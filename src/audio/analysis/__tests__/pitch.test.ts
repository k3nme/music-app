import { describe, expect, it } from 'vitest'
import { ANALYSIS_RATE, analyse, estimateTempo, yin } from '../pitch'

const SR = 44100

/** A vibrato-ish sung tone: a few harmonics, slight amplitude envelope. */
function tone(midi: number, seconds: number, sampleRate = SR, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * sampleRate)
  const out = new Float32Array(n)
  const hz = 440 * Math.pow(2, (midi - 69) / 12)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const env = Math.min(1, t / 0.02) * Math.min(1, (seconds - t) / 0.03)
    out[i] = env * amp * (
      Math.sin(2 * Math.PI * hz * t) +
      0.5 * Math.sin(2 * Math.PI * hz * 2 * t) +
      0.25 * Math.sin(2 * Math.PI * hz * 3 * t)
    ) / 1.75
  }
  return out
}

function silence(seconds: number, sampleRate = SR): Float32Array {
  return new Float32Array(Math.floor(seconds * sampleRate))
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Float32Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

describe('yin', () => {
  it('finds the pitch of a pure tone within a cent or two', () => {
    const buf = tone(69, 0.1, ANALYSIS_RATE).subarray(0, 1024)
    const res = yin(new Float32Array(buf), ANALYSIS_RATE, { minHz: 65, maxHz: 1100, threshold: 0.14 })
    expect(res).not.toBeNull()
    expect(res!.hz).toBeCloseTo(440, 0)
    expect(res!.clarity).toBeGreaterThan(0.8)
  })

  it('tracks across the singing range', () => {
    for (const midi of [45, 52, 60, 67, 72, 79]) {
      const buf = new Float32Array(tone(midi, 0.1, ANALYSIS_RATE).subarray(0, 1024))
      const res = yin(buf, ANALYSIS_RATE, { minHz: 65, maxHz: 1100, threshold: 0.14 })
      expect(res, `midi ${midi}`).not.toBeNull()
      const detected = 69 + 12 * Math.log2(res!.hz / 440)
      expect(Math.abs(detected - midi), `midi ${midi} -> ${detected}`).toBeLessThan(0.2)
    }
  })

  it('returns null for noise', () => {
    const buf = new Float32Array(1024)
    for (let i = 0; i < buf.length; i++) buf[i] = Math.random() * 2 - 1
    const res = yin(buf, ANALYSIS_RATE, { minHz: 65, maxHz: 1100, threshold: 0.14 })
    // Either no result, or one flagged as clearly unreliable.
    expect(res === null || res.clarity < 0.6).toBe(true)
  })
})

describe('analyse', () => {
  it('segments a sung melody into the right notes', () => {
    // C4 D4 E4 G4, 300ms each with short gaps.
    const melody = [60, 62, 64, 67]
    const pcm = concat(melody.flatMap((m) => [tone(m, 0.3), silence(0.09)]))
    const result = analyse(pcm, SR)

    expect(result.notes.length).toBe(4)
    result.notes.forEach((note, i) => {
      expect(Math.round(note.midi), `note ${i}`).toBe(melody[i])
      expect(note.endSec - note.startSec).toBeGreaterThan(0.2)
      expect(note.confidence).toBeGreaterThan(0.6)
    })
    // Notes should land roughly where they were sung.
    expect(result.notes[0].startSec).toBeLessThan(0.06)
    expect(result.notes[3].startSec).toBeCloseTo(3 * 0.39, 1)
  })

  it('splits a legato pitch change into two notes', () => {
    const pcm = concat([tone(60, 0.4), tone(64, 0.4)])
    const result = analyse(pcm, SR)
    expect(result.notes.length).toBe(2)
    expect(Math.round(result.notes[0].midi)).toBe(60)
    expect(Math.round(result.notes[1].midi)).toBe(64)
  })

  it('ignores silence', () => {
    const result = analyse(silence(1), SR)
    expect(result.notes).toHaveLength(0)
  })

  it('reports louder passages as higher velocity', () => {
    const pcm = concat([
      tone(60, 0.3, SR, 0.15), silence(0.1),
      tone(60, 0.3, SR, 0.9),
    ])
    const result = analyse(pcm, SR)
    expect(result.notes.length).toBe(2)
    expect(result.notes[1].velocity).toBeGreaterThan(result.notes[0].velocity)
  })
})

describe('estimateTempo', () => {
  it('recovers a steady tempo from onset times', () => {
    const bpm = 100
    const beat = 60 / bpm
    const times = Array.from({ length: 12 }, (_, i) => i * beat + (Math.random() - 0.5) * 0.012)
    expect(estimateTempo(times)).toBeCloseTo(bpm, 0)
  })

  it('gives up on random onsets rather than guessing', () => {
    const times = Array.from({ length: 10 }, () => Math.random() * 6).sort((a, b) => a - b)
    const result = estimateTempo(times)
    expect(result === null || result > 0).toBe(true)
  })
})
