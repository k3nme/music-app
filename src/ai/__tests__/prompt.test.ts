import { describe, expect, it } from 'vitest'
import { EXAMPLE_PROMPTS, matchStyle, readKey, readPrompt, readTempo } from '../prompt'
import { NOTE_NAMES } from '../../music/theory'

describe('reading a style out of a prompt', () => {
  it('finds the genre someone named', () => {
    expect(matchStyle('a techno track').style.id).toBe('techno')
    expect(matchStyle('some lo-fi to study to').style.id).toBe('boom-bap')
    expect(matchStyle('amapiano vibes').style.id).toBe('amapiano')
    expect(matchStyle('drum and bass').style.id).toBe('dnb')
  })

  it('prefers the more specific genre', () => {
    // "afro house" contains "house"; the longer match is the one meant.
    expect(matchStyle('afro house please').style.id).toBe('afro-house')
    expect(matchStyle('deep house please').style.id).toBe('house')
  })

  it('matches whole words only', () => {
    // "housework" is not house, and "trapped" is not trap.
    expect(matchStyle('a song about housework').matched).toBeNull()
    expect(matchStyle('trapped in a lift').matched).toBeNull()
  })

  it('still picks something when no genre is named', () => {
    const { style, matched } = matchStyle('something nice')
    expect(matched).toBeNull()
    expect(style).toBeTruthy()
  })
})

describe('reading a tempo', () => {
  it('takes an explicit BPM', () => {
    expect(readTempo('house at 128 bpm')).toBe(128)
    expect(readTempo('140BPM techno')).toBe(140)
    expect(readTempo('a track at 90')).toBe(90)
  })

  it('ignores numbers that are not tempos', () => {
    expect(readTempo('a song about 1999')).toBeNull()
    expect(readTempo('8 bars of drums')).toBeNull()
    expect(readTempo('at 400 bpm')).toBeNull()
  })
})

describe('reading a key', () => {
  it('takes a stated key', () => {
    expect(readKey('in F minor')).toEqual({ root: 5, minor: true })
    expect(readKey('in C major')).toEqual({ root: 0, minor: false })
    expect(readKey('key of Bb')).toEqual({ root: 10, minor: null })
    expect(readKey('C# minor please')).toEqual({ root: 1, minor: true })
  })

  it('does not read a stray letter as a key', () => {
    // "a sad song" must not become the key of A.
    expect(readKey('a sad song')).toBeNull()
    expect(readKey('something energetic')).toBeNull()
  })
})

describe('reading a whole prompt', () => {
  it('turns a real sentence into a brief', () => {
    const brief = readPrompt('a dark amapiano track at 112 with a sad piano')
    expect(brief.style.id).toBe('amapiano')
    expect(brief.bpm).toBe(112)
    expect(brief.wanted).toContain('grand-piano')
    expect(brief.energy).toBeLessThan(0.6)   // "dark" and "sad"
    expect(brief.reasons.length).toBeGreaterThan(2)
  })

  it('puts the mood into the tempo when none is given', () => {
    const calm = readPrompt('chilled house')
    const hard = readPrompt('hard driving house')
    expect(hard.bpm).toBeGreaterThan(calm.bpm)
    const [lo, hi] = calm.style.bpmHint
    expect(calm.bpm).toBeGreaterThanOrEqual(lo)
    expect(hard.bpm).toBeLessThanOrEqual(hi)
  })

  it('makes a sad song minor and a happy one major', () => {
    expect(readPrompt('a sad song').scale).toBe('minor')
    expect(readPrompt('a happy sunny song').scale).toBe('major')
  })

  it('honours a key that is asked for over the mood', () => {
    const brief = readPrompt('a happy track in F minor')
    expect(NOTE_NAMES[brief.root]).toBe('F')
    expect(brief.scale).toBe('minor')
  })

  it('hears instruments by name', () => {
    const brief = readPrompt('lo-fi with rhodes, upright bass and a sax')
    expect(brief.wanted).toContain('rhodes')
    expect(brief.wanted).toContain('tenor-sax')
  })

  it('hears what to leave out', () => {
    expect(readPrompt('ambient, no drums').without).toContain('drums')
    expect(readPrompt('house without a bass').without).toContain('bass')
    expect(readPrompt('a track with drums').without).toEqual([])
  })

  it('reads a length', () => {
    expect(readPrompt('a short loop').bars).toBe(16)
    expect(readPrompt('a full track').bars).toBe(64)
    expect(readPrompt('16 bars of techno').bars).toBe(16)
  })

  it('notices when you want your own sounds', () => {
    expect(readPrompt('house using my own sounds').useMySounds).toBe(true)
    expect(readPrompt('house').useMySounds).toBe(false)
  })

  it('always produces a usable brief, even from nothing', () => {
    for (const prompt of ['', '   ', 'asdfghjkl', 'make me something']) {
      const brief = readPrompt(prompt)
      expect(brief.bpm).toBeGreaterThan(40)
      expect(brief.bpm).toBeLessThan(220)
      expect(brief.root).toBeGreaterThanOrEqual(0)
      expect(brief.root).toBeLessThan(12)
      expect(brief.bars).toBeGreaterThanOrEqual(8)
      expect(brief.style).toBeTruthy()
    }
  })

  it('is deterministic for the same prompt and seed', () => {
    const a = readPrompt('something nice', { seed: 42 })
    const b = readPrompt('something nice', { seed: 42 })
    expect(a.root).toBe(b.root)
    expect(a.bpm).toBe(b.bpm)
  })

  it('explains every choice it made', () => {
    const brief = readPrompt('dreamy techno in G minor at 130')
    const joined = brief.reasons.join(' | ')
    expect(joined).toMatch(/techno/i)
    expect(joined).toMatch(/130/)
    expect(joined).toMatch(/G/)
  })

  it('understands every example it offers', () => {
    for (const prompt of EXAMPLE_PROMPTS) {
      const brief = readPrompt(prompt)
      // An example that matched nothing would be a bad example.
      expect(brief.reasons[0], prompt).not.toMatch(/no style named/)
    }
  })
})
