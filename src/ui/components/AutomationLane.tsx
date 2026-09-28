import { useMemo, useRef } from 'react'
import {
  AUTOMATABLE, AUTOMATABLE_PARAMS, drawShape, formatParam, fromUnit, laneFor, normalisePoints,
  SHAPES, toUnit, valueAt,
} from '../../music/automation'
import { engine } from '../../audio/engine'
import type { AutomatableParam, AutomationPoint, Track } from '../../music/project'
import { useStore } from '../../state/store'
import { Trash } from '../icons'

export const AUTO_HEIGHT = 56

/**
 * The controls for one track's automation, in the track-heads column.
 *
 * Kept as its own row rather than squeezed into the track header, so the
 * heads column and the lanes column stay the same height line for line —
 * which is the only thing holding the arrangement's two halves in register.
 */
export function AutomationHead({ track, param, onParam, onClose }: {
  track: Track
  param: AutomatableParam
  onParam(next: AutomatableParam): void
  onClose(): void
}) {
  const project = useStore((s) => s.project)
  const { clearLane, setLanePoints, commit } = useStore.getState()
  const lane = laneFor(project, track.id, param)

  const apply = (shapeId: string) => {
    const shape = SHAPES.find((s) => s.id === shapeId)
    if (!shape) return
    commit()
    // Over the loop region — the span someone means by "here" is almost always
    // the part they are looping. The engine owns it, like the playhead.
    const from = Math.max(0, engine.loopStart)
    const to = engine.loopEnd > from ? engine.loopEnd : project.lengthBeats
    if (shape.param !== param) onParam(shape.param)
    setLanePoints(track.id, shape.param, drawShape(shape, from, to))
  }

  return (
    <div className="auto-head" style={{ height: AUTO_HEIGHT }}>
      <div className="auto-head-row">
        <select
          className="field auto-param"
          value={param}
          onChange={(e) => onParam(e.target.value as AutomatableParam)}
          aria-label={`Parameter to automate on ${track.name}`}
        >
          {AUTOMATABLE_PARAMS.map((id) => (
            <option key={id} value={id}>{AUTOMATABLE[id].label}</option>
          ))}
        </select>
        <button
          className="mini" title="Close this automation lane" onClick={onClose}
          aria-label="Close automation"
        >×</button>
      </div>
      <div className="auto-head-row">
        <select
          className="field auto-shape"
          value=""
          onChange={(e) => { apply(e.target.value); e.target.value = '' }}
          aria-label="Draw a ready-made shape"
        >
          <option value="">Draw a shape…</option>
          {SHAPES.map((shape) => (
            <option key={shape.id} value={shape.id}>{shape.label}</option>
          ))}
        </select>
        <button
          className="mini"
          title="Remove every point on this lane"
          disabled={!lane}
          onClick={() => { commit(); clearLane(track.id, param) }}
        ><Trash width={10} height={10} /></button>
      </div>
    </div>
  )
}

/**
 * The curve itself.
 *
 * Click to add a point, drag one to move it, alt-click to remove it. Drawn in
 * the parameter's own scale, so a filter sweep is a straight line rather than
 * a hockey stick — see `toUnit`.
 */
export function AutomationLaneView({ track, param, ppb, width, snapBeat }: {
  track: Track
  param: AutomatableParam
  ppb: number
  width: number
  snapBeat(beat: number): number
}) {
  const project = useStore((s) => s.project)
  const { setLanePoints, commit } = useStore.getState()
  const lane = laneFor(project, track.id, param)
  const svgRef = useRef<SVGSVGElement>(null)
  const points = useMemo(() => normalisePoints(lane?.points ?? []), [lane])

  const height = AUTO_HEIGHT
  const pad = 7
  const usable = height - pad * 2
  const xOf = (beat: number) => beat * ppb
  const yOf = (value: number) => pad + (1 - toUnit(param, value)) * usable
  const beatOf = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    return Math.max(0, ((clientX - (rect?.left ?? 0)) / ppb))
  }
  const valueOf = (clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const unit = 1 - ((clientY - (rect?.top ?? 0)) - pad) / usable
    return fromUnit(param, unit)
  }

  /**
   * The drawn line. A held point is a step: along at the old value, then
   * straight up or down — which is what "hold" means and how every other DAW
   * draws it.
   */
  const path = useMemo(() => {
    if (points.length === 0) {
      const flat = yOf(valueAt({ id: '', trackId: '', param, points: [] }, 0))
      return `M 0 ${flat} L ${width} ${flat}`
    }
    const parts: string[] = [`M 0 ${yOf(points[0].value)}`]
    let previous = points[0]
    parts.push(`L ${xOf(previous.beat)} ${yOf(previous.value)}`)
    for (const point of points.slice(1)) {
      if (point.hold) parts.push(`L ${xOf(point.beat)} ${yOf(previous.value)}`)
      parts.push(`L ${xOf(point.beat)} ${yOf(point.value)}`)
      previous = point
    }
    parts.push(`L ${width} ${yOf(previous.value)}`)
    return parts.join(' ')
  }, [points, ppb, width, param])

  const write = (next: AutomationPoint[]) => setLanePoints(track.id, param, next)

  const dragPoint = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.altKey || e.button === 2) {
      commit()
      write(points.filter((_, i) => i !== index))
      return
    }
    e.preventDefault()
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved) { moved = true; commit() }
      const next = [...points]
      next[index] = {
        ...next[index],
        beat: Math.max(0, snapBeat(beatOf(ev.clientX))),
        value: valueOf(ev.clientY),
      }
      write(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const addPoint = (e: React.PointerEvent) => {
    if ((e.target as Element).tagName === 'circle') return
    commit()
    write([...points, { beat: Math.max(0, snapBeat(beatOf(e.clientX))), value: valueOf(e.clientY) }])
  }

  const spec = AUTOMATABLE[param]

  return (
    <div className="auto-lane" style={{ height, ['--hue' as string]: track.color }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onPointerDown={addPoint}
        onContextMenu={(e) => e.preventDefault()}
      >
        <line x1={0} y1={yOf(spec.max)} x2={width} y2={yOf(spec.max)} className="auto-edge" />
        <line x1={0} y1={yOf(spec.min)} x2={width} y2={yOf(spec.min)} className="auto-edge" />
        <path d={path} className="auto-path" />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={xOf(point.beat)}
            cy={yOf(point.value)}
            r={4.5}
            className={`auto-point${point.hold ? ' hold' : ''}`}
            onPointerDown={dragPoint(index)}
            onDoubleClick={(e) => {
              // Double-click turns a slide into a step and back.
              e.stopPropagation()
              commit()
              const next = [...points]
              next[index] = { ...next[index], hold: !next[index].hold }
              write(next)
            }}
          >
            <title>
              {`${AUTOMATABLE[param].label} ${formatParam(param, point.value)} at beat ${point.beat.toFixed(2)}`
                + (point.hold ? ' (step)' : '')
                + ' — drag to move, double-click to step, alt-click to remove'}
            </title>
          </circle>
        ))}
      </svg>
      {points.length === 0 && (
        <span className="auto-hint">
          Click to add a point, or draw a shape on the left
        </span>
      )}
    </div>
  )
}
