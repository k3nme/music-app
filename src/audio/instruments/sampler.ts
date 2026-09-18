/**
 * The sampler: an instrument whose sound is a recording rather than a model.
 *
 * Everything else in this app is synthesised, which is what keeps it small and
 * what makes "any instrument" possible at all. But a synthesised kick is never
 * *that* kick, off *that* record. Once a song can be taken apart, the pieces
 * have to be playable, and that needs this.
 *
 * Buffers are resolved synchronously from the sample cache, the same way audio
 * clips are: the store loads a user instrument's audio before registering it,
 * so by the time a track asks for one the buffer is already in memory. A zone
 * whose buffer is missing plays silence rather than throwing — the instrument
 * still exists, it just has nothing to say yet.
 */

import { velocityToGain } from '../dsp'
import type { InstrumentInstance, NoteHandle, PresetBase } from '../types'

export interface SamplerZone {
  /** Sample store id. */
  sampleId: string
  /** What was played to make this recording. */
  rootMidi: number
  /** Lowest and highest notes this zone answers for. */
  lo: number
  hi: number
  /** Label, used by drum kits and the UI. */
  name?: string
  gain?: number
  pan?: number
  /**
   * Play the whole slice regardless of how long the note is. Drums and
   * one-shots want this; a sustained instrument does not.
   */
  oneShot?: boolean
  /** Window into the sample, when the zone is a slice of something longer. */
  offsetSec?: number
  durationSec?: number
  /** Seamless sustain: loop this region while the note is held. */
  loopStartSec?: number
  loopEndSec?: number
}

export interface SamplerParams {
  zones: SamplerZone[]
  gain: number
  /** Amp envelope, in seconds. A one-shot zone ignores everything but release. */
  a: number
  d: number
  s: number
  r: number
  /** Low-pass in Hz. 20000 is off. */
  tone?: number
  /** How much the filter follows velocity, in octaves. */
  velocityToTone?: number
}

/** Where the sampler looks for audio. The store fills this in. */
const cache = new Map<string, AudioBuffer>()

export function provideSample(id: string, buffer: AudioBuffer) {
  cache.set(id, buffer)
}

export function hasSample(id: string): boolean {
  return cache.has(id)
}

export function forgetSample(id: string) {
  cache.delete(id)
}

/** Every sample id a preset needs, so callers can make sure they are loaded. */
export function samplerSampleIds(preset: PresetBase): string[] {
  if (preset.engine !== 'sampler') return []
  const params = preset.params as unknown as SamplerParams
  return [...new Set((params.zones ?? []).map((z) => z.sampleId))]
}

/** The zone that answers for a note: the one whose root is nearest, in range. */
export function zoneFor(zones: SamplerZone[], midi: number): SamplerZone | null {
  let best: SamplerZone | null = null
  let bestDistance = Infinity
  for (const zone of zones) {
    if (midi < zone.lo || midi > zone.hi) continue
    const distance = Math.abs(midi - zone.rootMidi)
    if (distance < bestDistance) { best = zone; bestDistance = distance }
  }
  return best
}

/**
 * Lay out zones for a set of recorded notes: each one covers the ground up to
 * halfway to its neighbours, and the outermost reach a fixed distance further.
 *
 * The result has to be gapless. A hole between two zones is a range of notes
 * that make no sound at all, and nothing about playing it would tell you why.
 */
export function noteZones(roots: number[], reach = 7): { rootMidi: number; lo: number; hi: number }[] {
  const sorted = [...new Set(roots)].sort((a, b) => a - b)
  return sorted.map((root, i) => ({
    rootMidi: root,
    lo: i === 0 ? root - reach : Math.floor((sorted[i - 1] + root) / 2) + 1,
    hi: i === sorted.length - 1 ? root + reach : Math.floor((root + sorted[i + 1]) / 2),
  }))
}

export function createSampler(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = preset.params as unknown as SamplerParams
  const zones = p.zones ?? []
  const output = ctx.createGain()
  output.gain.value = p.gain ?? 0.9

  const live = new Set<{ stop(when: number): void }>()

  function start(midi: number, when: number, velocity: number, holdFor: number | null) {
    const zone = zoneFor(zones, midi)
    if (!zone) return null
    const buffer = cache.get(zone.sampleId)
    if (!buffer) return null

    const source = ctx.createBufferSource()
    source.buffer = buffer
    // Repitching is what makes one recording play a whole keyboard. It moves
    // the formants too, which is why a sampled instrument wants a zone every
    // few semitones rather than one sample stretched over five octaves.
    source.playbackRate.value = Math.pow(2, (midi - zone.rootMidi) / 12)

    const amp = ctx.createGain()
    const peak = velocityToGain(velocity) * (zone.gain ?? 1)

    let node: AudioNode = amp
    let filter: BiquadFilterNode | null = null
    const tone = p.tone ?? 20000
    if (tone < 19000) {
      filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      // Playing harder opens the filter, the way hitting something harder
      // makes it brighter.
      const octaves = (p.velocityToTone ?? 0) * (velocity - 0.7)
      filter.frequency.value = Math.min(20000, Math.max(80, tone * Math.pow(2, octaves)))
      filter.Q.value = 0.4
      amp.connect(filter)
      node = filter
    }
    const panner = zone.pan ? ctx.createStereoPanner() : null
    if (panner) {
      panner.pan.value = zone.pan ?? 0
      node.connect(panner)
      node = panner
    }
    node.connect(output)
    source.connect(amp)

    const attack = Math.max(0.001, p.a ?? 0.002)
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(peak, when + attack)

    const offset = Math.max(0, zone.offsetSec ?? 0)
    const available = Math.max(0.01, (zone.durationSec ?? buffer.duration - offset))
    const release = Math.max(0.005, p.r ?? 0.06)

    const loops = zone.loopEndSec !== undefined && zone.loopStartSec !== undefined
      && zone.loopEndSec > zone.loopStartSec
    if (loops) {
      source.loop = true
      source.loopStart = zone.loopStartSec!
      source.loopEnd = zone.loopEndSec!
    }

    let stopAt: number
    if (zone.oneShot || holdFor === null) {
      // A one-shot rings out on its own terms; the note length is irrelevant.
      const sustainFor = available / source.playbackRate.value
      stopAt = when + sustainFor + release
      if (!zone.oneShot && holdFor === null) {
        // Held note on a sustaining zone: decay to the sustain level and wait
        // for release() to schedule the rest.
        const decay = Math.max(0.005, p.d ?? 0.1)
        amp.gain.setTargetAtTime(peak * (p.s ?? 1), when + attack, decay / 3)
        stopAt = loops ? Infinity : when + sustainFor + release
      }
    } else {
      const decay = Math.max(0.005, p.d ?? 0.1)
      amp.gain.setTargetAtTime(peak * (p.s ?? 1), when + attack, decay / 3)
      const end = when + Math.max(attack + 0.01, holdFor)
      amp.gain.setTargetAtTime(0.0001, end, release / 3)
      stopAt = Math.min(
        end + release * 3,
        loops ? Infinity : when + available / source.playbackRate.value + release,
      )
    }

    const voice = {
      stop(at: number) {
        try {
          amp.gain.cancelScheduledValues(at)
          amp.gain.setTargetAtTime(0.0001, at, release / 3)
          source.stop(at + release * 3)
        } catch { /* already stopped */ }
        live.delete(voice)
      },
    }
    live.add(voice)

    source.onended = () => {
      live.delete(voice)
      try { source.disconnect(); amp.disconnect(); filter?.disconnect(); panner?.disconnect() } catch { /* noop */ }
    }

    try {
      source.start(when, offset, loops ? undefined : Math.min(available, buffer.duration - offset))
    } catch {
      return null
    }
    if (Number.isFinite(stopAt)) {
      try { source.stop(stopAt) } catch { /* noop */ }
    }
    return { voice, amp, source, release }
  }

  return {
    presetId: preset.id,
    output,

    noteOn(midi, when, velocity): NoteHandle {
      const started = start(midi, when, velocity, null)
      return {
        midi,
        release(at: number) {
          if (!started) return
          started.voice.stop(Math.max(at, when))
        },
      }
    },

    play(midi, when, durationSec, velocity) {
      start(midi, when, velocity, durationSec)
    },

    allNotesOff(when) {
      for (const voice of [...live]) voice.stop(when)
      live.clear()
    },

    dispose() {
      this.allNotesOff(ctx.currentTime)
      try { output.disconnect() } catch { /* noop */ }
    },
  }
}
