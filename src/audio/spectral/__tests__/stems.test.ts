import { describe, expect, it } from 'vitest'
import { harmonicPercussive, mixStems, separateStems } from '../stems'

const SR = 22050

function energy(signal: Float32Array): number {
  let sum = 0
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i]
  return sum
}

/**
 * How much louder a signal is at the click positions than between them.
 *
 * Raw energy in a click window is the wrong measure when a loud sustained tone
 * is also present — it dominates every window. The ratio isolates the
 * transient contribution: a percussive signal spikes, a sustained one is flat.
 */
function transientContrast(signal: Float32Array, intervalSec: number, sampleRate = SR): number {
  const step = Math.floor(intervalSec * sampleRate)
  const width = Math.floor(0.012 * sampleRate)
  let onHit = 0
  let offHit = 0
  let hits = 0
  let gaps = 0
  for (let start = step; start + step < signal.length; start += step) {
    onHit += energy(signal.subarray(start, start + width))
    hits++
    // Sample the middle of the gap, well away from any transient.
    const mid = start + Math.floor(step / 2)
    offHit += energy(signal.subarray(mid, mid + width))
    gaps++
  }
  const on = onHit / Math.max(1, hits)
  const off = offHit / Math.max(1, gaps)
  return off > 1e-12 ? on / off : Infinity
}

/** Energy in a narrow band around `hz`, via a naive Goertzel-style sum. */
function bandEnergy(signal: Float32Array, hz: number, sampleRate = SR): number {
  let re = 0
  let im = 0
  for (let i = 0; i < signal.length; i++) {
    const t = (2 * Math.PI * hz * i) / sampleRate
    re += signal[i] * Math.cos(t)
    im += signal[i] * Math.sin(t)
  }
  return (re * re + im * im) / signal.length
}

function sustainedTone(hz: number, seconds: number, gain = 0.3): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = gain * Math.sin((2 * Math.PI * hz * i) / SR)
  return out
}

function clicks(intervalSec: number, seconds: number, gain = 0.7): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  const step = Math.floor(intervalSec * SR)
  for (let start = 0; start < n; start += step) {
    const burst = Math.floor(0.012 * SR)
    for (let i = 0; i < burst && start + i < n; i++) {
      out[start + i] += gain * Math.exp(-(i / burst) * 5) * (Math.random() * 2 - 1)
    }
  }
  return out
}

function add(...signals: Float32Array[]): Float32Array {
  const length = Math.max(...signals.map((s) => s.length))
  const out = new Float32Array(length)
  for (const signal of signals) {
    for (let i = 0; i < signal.length; i++) out[i] += signal[i]
  }
  return out
}

describe('harmonic / percussive separation', () => {
  it('sends a sustained tone to harmonic and clicks to percussive', () => {
    const tone = sustainedTone(440, 4)
    const hits = clicks(0.5, 4)
    const { harmonic, percussive } = harmonicPercussive(add(tone, hits), SR)

    // The tone's own frequency should survive in the harmonic part and be
    // strongly attenuated in the percussive one.
    const toneInHarmonic = bandEnergy(harmonic, 440)
    const toneInPercussive = bandEnergy(percussive, 440)
    expect(toneInHarmonic).toBeGreaterThan(toneInPercussive * 8)

    // The percussive stem should spike hard at the clicks; the harmonic stem,
    // holding a steady tone, should be close to flat.
    const percussiveContrast = transientContrast(percussive, 0.5)
    const harmonicContrast = transientContrast(harmonic, 0.5)
    expect(percussiveContrast).toBeGreaterThan(6)
    expect(harmonicContrast).toBeLessThan(2.5)
    expect(percussiveContrast).toBeGreaterThan(harmonicContrast * 4)
  })

  it('roughly conserves the signal', () => {
    const input = add(sustainedTone(330, 3), clicks(0.4, 3))
    const { harmonic, percussive } = harmonicPercussive(input, SR)
    const recombined = add(harmonic, percussive)

    // Not sample-exact — soft masks aren't a perfect partition — but the
    // energy should be in the same ballpark.
    const ratio = energy(recombined) / energy(input)
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(1.3)
  })
})

describe('four-stem separation', () => {
  /**
   * A stand-in mix: a centred "vocal", a hard-panned "guitar", a low "bass"
   * and a "drum" pattern.
   */
  function fakeMix(seconds = 6) {
    const vocal = sustainedTone(500, seconds, 0.25)
    const guitar = sustainedTone(830, seconds, 0.25)
    const bass = sustainedTone(80, seconds, 0.3)
    const drums = clicks(0.5, seconds, 0.6)

    const left = new Float32Array(vocal.length)
    const right = new Float32Array(vocal.length)
    for (let i = 0; i < vocal.length; i++) {
      // Vocal centred, guitar entirely on the right.
      left[i] = vocal[i] + bass[i] + drums[i]
      right[i] = vocal[i] + bass[i] + drums[i] + guitar[i]
    }
    return { channels: [left, right], vocal, guitar, bass, drums }
  }

  it('puts the centred voice in vocals and the panned part in other', () => {
    const mix = fakeMix()
    const stems = separateStems(mix.channels, SR)

    const vocalHz = 500
    const guitarHz = 830
    const vocalsMono = stems.vocals[0]
    const otherMono = stems.other[1]

    // The centred tone should be much stronger in vocals than the panned one.
    expect(bandEnergy(vocalsMono, vocalHz)).toBeGreaterThan(bandEnergy(vocalsMono, guitarHz) * 4)
    // And the panned tone should be much stronger in other than the centred one.
    expect(bandEnergy(otherMono, guitarHz)).toBeGreaterThan(bandEnergy(otherMono, vocalHz) * 2)
  })

  it('routes low sustained energy to the bass stem', () => {
    const mix = fakeMix()
    const stems = separateStems(mix.channels, SR)
    const bassHz = 80
    expect(bandEnergy(stems.bass[0], bassHz)).toBeGreaterThan(bandEnergy(stems.vocals[0], bassHz) * 5)
    expect(bandEnergy(stems.bass[0], bassHz)).toBeGreaterThan(bandEnergy(stems.other[0], bassHz) * 5)
  })

  it('puts transients in the drum stem', () => {
    const mix = fakeMix()
    const stems = separateStems(mix.channels, SR)
    // The drum stem should be spiky; the sustained stems should not be.
    expect(transientContrast(stems.drums[0], 0.5)).toBeGreaterThan(5)
    expect(transientContrast(stems.drums[0], 0.5))
      .toBeGreaterThan(transientContrast(stems.vocals[0], 0.5) * 2)
    expect(transientContrast(stems.drums[0], 0.5))
      .toBeGreaterThan(transientContrast(stems.bass[0], 0.5) * 2)
  })

  it('keeps the stems summing back to roughly the original', () => {
    const mix = fakeMix()
    const stems = separateStems(mix.channels, SR)
    const remix = mixStems(stems)
    expect(remix).toHaveLength(2)
    expect(remix[0].length).toBe(mix.channels[0].length)

    const ratio = energy(remix[0]) / energy(mix.channels[0])
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(1.4)
  })

  it('handles a mono source without inventing a vocal separation', () => {
    const mono = add(sustainedTone(440, 4, 0.3), clicks(0.5, 4))
    const stems = separateStems([mono], SR)
    expect(stems.vocals[0].length).toBe(mono.length)
    // No centre cue exists in mono, so vocals stays empty rather than guessing.
    expect(energy(stems.vocals[0])).toBeLessThan(energy(stems.other[0]) * 0.02)
    expect(energy(stems.other[0])).toBeGreaterThan(0)
  })

  it('can select a subset when remixing', () => {
    const mix = fakeMix()
    const stems = separateStems(mix.channels, SR)
    const drumsOnly = mixStems(stems, ['drums'])
    expect(energy(drumsOnly[0])).toBeGreaterThan(0)
    expect(energy(drumsOnly[0])).toBeLessThan(energy(mixStems(stems)[0]))
  })
})
