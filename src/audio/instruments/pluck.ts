/**
 * Plucked/struck string instruments, driven by the Karplus-Strong worklet.
 * The worklet renders the strings; this module owns the body — a set of
 * resonant peaks that turn a bare string into a guitar, sitar, koto or harp.
 */

import { createChorus, driveCurve } from '../dsp'
import { midiToFreq } from '../../music/theory'
import type { InstrumentInstance, NoteHandle, PresetBase } from '../types'

export interface BodyResonance { freq: number; q: number; gain: number }

export interface PluckParams {
  /** Seconds to -60dB at 220 Hz. */
  sustain: number
  /** Loop low-pass amount: higher is darker and decays faster up top. */
  damping: number
  /** How much shorter high notes ring. */
  decayKeyScale: number
  /** 0..0.5, where along the string it's plucked. */
  pluckPosition: number
  /** 0..1, softness of the exciter: 0 = finger, 1 = plectrum. */
  excitationTone: number
  /** String stiffness — stretches partials sharp (piano, steel strings). */
  inharmonicity: number
  /** Sitar-style bridge buzz. */
  buzz: number
  buzzThreshold: number
  /** Output comb (pickup placement). */
  pickup: number
  /** How fast a note-off mutes the string. */
  releaseDamp: number
  body: BodyResonance[]
  /** Dry level alongside the body resonances. */
  bodyMix: number
  drive: number
  chorus: number
  gain: number
}

const DEFAULTS: PluckParams = {
  sustain: 2.4, damping: 0.32, decayKeyScale: 0.35, pluckPosition: 0.22,
  excitationTone: 0.5, inharmonicity: 0, buzz: 0, buzzThreshold: 0.12,
  pickup: 0, releaseDamp: 14, body: [], bodyMix: 0.7, drive: 0, chorus: 0, gain: 0.9,
}

let workletPromise: WeakMap<BaseAudioContext, Promise<boolean>> = new WeakMap()

/** Load the processor once per context. Resolves false if worklets are unavailable. */
export function ensurePluckWorklet(ctx: BaseAudioContext): Promise<boolean> {
  const existing = workletPromise.get(ctx)
  if (existing) return existing
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')
  const url = `${base}/worklets/pluck-processor.js`
  const promise = (ctx as AudioContext).audioWorklet
    ? (ctx as AudioContext).audioWorklet.addModule(url).then(() => true).catch((err) => {
        console.warn('[overtone] pluck worklet unavailable, falling back', err)
        return false
      })
    : Promise.resolve(false)
  workletPromise.set(ctx, promise)
  return promise
}

export function pluckWorkletReady(ctx: BaseAudioContext): boolean {
  return readyContexts.has(ctx)
}

const readyContexts = new WeakSet<BaseAudioContext>()

export async function initPluck(ctx: BaseAudioContext): Promise<boolean> {
  const ok = await ensurePluckWorklet(ctx)
  if (ok) readyContexts.add(ctx)
  return ok
}

export function createPluck(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = { ...DEFAULTS, ...(preset.params as Partial<PluckParams>) }
  const output = ctx.createGain()
  output.gain.value = p.gain

  let chainHead: AudioNode = output
  const nodes: AudioNode[] = []
  if (p.drive > 0.001) {
    const shaper = ctx.createWaveShaper()
    shaper.curve = driveCurve(p.drive)
    shaper.oversample = '2x'
    const trim = ctx.createGain()
    trim.gain.value = 1 / (1 + p.drive * 1.2)
    shaper.connect(trim).connect(chainHead)
    chainHead = shaper
    nodes.push(shaper, trim)
  }
  if (p.chorus > 0.001) {
    const ch = createChorus(ctx, 0.002 + p.chorus * 0.004, 0.4)
    ch.output.connect(chainHead)
    chainHead = ch.input
    nodes.push(ch.input, ch.output)
  }

  // Body: parallel peaking filters summed with a dry path.
  const strings = ctx.createGain()
  strings.gain.value = 1
  if (p.body.length > 0) {
    const dry = ctx.createGain()
    dry.gain.value = 1 - p.bodyMix * 0.55
    strings.connect(dry).connect(chainHead)
    for (const res of p.body) {
      const f = ctx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = res.freq
      f.Q.value = res.q
      f.gain.value = res.gain
      const g = ctx.createGain()
      g.gain.value = p.bodyMix / Math.max(1, p.body.length) + 0.35
      strings.connect(f).connect(g).connect(chainHead)
      nodes.push(f, g)
    }
    nodes.push(dry)
  } else {
    strings.connect(chainHead)
  }

  const node = new AudioWorkletNode(ctx, 'pluck-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  })
  node.connect(strings)
  node.port.postMessage({ type: 'config', maxVoices: Math.max(4, preset.polyphony) })

  const workletParams = {
    sustain: p.sustain, damping: p.damping, decayKeyScale: p.decayKeyScale,
    pluckPosition: p.pluckPosition, excitationTone: p.excitationTone,
    inharmonicity: p.inharmonicity, buzz: p.buzz, buzzThreshold: p.buzzThreshold,
    pickup: p.pickup, releaseDamp: p.releaseDamp, level: 1,
  }

  let seq = 0

  function send(midi: number, when: number, velocity: number, releaseAt: number | null): number {
    const id = ++seq
    node.port.postMessage({
      type: 'note', id, midi, freq: midiToFreq(midi), when, velocity,
      releaseAt: releaseAt ?? Infinity, params: workletParams,
    })
    return id
  }

  return {
    presetId: preset.id,
    output,
    noteOn(midi, when, velocity) {
      const id = send(midi, when, velocity, null)
      return {
        midi,
        release: (t: number) => node.port.postMessage({ type: 'release', id, when: t }),
      } satisfies NoteHandle
    },
    play(midi, when, durationSec, velocity) {
      // Strings ring past the written length; a short note damps, a long one lets it bloom.
      send(midi, when, velocity, when + Math.max(0.04, durationSec))
    },
    allNotesOff(when) {
      node.port.postMessage({ type: 'allOff', when })
    },
    dispose() {
      try { node.port.postMessage({ type: 'allOff', when: ctx.currentTime }) } catch { /* noop */ }
      try { node.disconnect() } catch { /* noop */ }
      for (const n of nodes) { try { n.disconnect() } catch { /* noop */ } }
      try { output.disconnect() } catch { /* noop */ }
    },
  }
}
