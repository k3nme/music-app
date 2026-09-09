/**
 * Phase vocoder: time-stretch and pitch-shift.
 *
 * This is the piece that makes a mashup possible. Two songs at different
 * tempos in different keys have to be pulled onto a common grid, and doing
 * that by changing playback speed drags the pitch with it — fine for a DJ
 * nudging 2%, useless for matching 92 BPM to 128.
 *
 * Implementation notes:
 *  - Synthesis hop is fixed and the analysis pointer moves fractionally, so
 *    the output length is exact rather than accumulating rounding error.
 *  - Identity phase locking (Laroche & Dolson) ties each spectral peak's
 *    neighbourhood to the peak's phase. Without it, stretched material gets
 *    the smeared, watery "phasiness" that gives cheap stretching away.
 *  - Transient detection resets phase on sharp spectral flux increases, which
 *    keeps drum hits crisp instead of pre-echoing.
 */

import { getFFT, hann } from './fft'

export interface StretchOptions {
  fftSize: number
  /** Synthesis hop. fftSize/4 is the usual quality/cost balance. */
  hop: number
  /** Lock bins around each spectral peak to that peak's phase. */
  phaseLock: boolean
  /** Reset phase on transients so drums stay punchy. */
  transientReset: boolean
  onProgress?: (fraction: number) => void
}

export const DEFAULT_STRETCH: StretchOptions = {
  fftSize: 2048, hop: 512, phaseLock: true, transientReset: true,
}

const TWO_PI = Math.PI * 2

function wrapPhase(x: number): number {
  return x - TWO_PI * Math.round(x / TWO_PI)
}

/**
 * Stretch `signal` to `factor` times its length, preserving pitch.
 * factor > 1 makes it longer (slower); factor < 1 shorter (faster).
 */
export function timeStretch(
  signal: Float32Array, factor: number, options: Partial<StretchOptions> = {},
): Float32Array {
  const o = { ...DEFAULT_STRETCH, ...options }
  if (Math.abs(factor - 1) < 1e-6) return Float32Array.from(signal)
  if (signal.length === 0) return new Float32Array(0)

  const N = o.fftSize
  const bins = N / 2 + 1
  const Hs = o.hop
  const fft = getFFT(N)
  const window = hann(N)
  const half = N >> 1

  const outLength = Math.max(1, Math.round(signal.length * factor))
  const out = new Float64Array(outLength + N)
  const norm = new Float64Array(outLength + N)

  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const mag = new Float64Array(bins)
  const phase = new Float64Array(bins)
  const prevPhase = new Float64Array(bins)
  const sumPhase = new Float64Array(bins)
  const prevMag = new Float64Array(bins)
  const peakOf = new Int32Array(bins)

  const totalFrames = Math.ceil(outLength / Hs) + 1
  let prevAnalysis = 0
  let first = true

  for (let frame = 0; frame < totalFrames; frame++) {
    // Fractional analysis position, rounded per frame; the true hop between
    // consecutive frames is what the phase maths uses, so nothing drifts.
    const analysis = Math.round((frame * Hs) / factor)
    const deltaA = first ? Hs / factor : analysis - prevAnalysis

    const start = analysis - half
    im.fill(0)
    for (let i = 0; i < N; i++) {
      const idx = start + i
      re[i] = idx >= 0 && idx < signal.length ? signal[idx] * window[i] : 0
    }
    fft.forward(re, im)

    for (let k = 0; k < bins; k++) {
      mag[k] = Math.hypot(re[k], im[k])
      phase[k] = Math.atan2(im[k], re[k])
    }

    // Transient? Positive spectral flux spiking means a new event started;
    // re-seeding the phase from the analysis frame avoids smearing it.
    let transient = false
    if (o.transientReset && !first) {
      let flux = 0
      let energy = 0
      for (let k = 0; k < bins; k++) {
        const d = mag[k] - prevMag[k]
        if (d > 0) flux += d
        energy += mag[k]
      }
      transient = energy > 1e-6 && flux / energy > 0.42
    }

    if (first || transient) {
      for (let k = 0; k < bins; k++) sumPhase[k] = phase[k]
    } else {
      const ratio = Hs / Math.max(1e-9, deltaA)
      for (let k = 0; k < bins; k++) {
        const expected = (TWO_PI * k * deltaA) / N
        const deviation = wrapPhase(phase[k] - prevPhase[k] - expected)
        sumPhase[k] = wrapPhase(sumPhase[k] + (expected + deviation) * ratio)
      }
    }

    // Identity phase locking: bins in a peak's basin inherit the peak's
    // synthesis phase, offset by their original relationship to it.
    if (o.phaseLock && !first && !transient) {
      let peak = 0
      for (let k = 0; k < bins; k++) {
        const isPeak =
          mag[k] > mag[Math.max(0, k - 1)] && mag[k] > mag[Math.min(bins - 1, k + 1)] &&
          mag[k] > mag[Math.max(0, k - 2)] && mag[k] > mag[Math.min(bins - 1, k + 2)]
        if (isPeak) peak = k
        peakOf[k] = peak
      }
      // Sweep back so bins above the last peak attach to the nearer one.
      for (let k = bins - 2; k >= 0; k--) {
        const above = peakOf[k + 1]
        if (above !== peakOf[k] && mag[above] > mag[peakOf[k]] &&
            above - k < k - peakOf[k]) {
          peakOf[k] = above
        }
      }
      for (let k = 0; k < bins; k++) {
        const p = peakOf[k]
        if (p !== k) sumPhase[k] = sumPhase[p] + (phase[k] - phase[p])
      }
    }

    re.fill(0)
    im.fill(0)
    for (let k = 0; k < bins; k++) {
      const m = mag[k]
      const p = sumPhase[k]
      re[k] = m * Math.cos(p)
      im[k] = m * Math.sin(p)
      if (k > 0 && k < N - k) {
        re[N - k] = re[k]
        im[N - k] = -im[k]
      }
    }
    fft.inverse(re, im)

    const outStart = frame * Hs - half
    for (let i = 0; i < N; i++) {
      const idx = outStart + i
      if (idx < 0 || idx >= out.length) continue
      out[idx] += re[i] * window[i]
      norm[idx] += window[i] * window[i]
    }

    prevPhase.set(phase)
    prevMag.set(mag)
    prevAnalysis = analysis
    first = false

    if (o.onProgress && frame % 64 === 0) o.onProgress(frame / totalFrames)
  }

  const result = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    result[i] = norm[i] > 1e-8 ? out[i] / norm[i] : 0
  }
  return result
}

/** Cubic (Catmull-Rom) resampling — cleaner than linear on pitch-shifted audio. */
export function resample(signal: Float32Array, step: number, outLength?: number): Float32Array {
  const length = outLength ?? Math.max(1, Math.floor(signal.length / step))
  const out = new Float32Array(length)
  const n = signal.length
  const at = (i: number) => signal[i < 0 ? 0 : i >= n ? n - 1 : i]

  for (let i = 0; i < length; i++) {
    const pos = i * step
    const i1 = Math.floor(pos)
    const t = pos - i1
    const p0 = at(i1 - 1), p1 = at(i1), p2 = at(i1 + 1), p3 = at(i1 + 2)
    out[i] = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  }
  return out
}

/**
 * Shift pitch by `semitones` without changing the length: stretch by the pitch
 * ratio, then resample back down by the same ratio.
 */
export function pitchShift(
  signal: Float32Array, semitones: number, options: Partial<StretchOptions> = {},
): Float32Array {
  if (Math.abs(semitones) < 1e-6) return Float32Array.from(signal)
  const ratio = Math.pow(2, semitones / 12)
  const stretched = timeStretch(signal, ratio, options)
  return resample(stretched, ratio, signal.length)
}

/**
 * The one the mashup lab actually calls: change tempo and key in a single
 * pass, so the audio only goes through the vocoder once.
 *
 * `stretch` is the output/input length ratio; `semitones` is the transposition.
 */
export function warp(
  signal: Float32Array, stretch: number, semitones: number,
  options: Partial<StretchOptions> = {},
): Float32Array {
  const identityStretch = Math.abs(stretch - 1) < 1e-6
  const identityShift = Math.abs(semitones) < 1e-6
  if (identityStretch && identityShift) return Float32Array.from(signal)

  const ratio = Math.pow(2, semitones / 12)
  const outLength = Math.max(1, Math.round(signal.length * stretch))
  if (identityShift) return timeStretch(signal, stretch, options)

  // Stretch by (target x pitch ratio), then resample by the pitch ratio: the
  // resample undoes the extra length and takes the pitch with it.
  const stretched = timeStretch(signal, stretch * ratio, options)
  return resample(stretched, ratio, outLength)
}
