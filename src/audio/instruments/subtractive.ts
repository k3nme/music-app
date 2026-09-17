/**
 * Classic subtractive voice: unison oscillators (+ sub, + noise) through a
 * resonant filter with its own envelope, into an amp envelope.
 *
 * With the right parameters this covers a lot of ground: supersaw leads, warm
 * pads, organs, bowed strings (slow attack + breath noise), flutes and reeds
 * (noise-heavy, narrow band-pass), and most synth bass.
 */

import { applyADSR, createChorus, driveCurve, noiseSource, releaseTail, velocityToGain } from '../dsp'
import { midiToFreq } from '../../music/theory'
import { clamp, type InstrumentInstance, type NoteHandle, type PresetBase } from '../types'

export interface SubtractiveParams {
  wave: OscillatorType
  voices: number
  detune: number // cents of unison spread
  spread: number // stereo width of unison voices, 0..1
  osc2Wave: OscillatorType
  osc2Semi: number
  osc2Level: number
  subLevel: number
  subOctave: number
  noiseLevel: number
  /** Extra noise burst at note start — bow scratch, breath chiff, pick attack. */
  chiff: number
  filterType: BiquadFilterType
  cutoff: number
  resonance: number
  filterEnv: number // octaves the envelope opens the filter
  keyTrack: number // 0..1, how much cutoff follows pitch
  fa: number; fd: number; fs: number; fr: number
  a: number; d: number; s: number; r: number
  vibratoRate: number
  vibratoDepth: number // cents
  vibratoDelay: number
  /** Filter wobble: rate in Hz, depth in octaves. The dubstep/house gate move. */
  filterLfoRate: number
  filterLfoDepth: number
  /** 'sine' wobbles, 'square' gates on and off, 'sawtooth' pumps. */
  filterLfoShape: OscillatorType
  /** Tremolo on the amplitude, in Hz. Vibraphone, gated pads, helicopter. */
  tremoloRate: number
  tremoloDepth: number
  glide: number
  chorus: number
  drive: number
  gain: number
}

const DEFAULTS: SubtractiveParams = {
  wave: 'sawtooth', voices: 1, detune: 8, spread: 0.4,
  osc2Wave: 'sawtooth', osc2Semi: 0, osc2Level: 0,
  subLevel: 0, subOctave: 1, noiseLevel: 0, chiff: 0,
  filterType: 'lowpass', cutoff: 2200, resonance: 0.8, filterEnv: 1.6, keyTrack: 0.3,
  fa: 0.005, fd: 0.25, fs: 0.4, fr: 0.2,
  a: 0.005, d: 0.15, s: 0.7, r: 0.25,
  vibratoRate: 5, vibratoDepth: 0, vibratoDelay: 0.35,
  filterLfoRate: 0, filterLfoDepth: 0, filterLfoShape: 'sine',
  tremoloRate: 0, tremoloDepth: 0,
  glide: 0, chorus: 0, drive: 0, gain: 0.8,
}

export function createSubtractive(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = { ...DEFAULTS, ...(preset.params as Partial<SubtractiveParams>) }
  const output = ctx.createGain()
  output.gain.value = p.gain

  // --- shared insert chain -------------------------------------------------
  let chainHead: AudioNode = output
  const preNodes: AudioNode[] = []
  if (p.drive > 0.001) {
    const shaper = ctx.createWaveShaper()
    shaper.curve = driveCurve(p.drive)
    shaper.oversample = '2x'
    const trim = ctx.createGain()
    trim.gain.value = 1 / (1 + p.drive * 1.4)
    shaper.connect(trim)
    trim.connect(chainHead)
    chainHead = shaper
    preNodes.push(shaper, trim)
  }
  if (p.chorus > 0.001) {
    const ch = createChorus(ctx, 0.002 + p.chorus * 0.005, 0.4 + p.chorus * 0.5)
    ch.output.connect(chainHead)
    chainHead = ch.input
    preNodes.push(ch.input, ch.output)
  }

  const voices = new Map<number, InternalVoice>()
  let voiceSeq = 0
  let lastFreq = 0

  interface InternalVoice {
    id: number
    midi: number
    nodes: AudioScheduledSourceNode[]
    amp: GainNode
    filter: BiquadFilterNode
    released: boolean
    startedAt: number
    release(when: number): void
  }

  function buildVoice(midi: number, when: number, velocity: number): InternalVoice {
    const id = ++voiceSeq
    const freq = midiToFreq(midi)
    const vel = velocityToGain(velocity)
    const sources: AudioScheduledSourceNode[] = []

    const amp = ctx.createGain()
    amp.gain.value = 0.0001

    const filter = ctx.createBiquadFilter()
    filter.type = p.filterType
    filter.Q.value = p.resonance
    const keyed = p.cutoff * Math.pow(2, ((midi - 60) / 12) * p.keyTrack)
    const base = clamp(keyed, 40, 18000)
    const peak = clamp(base * Math.pow(2, p.filterEnv * (0.35 + vel * 0.65)), 40, 20000)
    filter.frequency.cancelScheduledValues(when)
    filter.frequency.setValueAtTime(base, when)
    if (p.filterEnv > 0.01) {
      filter.frequency.linearRampToValueAtTime(peak, when + Math.max(0.001, p.fa))
      filter.frequency.setTargetAtTime(
        clamp(base + (peak - base) * p.fs, 40, 20000),
        when + Math.max(0.001, p.fa),
        Math.max(0.01, p.fd / 3),
      )
    }
    // Filter LFO — the wobble. Depth is in octaves, so it scales with the
    // cutoff rather than sounding different at every pitch.
    if (p.filterLfoDepth > 0.001 && p.filterLfoRate > 0.001) {
      const lfo = ctx.createOscillator()
      lfo.type = p.filterLfoShape
      lfo.frequency.value = p.filterLfoRate
      const depth = ctx.createGain()
      // Convert octaves to Hz around the current cutoff.
      depth.gain.value = base * (Math.pow(2, p.filterLfoDepth) - 1) * 0.5
      lfo.connect(depth).connect(filter.frequency)
      lfo.start(when)
      sources.push(lfo)
    }

    filter.connect(amp)

    if (p.tremoloDepth > 0.001 && p.tremoloRate > 0.001) {
      const trem = ctx.createGain()
      trem.gain.value = 1 - p.tremoloDepth * 0.5
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = p.tremoloRate
      const depth = ctx.createGain()
      depth.gain.value = p.tremoloDepth * 0.5
      lfo.connect(depth).connect(trem.gain)
      lfo.start(when)
      sources.push(lfo)
      amp.connect(trem).connect(chainHead)
    } else {
      amp.connect(chainHead)
    }

    // --- pitch modulation shared by every oscillator in the voice ----------
    const pitchMod = ctx.createGain() // outputs cents
    pitchMod.gain.value = 1
    if (p.vibratoDepth > 0.01) {
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = p.vibratoRate
      const depth = ctx.createGain()
      depth.gain.setValueAtTime(0.0001, when)
      depth.gain.setTargetAtTime(p.vibratoDepth, when + p.vibratoDelay, 0.25)
      lfo.connect(depth).connect(pitchMod)
      lfo.start(when)
      sources.push(lfo)
    }

    const addOsc = (wave: OscillatorType, hz: number, detuneCents: number, level: number, pan: number) => {
      if (level <= 0.0001) return
      const osc = ctx.createOscillator()
      osc.type = wave
      if (p.glide > 0.001 && lastFreq > 0) {
        osc.frequency.setValueAtTime(lastFreq * (hz / freq), when)
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, hz), when + p.glide)
      } else {
        osc.frequency.setValueAtTime(Math.max(1, hz), when)
      }
      osc.detune.value = detuneCents
      pitchMod.connect(osc.detune)
      const g = ctx.createGain()
      g.gain.value = level
      if (Math.abs(pan) > 0.01) {
        const panner = ctx.createStereoPanner()
        panner.pan.value = pan
        osc.connect(g).connect(panner).connect(filter)
      } else {
        osc.connect(g).connect(filter)
      }
      osc.start(when)
      sources.push(osc)
    }

    const n = Math.max(1, Math.round(p.voices))
    const unisonLevel = 1 / Math.sqrt(n)
    for (let i = 0; i < n; i++) {
      const offset = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 // -1..1
      addOsc(p.wave, freq, offset * p.detune, unisonLevel, offset * p.spread)
    }
    if (p.osc2Level > 0.001) {
      addOsc(p.osc2Wave, freq * Math.pow(2, p.osc2Semi / 12), 0, p.osc2Level, 0)
    }
    if (p.subLevel > 0.001) {
      addOsc('sine', freq / Math.pow(2, p.subOctave), 0, p.subLevel, 0)
    }

    if (p.noiseLevel > 0.001 || p.chiff > 0.001) {
      const noise = noiseSource(ctx)
      const nf = ctx.createBiquadFilter()
      nf.type = 'bandpass'
      nf.frequency.value = clamp(freq * 2.2, 200, 12000)
      nf.Q.value = 0.9
      const ng = ctx.createGain()
      const steady = p.noiseLevel * (0.4 + vel * 0.6)
      ng.gain.setValueAtTime(0.0001, when)
      if (p.chiff > 0.001) {
        ng.gain.linearRampToValueAtTime(p.chiff * (0.5 + vel * 0.5), when + 0.008)
        ng.gain.setTargetAtTime(steady, when + 0.012, 0.045)
      } else {
        ng.gain.linearRampToValueAtTime(steady, when + Math.max(0.005, p.a))
      }
      noise.connect(nf).connect(ng).connect(filter)
      noise.start(when)
      sources.push(noise)
    }

    lastFreq = freq

    const voice: InternalVoice = {
      id, midi, nodes: sources, amp, filter, released: false, startedAt: when,
      release(at: number) {
        if (voice.released) return
        voice.released = true
        const t = Math.max(at, voice.startedAt + 0.005)
        voice.amp.gain.cancelScheduledValues(t)
        voice.amp.gain.setTargetAtTime(0.0001, t, Math.max(0.008, p.r / 3))
        if (p.filterEnv > 0.01) {
          voice.filter.frequency.cancelScheduledValues(t)
          voice.filter.frequency.setTargetAtTime(base, t, Math.max(0.01, p.fr / 3))
        }
        const stopAt = t + releaseTail(p.r)
        for (const node of voice.nodes) {
          try { node.stop(stopAt) } catch { /* already stopped */ }
        }
        const last = voice.nodes[voice.nodes.length - 1]
        const cleanup = () => {
          voice.amp.disconnect()
          voice.filter.disconnect()
          voices.delete(voice.id)
        }
        if (last) last.onended = cleanup
        else cleanup()
      },
    }

    applyADSR(amp.gain, when, vel, p.a, p.d, p.s, null, p.r)
    voices.set(id, voice)
    return voice
  }

  function enforcePolyphony(when: number) {
    const limit = Math.max(1, preset.polyphony)
    if (voices.size < limit) return
    const alive = [...voices.values()].filter((v) => !v.released)
    alive.sort((x, y) => x.startedAt - y.startedAt)
    const excess = alive.length - limit + 1
    for (let i = 0; i < excess && i < alive.length; i++) alive[i].release(when)
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
