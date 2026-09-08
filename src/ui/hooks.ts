import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'

/**
 * Playhead position, sampled on animation frames.
 *
 * This deliberately bypasses the store: the position changes every frame, and
 * routing it through React state would re-render the entire tree 60x a second.
 */
export function usePlayhead(active: boolean): number {
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      setBeat(engine.positionBeats)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return active ? beat : engine.positionBeats
}

/** Peak level for a track (or the master), smoothed for a calm meter. */
export function useLevel(trackId?: string, active = true): number {
  const [level, setLevel] = useState(0)
  const smoothed = useRef(0)
  useEffect(() => {
    if (!active) {
      // Fall back to zero rather than freezing the last level on stop.
      smoothed.current = 0
      setLevel(0)
      return
    }
    let raf = 0
    let frame = 0
    const tick = () => {
      // 30 Hz is plenty for a meter and halves the work.
      if (frame++ % 2 === 0) {
        const raw = engine.level(trackId)
        smoothed.current = raw > smoothed.current
          ? raw
          : smoothed.current * 0.86 + raw * 0.14
        setLevel(smoothed.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trackId, active])
  return level
}

/** Tracks whether a pointer drag is in progress, with automatic cleanup. */
export function useDrag(
  onMove: (e: PointerEvent) => void,
  onEnd?: (e: PointerEvent) => void,
): (e: React.PointerEvent) => void {
  const moveRef = useRef(onMove)
  const endRef = useRef(onEnd)
  moveRef.current = onMove
  endRef.current = onEnd

  return (e: React.PointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => moveRef.current(ev)
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      endRef.current?.(ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
}

/** Reads a CSS-pixel x offset within an element, clamped to its width. */
export function localX(e: { clientX: number }, el: HTMLElement | null): number {
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  return e.clientX - rect.left + el.scrollLeft
}
