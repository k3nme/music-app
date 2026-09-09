import { describe, expect, it } from 'vitest'
import { FFT, getFFT, hann, magnitudeSpectrum, nextPow2 } from '../fft'

function sine(n: number, cyclesPerBuffer: number, amplitude = 1, phase = 0): Float64Array {
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.cos((2 * Math.PI * cyclesPerBuffer * i) / n + phase)
  return out
}

describe('FFT', () => {
  it('rejects non-power-of-two sizes', () => {
    expect(() => new FFT(100)).toThrow()
  })

  it('puts a pure tone in exactly one bin', () => {
    const n = 1024
    const re = sine(n, 64)
    const im = new Float64Array(n)
    getFFT(n).forward(re, im)
    const mags = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]))
    const peak = mags.indexOf(Math.max(...mags))
    expect(peak).toBe(64)
    // Neighbours should be essentially empty for an exact-bin frequency.
    expect(mags[63]).toBeLessThan(mags[64] * 1e-6)
  })

  it('round-trips forward then inverse', () => {
    const n = 512
    const original = new Float64Array(n)
    for (let i = 0; i < n; i++) original[i] = Math.sin(i * 0.31) * 0.7 + Math.random() * 0.2 - 0.1
    const re = Float64Array.from(original)
    const im = new Float64Array(n)
    const fft = getFFT(n)
    fft.forward(re, im)
    fft.inverse(re, im)
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(original[i], 10)
      expect(im[i]).toBeCloseTo(0, 10)
    }
  })

  it('is linear', () => {
    const n = 256
    const a = sine(n, 10)
    const b = sine(n, 37, 0.5)
    const sum = Float64Array.from(a, (v, i) => v + b[i])

    const magOf = (x: Float64Array) => {
      const re = Float64Array.from(x)
      const im = new Float64Array(n)
      getFFT(n).forward(re, im)
      return { re, im }
    }
    const A = magOf(a), B = magOf(b), S = magOf(sum)
    for (let k = 0; k < n; k++) {
      expect(S.re[k]).toBeCloseTo(A.re[k] + B.re[k], 9)
      expect(S.im[k]).toBeCloseTo(A.im[k] + B.im[k], 9)
    }
  })

  it('scales magnitude with amplitude', () => {
    const quiet = magnitudeSpectrum(sine(512, 32, 0.25), 512)
    const loud = magnitudeSpectrum(sine(512, 32, 1), 512)
    expect(loud[32] / quiet[32]).toBeCloseTo(4, 4)
  })
})

describe('hann', () => {
  it('is periodic and sums to constant overlap-add at 4x', () => {
    const n = 1024
    const hop = n / 4
    const w = hann(n)
    expect(w[0]).toBeCloseTo(0, 12)

    // COLA: overlapped squared windows should sum to a constant in the middle.
    const total = n * 3
    const acc = new Float64Array(total)
    for (let start = 0; start + n <= total; start += hop) {
      for (let i = 0; i < n; i++) acc[start + i] += w[i] * w[i]
    }
    const middle = acc.slice(n, total - n)
    const first = middle[0]
    for (const v of middle) expect(v).toBeCloseTo(first, 10)
  })
})

describe('nextPow2', () => {
  it('rounds up', () => {
    expect(nextPow2(1)).toBe(1)
    expect(nextPow2(1000)).toBe(1024)
    expect(nextPow2(1024)).toBe(1024)
  })
})
