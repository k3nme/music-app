/**
 * Stem estimation without a neural network.
 *
 * Two classical techniques do most of the work, and they compose well:
 *
 *  1. Harmonic/percussive separation (Fitzgerald 2010). In a spectrogram,
 *     sustained pitched material forms horizontal ridges and percussive hits
 *     form vertical ones. Median-filtering along time suppresses the vertical
 *     structure and leaves the harmonic part; median-filtering along frequency
 *     does the opposite. Soft masks built from the two split the signal.
 *
 *  2. Centre-channel extraction. Lead vocals are almost always panned dead
 *     centre in a commercial mix, so bins where the two channels are strongly
 *     coherent and equal in level are probably vocal; bins that differ are
 *     probably the instruments spread around them.
 *
 * Combining them gives a four-way estimate — vocals, drums, bass, other —
 * that is genuinely useful for remixing. It is an *estimate*: a hard-panned
 * vocal or a mono recording defeats the centre trick, and a bowed cymbal roll
 * is neither clearly harmonic nor clearly percussive. It is honest about that
 * rather than pretending to be Demucs.
 *
 * Language is irrelevant here: this operates on the spectrogram, not on words,
 * so a Tamil vocal separates exactly like an English one.
 */

import { istft, stft, type Spectrogram } from './stft'

export interface StemSet {
  vocals: Float32Array[]
  drums: Float32Array[]
  bass: Float32Array[]
  other: Float32Array[]
}

export type StemName = keyof StemSet

export const STEM_NAMES: StemName[] = ['vocals', 'drums', 'bass', 'other']

export interface StemOptions {
  fftSize: number
  hop: number
  /** Median filter length along time, in frames. Longer = more harmonic. */
  harmonicSpan: number
  /** Median filter length along frequency, in bins. */
  percussiveSpan: number
  /** Mask exponent. 1 is soft (Wiener-ish), 2+ is more decisive. */
  maskPower: number
  /** Everything below this goes to the bass stem. */
  bassCutoffHz: number
  /** How strongly to trust the centre-channel cue. 0 disables it. */
  centreStrength: number
  onProgress?: (fraction: number) => void
}

export const DEFAULT_STEMS: StemOptions = {
  fftSize: 2048,
  hop: 512,
  harmonicSpan: 17,
  percussiveSpan: 17,
  maskPower: 2,
  bassCutoffHz: 220,
  centreStrength: 1,
}

// ---------------------------------------------------------------------------
// Median filtering
// ---------------------------------------------------------------------------

/**
 * Sliding median over a short window. The window is small (17 by default) so
 * an insertion-sorted scratch buffer beats anything cleverer.
 */
function medianOf(values: Float32Array, count: number): number {
  // values[0..count) is copied into a scratch array by the caller.
  const scratch = values.subarray(0, count)
  const sorted = Array.prototype.slice.call(scratch).sort((a: number, b: number) => a - b)
  return sorted[count >> 1]
}

/** Median filter each frequency bin along time — leaves harmonic ridges. */
function medianAlongTime(mag: Float32Array, frames: number, bins: number, span: number): Float32Array {
  const out = new Float32Array(mag.length)
  const half = span >> 1
  const scratch = new Float32Array(span)
  for (let k = 0; k < bins; k++) {
    for (let f = 0; f < frames; f++) {
      let count = 0
      for (let d = -half; d <= half; d++) {
        const idx = f + d
        if (idx < 0 || idx >= frames) continue
        scratch[count++] = mag[idx * bins + k]
      }
      out[f * bins + k] = medianOf(scratch, count)
    }
  }
  return out
}

/** Median filter each frame along frequency — leaves percussive ridges. */
function medianAlongFrequency(mag: Float32Array, frames: number, bins: number, span: number): Float32Array {
  const out = new Float32Array(mag.length)
  const half = span >> 1
  const scratch = new Float32Array(span)
  for (let f = 0; f < frames; f++) {
    const offset = f * bins
    for (let k = 0; k < bins; k++) {
      let count = 0
      for (let d = -half; d <= half; d++) {
        const idx = k + d
        if (idx < 0 || idx >= bins) continue
        scratch[count++] = mag[offset + idx]
      }
      out[offset + k] = medianOf(scratch, count)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Harmonic / percussive
// ---------------------------------------------------------------------------

export interface HPMasks {
  harmonic: Float32Array
  percussive: Float32Array
}

/** Soft masks that sum to one, per time-frequency bin. */
export function harmonicPercussiveMasks(
  spec: Spectrogram, harmonicSpan: number, percussiveSpan: number, power: number,
): HPMasks {
  const { mag, frames, bins } = spec
  const h = medianAlongTime(mag, frames, bins, harmonicSpan)
  const p = medianAlongFrequency(mag, frames, bins, percussiveSpan)

  const harmonic = new Float32Array(mag.length)
  const percussive = new Float32Array(mag.length)
  for (let i = 0; i < mag.length; i++) {
    const hp = Math.pow(h[i], power)
    const pp = Math.pow(p[i], power)
    const total = hp + pp
    if (total < 1e-20) {
      harmonic[i] = 0.5
      percussive[i] = 0.5
    } else {
      harmonic[i] = hp / total
      percussive[i] = pp / total
    }
  }
  return { harmonic, percussive }
}

/** Split a mono signal into its sustained and percussive parts. */
export function harmonicPercussive(
  signal: Float32Array, sampleRate: number, options: Partial<StemOptions> = {},
): { harmonic: Float32Array; percussive: Float32Array } {
  const o = { ...DEFAULT_STEMS, ...options }
  const spec = stft(signal, o.fftSize, o.hop, sampleRate)
  const masks = harmonicPercussiveMasks(spec, o.harmonicSpan, o.percussiveSpan, o.maskPower)
  return {
    harmonic: applyMask(spec, masks.harmonic, signal.length),
    percussive: applyMask(spec, masks.percussive, signal.length),
  }
}

function applyMask(spec: Spectrogram, mask: Float32Array, outputLength: number): Float32Array {
  const masked: Spectrogram = {
    ...spec,
    mag: new Float32Array(spec.mag.length),
  }
  for (let i = 0; i < spec.mag.length; i++) masked.mag[i] = spec.mag[i] * mask[i]
  return istft(masked, outputLength)
}

// ---------------------------------------------------------------------------
// Centre extraction
// ---------------------------------------------------------------------------

/**
 * Per-bin likelihood that content is centre-panned.
 *
 * Two cues combined: coherence (are the channels in phase?) and balance (are
 * they the same level?). Both must hold for centre-panned material. A mono
 * file has no information here, so it returns all-ones and the caller has to
 * lean on the harmonic split instead.
 */
export function centreMask(left: Spectrogram, right: Spectrogram, strength: number): Float32Array {
  const out = new Float32Array(left.mag.length)
  for (let i = 0; i < out.length; i++) {
    const lm = left.mag[i]
    const rm = right.mag[i]
    const denom = lm * lm + rm * rm
    if (denom < 1e-20) { out[i] = 0; continue }

    // Coherence: cos of the inter-channel phase difference, rectified.
    const phaseDelta = left.phase[i] - right.phase[i]
    const coherence = Math.max(0, Math.cos(phaseDelta))
    // Balance: 1 when the levels match, 0 when all the energy is on one side.
    const balance = (2 * lm * rm) / denom

    out[i] = Math.pow(coherence * balance, Math.max(0.01, strength) * 2)
  }
  return out
}

// ---------------------------------------------------------------------------
// Four-stem estimate
// ---------------------------------------------------------------------------

/**
 * Chunked so memory stays bounded: a four-minute stereo track at 44.1 kHz
 * would need hundreds of megabytes to hold a full-resolution spectrogram, so
 * it is processed in overlapping windows and crossfaded back together.
 */
const CHUNK_SEC = 20
const FADE_SEC = 0.5

export function separateStems(
  channels: Float32Array[], sampleRate: number, options: Partial<StemOptions> = {},
): StemSet {
  const o = { ...DEFAULT_STEMS, ...options }
  const length = channels[0]?.length ?? 0
  const channelCount = Math.min(2, Math.max(1, channels.length))
  const stereo = channelCount === 2

  const make = () => Array.from({ length: channelCount }, () => new Float32Array(length))
  const result: StemSet = { vocals: make(), drums: make(), bass: make(), other: make() }
  const weight = new Float32Array(length)

  const chunk = Math.floor(CHUNK_SEC * sampleRate)
  const fade = Math.floor(FADE_SEC * sampleRate)
  const step = Math.max(1, chunk - fade)
  const chunks = Math.max(1, Math.ceil(length / step))

  for (let index = 0, start = 0; start < length; index++, start += step) {
    const end = Math.min(length, start + chunk)
    const size = end - start
    if (size < o.fftSize) break

    const slices = channels.slice(0, channelCount).map((c) => c.subarray(start, end))
    const specs = slices.map((slice) => stft(slice, o.fftSize, o.hop, sampleRate))

    // Harmonic/percussive is computed on the channel sum, so both channels get
    // the same mask and the stereo image survives separation.
    const monoSpec = specs.length === 1 ? specs[0] : sumSpectra(specs)
    const hp = harmonicPercussiveMasks(monoSpec, o.harmonicSpan, o.percussiveSpan, o.maskPower)
    const centre = stereo && o.centreStrength > 0
      ? centreMask(specs[0], specs[1], o.centreStrength)
      : null

    const bins = monoSpec.bins
    const bassBin = Math.max(1, Math.floor((o.bassCutoffHz * o.fftSize) / sampleRate))

    for (let channel = 0; channel < channelCount; channel++) {
      const spec = specs[channel]
      const masks: Record<StemName, Float32Array> = {
        vocals: new Float32Array(spec.mag.length),
        drums: new Float32Array(spec.mag.length),
        bass: new Float32Array(spec.mag.length),
        other: new Float32Array(spec.mag.length),
      }

      for (let f = 0; f < spec.frames; f++) {
        for (let k = 0; k < bins; k++) {
          const i = f * bins + k
          const harmonic = hp.harmonic[i]
          const percussive = hp.percussive[i]

          // Percussive energy is drums, wherever it sits in the spectrum —
          // that keeps the kick's transient with the kit rather than the bass.
          masks.drums[i] = percussive

          if (k < bassBin) {
            // Sustained low end is the bass part.
            masks.bass[i] = harmonic
          } else if (centre) {
            const isCentre = centre[i]
            masks.vocals[i] = harmonic * isCentre
            masks.other[i] = harmonic * (1 - isCentre)
          } else {
            // Mono source: no centre cue available, so everything sustained
            // above the bass goes to "other" and vocals stay empty rather
            // than pretending to a separation we can't make.
            masks.other[i] = harmonic
          }
        }
      }

      for (const name of STEM_NAMES) {
        const rendered = applyMask(spec, masks[name], size)
        blend(result[name][channel], rendered, start, index, fade, length)
      }
    }

    accumulateWeight(weight, start, size, index, fade)
    o.onProgress?.(Math.min(1, (index + 1) / chunks))
    if (end >= length) break
  }

  // Normalise the crossfade so overlapped regions don't sum louder.
  for (const name of STEM_NAMES) {
    for (const channel of result[name]) {
      for (let i = 0; i < length; i++) {
        if (weight[i] > 1e-6) channel[i] /= weight[i]
      }
    }
  }

  return result
}

function sumSpectra(specs: Spectrogram[]): Spectrogram {
  const first = specs[0]
  const mag = new Float32Array(first.mag.length)
  for (const spec of specs) {
    for (let i = 0; i < mag.length; i++) mag[i] += spec.mag[i]
  }
  const scale = 1 / specs.length
  for (let i = 0; i < mag.length; i++) mag[i] *= scale
  return { ...first, mag, phase: first.phase }
}

/** Equal-power-ish ramp at the chunk edges so joins are inaudible. */
function fadeGain(offset: number, size: number, isFirst: boolean, fade: number): number {
  if (fade <= 0) return 1
  const inGain = isFirst ? 1 : Math.min(1, offset / fade)
  const outGain = Math.min(1, (size - offset) / fade)
  return Math.min(inGain, outGain)
}

function blend(
  target: Float32Array, source: Float32Array, start: number,
  index: number, fade: number, length: number,
) {
  const size = source.length
  for (let i = 0; i < size; i++) {
    const at = start + i
    if (at >= length) break
    target[at] += source[i] * fadeGain(i, size, index === 0, fade)
  }
}

function accumulateWeight(weight: Float32Array, start: number, size: number, index: number, fade: number) {
  for (let i = 0; i < size; i++) {
    const at = start + i
    if (at >= weight.length) break
    weight[at] += fadeGain(i, size, index === 0, fade)
  }
}

/** Sum a set of stems back into one signal — used to check nothing was lost. */
export function mixStems(stems: StemSet, selection: StemName[] = STEM_NAMES): Float32Array[] {
  const first = stems[selection[0]]
  const channelCount = first.length
  const length = first[0].length
  return Array.from({ length: channelCount }, (_, channel) => {
    const out = new Float32Array(length)
    for (const name of selection) {
      const source = stems[name][channel]
      for (let i = 0; i < length; i++) out[i] += source[i]
    }
    return out
  })
}
