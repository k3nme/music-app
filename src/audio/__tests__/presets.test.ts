import { describe, expect, it } from 'vitest'
import {
  ALL_PRESETS, DRUM_PRESETS, FAMILY_LABELS, FAMILY_ORDER, MELODIC_PRESETS,
  getPreset, isDrumPreset, kitPieces, searchPresets,
} from '../instruments'

/**
 * The library is data, and data rots quietly: a duplicated id shadows an
 * instrument, an empty kit plays nothing, a range that excludes its own centre
 * opens the piano roll on dimmed keys. None of that throws — it just makes an
 * instrument that doesn't work. So it gets checked here.
 */
describe('instrument library', () => {
  it('is actually large enough to claim "any instrument"', () => {
    expect(MELODIC_PRESETS.length).toBeGreaterThan(100)
    expect(DRUM_PRESETS.length).toBeGreaterThan(15)
  })

  it('gives every preset a unique id', () => {
    const ids = ALL_PRESETS.map((p) => p.id)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(duplicates).toEqual([])
  })

  it('gives every preset a name, a blurb and search tags', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.name.length, preset.id).toBeGreaterThan(1)
      expect(preset.blurb.length, preset.id).toBeGreaterThan(15)
      expect(preset.tags.length, preset.id).toBeGreaterThan(1)
      for (const tag of preset.tags) expect(tag, preset.id).toBe(tag.toLowerCase())
    }
  })

  it('keeps every range playable and centred inside itself', () => {
    for (const preset of ALL_PRESETS) {
      const [low, high] = preset.range
      expect(low, preset.id).toBeGreaterThanOrEqual(0)
      expect(high, preset.id).toBeLessThanOrEqual(127)
      // An octave is the least you can write a part in.
      expect(high - low, preset.id).toBeGreaterThanOrEqual(12)
      expect(preset.centerMidi, preset.id).toBeGreaterThanOrEqual(low)
      expect(preset.centerMidi, preset.id).toBeLessThanOrEqual(high)
    }
  })

  it('files every preset under a family the picker can show', () => {
    for (const preset of ALL_PRESETS) {
      expect(FAMILY_ORDER, preset.id).toContain(preset.family)
      expect(FAMILY_LABELS[preset.family], preset.id).toBeTruthy()
    }
  })

  it('has at least one instrument in every family it advertises', () => {
    for (const family of FAMILY_ORDER) {
      const members = ALL_PRESETS.filter((p) => p.family === family)
      expect(members.length, family).toBeGreaterThan(0)
    }
  })

  it('leaves room for chords wherever polyphony matters', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.polyphony, preset.id).toBeGreaterThan(0)
      // Basses, leads and drones are near-monophonic on purpose — one player,
      // one line, and the voice-stealing is what makes it sound played.
      if (preset.family === 'bass') continue
      if (preset.tags.includes('lead') || preset.tags.includes('drone')) continue
      if (preset.engine === 'drum') continue
      expect(preset.polyphony, preset.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every drum kit pieces that can actually be triggered', () => {
    for (const preset of DRUM_PRESETS) {
      const pieces = kitPieces(preset)
      expect(pieces.length, preset.id).toBeGreaterThan(3)
      const midis = pieces.map((p) => p.midi)
      expect(new Set(midis).size, preset.id).toBe(midis.length)
      for (const { midi, piece } of pieces) {
        expect(midi, preset.id).toBeGreaterThanOrEqual(0)
        expect(midi, preset.id).toBeLessThanOrEqual(127)
        expect(piece.name.length, `${preset.id}/${midi}`).toBeGreaterThan(1)
        expect(piece.level, `${preset.id}/${midi}`).toBeGreaterThan(0)
        // Parallel paths sum, and the master limiter hides it until someone
        // renders a stem — so no single piece gets to be hot on its own.
        expect(piece.level, `${preset.id}/${midi}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('puts a kick on 36 in every kit, so drum patterns are portable', () => {
    for (const preset of DRUM_PRESETS) {
      if (preset.id === 'kit-fx') continue // transitions, not a kit to play a beat on
      const midis = kitPieces(preset).map((p) => p.midi)
      expect(midis, preset.id).toContain(36)
    }
  })

  it('agrees with itself about what a drum kit is', () => {
    for (const preset of DRUM_PRESETS) {
      expect(isDrumPreset(preset.id), preset.id).toBe(true)
      expect(preset.family, preset.id).toBe('drums')
    }
    for (const preset of MELODIC_PRESETS) {
      expect(isDrumPreset(preset.id), preset.id).toBe(false)
    }
  })

  it('looks a preset up by id, and falls back rather than throwing', () => {
    expect(getPreset('grand-piano').id).toBe('grand-piano')
    expect(getPreset('no-such-instrument').id).toBe(MELODIC_PRESETS[0].id)
  })

  it('finds the sounds the search box promises', () => {
    const find = (query: string) => searchPresets(query).map((p) => p.id)
    expect(find('amapiano')).toContain('kit-amapiano')
    expect(find('riser')).toContain('kit-fx')
    expect(find('wobble')).toContain('wobble-bass')
    expect(find('kora')).toContain('kora')
    expect(find('supersaw')).toContain('supersaw')
    expect(searchPresets('')).toHaveLength(ALL_PRESETS.length)
    expect(searchPresets('qwertyuiop')).toHaveLength(0)
  })
})
