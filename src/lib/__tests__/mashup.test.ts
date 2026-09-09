import { describe, expect, it } from 'vitest'
import { barSeconds, deckChannels, describeSelection, levelMatch, planFor, sliceFromDownbeat } from '../mashup'
import type { AudioAnalysis } from '../../audio/analysis/audio'
import type { Deck } from '../mashup'

const SR = 1000

function analysis(bpm: number, downbeatSec: number, root = 9, loudnessDb = -14): AudioAnalysis {
  return {
    durationSec: 60, sampleRate: SR, channels: 1,
    beat: { bpm, confidence: 0.8, offsetSec: downbeatSec, downbeatSec, beatsPerBar: 4 },
    key: { root, mode: 'minor', scale: 'minor', confidence: 0.7, tuningCents: 0 },
    chords: [], peaks: new Float32Array(0), loudnessDb,
  }
}

/** A ramp, so slice boundaries are easy to check by value. */
function ramp(seconds: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  for (let i = 0; i < out.length; i++) out[i] = i / sampleRate
  return out
}

const deckBase = (over: Partial<Deck>): Deck => ({
  id: 'd', meta: {} as Deck['meta'], analysis: analysis(120, 0),
  channels: [Float32Array.from([1, 1, 1])], sampleRate: SR,
  stems: null, separating: false, selection: 'full', gain: 1, enabled: true, startBar: 0,
  ...over,
})

describe('barSeconds', () => {
  it('is four beats at the given tempo', () => {
    expect(barSeconds(120)).toBeCloseTo(2, 6)
    expect(barSeconds(60)).toBeCloseTo(4, 6)
  })
})

describe('sliceFromDownbeat', () => {
  it('cuts from the downbeat, not from zero', () => {
    const result = sliceFromDownbeat([ramp(30)], SR, analysis(120, 1.5), 0, 4)
    expect(result.startSec).toBeCloseTo(1.5, 6)
    expect(result.seconds).toBeCloseTo(8, 2)
    // The ramp encodes its own time, so the first sample says where we started.
    expect(result.channels[0][0]).toBeCloseTo(1.5, 2)
  })

  it('honours a start-bar offset', () => {
    const result = sliceFromDownbeat([ramp(30)], SR, analysis(120, 1), 2, 4)
    expect(result.startSec).toBeCloseTo(5, 6)
    expect(result.channels[0][0]).toBeCloseTo(5, 2)
  })

  it('uses the half- or double-time tempo when given one', () => {
    const atSource = sliceFromDownbeat([ramp(30)], SR, analysis(75, 0), 0, 4)
    const atDouble = sliceFromDownbeat([ramp(30)], SR, analysis(75, 0), 0, 4, 150)
    expect(atDouble.seconds).toBeCloseTo(atSource.seconds / 2, 2)
  })

  it('stops at the end of the file rather than overrunning', () => {
    const signal = ramp(5)
    const result = sliceFromDownbeat([signal], SR, analysis(120, 4), 0, 16)
    expect(result.channels[0].length).toBeLessThanOrEqual(signal.length)
    expect(result.seconds).toBeLessThan(2)
  })

  it('keeps every channel in step', () => {
    const result = sliceFromDownbeat([ramp(20), ramp(20)], SR, analysis(120, 2), 1, 2)
    expect(result.channels).toHaveLength(2)
    expect(result.channels[0].length).toBe(result.channels[1].length)
  })
})

describe('deckChannels', () => {
  it('returns the full mix when no stems are selected', () => {
    expect(Array.from(deckChannels(deckBase({}))[0])).toEqual([1, 1, 1])
  })

  it('falls back to the full mix when stems are not ready', () => {
    expect(Array.from(deckChannels(deckBase({ selection: ['vocals'] }))[0])).toEqual([1, 1, 1])
  })

  it('mixes only the selected stems', () => {
    const stems = {
      vocals: [Float32Array.from([1, 0, 0])],
      drums: [Float32Array.from([0, 2, 0])],
      bass: [Float32Array.from([0, 0, 4])],
      other: [Float32Array.from([8, 8, 8])],
    }
    expect(Array.from(deckChannels(deckBase({ stems, selection: ['vocals', 'drums'] }))[0]))
      .toEqual([1, 2, 0])
  })

  it('returns silence when a deck is set to contribute nothing', () => {
    const one = () => [Float32Array.from([1, 1, 1])]
    const stems = { vocals: one(), drums: one(), bass: one(), other: one() }
    expect(Array.from(deckChannels(deckBase({ stems, selection: [] }))[0])).toEqual([0, 0, 0])
  })
})

describe('levelMatch', () => {
  const deck = (loudnessDb: number) => deckBase({ analysis: analysis(120, 0, 9, loudnessDb) })

  it('brings a quiet source up', () => {
    expect(levelMatch(deck(-20), -14)).toBeCloseTo(Math.pow(10, 6 / 20), 5)
  })

  it('brings a loud source down', () => {
    expect(levelMatch(deck(-8), -14)).toBeCloseTo(Math.pow(10, -6 / 20), 5)
  })

  it('refuses to make an extreme correction', () => {
    expect(levelMatch(deck(-60), -14)).toBeCloseTo(Math.pow(10, 12 / 20), 5)
  })
})

describe('planFor', () => {
  const deck = (bpm: number, root: number) =>
    deckBase({ analysis: analysis(bpm, 2, root), startBar: 1 })

  it('combines tempo, key and the cut point', () => {
    const plan = planFor(deck(100, 9), 125, { root: 2, mode: 'minor' }, { bars: 8 })
    expect(plan.speed).toBeCloseTo(1.25, 5)
    expect(plan.semitones).toBe(5)
    // Downbeat at 2s plus one bar at 100 BPM (2.4s).
    expect(plan.startSec).toBeCloseTo(4.4, 5)
    expect(plan.sourceSeconds).toBeCloseTo(8 * 2.4, 5)
  })

  it('uses double time when that is the gentler move', () => {
    const plan = planFor(deck(70, 9), 140, { root: 9, mode: 'minor' }, { bars: 4 })
    expect(plan.sourceBpm).toBe(140)
    expect(plan.speed).toBeCloseTo(1, 5)
    // The cut must follow the doubled tempo too, or it would grab twice as much.
    expect(plan.sourceSeconds).toBeCloseTo(4 * barSeconds(140), 5)
  })
})

describe('describeSelection', () => {
  it('reads plainly', () => {
    expect(describeSelection('full')).toBe('Full mix')
    expect(describeSelection(['vocals'])).toBe('Vocals')
    expect(describeSelection(['vocals', 'drums'])).toBe('Vocals + Drums')
    expect(describeSelection([])).toBe('Nothing')
  })
})
