import { describe, expect, it } from 'vitest'
import {
  classifySound, clusterSounds, cutSlice, describeSound, findOnsets, fingerprint,
  fingerprintDistance, kitSlotFor, sliceRegions, soundLabel, type SoundKind,
} from '../sounds'

const RATE = 22050

/**
 * Seeded noise. Real noise makes these tests flaky — one unlucky draw and a
 * snare is momentarily brighter than a hi-hat — and a flaky detector test is
 * worse than no test, because you stop believing it.
 */
function noise(seed = 1) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2) - 1
  }
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE))
}

/** A synthetic kick: low sine with a fast pitch drop and a short decay. */
function kick(seconds = 0.3, gain = 0.9): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const hz = 50 + 110 * Math.exp(-t * 55)
    phase += (2 * Math.PI * hz) / RATE
    out[i] = Math.sin(phase) * gain * Math.exp(-t * 14)
  }
  return out
}

/** A hat: bright noise, gone almost immediately unless told otherwise. */
function hat(seconds = 0.05, gain = 0.5, decay = 90, seed = 7): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  const rand = noise(seed)
  let previous = 0
  for (let i = 0; i < out.length; i++) {
    const white = rand()
    // One-pole high pass, so the noise sits where a hi-hat sits.
    const value = white - previous * 0.92
    previous = white
    out[i] = value * gain * Math.exp(-(i / RATE) * decay)
  }
  return out
}

/**
 * A snare: a band of noise around 1-3 kHz plus the drum's own tone. White
 * noise would not do — it is brighter than any real snare and lands in the
 * cymbal range.
 */
function snare(seconds = 0.22, gain = 0.8, seed = 3): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  const rand = noise(seed)
  let low = 0, high = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const white = rand()
    low += (white - low) * 0.35          // tame the top
    high += (low - high) * 0.04          // and cut the bottom
    const band = (low - high) * 1.6
    const tone = Math.sin(2 * Math.PI * 190 * t) * 0.55 + Math.sin(2 * Math.PI * 330 * t) * 0.3
    out[i] = (band + tone * 0.8) * gain * Math.exp(-t * 22)
  }
  return out
}

/** A sustained, clearly pitched note that fades out rather than being cut. */
function tone(hz: number, seconds = 0.8, gain = 0.6): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  const fade = Math.round(0.05 * RATE)
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const attack = Math.min(1, t / 0.05)
    const release = Math.min(1, (out.length - i) / fade)
    out[i] = attack * release * gain * Math.exp(-t * 1.2) *
      (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t))
  }
  return out
}

/** Place sounds at given times in a buffer of `seconds`. */
function arrange(seconds: number, hits: { at: number; signal: Float32Array }[]): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  for (const hit of hits) {
    const from = Math.round(hit.at * RATE)
    for (let i = 0; i < hit.signal.length && from + i < out.length; i++) {
      out[from + i] += hit.signal[i]
    }
  }
  return out
}

describe('finding the hits', () => {
  it('finds one onset per hit in a simple pattern', () => {
    const signal = arrange(2, [
      { at: 0.0, signal: kick() }, { at: 0.5, signal: snare() },
      { at: 1.0, signal: kick() }, { at: 1.5, signal: snare() },
    ])
    const onsets = findOnsets(signal, RATE)
    expect(onsets.length).toBe(4)
    for (const [i, expected] of [0, 0.5, 1, 1.5].entries()) {
      expect(Math.abs(onsets[i] - expected), `onset ${i} at ${onsets[i]}`).toBeLessThan(0.04)
    }
  })

  it('hears a quiet hat between two loud kicks', () => {
    const signal = arrange(1.2, [
      { at: 0, signal: kick() }, { at: 0.25, signal: hat(0.05, 0.12) },
      { at: 0.5, signal: kick() }, { at: 0.75, signal: hat(0.05, 0.12) },
    ])
    expect(findOnsets(signal, RATE).length).toBe(4)
  })

  it('finds nothing in silence', () => {
    expect(findOnsets(silence(1), RATE)).toEqual([])
  })

  it('does not split one sound into several', () => {
    const signal = arrange(1.5, [{ at: 0.1, signal: tone(220, 1.2) }])
    expect(findOnsets(signal, RATE).length).toBeLessThanOrEqual(1)
  })
})

describe('cutting slices', () => {
  const signal = arrange(2, [
    { at: 0, signal: kick() }, { at: 0.5, signal: kick() }, { at: 1, signal: kick() },
  ])

  it('cuts one region per onset, starting just before the attack', () => {
    const regions = sliceRegions(signal, RATE, findOnsets(signal, RATE))
    expect(regions.length).toBe(3)
    expect(regions[0].startSec).toBeLessThanOrEqual(0.01)
    for (const region of regions) expect(region.endSec).toBeGreaterThan(region.startSec)
  })

  it('stops a slice when the sound has decayed, not at the next hit', () => {
    // The kick is over well before the next one 500 ms later.
    const [first] = sliceRegions(signal, RATE, findOnsets(signal, RATE))
    expect(first.endSec - first.startSec).toBeLessThan(0.45)
    expect(first.endSec - first.startSec).toBeGreaterThan(0.1)
  })

  it('never runs a slice past the next onset', () => {
    const dense = arrange(1, [
      { at: 0, signal: tone(110, 0.9) }, { at: 0.2, signal: tone(220, 0.7) },
    ])
    const regions = sliceRegions(dense, RATE, findOnsets(dense, RATE))
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i - 1].endSec).toBeLessThanOrEqual(regions[i].startSec + 0.01)
    }
  })

  it('fades the edges so a slice cannot click', () => {
    const slice = cutSlice(signal, RATE, { startSec: 0, endSec: 0.3 })
    expect(Math.abs(slice[0])).toBeLessThan(0.02)
    expect(Math.abs(slice[slice.length - 1])).toBeLessThan(0.02)
    expect(slice.length).toBe(Math.ceil(0.3 * RATE))
  })
})

describe('describing a sound', () => {
  it('hears a kick as low, fast to attack and quick to go', () => {
    const f = describeSound(kick(), RATE)
    expect(f.lowRatio).toBeGreaterThan(0.5)
    expect(f.centroidHz).toBeLessThan(320)
    expect(f.attackSec).toBeLessThan(0.02)
    expect(f.decaySec).toBeLessThan(0.4)
  })

  it('hears a hat as bright and noisy', () => {
    const f = describeSound(hat(), RATE)
    expect(f.centroidHz).toBeGreaterThan(4800)
    expect(f.flatness).toBeGreaterThan(0.18)
    expect(f.highRatio).toBeGreaterThan(f.lowRatio)
  })

  it('finds the pitch of a pitched sound and no pitch in noise', () => {
    const pitched = describeSound(tone(220, 0.8), RATE)
    expect(pitched.pitchHz).not.toBeNull()
    expect(pitched.pitchHz!).toBeGreaterThan(210)
    expect(pitched.pitchHz!).toBeLessThan(230)
    expect(pitched.pitchMidi).toBe(57)  // A3
    expect(describeSound(hat(0.3, 0.5, 12), RATE).clarity).toBeLessThan(0.6)
  })

  it('counts the separate attacks in a clap', () => {
    const clapLike = arrange(0.25, [
      { at: 0, signal: hat(0.02, 0.8, 90, 11) },
      { at: 0.012, signal: hat(0.02, 0.9, 90, 12) },
      { at: 0.026, signal: hat(0.06, 0.7, 90, 13) },
    ])
    // What matters is the gap between "several hands" and "one stick", not the
    // exact count — a pitch sweep can read as a second, quieter attack.
    expect(describeSound(clapLike, RATE).transients).toBeGreaterThanOrEqual(3)
    expect(describeSound(kick(), RATE).transients).toBeLessThan(3)
    expect(describeSound(snare(), RATE).transients).toBeLessThan(3)
  })
})

describe('naming what it found', () => {
  const kindOf = (signal: Float32Array, stem: 'drums' | 'bass' | 'vocals' | 'other' = 'drums') =>
    classifySound(describeSound(signal, RATE), stem)

  it('tells the parts of a kit apart', () => {
    expect(kindOf(kick())).toBe('kick')
    expect(kindOf(hat())).toBe('hat')
    expect(kindOf(hat(0.4, 0.5, 9))).toBe('openhat')     // rings on
    expect(kindOf(snare())).toBe('snare')
  })

  it('trusts the stem for bass and voice', () => {
    expect(kindOf(tone(55, 0.5), 'bass')).toBe('bass')
    expect(kindOf(tone(330, 0.9), 'vocals')).toBe('vocal')
  })

  it('calls a pitched sound in the other stem an instrument', () => {
    expect(kindOf(tone(440, 0.9), 'other')).toBe('tonal')
  })

  it('has a plain-language name for every kind', () => {
    const kinds: SoundKind[] = ['kick', 'snare', 'clap', 'hat', 'openhat', 'cymbal', 'tom',
      'perc', 'bass', 'tonal', 'vocal', 'texture']
    for (const kind of kinds) expect(soundLabel(kind).length).toBeGreaterThan(2)
  })

  it('lays a kit out the way every other drum machine does', () => {
    const taken = new Set<number>()
    for (const kind of ['kick', 'snare', 'hat', 'openhat'] as SoundKind[]) {
      taken.add(kitSlotFor(kind, taken))
    }
    expect([...taken].sort((a, b) => a - b)).toEqual([36, 38, 42, 46])
  })

  it('finds a free slot when the obvious one is taken', () => {
    const taken = new Set([36])
    expect(kitSlotFor('kick', taken)).toBe(35)
  })
})

describe('fingerprints', () => {
  it('puts two takes of the same sound closer than two different sounds', () => {
    const a = fingerprint(kick(0.3, 0.9), RATE)
    const b = fingerprint(kick(0.3, 0.5), RATE)   // same sound, played softer
    const c = fingerprint(hat(), RATE)
    expect(fingerprintDistance(a, b)).toBeLessThan(fingerprintDistance(a, c))
  })

  it('is not fooled by level alone', () => {
    const loud = tone(220, 0.8, 0.9)
    const quiet = tone(220, 0.8, 0.2)
    expect(fingerprintDistance(fingerprint(loud, RATE), fingerprint(quiet, RATE))).toBeLessThan(0.03)
  })

  it('does not move when the cut does', () => {
    // The same hit, sliced 8 ms earlier. A fingerprint that notices is
    // describing the edit rather than the sound.
    const hit = kick()
    const late = new Float32Array(hit.length + Math.round(0.008 * RATE))
    late.set(hit, Math.round(0.008 * RATE))
    expect(fingerprintDistance(fingerprint(hit, RATE), fingerprint(late, RATE)))
      .toBeLessThan(0.01)
  })

  it('leaves room between "the same sound again" and "a different sound"', () => {
    // The margin the clustering threshold sits inside. If this collapses,
    // every kit comes back as one smeared instrument.
    const same = fingerprintDistance(fingerprint(kick(0.3, 0.9), RATE), fingerprint(kick(0.3, 0.6), RATE))
    const different = fingerprintDistance(fingerprint(kick(), RATE), fingerprint(hat(), RATE))
    expect(same).toBeLessThan(0.02)
    expect(different).toBeGreaterThan(same * 5)
  })

  it('separates sounds with the same spectrum but different envelopes', () => {
    const plucked = new Float32Array(Math.round(0.6 * RATE))
    const bowed = new Float32Array(plucked.length)
    for (let i = 0; i < plucked.length; i++) {
      const t = i / RATE
      const wave = Math.sin(2 * Math.PI * 330 * t)
      plucked[i] = wave * Math.exp(-t * 8)
      bowed[i] = wave * Math.min(1, t / 0.25) * 0.8
    }
    expect(fingerprintDistance(fingerprint(plucked, RATE), fingerprint(bowed, RATE)))
      .toBeGreaterThan(0.05)
  })
})

describe('collapsing repeats', () => {
  const item = (kind: SoundKind, signal: Float32Array) => ({
    kind, print: fingerprint(signal, RATE), peak: Math.max(...signal),
  })

  it('turns many hits of one sound into one sound', () => {
    const items = [
      item('kick', kick(0.3, 0.9)), item('kick', kick(0.3, 0.85)), item('kick', kick(0.3, 0.8)),
      item('hat', hat()), item('hat', hat()),
    ]
    const clusters = clusterSounds(items)
    expect(clusters.length).toBe(2)
    expect(clusters.find((c) => c.kind === 'kick')?.count).toBe(3)
    expect(clusters.find((c) => c.kind === 'hat')?.count).toBe(2)
  })

  it('keeps genuinely different sounds of the same kind apart', () => {
    const clusters = clusterSounds([
      item('tonal', tone(110, 0.8)), item('tonal', tone(880, 0.8)),
    ])
    expect(clusters.length).toBe(2)
  })

  it('picks the loudest clean take as the one to keep', () => {
    const clusters = clusterSounds([
      item('kick', kick(0.3, 0.3)), item('kick', kick(0.3, 0.95)), item('kick', kick(0.3, 0.4)),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].bestIndex).toBe(1)
  })

  it('never loses a hit', () => {
    const items = [
      item('kick', kick()), item('snare', snare()), item('hat', hat()),
      item('kick', kick()), item('hat', hat()), item('hat', hat()),
    ]
    const total = clusterSounds(items).reduce((sum, c) => sum + c.count, 0)
    expect(total).toBe(items.length)
  })
})

describe('the whole pass, end to end', () => {
  it('pulls three distinct sounds out of a two-bar beat', () => {
    // kick on 1 and 3, snare on 2 and 4, hats on every eighth: 120 BPM.
    const hits: { at: number; signal: Float32Array }[] = []
    for (let bar = 0; bar < 2; bar++) {
      const base = bar * 2
      hits.push({ at: base + 0, signal: kick() }, { at: base + 1, signal: kick() })
      hits.push({ at: base + 0.5, signal: snare() }, { at: base + 1.5, signal: snare() })
      for (let e = 0; e < 4; e++) hits.push({ at: base + e * 0.5 + 0.25, signal: hat(0.05, 0.25) })
    }
    const signal = arrange(4.5, hits)

    const regions = sliceRegions(signal, RATE, findOnsets(signal, RATE))
    const items = regions.map((region) => {
      const slice = cutSlice(signal, RATE, region)
      const features = describeSound(slice, RATE)
      return {
        kind: classifySound(features, 'drums'),
        print: fingerprint(slice, RATE),
        peak: features.peak,
      }
    })

    const clusters = clusterSounds(items)
    const kinds = clusters.map((c) => c.kind).sort()
    expect(kinds).toEqual(['hat', 'kick', 'snare'])
    expect(clusters.find((c) => c.kind === 'kick')?.count).toBe(4)
    expect(clusters.find((c) => c.kind === 'snare')?.count).toBe(4)
    expect(clusters.find((c) => c.kind === 'hat')?.count).toBe(8)
  })
})
