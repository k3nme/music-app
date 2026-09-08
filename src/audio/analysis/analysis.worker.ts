/// <reference lib="webworker" />
/**
 * Runs pitch analysis off the main thread. A ten-second take is a few hundred
 * million operations — on the UI thread that's a visible freeze.
 */

import { analyse, type AnalysisOptions } from './pitch'

interface Request {
  id: number
  pcm: Float32Array
  sampleRate: number
  options?: Partial<AnalysisOptions>
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, pcm, sampleRate, options } = e.data
  try {
    const result = analyse(pcm, sampleRate, options, (fraction) => {
      ;(self as unknown as Worker).postMessage({ id, type: 'progress', fraction })
    })
    ;(self as unknown as Worker).postMessage({ id, type: 'done', result })
  } catch (error) {
    ;(self as unknown as Worker).postMessage({
      id, type: 'error', message: error instanceof Error ? error.message : String(error),
    })
  }
}
