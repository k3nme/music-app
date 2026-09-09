/**
 * Analysis of recorded audio: tempo, beat grid, key, tuning and chords.
 *
 * This is what lets two finished songs be put on a common grid. It runs on
 * decoded samples and has no Web Audio or DOM dependency, so it works in a
 * worker and in tests alike.
 *
 * A deliberate cross-cultural detail: tuning reference is *estimated*, not
 * assumed. Plenty of recordings — older film music, a lot of Indian and Arabic
 * repertoire, anything cut to tape — sit tens of cents away from A440. Reading
 * the actual reference before building the chroma means the key comes out
 * right instead of landing between two semitones, and that a transposition
 * computed from it is genuinely in tune.
 */

import { forEachFrame, resampleLinear, toMono } from '../spectral/stft'
import type { ScaleId } from '../../music/theory'

/** Analysis runs here regardless of the source rate. */
export const AUDIO_ANALYSIS_RATE = 22050
const FFT_SIZE = 2048
const HOP = 256
/**
 * Harmony needs far finer frequency resolution than onsets do. At 2048 points
 * and 22 kHz a bin spans 10.8 Hz — wider than a semitone anywhere below about
 * 400 Hz, so bass notes land in the wrong pitch class and no amount of tuning
 * correction can rescue the chroma. 8192 points gives 2.7 Hz, comfortably
 * inside a semitone down to the 110 Hz floor used here.
 */
const HARMONIC_FFT = 8192
const HARMONIC_HOP = 2048

export interface BeatGrid {
  bpm: number
  /** 0..1 — how strongly the envelope agreed with this pulse. */
  confidence: number
  /** Seconds from the start of the file to the first beat. */
  offsetSec: number
  /** Seconds to the first downbeat (bar 1, beat 1). */
  downbeatSec: number
  beatsPerBar: number
}

export interface KeyEstimate {
  /** Pitch class 0-11. */
  root: number
  mode: 'major' | 'minor'
  scale: ScaleId
  confidence: number
  /**
   * How far the recording's tuning sits from A440, in cents. Positive means
   * sharp. Applied when building chroma and when computing a transposition.
   */
  tuningCents: number
}

export interface ChordEvent {
  timeSec: number
  durationSec: number
  root: number
  quality: 'maj' | 'min'
  confidence: number
}

export interface AudioAnalysis {
  durationSec: number
  sampleRate: number
  channels: number
  beat: BeatGrid
  key: KeyEstimate
  chords: ChordEvent[]
  /** Interleaved min/max pairs for waveform drawing. */
  peaks: Float32Array
  /** Integrated level in dBFS — used to level-match stems in a mashup. */
  loudnessDb: number
}

// ---------------------------------------------------------------------------
// Onset envelope
// ---------------------------------------------------------------------------

/**
 * Spectral flux on a log-magnitude spectrum: the sum of positive frame-to-frame
 * increases. Log compression matters — on linear magnitudes a loud chorus
 * swamps a quiet verse and the tempo estimate follows the loudest section.
 */
function onsetEnvelope(signal: Float32Array): { flux: Float32Array; lowFlux: Float32Array; fps: number } {
  const bins = FFT_SIZE / 2 + 1
  const previous = new Float64Array(bins)
  const flux: number[] = []
  const lowFlux: number[] = []
  // Bass band, for finding downbeats: kick drums live below ~200 Hz.
  const lowBin = Math.max(1, Math.floor((200 * FFT_SIZE) / AUDIO_ANALYSIS_RATE))

  forEachFrame(signal, FFT_SIZE, HOP, (re, im) => {
    let sum = 0
    let low = 0
    for (let k = 1; k < bins; k++) {
      const mag = Math.log1p(Math.hypot(re[k], im[k]) * 40)
      const diff = mag - previous[k]
      if (diff > 0) {
        sum += diff
        if (k <= lowBin) low += diff
      }
      previous[k] = mag
    }
    flux.push(sum)
    lowFlux.push(low)
  })

  const envelope = Float32Array.from(flux)
  const lowEnvelope = Float32Array.from(lowFlux)

  // Subtract a moving average so a long crescendo doesn't read as onsets.
  const detrend = (input: Float32Array) => {
    const window = 24
    const out = new Float32Array(input.length)
    let running = 0
    for (let i = 0; i < input.length; i++) {
      running += input[i]
      if (i >= window) running -= input[i - window]
      out[i] = Math.max(0, input[i] - running / Math.min(window, i + 1))
    }
    return out
  }

  return { flux: detrend(envelope), lowFlux: detrend(lowEnvelope), fps: AUDIO_ANALYSIS_RATE / HOP }
}

/**
 * Blend the full-band envelope with the bass band for phase-finding. Both are
 * normalised first so the mix doesn't depend on their absolute scales.
 */
function phaseEnvelope(flux: Float32Array, low?: Float32Array): Float32Array {
  if (!low || low.length !== flux.length) return flux
  const peak = (x: Float32Array) => {
    let m = 0
    for (let i = 0; i < x.length; i++) if (x[i] > m) m = x[i]
    return m || 1
  }
  const fMax = peak(flux)
  const lMax = peak(low)
  const out = new Float32Array(flux.length)
  for (let i = 0; i < flux.length; i++) out[i] = flux[i] / fMax + (low[i] / lMax) * 1.4
  return out
}

/** Envelope value at a fractional frame index. */
function sampleEnvelope(envelope: Float32Array, position: number): number {
  if (position < 0 || position >= envelope.length - 1) return 0
  const i = Math.floor(position)
  const frac = position - i
  return envelope[i] * (1 - frac) + envelope[i + 1] * frac
}

/**
 * Score a candidate tempo by laying a pulse train over the envelope at the
 * best phase, and return both the score and that phase.
 */
function combScore(envelope: Float32Array, periodFrames: number): { score: number; phase: number } {
  if (periodFrames < 2 || periodFrames > envelope.length) return { score: 0, phase: 0 }
  const steps = Math.max(8, Math.round(periodFrames))
  let best = { score: -1, phase: 0 }

  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * periodFrames
    let sum = 0
    let count = 0
    for (let position = phase; position < envelope.length - 1; position += periodFrames) {
      // A small neighbourhood makes the score tolerant of slight rubato.
      sum += Math.max(
        sampleEnvelope(envelope, position),
        sampleEnvelope(envelope, position - 1) * 0.7,
        sampleEnvelope(envelope, position + 1) * 0.7,
      )
      count++
    }
    const score = count > 0 ? sum / count : 0
    if (score > best.score) best = { score, phase }
  }
  return best
}

/**
 * Tempo and beat phase.
 *
 * Autocorrelation finds candidates, a log-normal prior around 120 BPM breaks
 * the octave ambiguity that wrecks naive detectors (a half-time reading of
 * 160 is 80, and both fit the envelope perfectly), then a fine comb search
 * pins down the exact tempo and phase.
 */
function detectTempo(
  envelope: Float32Array, fps: number,
  lowEnvelope?: Float32Array, range: [number, number] = [60, 190],
): BeatGrid {
  const minLag = Math.floor((60 / range[1]) * fps)
  const maxLag = Math.min(envelope.length - 1, Math.ceil((60 / range[0]) * fps))
  if (maxLag <= minLag) {
    return { bpm: 120, confidence: 0, offsetSec: 0, downbeatSec: 0, beatsPerBar: 4 }
  }

  // Normalised autocorrelation of the onset envelope.
  let mean = 0
  for (let i = 0; i < envelope.length; i++) mean += envelope[i]
  mean /= Math.max(1, envelope.length)

  const correlation = new Float64Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < envelope.length; i++) {
      sum += (envelope[i] - mean) * (envelope[i + lag] - mean)
    }
    correlation[lag] = sum / Math.max(1, envelope.length - lag)
  }

  // Prefer tempos near 120; a factor-of-two error is the usual failure.
  const prior = (bpm: number) => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))

  const candidates: number[] = []
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (correlation[lag] > correlation[lag - 1] && correlation[lag] >= correlation[lag + 1]) {
      candidates.push(lag)
    }
  }
  candidates.sort((a, b) => correlation[b] * prior((60 * fps) / b) - correlation[a] * prior((60 * fps) / a))

  const seeds = new Set<number>()
  for (const lag of candidates.slice(0, 5)) {
    const bpm = (60 * fps) / lag
    for (const multiple of [0.5, 1, 2]) {
      const candidate = bpm * multiple
      if (candidate >= range[0] && candidate <= range[1]) seeds.add(Math.round(candidate * 10) / 10)
    }
  }
  if (seeds.size === 0) seeds.add(120)

  let best = { bpm: 120, score: -1, phase: 0 }
  for (const seed of seeds) {
    // Fine sweep either side of the seed; ±3% covers autocorrelation's error.
    for (let bpm = seed * 0.97; bpm <= seed * 1.03; bpm += 0.05) {
      if (bpm < range[0] || bpm > range[1]) continue
      const period = (60 * fps) / bpm
      const { score } = combScore(envelope, period)
      const weighted = score * prior(bpm)
      if (weighted > best.score) best = { bpm, score: weighted, phase: 0 }
    }
  }

  // Phase is scored separately, on a blend that weights the bass band heavily.
  // The period is set by whatever is most regular — often hi-hats — but the
  // *downbeat* is where the kick is, and locking phase to an offbeat hat is a
  // classic way to end up a half-beat out.
  const period = (60 * fps) / best.bpm
  best.phase = combScore(phaseEnvelope(envelope, lowEnvelope), period).phase

  // Confidence: how much better the chosen pulse is than the envelope's mean.
  const overall = mean > 1e-9 ? best.score / mean : 0
  return {
    bpm: Math.round(best.bpm * 100) / 100,
    confidence: Math.max(0, Math.min(1, (overall - 1) / 2.2)),
    offsetSec: best.phase / fps,
    downbeatSec: best.phase / fps,
    beatsPerBar: 4,
  }
}

/**
 * Which beat starts the bar. Bass hits and strong onsets cluster on beat one,
 * so score each of the four candidate phases and take the winner.
 */
function detectDownbeat(
  flux: Float32Array, lowFlux: Float32Array, grid: BeatGrid, fps: number,
): number {
  const period = (60 / grid.bpm) * fps
  const start = grid.offsetSec * fps
  let best = { phase: 0, score: -1 }

  for (let phase = 0; phase < grid.beatsPerBar; phase++) {
    let sum = 0
    let count = 0
    for (let beat = phase; ; beat += grid.beatsPerBar) {
      const position = start + beat * period
      if (position >= flux.length - 1) break
      sum += sampleEnvelope(flux, position) + sampleEnvelope(lowFlux, position) * 1.5
      count++
    }
    const score = count > 0 ? sum / count : 0
    if (score > best.score) best = { phase, score }
  }
  return grid.offsetSec + (best.phase * 60) / grid.bpm
}

// ---------------------------------------------------------------------------
// Tuning, chroma, key
// ---------------------------------------------------------------------------

/**
 * Estimate how far the recording is from A440, in cents.
 *
 * Spectral peaks are compared to the nearest equal-tempered semitone and the
 * deviations are pooled into a circular histogram. A recording cut 30 cents
 * flat produces a clear cluster at -30; one that's genuinely at A440 produces
 * a cluster at 0.
 */
function detectTuning(signal: Float32Array): number {
  const bins = HARMONIC_FFT / 2 + 1
  const histogram = new Float64Array(100) // one bucket per cent, -50..+49
  const minBin = Math.max(2, Math.floor((110 * HARMONIC_FFT) / AUDIO_ANALYSIS_RATE))
  const maxBin = Math.min(bins - 2, Math.floor((2000 * HARMONIC_FFT) / AUDIO_ANALYSIS_RATE))

  const mags = new Float64Array(bins)
  let frames = 0
  forEachFrame(signal, HARMONIC_FFT, HARMONIC_HOP * 2, (re, im) => {
    frames++
    for (let k = 0; k < bins; k++) mags[k] = Math.hypot(re[k], im[k])
    for (let k = minBin; k <= maxBin; k++) {
      if (mags[k] <= mags[k - 1] || mags[k] < mags[k + 1]) continue
      // Parabolic interpolation for a sub-bin frequency estimate.
      const a = mags[k - 1], b = mags[k], c = mags[k + 1]
      const denom = a - 2 * b + c
      const offset = Math.abs(denom) > 1e-12 ? (0.5 * (a - c)) / denom : 0
      const hz = ((k + offset) * AUDIO_ANALYSIS_RATE) / HARMONIC_FFT
      if (hz <= 0) continue
      const midi = 69 + 12 * Math.log2(hz / 440)
      const cents = (midi - Math.round(midi)) * 100
      const bucket = Math.round(cents) + 50
      if (bucket >= 0 && bucket < 100) histogram[bucket] += b
    }
  })
  if (frames === 0) return 0

  // Circular mean over the ±50 cent range, so a cluster straddling the wrap
  // point doesn't average to zero.
  let x = 0
  let y = 0
  for (let i = 0; i < 100; i++) {
    const angle = ((i - 50) / 100) * 2 * Math.PI
    x += histogram[i] * Math.cos(angle)
    y += histogram[i] * Math.sin(angle)
  }
  if (Math.hypot(x, y) < 1e-9) return 0
  const cents = (Math.atan2(y, x) / (2 * Math.PI)) * 100
  return Math.max(-50, Math.min(50, Math.round(cents * 10) / 10))
}

/**
 * Per-frame 12-bin chroma, corrected for the recording's tuning.
 *
 * Each bin contributes to its nearest pitch class with a Gaussian weight on
 * how close it actually sits — so an in-tune partial counts fully, and a bin
 * sitting between two semitones (noise, or an inharmonic partial) barely
 * counts at all.
 */
function chromagram(signal: Float32Array, tuningCents: number): {
  chroma: Float32Array; bass: Float32Array; frames: number; fps: number
} {
  const bins = HARMONIC_FFT / 2 + 1
  const chromaFrames: Float32Array[] = []
  const bassFrames: Float32Array[] = []
  const reference = 440 * Math.pow(2, tuningCents / 1200)
  // The lowest sounding note names the chord far more reliably than the note
  // set does: A minor and F major share two of their three notes, and only the
  // bass tells them apart.
  const bassCeiling = 260

  // Precompute each bin's pitch class and weight — this is per-file constant.
  const pitchClass = new Int8Array(bins)
  const weight = new Float32Array(bins)
  for (let k = 1; k < bins; k++) {
    const hz = (k * AUDIO_ANALYSIS_RATE) / HARMONIC_FFT
    if (hz < 110 || hz > 2100) { pitchClass[k] = -1; continue }
    const midi = 69 + 12 * Math.log2(hz / reference)
    const nearest = Math.round(midi)
    const deviation = midi - nearest
    const closeness = Math.exp(-0.5 * Math.pow(deviation / 0.22, 2))
    if (closeness < 0.05) { pitchClass[k] = -1; continue }
    pitchClass[k] = ((nearest % 12) + 12) % 12
    // Taper the top so cymbals contribute less than the harmony does.
    const band = hz > 1000 ? Math.max(0.25, 1 - (hz - 1000) / 1600) : 1
    weight[k] = closeness * band
  }

  const bassBin = Math.floor((bassCeiling * HARMONIC_FFT) / AUDIO_ANALYSIS_RATE)

  forEachFrame(signal, HARMONIC_FFT, HARMONIC_HOP, (re, im) => {
    const frame = new Float32Array(12)
    const bassFrame = new Float32Array(12)
    for (let k = 1; k < bins; k++) {
      const pc = pitchClass[k]
      if (pc < 0) continue
      const magnitude = Math.hypot(re[k], im[k]) * weight[k]
      frame[pc] += magnitude
      if (k <= bassBin) bassFrame[pc] += magnitude
    }
    const normalise = (target: Float32Array) => {
      let total = 0
      for (let i = 0; i < 12; i++) total += target[i]
      if (total > 1e-9) for (let i = 0; i < 12; i++) target[i] /= total
    }
    normalise(frame)
    normalise(bassFrame)
    chromaFrames.push(frame)
    bassFrames.push(bassFrame)
  })

  const flat = new Float32Array(chromaFrames.length * 12)
  const flatBass = new Float32Array(bassFrames.length * 12)
  chromaFrames.forEach((frame, i) => flat.set(frame, i * 12))
  bassFrames.forEach((frame, i) => flatBass.set(frame, i * 12))
  return {
    chroma: flat, bass: flatBass,
    frames: chromaFrames.length, fps: AUDIO_ANALYSIS_RATE / HARMONIC_HOP,
  }
}

// Krumhansl-Kessler key profiles: how much each scale degree is used in a key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function correlate(a: number[], b: number[]): number {
  const n = a.length
  const meanA = a.reduce((x, y) => x + y, 0) / n
  const meanB = b.reduce((x, y) => x + y, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - meanA
    const y = b[i] - meanB
    num += x * y
    da += x * x
    db += y * y
  }
  return da > 1e-12 && db > 1e-12 ? num / Math.sqrt(da * db) : 0
}

/**
 * Key from an averaged chromagram, correlated against the Krumhansl-Kessler
 * profiles for all 24 keys.
 *
 * Frames near the beginning and end carry extra weight. Tonality is
 * established in the opening bars and confirmed by where the music comes to
 * rest, and a flat average can't tell A minor from C major — they contain the
 * same seven notes. This tilts the decision toward what the music actually
 * sits on.
 *
 * Note that for the mashup lab this ambiguity is nearly harmless anyway:
 * relative keys share a pitch-class set, so a transposition computed from
 * either one is the same transposition.
 */
function detectKeyFromChroma(chroma: Float32Array, frames: number, tuningCents: number): KeyEstimate {
  const average = new Array(12).fill(0)
  let totalWeight = 0
  const edge = Math.max(1, Math.floor(frames * 0.12))
  for (let f = 0; f < frames; f++) {
    const positional = f < edge || f >= frames - edge ? 1.8 : 1
    for (let i = 0; i < 12; i++) average[i] += chroma[f * 12 + i] * positional
    totalWeight += positional
  }
  for (let i = 0; i < 12; i++) average[i] /= Math.max(1, totalWeight)

  let best = { root: 0, mode: 'major' as const, score: -2 }
  const scores: number[] = []
  for (let root = 0; root < 12; root++) {
    const rotated = Array.from({ length: 12 }, (_, i) => average[(root + i) % 12])
    const major = correlate(rotated, MAJOR_PROFILE)
    const minor = correlate(rotated, MINOR_PROFILE)
    scores.push(major, minor)
    if (major > best.score) best = { root, mode: 'major', score: major }
    if (minor > best.score) best = { root, mode: 'minor' as 'major', score: minor }
  }

  scores.sort((a, b) => b - a)
  const margin = scores[0] - (scores[1] ?? 0)

  return {
    root: best.root,
    mode: best.mode,
    scale: best.mode === 'major' ? 'major' : 'minor',
    confidence: Math.max(0, Math.min(1, best.score * 0.6 + margin * 2)),
    tuningCents,
  }
}

/**
 * Chord track. Chroma is averaged over each beat and matched against major and
 * minor triad templates, then smoothed — chords rarely change on every beat,
 * and a majority filter removes the flicker that unsmoothed matching produces.
 */
function detectChords(
  chroma: Float32Array, bass: Float32Array, frames: number, chromaFps: number, grid: BeatGrid,
): ChordEvent[] {
  if (frames === 0) return []
  const beatSec = 60 / grid.bpm
  const framesPerBeat = beatSec * chromaFps
  const beats = Math.floor((frames - grid.offsetSec * chromaFps) / framesPerBeat)
  if (beats < 2) return []

  const templates: { root: number; quality: 'maj' | 'min'; mask: number[] }[] = []
  for (let root = 0; root < 12; root++) {
    for (const [quality, intervals] of [['maj', [0, 4, 7]], ['min', [0, 3, 7]]] as const) {
      const mask = new Array(12).fill(0)
      for (const interval of intervals) mask[(root + interval) % 12] = 1
      templates.push({ root, quality, mask })
    }
  }

  const raw: { root: number; quality: 'maj' | 'min'; confidence: number }[] = []
  for (let beat = 0; beat < beats; beat++) {
    const start = Math.floor(grid.offsetSec * chromaFps + beat * framesPerBeat)
    const end = Math.min(frames, Math.floor(start + framesPerBeat))
    const average = new Array(12).fill(0)
    const bassAverage = new Array(12).fill(0)
    for (let f = Math.max(0, start); f < end; f++) {
      for (let i = 0; i < 12; i++) {
        average[i] += chroma[f * 12 + i]
        bassAverage[i] += bass[f * 12 + i]
      }
    }
    const count = Math.max(1, end - Math.max(0, start))
    for (let i = 0; i < 12; i++) {
      average[i] /= count
      bassAverage[i] /= count
    }
    const bassPeak = Math.max(...bassAverage)

    let best = { root: 0, quality: 'maj' as 'maj' | 'min', score: -2 }
    for (const template of templates) {
      // Template fit, plus a bonus when the bass agrees with the root.
      const rootInBass = bassPeak > 1e-9 ? bassAverage[template.root] / bassPeak : 0
      const score = correlate(average, template.mask) + rootInBass * 0.35
      if (score > best.score) best = { root: template.root, quality: template.quality, score }
    }
    raw.push({ root: best.root, quality: best.quality, confidence: Math.max(0, best.score) })
  }

  // Majority filter over a 3-beat window: chords are sticky.
  const smoothed = raw.map((chord, i) => {
    const window = raw.slice(Math.max(0, i - 1), i + 2)
    const tally = new Map<string, number>()
    for (const item of window) {
      const key = `${item.root}:${item.quality}`
      tally.set(key, (tally.get(key) ?? 0) + item.confidence)
    }
    const [winner] = [...tally.entries()].sort((a, b) => b[1] - a[1])
    const [root, quality] = winner[0].split(':')
    return { root: Number(root), quality: quality as 'maj' | 'min', confidence: chord.confidence }
  })

  // Merge runs of the same chord into single events.
  const events: ChordEvent[] = []
  for (let i = 0; i < smoothed.length; i++) {
    const chord = smoothed[i]
    const previous = events[events.length - 1]
    if (previous && previous.root === chord.root && previous.quality === chord.quality) {
      previous.durationSec += beatSec
      previous.confidence = Math.max(previous.confidence, chord.confidence)
    } else {
      events.push({
        timeSec: grid.offsetSec + i * beatSec,
        durationSec: beatSec,
        root: chord.root,
        quality: chord.quality,
        confidence: chord.confidence,
      })
    }
  }
  return events
}

// ---------------------------------------------------------------------------
// Waveform + loudness
// ---------------------------------------------------------------------------

/** Interleaved min/max pairs, for drawing a waveform without the samples. */
export function computePeaks(signal: Float32Array, buckets = 2000): Float32Array {
  const out = new Float32Array(buckets * 2)
  const size = signal.length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size)
    const end = Math.min(signal.length, Math.floor((b + 1) * size))
    let min = 0
    let max = 0
    for (let i = start; i < end; i++) {
      const v = signal[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    out[b * 2] = min
    out[b * 2 + 1] = max
  }
  return out
}

export function loudnessDb(signal: Float32Array): number {
  let sum = 0
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i]
  const rms = Math.sqrt(sum / Math.max(1, signal.length))
  return rms > 1e-7 ? 20 * Math.log10(rms) : -100
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function analyseAudio(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (fraction: number, stage: string) => void,
): AudioAnalysis {
  const mono = toMono(channels)
  const durationSec = mono.length / sampleRate
  const analysisSignal = resampleLinear(mono, sampleRate / AUDIO_ANALYSIS_RATE)

  onProgress?.(0.1, 'Finding the beat')
  const { flux, lowFlux, fps } = onsetEnvelope(analysisSignal)
  const grid = detectTempo(flux, fps, lowFlux)
  grid.downbeatSec = detectDownbeat(flux, lowFlux, grid, fps)

  onProgress?.(0.45, 'Reading the tuning')
  const tuningCents = detectTuning(analysisSignal)

  onProgress?.(0.6, 'Working out the key')
  const { chroma, bass, frames, fps: chromaFps } = chromagram(analysisSignal, tuningCents)
  const key = detectKeyFromChroma(chroma, frames, tuningCents)

  onProgress?.(0.85, 'Following the chords')
  const chords = detectChords(chroma, bass, frames, chromaFps, grid)

  onProgress?.(0.95, 'Drawing the waveform')
  const peaks = computePeaks(mono)

  onProgress?.(1, 'Done')
  return {
    durationSec,
    sampleRate,
    channels: channels.length,
    beat: grid,
    key,
    chords,
    peaks,
    loudnessDb: loudnessDb(mono),
  }
}

/** Exported for tests and for re-analysis after a user corrects the tempo. */
export const _internals = { onsetEnvelope, detectTempo, detectTuning, chromagram, detectKeyFromChroma, detectChords }
