import { describe, expect, it } from 'vitest'
import { STYLES } from '../styles'
import { getPreset, isDrumPreset, kitPieces } from '../../audio/instruments'
import { SCALES } from '../../music/theory'

/**
 * A style is data, and the failure mode of wrong data here is silence or a
 * wrong instrument rather than an error — a typo in a preset id gives whoever
 * asked for techno a grand piano, and nothing anywhere would say so.
 */
describe('the style library', () => {
  it('gives every style a unique id and some keywords', () => {
    const ids = STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const style of STYLES) {
      expect(style.id, style.name).toMatch(/^[a-z-]+$/)
      expect(style.keywords.length, style.name).toBeGreaterThan(1)
      for (const keyword of style.keywords) expect(keyword, style.name).toBe(keyword.toLowerCase())
    }
  })

  it('does not let two styles claim the same word', () => {
    const seen = new Map<string, string>()
    for (const style of STYLES) {
      for (const keyword of style.keywords) {
        expect(seen.has(keyword), `"${keyword}" is claimed by ${seen.get(keyword)} and ${style.id}`)
          .toBe(false)
        seen.set(keyword, style.id)
      }
    }
  })

  it('names a real kit, and triggers only pieces that kit has', () => {
    for (const style of STYLES) {
      expect(isDrumPreset(style.kit), style.id).toBe(true)
      const available = new Set(kitPieces(getPreset(style.kit)).map((p) => p.midi))
      for (const [midi] of style.steps) {
        expect(available.has(midi), `${style.id}: ${style.kit} has no piece at ${midi}`).toBe(true)
      }
    }
  })

  it('names real instruments for every job', () => {
    for (const style of STYLES) {
      for (const [role, candidates] of Object.entries(style.instruments ?? {})) {
        for (const id of candidates) {
          expect(getPreset(id).id, `${style.id}/${role}: no preset "${id}"`).toBe(id)
        }
      }
    }
  })

  it('puts a bass in the bass job and something playable elsewhere', () => {
    for (const style of STYLES) {
      for (const id of style.instruments?.bass ?? []) {
        // A "bass" that cannot play low notes is not a bass.
        expect(getPreset(id).range[0], `${style.id}: ${id}`).toBeLessThanOrEqual(45)
      }
      for (const role of ['chords', 'lead', 'pad'] as const) {
        for (const id of style.instruments?.[role] ?? []) {
          expect(isDrumPreset(id), `${style.id}/${role}: ${id} is a drum kit`).toBe(false)
        }
      }
    }
  })

  it('keeps every tempo range sane and in order', () => {
    for (const style of STYLES) {
      const [lo, hi] = style.bpmHint
      expect(lo, style.id).toBeGreaterThan(40)
      expect(hi, style.id).toBeLessThan(220)
      expect(hi, style.id).toBeGreaterThan(lo)
    }
  })

  it('names a scale that exists and progressions that fit it', () => {
    for (const style of STYLES) {
      if (style.scale) expect(SCALES[style.scale], `${style.id}: ${style.scale}`).toBeTruthy()
      const degrees = SCALES[style.scale ?? 'minor'].steps.length
      for (const progression of style.progressions ?? []) {
        expect(progression.length, style.id).toBeGreaterThanOrEqual(2)
        for (const degree of progression) {
          expect(degree, `${style.id}: degree ${degree}`).toBeGreaterThanOrEqual(0)
          expect(degree, `${style.id}: degree ${degree}`).toBeLessThan(degrees)
        }
      }
    }
  })

  it('keeps the duck off the styles that would never use one', () => {
    const acoustic = STYLES.filter((s) => ['rock', 'latin', 'indian', 'boom-bap'].includes(s.id))
    for (const style of acoustic) expect(style.pump ?? 0, style.id).toBe(0)
  })
})
