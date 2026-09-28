import { describe, expect, it } from 'vitest'
import { lanesFor, orderSet, planSet, transitionLanes } from '../djset'
import type { SongFacts } from '../compatibility'

const song = (over: Partial<SongFacts>): SongFacts => ({
  id: 'a', name: 'A', bpm: 124, root: 0, mode: 'minor',
  tuningCents: 0, loudnessDb: -12, durationSec: 240, keyConfidence: 0.9,
  ...over,
})

describe('ordering a set', () => {
  it('puts records that go together next to each other', () => {
    const songs = [
      song({ id: '1', name: 'One', bpm: 124, root: 0 }),
      song({ id: '2', name: 'Miles off', bpm: 172, root: 6, mode: 'major' }),
      song({ id: '3', name: 'Three', bpm: 125, root: 0 }),
    ]
    const { order } = orderSet(songs)
    const names = order.map((s) => s.name)
    // One and Three belong together; the odd one out gets pushed to an end.
    expect(Math.abs(names.indexOf('One') - names.indexOf('Three'))).toBe(1)
    expect(names.indexOf('Miles off')).toBe(2)
  })

  it('can be told where to start', () => {
    const songs = [song({ id: '1' }), song({ id: '2' }), song({ id: '3' })]
    expect(orderSet(songs, '3').order[0].id).toBe('3')
  })

  it('plays every record exactly once', () => {
    const songs = [song({ id: '1' }), song({ id: '2' }), song({ id: '3' }), song({ id: '4' })]
    const ids = orderSet(songs).order.map((s) => s.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })

  it('explains each move', () => {
    const { links } = orderSet([song({ id: '1' }), song({ id: '2', name: 'Two' })])
    expect(links).toHaveLength(1)
    expect(links[0].notes.length).toBeGreaterThan(1)
  })

  it('copes with one record, or none', () => {
    expect(orderSet([]).order).toEqual([])
    expect(orderSet([song({})]).order).toHaveLength(1)
    expect(orderSet([song({})]).links).toEqual([])
  })
})

describe('planning the timeline', () => {
  const songs = [
    song({ id: '1', name: 'One', bpm: 124 }),
    song({ id: '2', name: 'Two', bpm: 126 }),
    song({ id: '3', name: 'Three', bpm: 125 }),
  ]

  it('lays records end to end, overlapping by the blend', () => {
    const plan = planSet(songs, { blendBars: 16, playBars: 48 })
    expect(plan.entries).toHaveLength(3)
    for (let i = 1; i < plan.entries.length; i++) {
      const previous = plan.entries[i - 1]
      const current = plan.entries[i]
      // The next record comes in exactly one blend before the last one ends.
      expect(current.startBar).toBe(previous.startBar + previous.bars - previous.blendOutBars)
      expect(current.startBar).toBeLessThan(previous.startBar + previous.bars)
    }
  })

  it('never leaves a gap between records', () => {
    const plan = planSet(songs, { blendBars: 8, playBars: 32 })
    for (let i = 1; i < plan.entries.length; i++) {
      const previousEnd = plan.entries[i - 1].startBar + plan.entries[i - 1].bars
      expect(plan.entries[i].startBar).toBeLessThan(previousEnd)
    }
  })

  it('opens dry and closes dry', () => {
    const plan = planSet(songs)
    expect(plan.entries[0].blendInBars).toBe(0)
    expect(plan.entries[plan.entries.length - 1].blendOutBars).toBe(0)
  })

  it('puts every record at one tempo', () => {
    const plan = planSet(songs, { bpm: 128 })
    expect(plan.bpm).toBe(128)
    for (const entry of plan.entries) {
      // Whatever it was, it ends up at the set tempo.
      expect(entry.song.bpm * entry.speed).toBeCloseTo(128, 0)
    }
  })

  it('takes the first record’s tempo when not told one', () => {
    expect(planSet(songs, { startId: '2' }).bpm).toBe(126)
  })

  it('will not let a blend be longer than the record', () => {
    // Half of each record overlapping is already extreme; more is nonsense.
    const plan = planSet(songs, { blendBars: 32, playBars: 8 })
    for (const entry of plan.entries) {
      expect(entry.bars).toBeGreaterThanOrEqual(entry.blendInBars + entry.blendOutBars)
    }
  })

  it('says what it did', () => {
    const plan = planSet(songs, { blendBars: 16 })
    expect(plan.notes.join(' ')).toMatch(/16 bars/)
    expect(plan.entries[0].notes[0]).toMatch(/opens/)
    expect(plan.entries[1].notes.join(' ')).toMatch(/fit/)
  })

  it('has nothing to plan with no records', () => {
    expect(planSet([]).entries).toEqual([])
    expect(planSet([]).totalBars).toBe(0)
  })
})

describe('the transitions', () => {
  const plan = planSet(
    [song({ id: '1', name: 'One' }), song({ id: '2', name: 'Two' })],
    { blendBars: 8, playBars: 32 },
  )

  it('fades the outgoing record out and the incoming one in, over the same bars', () => {
    const first = transitionLanes(plan.entries[0], 4, 0.85)
    const second = transitionLanes(plan.entries[1], 4, 0.85)
    const out = first.fadeOut.find((l) => l.param === 'volume')!
    const into = second.fadeIn.find((l) => l.param === 'volume')!
    expect(out.points[0].beat).toBe(into.points[0].beat)
    expect(out.points[out.points.length - 1].beat).toBe(into.points[into.points.length - 1].beat)
    expect(out.points[0].value).toBeGreaterThan(out.points[out.points.length - 1].value)
    expect(into.points[0].value).toBeLessThan(into.points[into.points.length - 1].value)
  })

  it('crosses at equal power, not equal gain', () => {
    // Two straight lines meeting at half level sum about 3 dB down — an
    // audible dip at the exact moment the mix is meant to be seamless.
    const first = transitionLanes(plan.entries[0], 4, 1)
    const second = transitionLanes(plan.entries[1], 4, 1)
    const outMid = first.fadeOut[0].points[1]
    const inMid = second.fadeIn[0].points[1]
    expect(outMid.beat).toBe(inMid.beat)
    expect(outMid.value ** 2 + inMid.value ** 2).toBeCloseTo(1, 5)
  })

  it('brings the new record in filtered and opens it up', () => {
    const second = transitionLanes(plan.entries[1], 4, 0.85)
    const tone = second.fadeIn.find((l) => l.param === 'tone')!
    expect(tone.points[0].value).toBeLessThan(1000)
    expect(tone.points[tone.points.length - 1].value).toBeGreaterThan(15000)
  })

  it('gives the first record no way in and the last no way out', () => {
    expect(transitionLanes(plan.entries[0], 4, 0.85).fadeIn).toEqual([])
    expect(transitionLanes(plan.entries[1], 4, 0.85).fadeOut).toEqual([])
  })

  it('merges a record’s way in and way out into one lane per parameter', () => {
    const middle = planSet(
      [song({ id: '1' }), song({ id: '2' }), song({ id: '3' })],
      { blendBars: 8, playBars: 32 },
    ).entries[1]
    const lanes = lanesFor(middle, 4)
    // One volume lane and one filter lane, not two of each.
    expect(lanes.map((l) => l.param).sort()).toEqual(['tone', 'volume'])
    for (const lane of lanes) {
      const beats = lane.points.map((p) => p.beat)
      expect([...beats].sort((a, b) => a - b)).toEqual(beats)
    }
  })

  it('keeps every point inside the record it belongs to', () => {
    for (const entry of planSet(
      [song({ id: '1' }), song({ id: '2' }), song({ id: '3' })], { blendBars: 8, playBars: 32 },
    ).entries) {
      const from = entry.startBar * 4
      const to = (entry.startBar + entry.bars) * 4
      for (const lane of lanesFor(entry, 4)) {
        for (const point of lane.points) {
          expect(point.beat).toBeGreaterThanOrEqual(from)
          expect(point.beat).toBeLessThanOrEqual(to)
        }
      }
    }
  })
})

describe('records that are shorter than their slot', () => {
  const short = (over: Partial<SongFacts>): SongFacts => song({ durationSec: 19.2, ...over })

  it('never gives a record a longer turn than it has music for', () => {
    // 19.2s at 124 BPM is about ten bars. Asking for 48 would leave 38 bars of
    // silence in the middle of the mix — and because the next record comes in
    // relative to where this one ends, the hole lands exactly where the blend
    // was meant to be.
    const plan = planSet(
      [short({ id: '1', name: 'One' }), short({ id: '2', name: 'Two' })],
      { playBars: 48, blendBars: 16 },
    )
    for (const entry of plan.entries) {
      const availableBars = entry.song.durationSec / ((60 / entry.song.bpm) * 4)
      expect(entry.bars, entry.song.name).toBeLessThanOrEqual(Math.floor(availableBars))
    }
  })

  it('shrinks the blend to fit rather than overlapping a record with itself', () => {
    const plan = planSet(
      [short({ id: '1', durationSec: 8 }), short({ id: '2', durationSec: 8 })],
      { playBars: 48, blendBars: 16 },
    )
    for (const entry of plan.entries) {
      expect(entry.blendInBars + entry.blendOutBars).toBeLessThan(entry.bars)
    }
  })

  it('still leaves no gap between short records', () => {
    const plan = planSet(
      [short({ id: '1' }), short({ id: '2' }), short({ id: '3' })],
      { playBars: 48, blendBars: 16 },
    )
    for (let i = 1; i < plan.entries.length; i++) {
      const previousEnd = plan.entries[i - 1].startBar + plan.entries[i - 1].bars
      expect(plan.entries[i].startBar).toBeLessThan(previousEnd)
    }
  })

  it('says so, rather than quietly playing silence', () => {
    const plan = planSet([short({ id: '1', name: 'Short one' }), short({ id: '2' })], { playBars: 48 })
    expect(plan.notes.join(' ')).toMatch(/only runs/)
  })
})
