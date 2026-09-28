/**
 * Automation: a value that changes over time.
 *
 * Until now every channel setting was one number for the whole song. That is
 * fine for a mix and useless for a performance — a filter sweep into a drop, a
 * fade out, a crossfade between two records are all *movement*, and none of
 * them could be expressed at all.
 *
 * A lane is a sparse list of points in beats, read as a straight line between
 * them. Beats, not seconds, like everything else musical here: change the
 * tempo and a two-bar sweep is still two bars.
 *
 * Pure. The live scheduler, the offline renderer and the editor all read the
 * same functions, which is the only way they can agree about what a curve is.
 */

import type { AutomationLane, AutomationPoint, AutomatableParam, Project } from './project'

/** What each parameter means, and the range the UI and the engine agree on. */
export const AUTOMATABLE: Record<AutomatableParam, {
  label: string
  min: number
  max: number
  /** Where a new lane starts if the track has no value of its own. */
  fallback: number
  /** Hz-like parameters are read logarithmically; gains are linear. */
  curve: 'linear' | 'log'
  unit?: string
}> = {
  volume: { label: 'Volume', min: 0, max: 1.2, fallback: 0.8, curve: 'linear' },
  pan: { label: 'Pan', min: -1, max: 1, fallback: 0, curve: 'linear' },
  tone: { label: 'Filter', min: 80, max: 20000, fallback: 20000, curve: 'log', unit: 'Hz' },
  reverbSend: { label: 'Reverb', min: 0, max: 1, fallback: 0.12, curve: 'linear' },
  delaySend: { label: 'Delay', min: 0, max: 1, fallback: 0, curve: 'linear' },
  drive: { label: 'Drive', min: 0, max: 1, fallback: 0, curve: 'linear' },
}

export const AUTOMATABLE_PARAMS = Object.keys(AUTOMATABLE) as AutomatableParam[]

/** Points in order, with duplicates at the same beat resolved to the last one. */
export function normalisePoints(points: AutomationPoint[]): AutomationPoint[] {
  const sorted = [...points].sort((a, b) => a.beat - b.beat)
  const out: AutomationPoint[] = []
  for (const point of sorted) {
    const previous = out[out.length - 1]
    if (previous && Math.abs(previous.beat - point.beat) < 1e-6) out[out.length - 1] = point
    else out.push(point)
  }
  return out
}

/**
 * The value at a beat.
 *
 * Before the first point and after the last, the lane holds that point's value
 * — a lane is a description of the whole timeline, not just the part between
 * its ends, and a parameter that snapped back to something else outside the
 * drawn range would be impossible to reason about.
 */
export function valueAt(lane: AutomationLane, beat: number): number {
  const points = normalisePoints(lane.points)
  if (points.length === 0) return AUTOMATABLE[lane.param].fallback
  if (beat <= points[0].beat) return points[0].value
  const last = points[points.length - 1]
  if (beat >= last.beat) return last.value

  for (let i = 1; i < points.length; i++) {
    const to = points[i]
    if (to.beat < beat) continue
    const from = points[i - 1]
    if (to.hold || from.hold) return from.value
    const span = to.beat - from.beat
    if (span <= 0) return to.value
    const t = (beat - from.beat) / span
    return interpolate(lane.param, from.value, to.value, t)
  }
  return last.value
}

/**
 * Interpolate the way the parameter is heard.
 *
 * A filter swept linearly from 20 kHz to 100 Hz spends almost all of its time
 * in the top octave, where nothing is happening, and then falls off a cliff.
 * Pitch and frequency are logarithmic to the ear, so the curve has to be too.
 */
function interpolate(param: AutomatableParam, from: number, to: number, t: number): number {
  if (AUTOMATABLE[param].curve === 'log') {
    const a = Math.max(1, from)
    const b = Math.max(1, to)
    return a * Math.pow(b / a, t)
  }
  return from + (to - from) * t
}

/**
 * The breakpoints needed to schedule a window, including the value at its
 * start.
 *
 * The leading point matters: a window that begins mid-ramp has to be told
 * where the ramp already is, or the parameter jumps to the next written point
 * and slides from there.
 */
export function segmentsIn(
  lane: AutomationLane, fromBeat: number, toBeat: number,
): { beat: number; value: number; hold: boolean }[] {
  const points = normalisePoints(lane.points)
  if (points.length === 0) return []

  const out: { beat: number; value: number; hold: boolean }[] = [
    { beat: fromBeat, value: valueAt(lane, fromBeat), hold: true },
  ]
  for (const point of points) {
    if (point.beat <= fromBeat) continue
    if (point.beat > toBeat) break
    out.push({ beat: point.beat, value: point.value, hold: Boolean(point.hold) })
  }
  return out
}

/** Does this lane say anything at all? */
export function laneIsActive(lane: AutomationLane): boolean {
  return lane.points.length > 0
}

/** The lane for a track's parameter, if there is one. */
export function laneFor(
  project: Project, trackId: string, param: AutomatableParam,
): AutomationLane | undefined {
  return project.automation?.find((lane) => lane.trackId === trackId && lane.param === param)
}

/** Every parameter of a track that is under automation. */
export function automatedParams(project: Project, trackId: string): Set<AutomatableParam> {
  const out = new Set<AutomatableParam>()
  for (const lane of project.automation ?? []) {
    if (lane.trackId === trackId && laneIsActive(lane)) out.add(lane.param)
  }
  return out
}

/** Clamp a value into what the parameter allows. */
export function clampParam(param: AutomatableParam, value: number): number {
  const { min, max } = AUTOMATABLE[param]
  return Math.min(max, Math.max(min, value))
}

/**
 * Where a lane sits vertically, 0 at the bottom and 1 at the top. Logarithmic
 * parameters are drawn the way they are heard, so a filter sweep looks like a
 * straight line rather than a hockey stick.
 */
export function toUnit(param: AutomatableParam, value: number): number {
  const { min, max, curve } = AUTOMATABLE[param]
  if (curve === 'log') {
    const lo = Math.log(Math.max(1, min))
    const hi = Math.log(Math.max(1, max))
    return (Math.log(Math.max(1, value)) - lo) / (hi - lo)
  }
  return (value - min) / (max - min)
}

export function fromUnit(param: AutomatableParam, unit: number): number {
  const { min, max, curve } = AUTOMATABLE[param]
  const t = Math.min(1, Math.max(0, unit))
  if (curve === 'log') {
    const lo = Math.log(Math.max(1, min))
    const hi = Math.log(Math.max(1, max))
    return Math.exp(lo + (hi - lo) * t)
  }
  return min + (max - min) * t
}

/** Readable value, for the editor. */
export function formatParam(param: AutomatableParam, value: number): string {
  const spec = AUTOMATABLE[param]
  if (param === 'tone') {
    return value >= 19000 ? 'open' : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`
  }
  if (param === 'pan') {
    return Math.abs(value) < 0.02 ? 'C' : `${value < 0 ? 'L' : 'R'}${Math.round(Math.abs(value) * 100)}`
  }
  return `${Math.round(value * 100)}${spec.unit ?? ''}`
}

// ---------------------------------------------------------------------------
// The moves people actually want
// ---------------------------------------------------------------------------

export interface AutomationShape {
  id: string
  label: string
  detail: string
  param: AutomatableParam
  /** Points as (fraction of the span, value). */
  points: { at: number; value: number }[]
}

/**
 * Ready-made curves.
 *
 * Nobody opens an automation lane wanting to place points; they want the
 * filter to open into the drop. These are the handful of moves that account
 * for most of what automation is used for, drawn over whatever range is
 * selected.
 */
export const SHAPES: AutomationShape[] = [
  {
    id: 'filter-up', label: 'Filter opens', param: 'tone',
    detail: 'Muffled to open — the standard way into a drop.',
    points: [{ at: 0, value: 300 }, { at: 1, value: 20000 }],
  },
  {
    id: 'filter-down', label: 'Filter closes', param: 'tone',
    detail: 'Open to muffled, for going out of a section.',
    points: [{ at: 0, value: 20000 }, { at: 1, value: 300 }],
  },
  {
    id: 'fade-in', label: 'Fade in', param: 'volume',
    detail: 'Silence up to full.',
    points: [{ at: 0, value: 0 }, { at: 1, value: 0.85 }],
  },
  {
    id: 'fade-out', label: 'Fade out', param: 'volume',
    detail: 'Full down to silence.',
    points: [{ at: 0, value: 0.85 }, { at: 1, value: 0 }],
  },
  {
    id: 'duck', label: 'Drop out and return', param: 'volume',
    detail: 'Gone for most of the span, back at the end.',
    points: [
      { at: 0, value: 0.85 }, { at: 0.02, value: 0 },
      { at: 0.9, value: 0 }, { at: 1, value: 0.85 },
    ],
  },
  {
    id: 'wash', label: 'Reverb wash', param: 'reverbSend',
    detail: 'Send swells into a transition and pulls back.',
    points: [{ at: 0, value: 0.1 }, { at: 0.75, value: 0.8 }, { at: 1, value: 0.1 }],
  },
]

/** Turn a shape into real points across a span of the timeline. */
export function drawShape(
  shape: AutomationShape, fromBeat: number, toBeat: number,
): AutomationPoint[] {
  const span = Math.max(0.25, toBeat - fromBeat)
  return shape.points.map((point) => ({
    beat: fromBeat + point.at * span,
    value: clampParam(shape.param, point.value),
  }))
}
