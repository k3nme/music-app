import { useEffect, useRef } from 'react'

/**
 * Draws a stored min/max peak array. Peaks are computed once at import and
 * kept with the sample, so redrawing during a drag costs nothing — the audio
 * itself is never touched here.
 */
export function Waveform({
  peaks, from = 0, to = 1, height, color, background, className, style,
}: {
  peaks: Float32Array | number[] | null | undefined
  /** Fraction of the sample to start drawing at. */
  from?: number
  /** Fraction to stop at. */
  to?: number
  height: number
  color: string
  background?: string
  className?: string
  style?: React.CSSProperties
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const draw = () => {
      const width = Math.max(1, Math.floor(wrap.clientWidth))
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)
      if (background) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, width, height)
      }
      if (!peaks || peaks.length < 2) return

      const buckets = Math.floor(peaks.length / 2)
      const startBucket = Math.max(0, Math.floor(from * buckets))
      const endBucket = Math.min(buckets, Math.ceil(to * buckets))
      const span = Math.max(1, endBucket - startBucket)
      const mid = height / 2

      ctx.fillStyle = color
      for (let x = 0; x < width; x++) {
        // Each screen column covers a range of buckets; take their extremes so
        // zooming out doesn't drop transients.
        const b0 = startBucket + Math.floor((x / width) * span)
        const b1 = startBucket + Math.max(b0 + 1, Math.floor(((x + 1) / width) * span))
        let min = 0
        let max = 0
        for (let b = b0; b < b1 && b < buckets; b++) {
          const lo = peaks[b * 2]
          const hi = peaks[b * 2 + 1]
          if (lo < min) min = lo
          if (hi > max) max = hi
        }
        const top = mid - max * mid
        const bottom = mid - min * mid
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [peaks, from, to, height, color, background])

  return (
    <div ref={wrapRef} className={className} style={{ width: '100%', height, ...style }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
