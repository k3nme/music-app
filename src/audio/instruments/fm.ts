/**
 * A small modular FM engine: up to six operators wired by an explicit routing
 * list, so one implementation covers electric pianos, bells, marimbas,
 * kalimbas, brass stabs, organs and metallic percussion.
 *
 * Routing is `[from, to]` pairs where `to === OUT` means the operator is a
 * carrier. Feedback is a per-operator self-modulation amount, realised through
 * a very short DelayNode because Web Audio forbids delay-free cycles.
 */

import { applyADSR, createChorus, driveCurve, releaseTail, velocityToGain } from '../dsp'
import { midiToFreq } from '../../music/theory'
import { clamp, type InstrumentInstance, type NoteHandle, type PresetBase } from '../types'

export const OUT = -1

export interface FMOperator {
  /** Frequency as a multiple of the note's pitch. */
  ratio: number
  /** Fixed frequency in Hz; when set, `ratio` is ignored (used for bell partials). */
  fixed?: number
  /** Carrier: output level. Modulator: modulation index. */
  level: number
  a: number; d: number; s: number; r: number
  wave?: OscillatorType
  /** Detune in cents — a little goes a long way on stacked partials. */
  detune?: number
  /** How much this operator's level tracks velocity (0..1). Bright on hard hits. */
  velSens?: number
  /** Self-modulation amount (0..1). */
  feedback?: number
  /** Level scaling across the keyboard: negative = quieter as you go up. */
  keyScale?: number
}

export interface FMParams {
  ops: FMOperator[]
  routes: [number, number][]
  chorus: number
  drive: number
  gain: number
  /** Master pitch envelope depth in semitones — the "thunk" of a mallet strike. */
  pitchEnv: number
  pitchEnvTime: number
}

const DEFAULTS: FMParams = {
  ops: [
    { ratio: 1, level: 1, a: 0.002, d: 1.2, s: 0.0, r: 0.3 },
    { ratio: 3, level: 2.2, a: 0.002, d: 0.45, s: 0.0, r: 0.2 },
  ],
  routes: [[1, 0], [0, OUT]],
  chorus: 0, drive: 0, gain: 0.8, pitchEnv: 0, pitchEnvTime: 0.04,
}

export function createFM(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = { ...DEFAULTS, ...(preset.params as Partial<FMParams>) }
  const output = ctx.createGain()
  output.gain.value = p.gain

  let chainHead: AudioNode = output
  const preNodes: AudioNode[] = []
  if (p.drive > 0.001) {
    const shaper = ctx.createWaveShaper()
    shaper.curve = driveCurve(p.drive)
    shaper.oversample = '2x'
    const trim = ctx.createGain()
    trim.gain.value = 1 / (1 + p.drive * 1.4)
    shaper.connect(trim).connect(chainHead)
    chainHead = shaper
    preNodes.push(shaper, trim)
  }
  if (p.chorus > 0.001) {
    const ch = createChorus(ctx, 0.0015 + p.chorus * 0.004, 0.35 + p.chorus * 0.5)
    ch.output.connect(chainHead)
    chainHead = ch.input
    preNodes.push(ch.input, ch.output)
  }

  interface Voice {
    id: number
    midi: number
    oscs: OscillatorNode[]
    gains: GainNode[]
    amp: GainNode
    released: boolean
    startedAt: number
    release(when: number): void
  }

  const voices = new Map<number, Voice>()
  let seq = 0

  function buildVoice(midi: number, when: number, velocity: number): Voice {
    const id = ++seq
    const freq = midiToFreq(midi)
    const vel = velocityToGain(velocity)
    const amp = ctx.createGain()
    amp.gain.value = 1
    amp.connect(chainHead)

    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []

    for (const op of p.ops) {
      const osc = ctx.createOscillator()
      osc.type = op.wave ?? 'sine'
      const opFreq = op.fixed ?? freq * op.ratio
      osc.frequency.setValueAtTime(clamp(opFreq, 0.01, 20000), when)
      if (op.detune) osc.detune.value = op.detune
      if (p.pitchEnv > 0.001) {
        osc.detune.setValueAtTime(p.pitchEnv * 100 + (op.detune ?? 0), when)
        osc.detune.exponentialRampToValueAtTime(
          Math.max(0.01, Math.abs(op.detune ?? 0.01)) * Math.sign(op.detune ?? 1) || 0.01,
          when + Math.max(0.005, p.pitchEnvTime),
        )
      }
      const g = ctx.createGain()
      osc.connect(g)

      const velSens = op.velSens ?? 0.6
      const keyScale = op.keyScale ?? 0
      const keyFactor = Math.pow(2, ((midi - 60) / 12) * keyScale)
      const velFactor = 1 - velSens + velSens * vel
      const peak = op.level * velFactor * keyFactor

      if (op.feedback && op.feedback > 0.001) {
        const fb = ctx.createGain()
        fb.gain.value = op.feedback * opFreq * 2
        const dly = ctx.createDelay(0.05)
        dly.delayTime.value = 1 / ctx.sampleRate
        g.connect(dly).connect(fb).connect(osc.frequency)
      }

      applyADSR(g.gain, when, Math.max(0.0001, peak), op.a, op.d, op.s, null, op.r)
      osc.start(when)
      oscs.push(osc)
      gains.push(g)
    }

    for (const [from, to] of p.routes) {
      const src = gains[from]
      if (!src) continue
      if (to === OUT) {
        src.connect(amp)
      } else {
        const target = oscs[to]
        if (!target) continue
        // FM depth in Hz: index x modulator frequency, the usual convention.
        const depth = ctx.createGain()
        const modFreq = p.ops[from].fixed ?? freq * p.ops[from].ratio
        depth.gain.value = modFreq
        src.connect(depth).connect(target.frequency)
      }
    }

    const longestRelease = Math.max(...p.ops.map((o) => o.r), 0.05)

    const voice: Voice = {
      id, midi, oscs, gains, amp, released: false, startedAt: when,
      release(at: number) {
        if (voice.released) return
        voice.released = true
        const t = Math.max(at, voice.startedAt + 0.005)
        for (let i = 0; i < voice.gains.length; i++) {
          const op = p.ops[i]
          const g = voice.gains[i].gain
          g.cancelScheduledValues(t)
          g.setTargetAtTime(0.0001, t, Math.max(0.008, op.r / 3))
        }
        const stopAt = t + releaseTail(longestRelease)
        for (const o of voice.oscs) { try { o.stop(stopAt) } catch { /* already stopped */ } }
        const last = voice.oscs[voice.oscs.length - 1]
        const cleanup = () => {
          for (const g of voice.gains) g.disconnect()
          voice.amp.disconnect()
          voices.delete(voice.id)
        }
        if (last) last.onended = cleanup
        else cleanup()
      },
    }
    voices.set(id, voice)
    return voice
  }

  function enforcePolyphony(when: number) {
    const limit = Math.max(1, preset.polyphony)
    if (voices.size < limit) return
    const alive = [...voices.values()].filter((v) => !v.released).sort((a, b) => a.startedAt - b.startedAt)
    for (let i = 0; i <= alive.length - limit && i < alive.length; i++) alive[i].release(when)
  }

  return {
    presetId: preset.id,
    output,
    noteOn(midi, when, velocity) {
      enforcePolyphony(when)
      const v = buildVoice(midi, when, velocity)
      return { midi, release: (t: number) => v.release(t) } satisfies NoteHandle
    },
    play(midi, when, durationSec, velocity) {
      enforcePolyphony(when)
      const v = buildVoice(midi, when, velocity)
      v.release(when + Math.max(0.02, durationSec))
    },
    allNotesOff(when) {
      for (const v of [...voices.values()]) v.release(when)
    },
    dispose() {
      for (const v of [...voices.values()]) v.release(ctx.currentTime)
      for (const n of preNodes) { try { n.disconnect() } catch { /* noop */ } }
      try { output.disconnect() } catch { /* noop */ }
    },
  }
}
