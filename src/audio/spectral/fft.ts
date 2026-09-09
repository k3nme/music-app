/**
 * Radix-2 FFT and the real-signal helpers built on it.
 *
 * Everything spectral in Overtone — time-stretching, stem separation, tempo
 * and key detection — runs through here, so it's written to be allocation-free
 * in the inner loop: a plan precomputes twiddle factors and bit-reversal
 * indices once per size, and transforms run in place.
 */

export class FFT {
  readonly size: number
  private readonly levels: number
  private readonly cosTable: Float64Array
  private readonly sinTable: Float64Array
  private readonly reverse: Uint32Array

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`)
    }
    this.size = size
    this.levels = Math.log2(size)

    const half = size / 2
    this.cosTable = new Float64Array(half)
    this.sinTable = new Float64Array(half)
    for (let i = 0; i < half; i++) {
      this.cosTable[i] = Math.cos((2 * Math.PI * i) / size)
      this.sinTable[i] = Math.sin((2 * Math.PI * i) / size)
    }

    this.reverse = new Uint32Array(size)
    for (let i = 0; i < size; i++) {
      let x = i
      let r = 0
      for (let b = 0; b < this.levels; b++) {
        r = (r << 1) | (x & 1)
        x >>= 1
      }
      this.reverse[i] = r
    }
  }

  /** In-place complex forward transform. */
  forward(re: Float64Array, im: Float64Array): void {
    this.transform(re, im)
  }

  /**
   * In-place inverse transform, scaled by 1/N so that
   * `inverse(forward(x))` returns `x`.
   */
  inverse(re: Float64Array, im: Float64Array): void {
    // The conjugate trick: swapping re/im turns a forward transform into an
    // inverse one, which keeps a single butterfly implementation.
    this.transform(im, re)
    const n = this.size
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }

  private transform(re: Float64Array, im: Float64Array): void {
    const n = this.size
    const rev = this.reverse

    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }

    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j++, k += step) {
          const l = j + halfSize
          const cos = this.cosTable[k]
          const sin = this.sinTable[k]
          const tre = re[l] * cos + im[l] * sin
          const tim = -re[l] * sin + im[l] * cos
          re[l] = re[j] - tre
          im[l] = im[j] - tim
          re[j] += tre
          im[j] += tim
        }
      }
    }
  }
}

const plans = new Map<number, FFT>()

/** Cached plan — building twiddle tables per frame would dominate the cost. */
export function getFFT(size: number): FFT {
  let plan = plans.get(size)
  if (!plan) {
    plan = new FFT(size)
    plans.set(size, plan)
  }
  return plan
}

/** Next power of two at or above `n`. */
export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

const windowCache = new Map<string, Float64Array>()

/**
 * Periodic Hann window — the periodic (not symmetric) form is the one that
 * satisfies constant-overlap-add, which is what STFT resynthesis needs.
 */
export function hann(size: number): Float64Array {
  const key = `hann:${size}`
  const hit = windowCache.get(key)
  if (hit) return hit
  const w = new Float64Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  windowCache.set(key, w)
  return w
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/** Magnitude spectrum of a real frame. Returns size/2 + 1 bins. */
export function magnitudeSpectrum(frame: Float32Array | Float64Array, fftSize?: number): Float64Array {
  const n = fftSize ?? nextPow2(frame.length)
  const fft = getFFT(n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  re.set(frame.subarray(0, Math.min(frame.length, n)))
  fft.forward(re, im)
  const bins = n / 2 + 1
  const out = new Float64Array(bins)
  for (let k = 0; k < bins; k++) out[k] = Math.hypot(re[k], im[k])
  return out
}
