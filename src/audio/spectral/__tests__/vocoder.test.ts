import { describe, expect, it } from 'vitest'
import { istft, resampleLinear, stft, toMono } from '../stft'
import { pitchShift, resample, timeStretch, warp } from '../vocoder'
import { magnitudeSpectrum } from '../fft'

const SR = 44100

function tone(hz: number, seconds: number, sampleRate = SR, harmonics = 3): Float32Array {
  const n = Math.floor(seconds * sampleRate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    let v = 0
    for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * hz * h * t) / h
    // Gentle fades so the edges don't dominate the spectrum.
    const env = Math.min(1, t / 0.02) * Math.min(1, (seconds - t) / 0.02)
    out[i] = (v / 1.85) * 0.6 * env
  }
  return out
}

/** Peak frequency with parabolic interpolation, measured mid-signal. */
function dominantHz(signal: Float32Array, sampleRate = SR): number {
  const n = 8192
  const start = Math.max(0, Math.floor(signal.length / 2) - n / 2)
  const frame = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = signal[start + i] ?? 0
    frame[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))
  }
  const mags = magnitudeSpectrum(frame, n)
  let peak = 1
  for (let k = 2; k < mags.length - 1; k++) if (mags[k] > mags[peak]) peak = k
  const a = mags[peak - 1], b = mags[peak], c = mags[peak + 1]
  const denom = a - 2 * b + c
  const offset = Math.abs(denom) > 1e-12 ? (0.5 * (a - c)) / denom : 0
  return ((peak + offset) * sampleRate) / n
}

function rms(signal: Float32Array): number {
  let sum = 0
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i]
  return Math.sqrt(sum / Math.max(1, signal.length))
}

describe('stft / istft', () => {
  it('round-trips a signal to within a whisker', () => {
    const signal = tone(220, 0.4)
    const spec = stft(signal, 1024, 256, SR)
    const back = istft(spec, signal.length)
    expect(back.length).toBe(signal.length)

    // Compare away from the edges, where the window taper dominates.
    let error = 0
    let energy = 0
    for (let i = 2048; i < signal.length - 2048; i++) {
      error += (back[i] - signal[i]) ** 2
      energy += signal[i] ** 2
    }
    expect(Math.sqrt(error / energy)).toBeLessThan(0.01)
  })
})

describe('timeStretch', () => {
  it('changes length by the requested factor', () => {
    const signal = tone(440, 0.5)
    for (const factor of [0.5, 0.75, 1.5, 2]) {
      const out = timeStretch(signal, factor)
      expect(Math.abs(out.length - signal.length * factor)).toBeLessThan(2)
    }
  })

  it('keeps the pitch where it was', () => {
    const signal = tone(440, 1)
    for (const factor of [0.6, 1.4, 2]) {
      const out = timeStretch(signal, factor)
      expect(dominantHz(out), `factor ${factor}`).toBeCloseTo(440, -1)
      expect(Math.abs(dominantHz(out) - 440)).toBeLessThan(6)
    }
  })

  it('roughly preserves level', () => {
    const signal = tone(330, 0.8)
    const out = timeStretch(signal, 1.5)
    expect(rms(out)).toBeGreaterThan(rms(signal) * 0.7)
    expect(rms(out)).toBeLessThan(rms(signal) * 1.4)
  })

  it('is a no-op at factor 1', () => {
    const signal = tone(300, 0.2)
    const out = timeStretch(signal, 1)
    expect(out.length).toBe(signal.length)
    expect(out[1000]).toBeCloseTo(signal[1000], 6)
  })
})

describe('pitchShift', () => {
  it('shifts by the right interval and keeps the length', () => {
    const signal = tone(440, 1)
    for (const semitones of [-12, -5, 2, 7, 12]) {
      const out = pitchShift(signal, semitones)
      expect(out.length).toBe(signal.length)
      const expected = 440 * Math.pow(2, semitones / 12)
      const measured = dominantHz(out)
      // Within about a quarter tone.
      expect(Math.abs(1200 * Math.log2(measured / expected)), `${semitones} st`).toBeLessThan(45)
    }
  })
})

describe('warp', () => {
  it('changes tempo and key in one pass', () => {
    const signal = tone(440, 1)
    const out = warp(signal, 0.75, 3)
    expect(Math.abs(out.length - signal.length * 0.75)).toBeLessThan(3)
    const expected = 440 * Math.pow(2, 3 / 12)
    expect(Math.abs(1200 * Math.log2(dominantHz(out) / expected))).toBeLessThan(45)
  })

  it('short-circuits when there is nothing to do', () => {
    const signal = tone(440, 0.1)
    const out = warp(signal, 1, 0)
    expect(Array.from(out.slice(0, 50))).toEqual(Array.from(signal.slice(0, 50)))
  })
})

describe('resampling helpers', () => {
  it('resample halves the length at step 2', () => {
    const signal = tone(440, 0.2)
    expect(resample(signal, 2).length).toBe(Math.floor(signal.length / 2))
  })

  it('resampleLinear decimates and interpolates', () => {
    const signal = tone(440, 0.2)
    expect(resampleLinear(signal, 2).length).toBe(Math.floor(signal.length / 2))
    expect(resampleLinear(signal, 0.5).length).toBe(signal.length * 2)
  })

  it('toMono averages channels', () => {
    const a = Float32Array.from([1, 1, 1])
    const b = Float32Array.from([-1, 0, 1])
    expect(Array.from(toMono([a, b]))).toEqual([0, 0.5, 1])
  })
})
