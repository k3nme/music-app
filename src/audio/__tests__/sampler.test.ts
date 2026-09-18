import { describe, expect, it } from 'vitest'
import { noteZones, zoneFor } from '../instruments'
import type { SamplerZone } from '../instruments'

const zone = (rootMidi: number, lo: number, hi: number): SamplerZone =>
  ({ sampleId: `s${rootMidi}`, rootMidi, lo, hi })

describe('laying a sampled instrument across the keyboard', () => {
  it('covers every note between the recordings, with no gaps', () => {
    const zones = noteZones([48, 60, 72])
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].lo, `gap below ${zones[i].rootMidi}`).toBe(zones[i - 1].hi + 1)
    }
  })

  it('splits the distance between neighbouring recordings', () => {
    const [low, high] = noteZones([60, 72])
    expect(low.hi).toBe(66)
    expect(high.lo).toBe(67)
  })

  it('reaches out past the outermost recordings, but not forever', () => {
    const zones = noteZones([60], 7)
    expect(zones[0].lo).toBe(53)
    expect(zones[0].hi).toBe(67)
  })

  it('handles a single recording and duplicate notes', () => {
    expect(noteZones([60])).toHaveLength(1)
    expect(noteZones([60, 60, 60])).toHaveLength(1)
    expect(noteZones([])).toEqual([])
  })

  it('sorts recordings that arrive out of order', () => {
    expect(noteZones([72, 48, 60]).map((z) => z.rootMidi)).toEqual([48, 60, 72])
  })
})

describe('choosing which recording plays a note', () => {
  const zones = [zone(48, 41, 54), zone(60, 55, 66), zone(72, 67, 79)]

  it('picks the zone the note falls inside', () => {
    expect(zoneFor(zones, 60)?.rootMidi).toBe(60)
    expect(zoneFor(zones, 44)?.rootMidi).toBe(48)
    expect(zoneFor(zones, 79)?.rootMidi).toBe(72)
  })

  it('plays nothing outside the instrument, rather than the nearest thing', () => {
    // A sampled instrument has edges. Stretching a recording three octaves is
    // not "the same instrument, lower" — it is a different, worse sound.
    expect(zoneFor(zones, 20)).toBeNull()
    expect(zoneFor(zones, 100)).toBeNull()
  })

  it('prefers the nearest root when zones overlap', () => {
    const overlapping = [zone(48, 40, 70), zone(60, 50, 70)]
    expect(zoneFor(overlapping, 62)?.rootMidi).toBe(60)
    expect(zoneFor(overlapping, 45)?.rootMidi).toBe(48)
  })

  it('has nothing to say about an empty instrument', () => {
    expect(zoneFor([], 60)).toBeNull()
  })
})
