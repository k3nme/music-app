/**
 * Short-time Fourier transform: a streaming frame iterator for analysis, and
 * a block form for processing that needs the whole picture at once.
 *
 * The streaming form matters. A four-minute song at 44.1 kHz with a 2048-point
 * window and 512 hop is about 20,000 frames; holding magnitude and phase for
 * all of them is ~160 MB. Analysis passes only need one frame at a time, so
 * they get an iterator, and the block form is used on bounded chunks.
 */

import { getFFT, hann } from './fft'

export interface Spectrogram {
  frames: number
  bins: number
  fftSize: number
  hop: number
  sampleRate: number
  /** frames x bins, row-major. */
  mag: Float32Array
  /** frames x bins, row-major. */
  phase: Float32Array
}

/** How many frames a signal of this length produces (centred, zero-padded). */
export function frameCount(length: number, hop: number): number {
  return Math.max(1, Math.ceil(length / hop) + 1)
}

/**
 * Walks the signal frame by frame, handing the callback the complex spectrum.
 * The arrays are reused between frames — copy anything you need to keep.
 */
export function forEachFrame(
  signal: Float32Array,
  fftSize: number,
  hop: number,
  visit: (re: Float64Array, im: Float64Array, frame: number, start: number) => void,
): number {
  const fft = getFFT(fftSize)
  const window = hann(fftSize)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  // Centre the first window on sample 0, as every analysis convention expects.
  const half = fftSize >> 1
  const total = frameCount(signal.length, hop)

  for (let frame = 0; frame < total; frame++) {
    const start = frame * hop - half
    im.fill(0)
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i
      re[i] = idx >= 0 && idx < signal.length ? signal[idx] * window[i] : 0
    }
    fft.forward(re, im)
    visit(re, im, frame, start)
  }
  return total
}

export function stft(
  signal: Float32Array, fftSize: number, hop: number, sampleRate: number,
): Spectrogram {
  const bins = fftSize / 2 + 1
  const frames = frameCount(signal.length, hop)
  const mag = new Float32Array(frames * bins)
  const phase = new Float32Array(frames * bins)

  forEachFrame(signal, fftSize, hop, (re, im, frame) => {
    const offset = frame * bins
    for (let k = 0; k < bins; k++) {
      mag[offset + k] = Math.hypot(re[k], im[k])
      phase[offset + k] = Math.atan2(im[k], re[k])
    }
  })

  return { frames, bins, fftSize, hop, sampleRate, mag, phase }
}

/**
 * Overlap-add resynthesis. Uses a Hann synthesis window on top of the Hann
 * analysis window and divides out the summed window energy, which keeps the
 * result flat even where frames don't perfectly overlap (the very start and
 * end of the signal).
 */
export function istft(spec: Spectrogram, outputLength?: number): Float32Array {
  const { frames, bins, fftSize, hop } = spec
  const fft = getFFT(fftSize)
  const window = hann(fftSize)
  const half = fftSize >> 1

  const length = outputLength ?? Math.max(1, (frames - 1) * hop)
  const out = new Float64Array(length + fftSize)
  const norm = new Float64Array(length + fftSize)

  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)

  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * bins
    re.fill(0)
    im.fill(0)
    for (let k = 0; k < bins; k++) {
      const m = spec.mag[offset + k]
      const p = spec.phase[offset + k]
      re[k] = m * Math.cos(p)
      im[k] = m * Math.sin(p)
      // Mirror into the negative frequencies so the inverse is real.
      if (k > 0 && k < fftSize - k) {
        re[fftSize - k] = re[k]
        im[fftSize - k] = -im[k]
      }
    }
    fft.inverse(re, im)

    const start = frame * hop - half
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i
      if (idx < 0 || idx >= out.length) continue
      out[idx] += re[i] * window[i]
      norm[idx] += window[i] * window[i]
    }
  }

  const result = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    result[i] = norm[i] > 1e-8 ? out[i] / norm[i] : 0
  }
  return result
}

/** Bin index -> centre frequency in Hz. */
export function binToHz(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const length = channels[0].length
  const out = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[i]
  }
  const scale = 1 / channels.length
  for (let i = 0; i < length; i++) out[i] *= scale
  return out
}

/**
 * Cheap decimation with a boxcar pre-filter. Analysis runs at a lower rate —
 * nothing above ~5 kHz matters for tempo or key, and it makes the FFTs cheap.
 */
export function resampleLinear(input: Float32Array, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-9) return input
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLength)
  if (ratio > 1) {
    const window = Math.max(1, Math.floor(ratio))
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio)
      let sum = 0
      for (let j = 0; j < window; j++) sum += input[Math.min(input.length - 1, start + j)]
      out[i] = sum / window
    }
  } else {
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio
      const i0 = Math.floor(pos)
      const frac = pos - i0
      const a = input[Math.min(input.length - 1, i0)]
      const b = input[Math.min(input.length - 1, i0 + 1)]
      out[i] = a + (b - a) * frac
    }
  }
  return out
}
