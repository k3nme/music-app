import { describe, expect, it } from 'vitest'
import { analyseAudio, computePeaks, loudnessDb, _internals } from '../audio'

const SR = 22050

/** A drum-machine-ish track: kick on the beat, hat on the offbeat. */
function clickTrack(bpm: number, seconds: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  const beat = (60 / bpm) * sampleRate

  const kick = (at: number, gain: number) => {
    const n = Math.floor(0.16 * sampleRate)
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(at) + i
      if (idx >= out.length) break
      const t = i / sampleRate
      const hz = 130 * Math.exp(-t * 28) + 45
      out[idx] += gain * Math.exp(-t * 22) * Math.sin(2 * Math.PI * hz * t)
    }
  }
  const hat = (at: number, gain: number) => {
    const n = Math.floor(0.03 * sampleRate)
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(at) + i
      if (idx >= out.length) break
      out[idx] += gain * Math.exp(-(i / n) * 6) * (Math.random() * 2 - 1) * 0.5
    }
  }

  let index = 0
  for (let position = 0; position < out.length; position += beat) {
    // Accent beat one so the downbeat is findable.
    kick(position, index % 4 === 0 ? 1 : 0.75)
    hat(position, 0.22)
    hat(position + beat / 2, 0.22)
    index++
  }
  return out
}

/** A chord progression as stacked sines, optionally detuned as a whole. */
function progression(
  chords: number[][], secondsEach: number, sampleRate = SR, detuneCents = 0,
): Float32Array {
  const total = Math.floor(chords.length * secondsEach * sampleRate)
  const out = new Float32Array(total)
  const scale = Math.pow(2, detuneCents / 1200)

  chords.forEach((chord, index) => {
    const start = Math.floor(index * secondsEach * sampleRate)
    const n = Math.floor(secondsEach * sampleRate)
    for (const midi of chord) {
      const hz = 440 * Math.pow(2, (midi - 69) / 12) * scale
      for (let i = 0; i < n; i++) {
        const idx = start + i
        if (idx >= total) break
        const t = i / sampleRate
        const env = Math.min(1, t / 0.02) * Math.min(1, (secondsEach - t) / 0.05)
        // A couple of harmonics, so chroma sees a real instrument-ish spectrum.
        out[idx] += env * 0.14 * (
          Math.sin(2 * Math.PI * hz * t) +
          0.4 * Math.sin(4 * Math.PI * hz * t) +
          0.18 * Math.sin(6 * Math.PI * hz * t)
        )
      }
    }
  })
  return out
}

describe('tempo detection', () => {
  it('finds the tempo of a steady beat', () => {
    for (const bpm of [90, 100, 128]) {
      const signal = clickTrack(bpm, 16)
      const { flux, fps } = _internals.onsetEnvelope(signal)
      const grid = _internals.detectTempo(flux, fps)
      expect(Math.abs(grid.bpm - bpm), `${bpm} -> ${grid.bpm}`).toBeLessThan(1.2)
      expect(grid.confidence).toBeGreaterThan(0.2)
    }
  })

  it('does not fall into the half-time trap', () => {
    // 140 BPM: a naive detector often reports 70.
    const { flux, fps } = _internals.onsetEnvelope(clickTrack(140, 16))
    const grid = _internals.detectTempo(flux, fps)
    expect(Math.abs(grid.bpm - 140)).toBeLessThan(1.5)
  })

  it('locks the beat phase near the first hit', () => {
    const signal = clickTrack(120, 12)
    const analysis = analyseAudio([signal], SR)
    const beatSec = 60 / analysis.beat.bpm
    // Offset should land on a beat: near 0 or near a whole beat.
    const remainder = analysis.beat.offsetSec % beatSec
    const distance = Math.min(remainder, beatSec - remainder)
    expect(distance).toBeLessThan(0.06)
  })
})

describe('key detection', () => {
  const AM = [57, 60, 64], F = [53, 57, 60], C = [48, 52, 55], G = [55, 59, 62]

  it('hears A minor', () => {
    // Starts and ends on the tonic, as an A-minor song does. Am-F-C-G on its
    // own is genuinely ambiguous with C major — same seven notes.
    const signal = progression([AM, F, C, G, AM, F, G, AM], 1.6)
    const analysis = analyseAudio([signal], SR)
    expect(analysis.key.root).toBe(9)
    expect(analysis.key.mode).toBe('minor')
    expect(analysis.key.confidence).toBeGreaterThan(0.3)
  })

  it('hears C major', () => {
    const signal = progression([C, F, G, C, C, F, G, C], 1.6)
    const analysis = analyseAudio([signal], SR)
    expect(analysis.key.root).toBe(0)
    expect(analysis.key.mode).toBe('major')
  })
})

describe('tuning detection', () => {
  it('reads a recording that sits flat of A440', () => {
    const signal = progression([[57, 60, 64], [53, 57, 60]], 3, SR, -32)
    const cents = _internals.detectTuning(signal)
    expect(Math.abs(cents - -32)).toBeLessThan(9)
  })

  it('reads a recording that sits sharp', () => {
    const signal = progression([[57, 60, 64], [53, 57, 60]], 3, SR, 24)
    const cents = _internals.detectTuning(signal)
    expect(Math.abs(cents - 24)).toBeLessThan(9)
  })

  it('still gets the key right on a detuned recording', () => {
    // Without tuning correction the chroma smears across two semitones and
    // the key comes out wrong — this is the whole reason tuning is detected.
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [57, 60, 64]]
    const inTune = analyseAudio([progression(chords, 2, SR, 0)], SR)
    const flat = analyseAudio([progression(chords, 2, SR, -38)], SR)

    expect(Math.abs(flat.key.tuningCents - -38)).toBeLessThan(10)
    // The point: a recording 38 cents flat should read the same key as the
    // identical recording at concert pitch.
    expect(flat.key.root).toBe(inTune.key.root)
    expect(flat.key.mode).toBe(inTune.key.mode)
    expect(flat.key.root).toBe(9)
  })

  it('reports roughly zero for a recording at concert pitch', () => {
    const signal = progression([[57, 60, 64], [53, 57, 60]], 3, SR, 0)
    expect(Math.abs(_internals.detectTuning(signal))).toBeLessThan(8)
  })
})

describe('chord detection', () => {
  it('follows a progression', () => {
    const signal = progression([[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], 2)
    const analysis = analyseAudio([signal], SR)
    const roots = analysis.chords
      .filter((c) => c.durationSec > 0.8)
      .map((c) => `${c.root}${c.quality}`)
    // Am, F, C, G — allow the detector to miss one in four.
    const expected = ['9min', '5maj', '0maj', '7maj']
    const hits = expected.filter((chord) => roots.includes(chord)).length
    expect(hits, JSON.stringify(roots)).toBeGreaterThanOrEqual(3)
  })
})

describe('waveform and loudness', () => {
  it('produces min/max pairs', () => {
    const signal = progression([[60]], 1)
    const peaks = computePeaks(signal, 100)
    expect(peaks.length).toBe(200)
    for (let i = 0; i < 100; i++) expect(peaks[i * 2]).toBeLessThanOrEqual(peaks[i * 2 + 1])
  })

  it('measures level in dBFS', () => {
    const loud = new Float32Array(1000).fill(0.5)
    const quiet = new Float32Array(1000).fill(0.05)
    expect(loudnessDb(loud)).toBeCloseTo(-6.02, 1)
    expect(loudnessDb(quiet)).toBeCloseTo(-26.02, 1)
    expect(loudnessDb(new Float32Array(100))).toBe(-100)
  })
})

describe('analyseAudio', () => {
  it('reports duration and channel count', () => {
    const signal = clickTrack(120, 8)
    const analysis = analyseAudio([signal, signal], SR)
    expect(analysis.durationSec).toBeCloseTo(8, 1)
    expect(analysis.channels).toBe(2)
    expect(analysis.peaks.length).toBeGreaterThan(0)
  })
})
