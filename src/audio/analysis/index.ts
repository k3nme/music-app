/** Main-thread wrapper around the analysis worker, with a sync fallback. */

import { analyse, type AnalysisOptions, type AnalysisResult } from './pitch'

export * from './pitch'

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  return worker
}

export function analyseRecording(
  pcm: Float32Array,
  sampleRate: number,
  options?: Partial<AnalysisOptions>,
  onProgress?: (fraction: number) => void,
): Promise<AnalysisResult> {
  const w = getWorker()
  if (!w) {
    // No worker (older browser, blocked blob URLs) — analyse inline.
    return Promise.resolve(analyse(pcm, sampleRate, options, onProgress))
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') { onProgress?.(msg.fraction); return }
      w.removeEventListener('message', handler)
      if (msg.type === 'done') resolve(msg.result as AnalysisResult)
      else reject(new Error(msg.message ?? 'Analysis failed'))
    }
    w.addEventListener('message', handler)
    // Copy, because transferring would detach the caller's buffer (we still
    // want the raw take around for the waveform preview).
    w.postMessage({ id, pcm: pcm.slice(), sampleRate, options })
  })
}
