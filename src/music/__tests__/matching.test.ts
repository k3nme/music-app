import { describe, expect, it } from 'vitest'
import {
  keyDistance, planMatch, relativeMinorRoot, tempoRatio, tempoStrain, toKeySpec, transposeFor,
} from '../matching'
import type { AudioAnalysis } from '../../audio/analysis/audio'

describe('relative keys', () => {
  it('folds a major key onto its relative minor', () => {
    expect(relativeMinorRoot({ root: 0, mode: 'major' })).toBe(9)  // C major -> A
    expect(relativeMinorRoot({ root: 9, mode: 'minor' })).toBe(9)
  })

  it('needs no transposition between relative keys', () => {
    expect(keyDistance({ root: 0, mode: 'major' }, { root: 9, mode: 'minor' })).toBe(0)
    expect(keyDistance({ root: 5, mode: 'major' }, { root: 2, mode: 'minor' })).toBe(0)
  })
})

describe('keyDistance', () => {
  it('takes the shorter route', () => {
    // A minor -> D minor is +5 up or -7 down; it should pick +5.
    expect(keyDistance({ root: 9, mode: 'minor' }, { root: 2, mode: 'minor' })).toBe(5)
    // A minor -> E minor is +7 up or -5 down; it should pick -5.
    expect(keyDistance({ root: 9, mode: 'minor' }, { root: 4, mode: 'minor' })).toBe(-5)
  })

  it('stays inside a tritone either way', () => {
    for (let from = 0; from < 12; from++) {
      for (let to = 0; to < 12; to++) {
        const distance = keyDistance({ root: from, mode: 'minor' }, { root: to, mode: 'minor' })
        expect(distance).toBeGreaterThanOrEqual(-6)
        expect(distance).toBeLessThanOrEqual(6)
      }
    }
  })
})

describe('transposeFor', () => {
  const key = (root: number, tuningCents = 0) =>
    ({ root, mode: 'minor' as const, scale: 'minor' as const, confidence: 1, tuningCents })

  it('adds the tuning offset back on', () => {
    // A source 40 cents flat needs +0.4 semitones to reach concert pitch.
    expect(transposeFor(key(9, -40), { root: 9, mode: 'minor' })).toBeCloseTo(0.4, 3)
    expect(transposeFor(key(9, 25), { root: 9, mode: 'minor' })).toBeCloseTo(-0.25, 3)
  })

  it('combines key change and tuning', () => {
    expect(transposeFor(key(9, -50), { root: 11, mode: 'minor' })).toBeCloseTo(2.5, 3)
  })

  it('can be told to leave tuning alone', () => {
    expect(transposeFor(key(9, -40), { root: 9, mode: 'minor' }, false)).toBe(0)
  })
})

describe('tempo matching', () => {
  it('computes the speed multiplier', () => {
    expect(tempoRatio(100, 120)).toBeCloseTo(1.2, 6)
    expect(tempoRatio(0, 120)).toBe(1)
  })

  it('prefers half or double time over an extreme stretch', () => {
    // 75 BPM against a 150 BPM project: double it rather than stretch 100%.
    const strain = tempoStrain(75, 150)
    expect(strain.suggestedSourceBpm).toBe(150)
    expect(strain.percent).toBeCloseTo(0, 5)
    expect(strain.advice).toBe('easy')
  })

  it('flags a stretch that will be audible', () => {
    expect(tempoStrain(100, 112).advice).toBe('stretchy')
    expect(tempoStrain(100, 128).advice).toBe('try-half-time')
  })

  it('leaves a close tempo alone', () => {
    const strain = tempoStrain(122, 124)
    expect(strain.suggestedSourceBpm).toBe(122)
    expect(strain.advice).toBe('easy')
  })
})

describe('toKeySpec', () => {
  it('maps modal and world scales onto major or minor', () => {
    expect(toKeySpec(0, 'dorian').mode).toBe('minor')
    expect(toKeySpec(0, 'lydian').mode).toBe('major')
    expect(toKeySpec(0, 'bhairav').mode).toBe('major')
    expect(toKeySpec(0, 'hirajoshi').mode).toBe('minor')
  })
})

describe('planMatch', () => {
  const analysis = (bpm: number, root: number, tuningCents = 0): AudioAnalysis => ({
    durationSec: 200, sampleRate: 44100, channels: 2,
    beat: { bpm, confidence: 0.8, offsetSec: 0, downbeatSec: 0, beatsPerBar: 4 },
    key: { root, mode: 'minor', scale: 'minor', confidence: 0.7, tuningCents },
    chords: [], peaks: new Float32Array(0), loudnessDb: -14,
  })

  it('plans a full match', () => {
    const plan = planMatch(analysis(96, 9, -20), 124, { root: 2, mode: 'minor' })
    expect(plan.speed).toBeCloseTo(124 / 96, 5)
    expect(plan.semitones).toBeCloseTo(5.2, 3)
  })

  it('can skip the key change', () => {
    const plan = planMatch(analysis(96, 9), 124, { root: 2, mode: 'minor' }, { matchKey: false })
    expect(plan.semitones).toBe(0)
    expect(plan.speed).toBeGreaterThan(1)
  })

  it('uses double time when that is the smaller move', () => {
    const plan = planMatch(analysis(70, 9), 140, { root: 9, mode: 'minor' })
    expect(plan.sourceBpm).toBe(140)
    expect(plan.speed).toBeCloseTo(1, 5)
  })
})
