/**
 * Taking a recording apart into the individual sounds inside it.
 *
 * Stem separation answers "where is the drum layer"; this answers "what are the
 * sounds in that layer, and which of them are the same sound played again".
 * A four-bar loop might contain 90 hits and only six distinct sounds, and it is
 * the six you want — a kick you can play, not ninety kicks.
 *
 * The pipeline is: find onsets, cut a slice at each one, describe each slice
 * with a handful of features, decide what kind of sound it is, then cluster so
 * repeats of the same sound collapse into one with the cleanest take chosen as
 * the exemplar.
 *
 * Pure: no Web Audio, no DOM. It runs in a worker and in vitest identically,
 * which is the only reason any of this is checkable.
 */

import { forEachFrame } from '../spectral/stft'
import { yin } from './pitch'

export interface SliceRegion {
  startSec: number
  endSec: number
}

export type SoundKind =
  | 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'cymbal' | 'tom' | 'perc'
  | 'bass' | 'tonal' | 'vocal' | 'texture'

/** Sounds you hit once. The rest are played at a pitch. */
export const PERCUSSIVE_KINDS: SoundKind[] = [
  'kick', 'snare', 'clap', 'hat', 'openhat', 'cymbal', 'tom', 'perc',
]

export function isPercussive(kind: SoundKind): boolean {
  return PERCUSSIVE_KINDS.includes(kind)
}

export interface SoundFeatures {
  durationSec: number
  /** 10% to 90% of peak, in seconds. Near zero for anything struck. */
  attackSec: number
  /** Peak to -30 dB. */
  decaySec: number
  centroidHz: number
  /** Spectral flatness, 0..1. Noise is high, a tone is low. */
  flatness: number
  /** Share of energy below 160 Hz / 160 Hz-2 kHz / above 2 kHz. */
  lowRatio: number
  midRatio: number
  highRatio: number
  /** YIN, when the slice is periodic enough to have a pitch at all. */
  pitchHz: number | null
  pitchMidi: number | null
  clarity: number
  peak: number
  /** Separate attacks inside the first 60 ms — a hand clap has several. */
  transients: number
}

// ---------------------------------------------------------------------------
// Onsets
// ---------------------------------------------------------------------------

const ONSET_FFT = 1024
const ONSET_HOP = 256

/**
 * Spectral flux onset envelope: how much the spectrum grew since the last
 * frame. Growth only — a sound stopping is not a new sound.
 */
export function onsetFlux(signal: Float32Array, fftSize = ONSET_FFT, hop = ONSET_HOP): Float32Array {
  const bins = fftSize / 2 + 1
  const previous = new Float32Array(bins)
  const out: number[] = []
  forEachFrame(signal, fftSize, hop, (re, im) => {
    let flux = 0
    for (let bin = 0; bin < bins; bin++) {
      // Log magnitude: a hi-hat over a loud bass note is a big relative jump
      // and a tiny absolute one, and it is still an onset.
      const mag = Math.log1p(Math.hypot(re[bin], im[bin]) * 8)
      const growth = mag - previous[bin]
      if (growth > 0) flux += growth
      previous[bin] = mag
    }
    out.push(flux)
  })
  return Float32Array.from(out)
}

/**
 * Peak-pick the flux against a local median, which is what keeps a quiet hat
 * in a loud bar from being missed and a bass wobble from counting as five hits.
 */
export function findOnsets(
  signal: Float32Array,
  sampleRate: number,
  options: { sensitivity?: number; minGapSec?: number } = {},
): number[] {
  const sensitivity = options.sensitivity ?? 1
  const minGap = options.minGapSec ?? 0.045
  const flux = onsetFlux(signal)
  if (flux.length < 3) return []

  const frameSec = ONSET_HOP / sampleRate
  const minGapFrames = Math.max(1, Math.round(minGap / frameSec))

  let max = 0
  for (const value of flux) max = Math.max(max, value)
  if (max <= 0) return []
  // An absolute floor as well as a relative one. Without it, the small ripples
  // in the flux of one long sustained note each look like a peak against their
  // own quiet neighbourhood, and a held chord comes back as a drum fill.
  const floor = (0.07 * max) / sensitivity

  // The comparison window looks *backwards* only, and not far. A snare's noise
  // tail puts out a steady stream of flux, so against a window centred on
  // itself it keeps clearing the bar; against the 90 ms before it, it is
  // obviously just a tail. Longer than that and the silence before the snare
  // drags the median back down to nothing.
  const back = Math.max(3, Math.round(0.09 / frameSec))
  const ratio = 1.8 + 0.8 / sensitivity

  let globalPeak = 0
  for (let i = 0; i < signal.length; i++) globalPeak = Math.max(globalPeak, Math.abs(signal[i]))

  const onsets: number[] = []
  let last = -Infinity
  const sorted = new Float32Array(back)
  // The last frames are half zero-padding, so their spectrum changes for
  // reasons that have nothing to do with the music. Ignore them.
  const usable = Math.max(0, flux.length - 2)
  // Frame 0 is a real candidate: the first window is centred on sample 0, so a
  // recording that starts on a hit has that hit in it.
  for (let i = 0; i < usable; i++) {
    if (i > 0 && flux[i] < flux[i - 1]) continue
    if (i + 1 < flux.length && flux[i] < flux[i + 1]) continue
    const from = Math.max(0, i - back)
    let threshold = floor
    if (i > from) {
      const span = sorted.subarray(0, i - from)
      span.set(flux.subarray(from, i))
      span.sort()
      threshold = Math.max(floor, span[span.length >> 1] * ratio)
    }
    if (flux[i] <= threshold) continue
    // And there has to be something there to hear. A fade reaching zero ends
    // with a frame of pure numerical dust, which is a spectral change and is
    // not a sound.
    if (peakNear(signal, sampleRate, i * frameSec) < globalPeak * 0.003) continue
    if (i - last < minGapFrames) {
      // Keep the stronger of two hits too close together to be separate.
      if (onsets.length && flux[i] > flux[last]) {
        onsets[onsets.length - 1] = i * frameSec
        last = i
      }
      continue
    }
    onsets.push(i * frameSec)
    last = i
  }
  return onsets
}

/** Loudest sample in the 20 ms after a moment. */
function peakNear(signal: Float32Array, sampleRate: number, atSec: number): number {
  const from = Math.max(0, Math.floor(atSec * sampleRate))
  const to = Math.min(signal.length, from + Math.round(sampleRate * 0.02))
  let peak = 0
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(signal[i]))
  return peak
}

/**
 * Turn onsets into regions. A slice runs to the next onset, or until the sound
 * has clearly stopped, whichever comes first — a crash that rings for two
 * seconds under four hats should still be captured whole.
 */
export function sliceRegions(
  signal: Float32Array,
  sampleRate: number,
  onsets: number[],
  options: { maxLenSec?: number; tailDb?: number } = {},
): SliceRegion[] {
  const maxLen = options.maxLenSec ?? 2
  const tailDb = options.tailDb ?? -42
  const regions: SliceRegion[] = []

  for (let i = 0; i < onsets.length; i++) {
    // Back up slightly: the flux peak lands a frame or two after the attack,
    // and a one-shot that starts after its own transient sounds broken.
    const start = Math.max(0, onsets[i] - 0.006)
    const hardEnd = Math.min(
      signal.length / sampleRate,
      Math.min(i + 1 < onsets.length ? onsets[i + 1] : Infinity, start + maxLen),
    )
    if (hardEnd - start < 0.02) continue
    const end = decayEnd(signal, sampleRate, start, hardEnd, tailDb)
    if (end - start < 0.02) continue
    regions.push({ startSec: start, endSec: end })
  }
  return regions
}

/** Where the sound has fallen far enough below its own peak to be over. */
function decayEnd(
  signal: Float32Array, sampleRate: number, startSec: number, endSec: number, tailDb: number,
): number {
  const from = Math.floor(startSec * sampleRate)
  const to = Math.min(signal.length, Math.ceil(endSec * sampleRate))
  const step = Math.max(1, Math.floor(sampleRate * 0.005))
  let peak = 0
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(signal[i]))
  if (peak <= 0) return endSec
  const threshold = peak * Math.pow(10, tailDb / 20)

  let quietFor = 0
  for (let i = from; i < to; i += step) {
    let blockPeak = 0
    for (let j = i; j < Math.min(to, i + step); j++) blockPeak = Math.max(blockPeak, Math.abs(signal[j]))
    if (blockPeak < threshold) {
      quietFor += step
      // 25 ms below the floor means it really has stopped, not just a dip
      // between two cycles of a low note.
      if (quietFor > sampleRate * 0.025) return Math.min(endSec, (i + step) / sampleRate)
    } else {
      quietFor = 0
    }
  }
  return endSec
}

/**
 * Copy a region out, with a fade at each end so it cannot click.
 *
 * The fade in is tiny on purpose. A percussive sound *is* its attack, and a
 * 4 ms ramp over the front of a kick changes it into a different kick — enough
 * that the same drum sampled twice no longer fingerprints as the same drum.
 * Long enough to kill a click, short enough to leave the transient alone.
 */
export function cutSlice(
  signal: Float32Array, sampleRate: number, region: SliceRegion,
  fadeOutSec = 0.005, fadeInSec = 0.0008,
): Float32Array {
  const from = Math.max(0, Math.floor(region.startSec * sampleRate))
  const to = Math.min(signal.length, Math.ceil(region.endSec * sampleRate))
  const out = signal.slice(from, to)
  const fadeIn = Math.min(Math.round(fadeInSec * sampleRate), out.length >> 1)
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn
  const fadeOut = Math.min(Math.round(fadeOutSec * sampleRate), out.length >> 1)
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut
  return out
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/** Amplitude envelope, one point per `hop` samples. */
export function envelope(signal: Float32Array, hop: number): Float32Array {
  const points = Math.max(1, Math.ceil(signal.length / hop))
  const out = new Float32Array(points)
  for (let p = 0; p < points; p++) {
    let peak = 0
    const from = p * hop
    for (let i = from; i < Math.min(signal.length, from + hop); i++) {
      peak = Math.max(peak, Math.abs(signal[i]))
    }
    out[p] = peak
  }
  return out
}

export function describeSound(signal: Float32Array, sampleRate: number): SoundFeatures {
  const hop = Math.max(1, Math.round(sampleRate * 0.002))
  const env = envelope(signal, hop)
  let peak = 0
  let peakAt = 0
  for (let i = 0; i < env.length; i++) {
    if (env[i] > peak) { peak = env[i]; peakAt = i }
  }

  // Attack: 10% to 90% of the peak on the way up.
  let tenth = 0
  for (let i = 0; i <= peakAt; i++) { if (env[i] >= peak * 0.1) { tenth = i; break } }
  let ninety = peakAt
  for (let i = tenth; i <= peakAt; i++) { if (env[i] >= peak * 0.9) { ninety = i; break } }
  const attackSec = Math.max(0, (ninety - tenth) * hop / sampleRate)

  // Decay: peak down to -30 dB.
  const decayFloor = peak * Math.pow(10, -30 / 20)
  let decayAt = env.length - 1
  for (let i = peakAt; i < env.length; i++) { if (env[i] <= decayFloor) { decayAt = i; break } }
  const decaySec = Math.max(0, (decayAt - peakAt) * hop / sampleRate)

  const spectral = spectralShape(signal, sampleRate)
  const pitch = pitchOf(signal, sampleRate)
  const pitched = pitch !== null && pitch.clarity >= PITCHED

  return {
    durationSec: signal.length / sampleRate,
    attackSec,
    decaySec,
    centroidHz: spectral.centroidHz,
    flatness: spectral.flatness,
    lowRatio: spectral.lowRatio,
    midRatio: spectral.midRatio,
    highRatio: spectral.highRatio,
    pitchHz: pitched ? pitch!.hz : null,
    pitchMidi: pitched ? Math.round(69 + 12 * Math.log2(pitch!.hz / 440)) : null,
    clarity: pitch?.clarity ?? 0,
    peak,
    transients: countTransients(signal, sampleRate),
  }
}

function spectralShape(signal: Float32Array, sampleRate: number) {
  const fftSize = 1024
  const bins = fftSize / 2 + 1
  const sum = new Float32Array(bins)
  let frames = 0
  // Only the first 200 ms: what a sound *is* is decided by its attack, and
  // including a long tail drags every centroid towards the low end.
  const head = signal.subarray(0, Math.min(signal.length, Math.round(sampleRate * 0.2)))
  forEachFrame(head.length >= fftSize ? head : pad(head, fftSize), fftSize, 256, (re, im) => {
    for (let bin = 0; bin < bins; bin++) sum[bin] += Math.hypot(re[bin], im[bin])
    frames++
  })
  if (frames === 0) return { centroidHz: 0, flatness: 0, lowRatio: 0, midRatio: 0, highRatio: 0 }

  let total = 0, weighted = 0, logSum = 0, low = 0, mid = 0, high = 0
  const binHz = sampleRate / fftSize
  for (let bin = 1; bin < bins; bin++) {
    const mag = sum[bin] / frames
    const hz = bin * binHz
    total += mag
    weighted += mag * hz
    logSum += Math.log(mag + 1e-9)
    if (hz < 160) low += mag
    else if (hz < 2000) mid += mag
    else high += mag
  }
  if (total <= 0) return { centroidHz: 0, flatness: 0, lowRatio: 0, midRatio: 0, highRatio: 0 }
  const arithmetic = total / (bins - 1)
  const geometric = Math.exp(logSum / (bins - 1))
  return {
    centroidHz: weighted / total,
    flatness: Math.min(1, geometric / (arithmetic + 1e-9)),
    lowRatio: low / total,
    midRatio: mid / total,
    highRatio: high / total,
  }
}

function pad(signal: Float32Array, length: number): Float32Array {
  const out = new Float32Array(length)
  out.set(signal.subarray(0, Math.min(signal.length, length)))
  return out
}

/**
 * The pitch of a slice, and how sure we are.
 *
 * The clarity is returned whatever it is. An earlier version reported 0 below
 * a confidence threshold, which put a cliff in the middle of the fingerprint:
 * two hits of the same drum landing either side of 0.5 came back as 0.74 and
 * 0.0, and clustered as different instruments. Gate the *pitch*, never the
 * measurement it is based on.
 */
function pitchOf(signal: Float32Array, sampleRate: number): { hz: number; clarity: number } | null {
  // Skip the transient: the attack of almost anything is inharmonic, and YIN
  // reads it as noise even when the body of the note is perfectly pitched.
  const from = Math.min(signal.length - 1, Math.round(sampleRate * 0.02))
  const body = signal.subarray(from, Math.min(signal.length, from + Math.round(sampleRate * 0.25)))
  if (body.length < 512) return null
  return yin(body, sampleRate, { minHz: 30, maxHz: 1600, threshold: 0.18 })
}

/** Confident enough to call it a note rather than a noise. */
const PITCHED = 0.5

/**
 * Count separate attacks in the first 60 ms. A clap is three or four hands
 * landing not quite together, which is exactly what makes it sound like a clap
 * rather than a snare.
 *
 * Counted on the flux rather than the amplitude envelope: the envelope of a
 * 50 Hz kick ripples once per cycle, so counting peaks there says a kick has
 * three attacks. Flux only rises when new energy appears, which is what an
 * attack actually is.
 */
function countTransients(signal: Float32Array, sampleRate: number): number {
  const fftSize = 256
  const hop = 64
  const flux = onsetFlux(signal.subarray(0, Math.min(signal.length, Math.round(sampleRate * 0.07))),
    fftSize, hop)
  if (flux.length < 3) return signal.length ? 1 : 0
  let max = 0
  for (const value of flux) max = Math.max(max, value)
  if (max <= 0) return 0

  // Each attack after the first arrives on top of the decaying tail of the one
  // before, so it is never remotely as big as the first: in a clap the opening
  // hit is five times the second. What marks a new attack is the *rise* out of
  // the dip that precedes it, not its absolute size.
  const minGap = Math.max(1, Math.round((0.005 * sampleRate) / hop))
  let count = 0
  let lastAt = -minGap
  let trough = Infinity
  for (let i = 0; i < flux.length; i++) {
    trough = Math.min(trough, flux[i])
    const rising = i === 0 || flux[i] >= flux[i - 1]
    const falling = i + 1 >= flux.length || flux[i] >= flux[i + 1]
    if (!rising || !falling) continue
    const clearsFloor = flux[i] > max * 0.1
    const clearsTrough = i === 0 || flux[i] > trough * 3
    if (clearsFloor && clearsTrough && i - lastAt >= minGap) {
      count++
      lastAt = i
      trough = Infinity
    }
  }
  return Math.max(1, count)
}

// ---------------------------------------------------------------------------
// What kind of sound is it?
// ---------------------------------------------------------------------------

/**
 * Decide what a slice is from its shape. The stem it came out of is a strong
 * hint but not the answer — the drum stem catches plenty of non-drums, and a
 * bass note bleeding into it should not become a kick.
 */
export function classifySound(f: SoundFeatures, stem: 'drums' | 'bass' | 'vocals' | 'other'): SoundKind {
  const struck = f.attackSec < 0.02
  const sustained = f.decaySec > 0.45 || f.durationSec > 0.9

  if (stem === 'bass') return 'bass'
  if (stem === 'vocals') return f.clarity > 0.55 || !struck ? 'vocal' : 'perc'

  if (stem === 'drums') {
    if (f.lowRatio > 0.5 && f.centroidHz < 320) return 'kick'
    // Bright *and* thin. A snare is just as bright but carries real weight
    // between 160 Hz and 2 kHz, which is the difference you actually hear.
    if (f.centroidHz > 4800 && f.flatness > 0.18 && f.midRatio < 0.3) {
      if (f.decaySec < 0.13) return 'hat'
      return f.decaySec < 0.55 ? 'openhat' : 'cymbal'
    }
    if (f.centroidHz > 3200 && f.decaySec > 0.7) return 'cymbal'
    if (f.transients >= 3 && f.midRatio > 0.25) return 'clap'
    if (f.midRatio > 0.3 && f.flatness > 0.07 && f.decaySec < 0.45) return 'snare'
    if (f.clarity > 0.5 && f.centroidHz < 900 && f.decaySec > 0.12) return 'tom'
    return 'perc'
  }

  // The 'other' stem: everything that is not voice, bass or drums.
  if (struck && !sustained && f.centroidHz > 2500 && f.clarity < 0.5) return 'perc'
  if (f.clarity > 0.5) return 'tonal'
  return sustained ? 'texture' : 'perc'
}

/** A plain-language name, so the UI never has to show a type tag. */
export function soundLabel(kind: SoundKind): string {
  switch (kind) {
    case 'kick': return 'Kick'
    case 'snare': return 'Snare'
    case 'clap': return 'Clap'
    case 'hat': return 'Closed hat'
    case 'openhat': return 'Open hat'
    case 'cymbal': return 'Cymbal'
    case 'tom': return 'Tom'
    case 'perc': return 'Percussion'
    case 'bass': return 'Bass'
    case 'tonal': return 'Instrument'
    case 'vocal': return 'Voice'
    case 'texture': return 'Texture'
  }
}

/** Where each kind sits on a drum kit, following the General MIDI convention. */
export function kitSlotFor(kind: SoundKind, taken: Set<number>): number {
  const preferred: Partial<Record<SoundKind, number[]>> = {
    kick: [36, 35], snare: [38, 40], clap: [39], hat: [42, 44], openhat: [46],
    cymbal: [49, 51, 57], tom: [45, 41, 48, 47], perc: [70, 72, 37, 43, 50, 52, 53],
  }
  for (const slot of preferred[kind] ?? []) {
    if (!taken.has(slot)) return slot
  }
  for (let midi = 36; midi < 96; midi++) if (!taken.has(midi)) return midi
  return 36
}

// ---------------------------------------------------------------------------
// Fingerprints and clustering
// ---------------------------------------------------------------------------

/** Mel-ish band edges, in Hz. Coarse on purpose: this compares timbres, not takes. */
const BANDS = [0, 80, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000]

/**
 * A short description of what a sound is like, comparable between two
 * recordings of different lengths and levels. Band energies over the attack,
 * plus the envelope shape, normalised so only the balance matters.
 */
export function fingerprint(signal: Float32Array, sampleRate: number): Float32Array {
  // Start at the attack, not at the cut. Two hits of the same drum can sit a
  // few milliseconds differently inside their slices — one of them may have
  // been at the very start of the recording with nothing to back up into — and
  // a fingerprint that moves when the cut moves is describing the edit rather
  // than the sound.
  const aligned = alignToAttack(signal)
  const fftSize = 1024
  const bins = fftSize / 2 + 1
  const sum = new Float32Array(bins)
  let frames = 0
  const head = aligned.subarray(0, Math.min(aligned.length, Math.round(sampleRate * 0.25)))
  forEachFrame(head.length >= fftSize ? head : pad(head, fftSize), fftSize, 256, (re, im) => {
    for (let bin = 0; bin < bins; bin++) sum[bin] += Math.hypot(re[bin], im[bin])
    frames++
  })

  const out = new Float32Array(BANDS.length - 1 + 3)
  const binHz = sampleRate / fftSize
  let total = 0
  for (let band = 0; band < BANDS.length - 1; band++) {
    let energy = 0
    const from = Math.max(1, Math.floor(BANDS[band] / binHz))
    const to = Math.min(bins, Math.ceil(BANDS[band + 1] / binHz))
    for (let bin = from; bin < to; bin++) energy += sum[bin] / Math.max(1, frames)
    out[band] = Math.log1p(energy)
    total += out[band]
  }
  if (total > 0) for (let i = 0; i < BANDS.length - 1; i++) out[i] /= total

  const f = describeSound(aligned, sampleRate)
  // Envelope shape matters as much as spectrum: a piano and a bowed string can
  // share a spectrum and never be mistaken for each other.
  out[BANDS.length - 1] = Math.min(1, f.attackSec / 0.1)
  out[BANDS.length] = Math.min(1, f.decaySec / 2)
  out[BANDS.length + 1] = f.clarity
  return out
}

/** Drop any lead-in before the sound properly starts. */
function alignToAttack(signal: Float32Array, threshold = 0.2): Float32Array {
  let peak = 0
  for (let i = 0; i < signal.length; i++) peak = Math.max(peak, Math.abs(signal[i]))
  if (peak <= 0) return signal
  const bar = peak * threshold
  for (let i = 0; i < signal.length; i++) {
    if (Math.abs(signal[i]) >= bar) return i > 0 ? signal.subarray(i) : signal
  }
  return signal
}

export function fingerprintDistance(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i]
    // The three shape terms at the end carry more weight than any one band.
    const weight = i >= BANDS.length - 1 ? 2.5 : 1
    sum += d * d * weight
  }
  return Math.sqrt(sum / n)
}

export interface SoundCluster<T> {
  kind: SoundKind
  /** Index of the exemplar within `members`. */
  bestIndex: number
  members: T[]
  /** How many times this sound occurs in the source. */
  count: number
}

/**
 * Collapse repeats. Every hit of the same kick clusters together, and the
 * exemplar is the loudest one that is closest to the group average — loud
 * because it has the best signal-to-noise, average because an outlier is
 * usually a hit that overlapped something else.
 */
export function clusterSounds<T extends { kind: SoundKind; print: Float32Array; peak: number }>(
  items: T[], threshold = 0.075,
): SoundCluster<T>[] {
  const clusters: { kind: SoundKind; centre: Float32Array; members: T[] }[] = []

  for (const item of items) {
    let best: typeof clusters[number] | null = null
    let bestDistance = Infinity
    for (const cluster of clusters) {
      if (cluster.kind !== item.kind) continue
      const distance = fingerprintDistance(cluster.centre, item.print)
      if (distance < bestDistance) { best = cluster; bestDistance = distance }
    }
    if (best && bestDistance < threshold) {
      best.members.push(item)
      // Running mean, so the centre is not anchored to whichever hit was first.
      for (let i = 0; i < best.centre.length; i++) {
        best.centre[i] += (item.print[i] - best.centre[i]) / best.members.length
      }
    } else {
      clusters.push({ kind: item.kind, centre: Float32Array.from(item.print), members: [item] })
    }
  }

  // A single pass is order-dependent: whichever hit came first defines a
  // cluster, and a slightly odd first take can leave its own siblings stranded
  // in a second group. Merging afterwards, when every centre is an average of
  // real members, puts them back together.
  for (let a = 0; a < clusters.length; a++) {
    for (let b = clusters.length - 1; b > a; b--) {
      if (clusters[a].kind !== clusters[b].kind) continue
      if (fingerprintDistance(clusters[a].centre, clusters[b].centre) >= threshold) continue
      const total = clusters[a].members.length + clusters[b].members.length
      for (let i = 0; i < clusters[a].centre.length; i++) {
        clusters[a].centre[i] =
          (clusters[a].centre[i] * clusters[a].members.length +
            clusters[b].centre[i] * clusters[b].members.length) / total
      }
      clusters[a].members.push(...clusters[b].members)
      clusters.splice(b, 1)
    }
  }

  return clusters.map((cluster) => {
    let bestIndex = 0
    let bestScore = -Infinity
    cluster.members.forEach((member, index) => {
      const distance = fingerprintDistance(cluster.centre, member.print)
      const score = member.peak * 2 - distance * 8
      if (score > bestScore) { bestScore = score; bestIndex = index }
    })
    return { kind: cluster.kind, bestIndex, members: cluster.members, count: cluster.members.length }
  })
}
