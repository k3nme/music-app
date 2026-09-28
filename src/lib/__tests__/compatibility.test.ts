import { describe, expect, it } from 'vitest'
import {
  fifthsDistance, keyRelation, rankPairs, scorePair, suggestStems, tempoMatch,
  type SongFacts,
} from '../compatibility'

const song = (over: Partial<SongFacts>): SongFacts => ({
  id: 'a', name: 'A song', bpm: 120, root: 0, mode: 'minor',
  tuningCents: 0, loudnessDb: -12, durationSec: 200, keyConfidence: 0.9,
  ...over,
})

describe('matching tempos', () => {
  it('leaves an already-matching pair alone', () => {
    const { speed, shift } = tempoMatch(120, 120)
    expect(speed).toBe(1)
    expect(shift).toBe('none')
  })

  it('hears 140 over 70 as the same tempo counted differently', () => {
    // Not a tempo problem; it is how half of all mashups work. The name says
    // what happens to B: its 70 is read as 140.
    const { speed, shift } = tempoMatch(140, 70)
    expect(shift).toBe('double')
    expect(speed).toBeCloseTo(1, 5)
  })

  it('hears 70 under 140 the same way', () => {
    const { shift, speed } = tempoMatch(70, 140)
    expect(shift).toBe('half')
    expect(speed).toBeCloseTo(1, 5)
  })

  it('picks whichever reading asks for the least stretching', () => {
    // 128 against 130: straight is a 1.5% move, half-time would be enormous.
    expect(tempoMatch(128, 130).shift).toBe('none')
    expect(tempoMatch(128, 130).speed).toBeCloseTo(0.985, 3)
  })
})

describe('matching keys', () => {
  it('knows the relative major and minor share every note', () => {
    const relation = keyRelation(
      song({ root: 0, mode: 'minor' }),          // C minor
      song({ id: 'b', root: 3, mode: 'major' }), // Eb major — its relative
    )
    expect(relation.transpose).toBe(0)
    expect(relation.score).toBeGreaterThan(0.9)
    expect(relation.note).toMatch(/relative/)
  })

  it('moves the shortest way round', () => {
    // C to A is down three, not up nine.
    const relation = keyRelation(
      song({ root: 9, mode: 'minor' }),
      song({ id: 'b', root: 0, mode: 'minor' }),
    )
    expect(relation.transpose).toBe(-3)
  })

  it('prefers a pairing that barely has to move', () => {
    const close = keyRelation(song({ root: 0 }), song({ id: 'b', root: 1 }))
    const far = keyRelation(song({ root: 0 }), song({ id: 'b', root: 6 }))
    expect(close.score).toBeGreaterThan(far.score)
  })

  it('folds the recording’s own tuning into the move', () => {
    // A record cut 50 cents flat needs half a semitone more than the note says.
    const relation = keyRelation(
      song({ root: 0, tuningCents: 0 }),
      song({ id: 'b', root: 0, mode: 'minor', tuningCents: -50 }),
    )
    expect(relation.transpose).toBeCloseTo(0.5, 2)
  })

  it('measures distance round the circle of fifths', () => {
    expect(fifthsDistance(0, 0)).toBe(0)
    expect(fifthsDistance(0, 7)).toBe(1)   // C to G
    expect(fifthsDistance(0, 5)).toBe(1)   // C to F
    expect(fifthsDistance(0, 6)).toBe(6)   // C to F# — as far as it gets
  })
})

describe('scoring a pairing', () => {
  it('loves two records already in the same key at the same tempo', () => {
    const pair = scorePair(song({}), song({ id: 'b', name: 'B' }))
    expect(pair.verdict).toBe('great')
    expect(pair.score).toBeGreaterThan(0.9)
    expect(pair.notes.join(' ')).toMatch(/tempos already agree/)
  })

  it('is honest about a pairing that needs a big stretch', () => {
    const pair = scorePair(song({ bpm: 120 }), song({ id: 'b', name: 'B', bpm: 150 }))
    expect(pair.verdict).toBe('a stretch')
    expect(pair.notes.join(' ')).toMatch(/audible/)
  })

  it('counts double time rather than calling it a stretch', () => {
    const pair = scorePair(song({ bpm: 140 }), song({ id: 'b', name: 'B', bpm: 70 }))
    expect(pair.timeShift).toBe('double')
    expect(pair.verdict).toBe('great')
  })

  it('does not let a perfect key rescue a tempo that cannot be matched', () => {
    // Same key, wildly different tempo. A mashup out of time is not a mashup.
    const pair = scorePair(song({ bpm: 120 }), song({ id: 'b', name: 'B', bpm: 155 }))
    expect(pair.verdict).toBe('a stretch')
  })

  it('warns when a key is only a guess', () => {
    const pair = scorePair(song({}), song({ id: 'b', name: 'B', keyConfidence: 0.2 }))
    expect(pair.notes.join(' ')).toMatch(/guess/)
    expect(pair.score).toBeLessThan(0.95)
  })

  it('explains itself in sentences, not numbers', () => {
    const pair = scorePair(song({ bpm: 124 }), song({ id: 'b', name: 'B', bpm: 128, root: 5 }))
    expect(pair.notes.length).toBeGreaterThan(1)
    for (const note of pair.notes) expect(note.length).toBeGreaterThan(10)
  })
})

describe('ranking a library', () => {
  const library = [
    song({ id: '1', name: 'House', bpm: 124, root: 0, mode: 'minor' }),
    song({ id: '2', name: 'Same key', bpm: 125, root: 0, mode: 'minor' }),
    song({ id: '3', name: 'Miles off', bpm: 172, root: 6, mode: 'major' }),
  ]

  it('puts the best pairing first', () => {
    const ranked = rankPairs(library)
    expect([ranked[0].a.id, ranked[0].b.id].sort()).toEqual(['1', '2'])
  })

  it('scores both directions, because they are not the same question', () => {
    const ranked = rankPairs(library)
    expect(ranked).toHaveLength(6)   // 3 songs, both ways
  })

  it('never pairs a song with itself', () => {
    for (const pair of rankPairs(library)) expect(pair.a.id).not.toBe(pair.b.id)
  })

  it('has nothing to say about a library of one', () => {
    expect(rankPairs([library[0]])).toEqual([])
  })
})

describe('choosing the stems', () => {
  it('takes the vocal off the quieter record and the groove off the louder', () => {
    const pair = scorePair(
      song({ name: 'Loud', loudnessDb: -8 }),
      song({ id: 'b', name: 'Quiet', loudnessDb: -18 }),
    )
    const stems = suggestStems(pair)
    expect(stems.b).toEqual(['vocals'])
    expect(stems.a).toContain('drums')
    expect(stems.why).toMatch(/Quiet/)
  })

  it('gives the fuller record more to do', () => {
    const pair = scorePair(
      song({ name: 'Sparse', loudnessDb: -18 }),
      song({ id: 'b', name: 'Full', loudnessDb: -7 }),
    )
    const stems = suggestStems(pair)
    expect(stems.b).toContain('vocals')
    expect(stems.b.length).toBeGreaterThan(1)
  })

  it('always leaves the drums with whoever sets the grid', () => {
    for (const loudness of [-20, -12, -4]) {
      const pair = scorePair(song({}), song({ id: 'b', name: 'B', loudnessDb: loudness }))
      expect(suggestStems(pair).a).toContain('drums')
    }
  })
})
