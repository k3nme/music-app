/**
 * Monophonic pitch tracking and note segmentation — the analysis half of
 * "hum it, hear it on anything".
 *
 * Pure functions, no Web Audio and no DOM, so this runs identically in a
 * Worker and in tests.
 *
 * Pipeline: downsample -> YIN per frame -> median-smooth -> segment into notes
 * on silence, pitch change and onsets.
 */

export interface AnalysisOptions {
  /** Lowest pitch to look for, Hz. 65 ≈ C2, below most singing. */
  minHz: number
  /** Highest pitch, Hz. 1100 ≈ C#6. */
  maxHz: number
  /** YIN threshold; lower is stricter. */
  threshold: number
  /** Frames below this clarity are treated as unvoiced. */
  clarityGate: number
  /** Level below this (relative to the take's peak) is silence. */
  noiseGate: number
  /** Notes shorter than this are dropped, seconds. */
  minNoteSec: number
  /** Semitone jump that starts a new note. */
  pitchSplitSemitones: number
}

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  minHz: 65,
  maxHz: 1100,
  threshold: 0.14,
  clarityGate: 0.55,
  noiseGate: 0.055,
  minNoteSec: 0.07,
  pitchSplitSemitones: 0.75,
}

/** Analysis runs at this rate regardless of the input — plenty for voice. */
export const ANALYSIS_RATE = 16000
const FRAME = 1024
const HOP = 160 // 10 ms

export interface Frame {
  time: number
  /** MIDI note as a float, or NaN when unvoiced. */
  midi: number
  clarity: number
  rms: number
  /** Rough band split used for percussive classification. */
  low: number
  mid: number
  high: number
}

export interface RawNote {
  startSec: number
  endSec: number
  /** Median pitch across the note, as a float MIDI number. */
  midi: number
  velocity: number
  /** Mean clarity — how confident the tracker was. */
  confidence: number
}

export interface PercussiveHit {
  timeSec: number
  velocity: number
  /** 'low' | 'mid' | 'high' — maps onto kick / snare / hat. */
  band: 'low' | 'mid' | 'high'
}

export interface AnalysisResult {
  frames: Frame[]
  notes: RawNote[]
  hits: PercussiveHit[]
  durationSec: number
  /** Best-guess tempo from the onset pattern, or null when unclear. */
  tempo: number | null
  /** Peak sample level of the take, for the "too quiet" warning. */
  peak: number
}

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------

/** Decimate to ANALYSIS_RATE with a short averaging filter to stop aliasing. */
export function downsample(input: Float32Array, fromRate: number, toRate = ANALYSIS_RATE): Float32Array {
  if (fromRate <= toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  const window = Math.max(1, Math.floor(ratio))
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    let sum = 0
    for (let j = 0; j < window; j++) sum += input[Math.min(input.length - 1, start + j)]
    out[i] = sum / window
  }
  return out
}

// ---------------------------------------------------------------------------
// YIN
// ---------------------------------------------------------------------------

/**
 * YIN (de Cheveigné & Kawahara 2002), the difference-function form.
 * Returns frequency in Hz and a 0..1 clarity, or null when nothing periodic
 * is found.
 */
export function yin(
  buffer: Float32Array, sampleRate: number, opts: Pick<AnalysisOptions, 'minHz' | 'maxHz' | 'threshold'>,
  scratch?: Float32Array,
): { hz: number; clarity: number } | null {
  const tauMin = Math.max(2, Math.floor(sampleRate / opts.maxHz))
  const tauMax = Math.min(Math.floor(buffer.length / 2), Math.ceil(sampleRate / opts.minHz))
  if (tauMax <= tauMin) return null

  const diff = scratch && scratch.length >= tauMax + 1 ? scratch : new Float32Array(tauMax + 1)
  diff[0] = 1

  // Step 1: squared difference function.
  const halfLen = Math.floor(buffer.length / 2)
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0
    for (let i = 0; i < halfLen; i++) {
      const d = buffer[i] - buffer[i + tau]
      sum += d * d
    }
    diff[tau] = sum
  }

  // Step 2: cumulative mean normalisation.
  let running = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau]
    diff[tau] = running === 0 ? 1 : (diff[tau] * tau) / running
  }

  // Step 3: absolute threshold — first dip below it, following it to its floor.
  let tauEstimate = -1
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (diff[tau] < opts.threshold) {
      while (tau + 1 <= tauMax && diff[tau + 1] < diff[tau]) tau++
      tauEstimate = tau
      break
    }
  }
  if (tauEstimate === -1) {
    // Fall back to the global minimum; clarity will report how weak it is.
    let best = tauMin
    for (let tau = tauMin; tau <= tauMax; tau++) if (diff[tau] < diff[best]) best = tau
    if (diff[best] > 0.75) return null
    tauEstimate = best
  }

  // Step 4: parabolic interpolation for sub-sample precision.
  const x0 = tauEstimate > tauMin ? tauEstimate - 1 : tauEstimate
  const x2 = tauEstimate + 1 <= tauMax ? tauEstimate + 1 : tauEstimate
  let betterTau = tauEstimate
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = diff[x0], s1 = diff[tauEstimate], s2 = diff[x2]
    const denom = 2 * (2 * s1 - s2 - s0)
    if (Math.abs(denom) > 1e-9) betterTau = tauEstimate + (s2 - s0) / denom
  }

  const hz = sampleRate / betterTau
  if (!Number.isFinite(hz) || hz < opts.minHz * 0.9 || hz > opts.maxHz * 1.1) return null
  return { hz, clarity: Math.max(0, Math.min(1, 1 - diff[tauEstimate])) }
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------

const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440)

export function analyseFrames(
  signal: Float32Array, sampleRate: number, opts: AnalysisOptions,
  onProgress?: (fraction: number) => void,
): { frames: Frame[]; peak: number } {
  const frames: Frame[] = []
  const scratch = new Float32Array(Math.ceil(sampleRate / opts.minHz) + 2)
  const frameBuf = new Float32Array(FRAME)

  let peak = 0
  for (let i = 0; i < signal.length; i++) {
    const v = Math.abs(signal[i])
    if (v > peak) peak = v
  }

  // One-pole filters for the coarse band split (used for beatbox detection).
  const lowCoef = Math.exp((-2 * Math.PI * 220) / sampleRate)
  const highCoef = Math.exp((-2 * Math.PI * 3500) / sampleRate)

  const total = Math.max(1, Math.floor((signal.length - FRAME) / HOP))
  let reported = 0

  for (let start = 0, f = 0; start + FRAME <= signal.length; start += HOP, f++) {
    frameBuf.set(signal.subarray(start, start + FRAME))

    let sumSq = 0
    let lowState = 0, highState = 0, lowE = 0, highE = 0, allE = 0
    for (let i = 0; i < FRAME; i++) {
      const x = frameBuf[i]
      sumSq += x * x
      lowState = x * (1 - lowCoef) + lowState * lowCoef
      highState = x * (1 - highCoef) + highState * highCoef
      lowE += lowState * lowState
      const hp = x - highState
      highE += hp * hp
      allE += x * x
    }
    const rms = Math.sqrt(sumSq / FRAME)
    const low = allE > 0 ? lowE / allE : 0
    const high = allE > 0 ? highE / allE : 0

    let midi = NaN
    let clarity = 0
    if (rms > opts.noiseGate * Math.max(peak, 1e-6)) {
      const res = yin(frameBuf, sampleRate, opts, scratch)
      if (res) {
        midi = hzToMidi(res.hz)
        clarity = res.clarity
      }
    }

    frames.push({
      time: start / sampleRate,
      midi, clarity, rms,
      low, mid: Math.max(0, 1 - low - high), high,
    })

    if (onProgress && f - reported > 200) { reported = f; onProgress(f / total) }
  }
  return { frames, peak }
}

// ---------------------------------------------------------------------------
// Smoothing & segmentation
// ---------------------------------------------------------------------------

/** Median filter over MIDI values; kills the octave flips YIN occasionally makes. */
export function medianSmooth(frames: Frame[], window = 5): void {
  const half = Math.floor(window / 2)
  const original = frames.map((f) => f.midi)
  const bucket: number[] = []
  for (let i = 0; i < frames.length; i++) {
    bucket.length = 0
    for (let j = i - half; j <= i + half; j++) {
      const v = original[j]
      if (j >= 0 && j < original.length && Number.isFinite(v)) bucket.push(v)
    }
    if (bucket.length === 0) continue
    bucket.sort((a, b) => a - b)
    frames[i].midi = bucket[Math.floor(bucket.length / 2)]
  }
}

/**
 * Octave correction. YIN sometimes locks an octave low on breathy voices;
 * if a frame sits ~12 semitones from the take's running centre, pull it back.
 */
export function fixOctaveJumps(frames: Frame[]): void {
  const voiced = frames.filter((f) => Number.isFinite(f.midi))
  if (voiced.length < 8) return
  const sorted = voiced.map((f) => f.midi).sort((a, b) => a - b)
  const centre = sorted[Math.floor(sorted.length / 2)]
  for (const f of frames) {
    if (!Number.isFinite(f.midi)) continue
    while (f.midi - centre > 9.5) f.midi -= 12
    while (centre - f.midi > 9.5) f.midi += 12
  }
}

export function segmentNotes(frames: Frame[], opts: AnalysisOptions, peak: number): RawNote[] {
  const notes: RawNote[] = []
  const gate = opts.noiseGate * Math.max(peak, 1e-6)
  const frameSec = HOP / ANALYSIS_RATE

  let current: { start: number; pitches: number[]; rms: number[]; clarity: number[] } | null = null

  const flush = (endTime: number) => {
    if (!current) return
    const dur = endTime - current.start
    if (dur >= opts.minNoteSec && current.pitches.length > 0) {
      const sorted = [...current.pitches].sort((a, b) => a - b)
      const midi = sorted[Math.floor(sorted.length / 2)]
      const loudest = Math.max(...current.rms)
      const meanClarity = current.clarity.reduce((a, b) => a + b, 0) / current.clarity.length
      notes.push({
        startSec: current.start,
        endSec: endTime,
        midi,
        velocity: Math.max(0.25, Math.min(1, (loudest / Math.max(peak, 1e-6)) * 1.15)),
        confidence: meanClarity,
      })
    }
    current = null
  }

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    const voiced = Number.isFinite(f.midi) && f.clarity >= opts.clarityGate && f.rms > gate

    if (!voiced) {
      // Allow a two-frame dropout before ending the note — vibrato and
      // consonants briefly break periodicity mid-note.
      const nextVoiced = frames[i + 1] && Number.isFinite(frames[i + 1].midi) &&
        frames[i + 1].clarity >= opts.clarityGate && frames[i + 1].rms > gate
      const afterVoiced = frames[i + 2] && Number.isFinite(frames[i + 2].midi) &&
        frames[i + 2].clarity >= opts.clarityGate && frames[i + 2].rms > gate
      if (current && (nextVoiced || afterVoiced)) continue
      flush(f.time)
      continue
    }

    if (!current) {
      current = { start: f.time, pitches: [f.midi], rms: [f.rms], clarity: [f.clarity] }
      continue
    }

    // Split on a sustained pitch change...
    const ref = current.pitches[current.pitches.length - 1]
    const jump = Math.abs(f.midi - ref)
    if (jump > opts.pitchSplitSemitones) {
      const next = frames[i + 1]
      const holds = !next || !Number.isFinite(next.midi) ||
        Math.abs(next.midi - f.midi) < opts.pitchSplitSemitones
      if (holds && current.pitches.length * frameSec >= opts.minNoteSec * 0.8) {
        flush(f.time)
        current = { start: f.time, pitches: [f.midi], rms: [f.rms], clarity: [f.clarity] }
        continue
      }
    }

    // ...and on a re-articulation: a clear jump in level at the same pitch.
    const prev = frames[i - 1]
    if (prev && f.rms > prev.rms * 2.4 && f.rms > gate * 2.2 &&
        current.pitches.length * frameSec >= opts.minNoteSec) {
      flush(f.time)
      current = { start: f.time, pitches: [f.midi], rms: [f.rms], clarity: [f.clarity] }
      continue
    }

    current.pitches.push(f.midi)
    current.rms.push(f.rms)
    current.clarity.push(f.clarity)
  }
  flush(frames.length > 0 ? frames[frames.length - 1].time + frameSec : 0)
  return notes
}

// ---------------------------------------------------------------------------
// Percussive input (beatbox / tapping)
// ---------------------------------------------------------------------------

export function detectOnsets(frames: Frame[], peak: number, sensitivity = 1): PercussiveHit[] {
  const hits: PercussiveHit[] = []
  if (frames.length < 3) return hits
  const gate = 0.045 * Math.max(peak, 1e-6) / Math.max(0.2, sensitivity)

  // Spectral-flux-lite: rising energy relative to a local average.
  const window = 12
  let lastHitTime = -1
  for (let i = 2; i < frames.length - 1; i++) {
    const f = frames[i]
    if (f.rms < gate) continue
    let avg = 0
    let n = 0
    for (let j = Math.max(0, i - window); j < i; j++) { avg += frames[j].rms; n++ }
    avg = n > 0 ? avg / n : 0
    const rising = f.rms > frames[i - 1].rms && f.rms >= frames[i + 1].rms
    if (!rising) continue
    if (f.rms < avg * (1.55 / Math.max(0.4, sensitivity))) continue
    if (lastHitTime >= 0 && f.time - lastHitTime < 0.045) continue
    lastHitTime = f.time

    const band: PercussiveHit['band'] =
      f.low > 0.5 ? 'low' : f.high > 0.32 ? 'high' : 'mid'
    hits.push({
      timeSec: f.time,
      velocity: Math.max(0.3, Math.min(1, (f.rms / Math.max(peak, 1e-6)) * 1.25)),
      band,
    })
  }
  return hits
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/**
 * Estimate tempo by autocorrelating inter-onset intervals over a musical
 * range. Returns null when nothing convincing lines up — better to keep the
 * project tempo than to guess wrong.
 */
export function estimateTempo(times: number[], minBpm = 60, maxBpm = 190): number | null {
  if (times.length < 4) return null
  let best: { bpm: number; score: number } | null = null
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const beat = 60 / bpm
    let score = 0
    for (const t of times) {
      const phase = (t / beat) % 1
      const dist = Math.min(phase, 1 - phase) // 0 = dead on a beat
      score += Math.max(0, 1 - dist * 4)
      // Reward eighth-note placement too, at half weight.
      const half = ((t / (beat / 2)) % 1)
      score += 0.5 * Math.max(0, 1 - Math.min(half, 1 - half) * 4)
    }
    score /= times.length
    if (!best || score > best.score) best = { bpm, score }
  }
  if (!best || best.score < 0.62) return null
  return Math.round(best.bpm * 2) / 2
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function analyse(
  pcm: Float32Array, sampleRate: number,
  options: Partial<AnalysisOptions> = {},
  onProgress?: (fraction: number) => void,
): AnalysisResult {
  const opts = { ...DEFAULT_ANALYSIS, ...options }
  const signal = downsample(pcm, sampleRate)
  const { frames, peak } = analyseFrames(signal, ANALYSIS_RATE, opts, onProgress)
  medianSmooth(frames)
  fixOctaveJumps(frames)
  const notes = segmentNotes(frames, opts, peak)
  const hits = detectOnsets(frames, peak)
  const onsetTimes = notes.length >= 4 ? notes.map((n) => n.startSec) : hits.map((h) => h.timeSec)
  return {
    frames,
    notes,
    hits,
    durationSec: pcm.length / sampleRate,
    tempo: estimateTempo(onsetTimes),
    peak,
  }
}
