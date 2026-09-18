/**
 * Procedural drum synthesis. Each kit maps MIDI notes to a piece, and each
 * piece is a tiny synth recipe rather than a sample, so kits are tweakable
 * (tune, decay, tone, snap) and cost nothing to load.
 */

import { driveCurve, noiseSource, velocityToGain } from '../dsp'
import { clamp, type InstrumentInstance, type NoteHandle, type PresetBase } from '../types'
import type { SamplerZone } from './sampler'

export type DrumVoiceType =
  | 'kick' | 'snare' | 'hat' | 'tom' | 'clap' | 'rim' | 'cowbell'
  | 'cymbal' | 'membrane' | 'shaker' | 'click' | 'noise'
  // Long-form transition effects. These are not drums — they run for bars, not
  // milliseconds — but they are one-shots triggered by a note, so they belong
  // to the same engine rather than needing one of their own.
  | 'riser' | 'downlifter' | 'impact' | 'sweep' | 'reverse' | 'roll'
  /** Pitched, sliding sub-bass drum — the sound amapiano is built on. */
  | 'logdrum'
  /** Membrane whose pitch bends under hand pressure, like a talking drum. */
  | 'talking'

export interface DrumPiece {
  type: DrumVoiceType
  name: string
  /** Base frequency in Hz. */
  tune: number
  /** Amplitude decay in seconds. */
  decay: number
  level: number
  /** Meaning depends on type: filter colour, noise/tone balance, brightness. */
  tone?: number
  /** Transient emphasis. */
  snap?: number
  /** Pitch envelope depth as a multiple of `tune`. */
  bend?: number
  bendTime?: number
  pan?: number
  drive?: number
  /** Pieces sharing a choke group cut each other off (closed hat vs open hat). */
  choke?: string
  /**
   * Length in *beats* rather than seconds, for the transition effects. A riser
   * has to end exactly on the drop, so it must follow the tempo.
   */
  beats?: number
  /** Where the pitch or filter slide ends, as a multiple of `tune`. */
  glideTo?: number
}

export interface DrumParams {
  pieces: Record<number, DrumPiece>
  gain: number
  drive: number
}

export function createDrums(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = preset.params as unknown as DrumParams
  const pieces = p.pieces ?? {}
  /**
   * Transition effects are written in beats, so they need the song tempo.
   * The engine keeps this current; 120 is only the value before playback.
   */
  let bpm = 120
  const output = ctx.createGain()
  output.gain.value = p.gain ?? 0.9

  let chainHead: AudioNode = output
  const staticNodes: AudioNode[] = []
  if ((p.drive ?? 0) > 0.001) {
    const shaper = ctx.createWaveShaper()
    shaper.curve = driveCurve(p.drive)
    shaper.oversample = '2x'
    const trim = ctx.createGain()
    trim.gain.value = 1 / (1 + p.drive)
    shaper.connect(trim).connect(chainHead)
    chainHead = shaper
    staticNodes.push(shaper, trim)
  }

  /** Active voices per choke group, so a closed hat can cut an open one. */
  const chokes = new Map<string, { stop: (when: number) => void }[]>()
  const live = new Set<{ stop: (when: number) => void }>()

  function channel(piece: DrumPiece): { input: GainNode; out: AudioNode } {
    const g = ctx.createGain()
    g.gain.value = piece.level ?? 1
    if (piece.drive && piece.drive > 0.001) {
      const shaper = ctx.createWaveShaper()
      shaper.curve = driveCurve(piece.drive)
      const trim = ctx.createGain()
      trim.gain.value = 1 / (1 + piece.drive)
      g.connect(shaper).connect(trim)
      if (piece.pan) {
        const pan = ctx.createStereoPanner()
        pan.pan.value = piece.pan
        trim.connect(pan).connect(chainHead)
      } else trim.connect(chainHead)
    } else if (piece.pan) {
      const pan = ctx.createStereoPanner()
      pan.pan.value = piece.pan
      g.connect(pan).connect(chainHead)
    } else {
      g.connect(chainHead)
    }
    return { input: g, out: chainHead }
  }

  /** Percussive amp envelope: instant attack, exponential fall. */
  function hit(param: AudioParam, when: number, peak: number, attack: number, decay: number) {
    param.cancelScheduledValues(when)
    param.setValueAtTime(0.0001, when)
    param.linearRampToValueAtTime(peak, when + attack)
    param.exponentialRampToValueAtTime(0.0001, when + attack + Math.max(0.01, decay))
  }

  function trigger(piece: DrumPiece, when: number, velocity: number) {
    const vel = velocityToGain(velocity)
    const { input } = channel(piece)
    const sources: AudioScheduledSourceNode[] = []
    // A piece measured in beats stretches with the tempo; everything else is
    // a fixed length in seconds.
    const decay = piece.beats !== undefined
      ? Math.max(0.05, (piece.beats * 60) / bpm)
      : Math.max(0.01, piece.decay)
    const tone = piece.tone ?? 0.5
    const snap = piece.snap ?? 0.5

    const addOsc = (
      type: OscillatorType, freq: number, level: number, dec: number,
      bend?: { to: number; time: number }, dest: AudioNode = input,
    ) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.setValueAtTime(Math.max(1, freq), when)
      if (bend) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, bend.to), when + Math.max(0.002, bend.time),
        )
      }
      const g = ctx.createGain()
      hit(g.gain, when, level * vel, 0.0008, dec)
      osc.connect(g).connect(dest)
      osc.start(when)
      osc.stop(when + dec + 0.08)
      sources.push(osc)
      return osc
    }

    const addNoise = (
      filterType: BiquadFilterType, freq: number, q: number, level: number,
      dec: number, attack = 0.0008, dest: AudioNode = input,
    ) => {
      const n = noiseSource(ctx)
      const f = ctx.createBiquadFilter()
      f.type = filterType
      f.frequency.value = clamp(freq, 30, 20000)
      f.Q.value = q
      const g = ctx.createGain()
      hit(g.gain, when, level * vel, attack, dec)
      n.connect(f).connect(g).connect(dest)
      n.start(when)
      n.stop(when + dec + 0.08)
      sources.push(n)
      return n
    }

    /** Six detuned squares — the classic 808/909 metallic cluster. */
    const metallic = (base: number, level: number, dec: number, hp: number) => {
      const ratios = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]
      const mix = ctx.createGain()
      mix.gain.value = 1
      const hpf = ctx.createBiquadFilter()
      hpf.type = 'highpass'
      hpf.frequency.value = hp
      const bpf = ctx.createBiquadFilter()
      bpf.type = 'bandpass'
      bpf.frequency.value = hp * 1.4
      bpf.Q.value = 0.6
      const g = ctx.createGain()
      hit(g.gain, when, level * vel, 0.0006, dec)
      mix.connect(hpf).connect(bpf).connect(g).connect(input)
      for (const r of ratios) {
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.value = base * r
        const og = ctx.createGain()
        og.gain.value = 1 / ratios.length
        osc.connect(og).connect(mix)
        osc.start(when)
        osc.stop(when + dec + 0.08)
        sources.push(osc)
      }
    }

    switch (piece.type) {
      case 'kick': {
        const bend = piece.bend ?? 4
        addOsc('sine', piece.tune * bend, 1, decay, { to: piece.tune, time: piece.bendTime ?? 0.045 })
        if (snap > 0.01) addNoise('bandpass', 1800, 1, snap * 0.35, 0.012)
        if (tone > 0.5) addOsc('triangle', piece.tune * 2, (tone - 0.5) * 0.4, decay * 0.4)
        break
      }
      case 'snare': {
        addOsc('triangle', piece.tune, 0.55 * (1 - tone * 0.4), decay * 0.5,
          { to: piece.tune * 0.82, time: 0.03 })
        addOsc('triangle', piece.tune * 1.47, 0.35 * (1 - tone * 0.4), decay * 0.4)
        addNoise('highpass', 900 + tone * 3500, 0.7, 0.9, decay)
        if (snap > 0.01) addNoise('bandpass', 6000, 1.2, snap * 0.5, 0.018)
        break
      }
      case 'hat': {
        if (tone > 0.5) metallic(piece.tune, 0.7, decay, 7000 + tone * 3000)
        else addNoise('highpass', 6000 + tone * 4000, 1.1, 0.75, decay)
        break
      }
      case 'cymbal': {
        metallic(piece.tune, 0.5, decay, 4200 + tone * 3000)
        addNoise('highpass', 8000, 0.7, 0.28, decay * 0.9, 0.004)
        break
      }
      case 'tom': {
        addOsc('sine', piece.tune * (piece.bend ?? 1.6), 0.9, decay,
          { to: piece.tune, time: piece.bendTime ?? 0.08 })
        addNoise('bandpass', piece.tune * 3, 1.4, tone * 0.3, decay * 0.5)
        break
      }
      case 'membrane': {
        // Tuned drum head: fundamental + inharmonic partials + a slap transient.
        addOsc('sine', piece.tune * (piece.bend ?? 1.35), 0.85, decay,
          { to: piece.tune, time: piece.bendTime ?? 0.05 })
        addOsc('sine', piece.tune * 2.83, 0.18 * tone, decay * 0.35)
        addOsc('sine', piece.tune * 4.11, 0.1 * tone, decay * 0.22)
        if (snap > 0.01) addNoise('bandpass', piece.tune * 8, 2.2, snap * 0.45, 0.022)
        break
      }
      case 'clap': {
        const spread = [0, 0.011, 0.021, 0.031]
        spread.forEach((off, i) => {
          const n = noiseSource(ctx)
          const f = ctx.createBiquadFilter()
          f.type = 'bandpass'
          f.frequency.value = piece.tune
          f.Q.value = 0.9
          const g = ctx.createGain()
          const t = when + off
          const isTail = i === spread.length - 1
          hit(g.gain, t, (isTail ? 1 : 0.65) * vel, 0.0006, isTail ? decay : 0.012)
          n.connect(f).connect(g).connect(input)
          n.start(t)
          n.stop(t + decay + 0.08)
          sources.push(n)
        })
        break
      }
      case 'rim': {
        addOsc('triangle', piece.tune, 0.5, 0.02)
        addOsc('square', piece.tune * 1.61, 0.3, 0.016)
        addNoise('bandpass', piece.tune * 4, 3, 0.5, 0.018)
        break
      }
      case 'cowbell': {
        addOsc('square', piece.tune, 0.5, decay)
        addOsc('square', piece.tune * 1.5, 0.5, decay)
        break
      }
      case 'shaker': {
        addNoise('highpass', 4000 + tone * 5000, 0.8, 0.6, decay, 0.006)
        break
      }
      case 'click': {
        addOsc('square', piece.tune, 0.5, 0.006)
        addNoise('highpass', 3000, 0.7, 0.4, 0.008)
        break
      }
      case 'riser':
      case 'downlifter': {
        // Filtered noise whose band sweeps across the whole build, plus a
        // pitched tone doing the same, which is what sells the rise.
        const up = piece.type === 'riser'
        const from = piece.tune
        const to = piece.tune * (piece.glideTo ?? (up ? 26 : 0.12))

        const noise = noiseSource(ctx)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.Q.value = 1.2 + tone * 6
        filter.frequency.setValueAtTime(clamp(from, 30, 18000), when)
        filter.frequency.exponentialRampToValueAtTime(clamp(to, 30, 18000), when + decay)
        const noiseGain = ctx.createGain()
        noiseGain.gain.setValueAtTime(0.0001, when)
        // Rising: swell in. Falling: start loud and fade as it drops away.
        noiseGain.gain.exponentialRampToValueAtTime(
          Math.max(0.0002, 0.75 * vel), when + (up ? decay * 0.92 : decay * 0.08),
        )
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + decay)
        noise.connect(filter).connect(noiseGain).connect(input)
        noise.start(when)
        noise.stop(when + decay + 0.05)
        sources.push(noise)

        if (snap > 0.01) {
          const osc = ctx.createOscillator()
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(clamp(from * 0.5, 20, 12000), when)
          osc.frequency.exponentialRampToValueAtTime(clamp(to * 0.5, 20, 12000), when + decay)
          const g = ctx.createGain()
          g.gain.setValueAtTime(0.0001, when)
          g.gain.exponentialRampToValueAtTime(Math.max(0.0002, snap * 0.35 * vel), when + decay * 0.9)
          g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 6000
          osc.connect(g).connect(lp).connect(input)
          osc.start(when)
          osc.stop(when + decay + 0.05)
          sources.push(osc)
        }
        break
      }

      case 'impact': {
        // The hit at the drop: a sub boom under a broadband crash.
        addOsc('sine', piece.tune * 3, 0.9, decay * 0.55, { to: piece.tune * 0.6, time: decay * 0.3 })
        addNoise('lowpass', 900 + tone * 3000, 0.7, 0.8, decay, 0.002)
        addNoise('highpass', 5000, 0.6, 0.35 * snap, decay * 0.7, 0.001)
        break
      }

      case 'sweep': {
        // White noise through a moving filter, no pitch content. The "whoosh".
        const noise = noiseSource(ctx)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.Q.value = 0.7 + tone * 3
        const target = piece.tune * (piece.glideTo ?? 8)
        filter.frequency.setValueAtTime(clamp(piece.tune, 30, 18000), when)
        filter.frequency.exponentialRampToValueAtTime(clamp(target, 30, 18000), when + decay * 0.55)
        filter.frequency.exponentialRampToValueAtTime(clamp(piece.tune, 30, 18000), when + decay)
        const g = ctx.createGain()
        hit(g.gain, when, 0.7 * vel, decay * 0.25, decay * 0.75)
        noise.connect(filter).connect(g).connect(input)
        noise.start(when)
        noise.stop(when + decay + 0.05)
        sources.push(noise)
        break
      }

      case 'reverse': {
        // Backwards cymbal: swell up to nothing, then stop dead.
        const noise = noiseSource(ctx)
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 1200 + tone * 4000
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, when)
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.7 * vel), when + decay * 0.97)
        g.gain.linearRampToValueAtTime(0.0001, when + decay)
        noise.connect(hp).connect(g).connect(input)
        noise.start(when)
        noise.stop(when + decay + 0.02)
        sources.push(noise)
        break
      }

      case 'roll': {
        // A snare roll that accelerates into the drop.
        const hits = Math.max(4, Math.round(8 + snap * 24))
        for (let i = 0; i < hits; i++) {
          // Quadratic spacing: hits bunch up towards the end.
          const at = when + decay * Math.pow(i / hits, 1.7)
          const n = noiseSource(ctx)
          const f = ctx.createBiquadFilter()
          f.type = 'highpass'
          f.frequency.value = 800 + tone * 3000
          const g = ctx.createGain()
          hit(g.gain, at, vel * (0.35 + 0.65 * (i / hits)), 0.001, 0.055)
          n.connect(f).connect(g).connect(input)
          n.start(at)
          n.stop(at + 0.12)
          sources.push(n)
        }
        break
      }

      case 'logdrum': {
        // Amapiano's signature: a sine that slides *up* into its target pitch,
        // with just enough click to read as a drum rather than a bass note.
        const target = piece.tune
        const start = target * (piece.bend ?? 0.55)
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(Math.max(20, start), when)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, target), when + Math.max(0.01, piece.bendTime ?? 0.09),
        )
        const g = ctx.createGain()
        hit(g.gain, when, vel, 0.004, decay)
        const shaper = ctx.createWaveShaper()
        shaper.curve = driveCurve(0.25 + tone * 0.4)
        osc.connect(g).connect(shaper).connect(input)
        osc.start(when)
        osc.stop(when + decay + 0.1)
        sources.push(osc)
        if (snap > 0.01) addNoise('bandpass', 2200, 1.4, snap * 0.22, 0.012)
        break
      }

      case 'talking': {
        // A talking drum's pitch is squeezed up and released again mid-note.
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        const peak = piece.tune * (piece.bend ?? 1.5)
        osc.frequency.setValueAtTime(Math.max(20, piece.tune), when)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, peak), when + decay * 0.3)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, piece.tune * (piece.glideTo ?? 1)), when + decay * 0.9,
        )
        const g = ctx.createGain()
        hit(g.gain, when, vel * 0.9, 0.003, decay)
        osc.connect(g).connect(input)
        osc.start(when)
        osc.stop(when + decay + 0.08)
        sources.push(osc)
        addOsc('sine', piece.tune * 2.7, 0.14 * tone, decay * 0.4)
        if (snap > 0.01) addNoise('bandpass', piece.tune * 9, 2, snap * 0.4, 0.02)
        break
      }

      case 'noise':
      default: {
        addNoise('bandpass', piece.tune, 0.8, 0.7, decay)
        break
      }
    }

    const entry = {
      stop(at: number) {
        for (const s of sources) { try { s.stop(Math.max(at, when + 0.001)) } catch { /* noop */ } }
      },
    }
    live.add(entry)
    const last = sources[sources.length - 1]
    if (last) {
      last.onended = () => {
        live.delete(entry)
        try { input.disconnect() } catch { /* noop */ }
        const group = piece.choke ? chokes.get(piece.choke) : undefined
        if (group) {
          const i = group.indexOf(entry)
          if (i >= 0) group.splice(i, 1)
        }
      }
    }

    if (piece.choke) {
      const group = chokes.get(piece.choke) ?? []
      for (const prev of group) prev.stop(when + 0.002)
      group.length = 0
      group.push(entry)
      chokes.set(piece.choke, group)
    }
  }

  return {
    presetId: preset.id,
    output,
    setTempo(nextBpm: number) {
      bpm = Math.max(20, nextBpm)
    },
    noteOn(midi, when, velocity) {
      const piece = pieces[Math.round(midi)]
      if (piece) trigger(piece, when, velocity)
      // Percussion is one-shot: releasing does nothing, but the API stays uniform.
      return { midi, release: () => {} } satisfies NoteHandle
    },
    play(midi, when, _durationSec, velocity) {
      const piece = pieces[Math.round(midi)]
      if (piece) trigger(piece, when, velocity)
    },
    allNotesOff(when) {
      for (const v of [...live]) v.stop(when)
      live.clear()
      chokes.clear()
    },
    dispose() {
      for (const v of [...live]) v.stop(ctx.currentTime)
      live.clear()
      for (const n of staticNodes) { try { n.disconnect() } catch { /* noop */ } }
      try { output.disconnect() } catch { /* noop */ }
    },
  }
}

/** Pieces a kit exposes, in play order — the drum grid uses this for its rows. */
/**
 * What is on each pad of a kit, whatever engine makes the sound.
 *
 * A kit taken out of a song is a sampler with one zone per pad, not a set of
 * synthesis parameters — but the drum grid, the tests and the Ideas panel all
 * ask the same question of both, so they get the same answer shape. Only the
 * fields that mean something for a recording are filled in.
 */
export function kitPieces(preset: PresetBase): { midi: number; piece: DrumPiece }[] {
  if (preset.engine === 'sampler') {
    const { zones = [] } = preset.params as unknown as { zones: SamplerZone[] }
    return zones
      .map((zone) => ({
        midi: zone.rootMidi,
        piece: {
          type: 'noise' as const,
          name: zone.name ?? 'Sound',
          tune: 0,
          decay: 0,
          level: zone.gain ?? 1,
          pan: zone.pan,
        },
      }))
      .sort((a, b) => a.midi - b.midi)
  }
  const params = preset.params as unknown as DrumParams
  return Object.entries(params.pieces ?? {})
    .map(([midi, piece]) => ({ midi: Number(midi), piece }))
    .sort((a, b) => a.midi - b.midi)
}
