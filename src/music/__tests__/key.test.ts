import { describe, expect, it } from 'vitest'
import { detectKey } from '../key'

const notes = (midis: number[], duration = 1) =>
  midis.map((midi) => ({ midi, duration, velocity: 0.8 }))

describe('detectKey', () => {
  it('finds A minor from an A-minor melody', () => {
    const guess = detectKey(notes([69, 72, 76, 74, 72, 69, 67, 69]))
    expect(guess).not.toBeNull()
    expect(guess!.root).toBe(9)
    expect(['minor', 'pentaMinor', 'dorian']).toContain(guess!.scale)
  })

  it('finds C major from a C-major melody', () => {
    const guess = detectKey(notes([60, 62, 64, 65, 67, 65, 64, 62, 60]))
    expect(guess!.root).toBe(0)
    expect(['major', 'pentaMajor', 'mixolydian', 'lydian']).toContain(guess!.scale)
  })

  it('hears the raised seventh of a harmonic minor', () => {
    // E harmonic minor: E F# G A B C D#
    const guess = detectKey(notes([64, 66, 67, 69, 71, 72, 75, 76, 71, 64]))
    expect(guess!.root).toBe(4)
    expect(guess!.scale).toBe('harmonicMinor')
  })

  it('does not claim a key from two notes', () => {
    expect(detectKey(notes([60, 62]))).toBeNull()
  })

  it('reports low confidence for a chromatic run', () => {
    const guess = detectKey(notes([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]))
    expect(guess!.confidence).toBeLessThan(0.35)
  })
})
