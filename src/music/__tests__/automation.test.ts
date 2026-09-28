import { describe, expect, it } from 'vitest'
import {
  AUTOMATABLE, automatedParams, clampParam, drawShape, formatParam, fromUnit, laneFor,
  normalisePoints, segmentsIn, SHAPES, toUnit, valueAt,
} from '../automation'
import {
  createAutomationLane, emptyProject, type AutomatableParam, type AutomationLane,
} from '../project'

const lane = (
  points: { beat: number; value: number; hold?: boolean }[],
  param: AutomatableParam = 'volume',
): AutomationLane => createAutomationLane('t1', param, points)

describe('reading a value off a lane', () => {
  it('slides between points', () => {
    const l = lane([{ beat: 0, value: 0 }, { beat: 4, value: 1 }])
    expect(valueAt(l, 0)).toBe(0)
    expect(valueAt(l, 2)).toBeCloseTo(0.5, 5)
    expect(valueAt(l, 4)).toBe(1)
  })

  it('holds its ends rather than snapping back', () => {
    // A lane describes the whole timeline. A parameter that reverted to
    // something else outside the drawn range would be impossible to reason
    // about while editing.
    const l = lane([{ beat: 8, value: 0.3 }, { beat: 16, value: 0.9 }])
    expect(valueAt(l, 0)).toBe(0.3)
    expect(valueAt(l, 100)).toBe(0.9)
  })

  it('steps instead of sliding when a point says to hold', () => {
    const l = lane([{ beat: 0, value: 1 }, { beat: 4, value: 0, hold: true }])
    expect(valueAt(l, 3.99)).toBe(1)
    expect(valueAt(l, 4)).toBe(0)
  })

  it('falls back to the parameter default for an empty lane', () => {
    expect(valueAt(lane([]), 5)).toBe(AUTOMATABLE.volume.fallback)
  })

  it('sweeps a filter the way it is heard, not the way it is numbered', () => {
    // Linear from 20k to 100 spends nearly all its time in the top octave,
    // where nothing audible happens, then falls off a cliff at the end.
    const l = lane([{ beat: 0, value: 100 }, { beat: 4, value: 12800 }], 'tone')
    // Halfway through, an octave-wise sweep is at the geometric middle.
    expect(valueAt(l, 2)).toBeCloseTo(Math.sqrt(100 * 12800), 0)
    // Every quarter is one octave times a constant ratio.
    const ratio = valueAt(l, 1) / valueAt(l, 0)
    expect(valueAt(l, 2) / valueAt(l, 1)).toBeCloseTo(ratio, 3)
    expect(valueAt(l, 3) / valueAt(l, 2)).toBeCloseTo(ratio, 3)
  })

  it('never goes backwards in time, whatever order the points arrive in', () => {
    const l = lane([{ beat: 8, value: 1 }, { beat: 0, value: 0 }, { beat: 4, value: 0.5 }])
    expect(valueAt(l, 2)).toBeCloseTo(0.25, 5)
    expect(normalisePoints(l.points).map((p) => p.beat)).toEqual([0, 4, 8])
  })

  it('keeps the last of two points written at the same beat', () => {
    const points = normalisePoints([
      { beat: 4, value: 0.2 }, { beat: 4, value: 0.9 }, { beat: 0, value: 0 },
    ])
    expect(points).toHaveLength(2)
    expect(points[1].value).toBe(0.9)
  })
})

describe('scheduling a window of a lane', () => {
  const l = lane([{ beat: 0, value: 0 }, { beat: 8, value: 1 }, { beat: 16, value: 0 }])

  it('starts by saying where the value already is', () => {
    // Without this, a window that begins mid-ramp jumps to the next written
    // point and slides from there.
    const [first] = segmentsIn(l, 4, 8)
    expect(first.beat).toBe(4)
    expect(first.value).toBeCloseTo(0.5, 5)
  })

  it('includes only the points inside the window', () => {
    expect(segmentsIn(l, 4, 12).map((s) => s.beat)).toEqual([4, 8])
    expect(segmentsIn(l, 0, 20).map((s) => s.beat)).toEqual([0, 8, 16])
  })

  it('returns nothing for an empty lane', () => {
    expect(segmentsIn(lane([]), 0, 16)).toEqual([])
  })

  it('keeps ramping through a window with no points of its own', () => {
    const segments = segmentsIn(l, 2, 3)
    expect(segments).toHaveLength(1)
    expect(segments[0].value).toBeCloseTo(0.25, 5)
  })
})

describe('finding lanes on a project', () => {
  it('finds a track’s lane for a parameter', () => {
    const project = { ...emptyProject(), automation: [createAutomationLane('t1', 'tone', [{ beat: 0, value: 500 }])] }
    expect(laneFor(project, 't1', 'tone')?.param).toBe('tone')
    expect(laneFor(project, 't1', 'volume')).toBeUndefined()
    expect(laneFor(project, 'other', 'tone')).toBeUndefined()
  })

  it('reports which parameters a track has under automation', () => {
    const project = {
      ...emptyProject(),
      automation: [
        createAutomationLane('t1', 'tone', [{ beat: 0, value: 500 }]),
        createAutomationLane('t1', 'volume', []),          // empty says nothing
        createAutomationLane('t2', 'pan', [{ beat: 0, value: -1 }]),
      ],
    }
    expect([...automatedParams(project, 't1')]).toEqual(['tone'])
    expect([...automatedParams(project, 't2')]).toEqual(['pan'])
    expect([...automatedParams(project, 'nobody')]).toEqual([])
  })

  it('treats a project saved before automation existed as having none', () => {
    const old = { ...emptyProject(), automation: undefined } as unknown as ReturnType<typeof emptyProject>
    expect([...automatedParams(old, 't1')]).toEqual([])
    expect(laneFor(old, 't1', 'volume')).toBeUndefined()
  })
})

describe('drawing and reading positions', () => {
  it('maps a value to a position and back', () => {
    for (const param of ['volume', 'pan', 'tone', 'drive'] as const) {
      for (const unit of [0, 0.25, 0.5, 1]) {
        expect(toUnit(param, fromUnit(param, unit)), `${param} @ ${unit}`).toBeCloseTo(unit, 5)
      }
    }
  })

  it('draws a filter sweep as a straight line', () => {
    // Halfway up the lane should be halfway *in octaves*, or a sweep looks
    // like a hockey stick and is impossible to edit.
    const middle = fromUnit('tone', 0.5)
    expect(middle).toBeGreaterThan(1000)
    expect(middle).toBeLessThan(2000)
  })

  it('clamps anything out of range', () => {
    expect(clampParam('volume', 5)).toBe(AUTOMATABLE.volume.max)
    expect(clampParam('pan', -9)).toBe(-1)
    expect(clampParam('tone', 0)).toBe(AUTOMATABLE.tone.min)
  })

  it('shows values the way the mixer does', () => {
    expect(formatParam('tone', 20000)).toBe('open')
    expect(formatParam('tone', 2000)).toBe('2.0k')
    expect(formatParam('pan', 0)).toBe('C')
    expect(formatParam('pan', -0.5)).toBe('L50')
    expect(formatParam('volume', 0.8)).toBe('80')
  })
})

describe('the ready-made shapes', () => {
  it('draws each one across the span it is given', () => {
    for (const shape of SHAPES) {
      const points = drawShape(shape, 16, 32)
      expect(points.length, shape.id).toBeGreaterThanOrEqual(2)
      expect(points[0].beat, shape.id).toBe(16)
      expect(points[points.length - 1].beat, shape.id).toBe(32)
      for (const point of points) {
        expect(point.beat, shape.id).toBeGreaterThanOrEqual(16)
        expect(point.beat, shape.id).toBeLessThanOrEqual(32)
        expect(point.value, shape.id).toBeGreaterThanOrEqual(AUTOMATABLE[shape.param].min)
        expect(point.value, shape.id).toBeLessThanOrEqual(AUTOMATABLE[shape.param].max)
      }
    }
  })

  it('actually moves — a shape that ends where it started is not a move', () => {
    for (const shape of SHAPES) {
      const values = shape.points.map((p) => p.value)
      expect(Math.max(...values) - Math.min(...values), shape.id).toBeGreaterThan(0)
    }
  })

  it('survives being drawn across a zero-length span', () => {
    const points = drawShape(SHAPES[0], 8, 8)
    expect(points[0].beat).toBe(8)
    expect(points[points.length - 1].beat).toBeGreaterThan(8)
  })

  it('opens the filter over the span, heard as a rise all the way through', () => {
    const sweep = drawShape(SHAPES.find((s) => s.id === 'filter-up')!, 0, 16)
    const l = lane(sweep, 'tone')
    let previous = -Infinity
    for (let beat = 0; beat <= 16; beat += 2) {
      const value = valueAt(l, beat)
      expect(value, `beat ${beat}`).toBeGreaterThan(previous)
      previous = value
    }
  })
})
