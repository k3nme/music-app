import { describe, expect, it } from 'vitest'
import { pumpPoints } from '../pump'

/** Walk the breakpoints and read the gain at an arbitrary beat. */
function valueAt(points: ReturnType<typeof pumpPoints>, beat: number): number {
  let previous = { beat: -Infinity, value: 1 }
  for (const point of points) {
    if (point.beat >= beat) {
      if (point.kind === 'set') return previous.value
      const span = point.beat - previous.beat
      if (span <= 0) return point.value
      const t = (beat - previous.beat) / span
      return previous.value + (point.value - previous.value) * t
    }
    previous = { beat: point.beat, value: point.value }
  }
  return previous.value
}

describe('sidechain pump', () => {
  it('does nothing when the amount is zero', () => {
    expect(pumpPoints(0, 1, 0, 16)).toEqual([])
  })

  it('ignores a nonsense amount rather than scheduling NaN', () => {
    expect(pumpPoints(Number.NaN, 1, 0, 16)).toEqual([])
    expect(pumpPoints(0.8, Number.NaN, 0, 16)).toEqual([])
  })

  it('puts one cycle on every beat of the window', () => {
    const starts = pumpPoints(0.8, 1, 0, 4).filter((p) => p.kind === 'set').map((p) => p.beat)
    expect(starts).toEqual([0, 1, 2, 3])
  })

  it('lands on the absolute grid, not on where the window happens to start', () => {
    // Playback resumed mid-bar: the duck still belongs on the beat.
    const starts = pumpPoints(0.8, 1, 2.3, 6).filter((p) => p.kind === 'set').map((p) => p.beat)
    expect(starts).toEqual([3, 4, 5])
  })

  it('follows the period', () => {
    const halves = pumpPoints(0.6, 0.5, 0, 2).filter((p) => p.kind === 'set').map((p) => p.beat)
    expect(halves).toEqual([0, 0.5, 1, 1.5])
    const bars = pumpPoints(0.6, 4, 0, 16).filter((p) => p.kind === 'set').map((p) => p.beat)
    expect(bars).toEqual([0, 4, 8, 12])
  })

  it('ducks hardest right after the beat and recovers before the next one', () => {
    const points = pumpPoints(0.8, 1, 0, 2)
    // Just before the beat: back at full level.
    expect(valueAt(points, 0.98)).toBeCloseTo(1, 2)
    // Just after: pushed down.
    expect(valueAt(points, 1.02)).toBeLessThan(0.4)
    // Halfway through the beat: on its way back up.
    const middle = valueAt(points, 1.5)
    expect(middle).toBeGreaterThan(valueAt(points, 1.02))
    expect(middle).toBeLessThan(1)
  })

  it('never fully mutes, so a duck is not a dropout', () => {
    for (const point of pumpPoints(1, 1, 0, 8)) {
      expect(point.value).toBeGreaterThan(0.05)
      expect(point.value).toBeLessThanOrEqual(1)
    }
  })

  it('goes deeper as the amount rises', () => {
    const shallow = Math.min(...pumpPoints(0.3, 1, 0, 4).map((p) => p.value))
    const deep = Math.min(...pumpPoints(0.9, 1, 0, 4).map((p) => p.value))
    expect(deep).toBeLessThan(shallow)
  })

  it('keeps every cycle inside its own period', () => {
    const period = 1
    const points = pumpPoints(0.9, period, 0, 4)
    let cycleStart = 0
    for (const point of points) {
      if (point.kind === 'set') cycleStart = point.beat
      expect(point.beat).toBeGreaterThanOrEqual(cycleStart)
      expect(point.beat).toBeLessThanOrEqual(cycleStart + period)
    }
  })

  it('emits points in ascending order — the Web Audio ramps depend on it', () => {
    const points = pumpPoints(0.7, 1, 0, 8)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].beat).toBeGreaterThanOrEqual(points[i - 1].beat)
    }
  })
})
