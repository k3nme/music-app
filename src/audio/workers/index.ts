/**
 * Client for the DSP worker.
 *
 * Each job gets its own worker, which is terminated when it finishes. Jobs run
 * for seconds, so the few milliseconds to spawn one is irrelevant, and it
 * means two analyses can run in parallel without a scheduler.
 */

import type { AudioAnalysis } from '../analysis/audio'
import type { DissectOptions, ExtractedSound } from '../analysis/dissect'
import type { StemOptions, StemSet } from '../spectral/stems'

export interface JobProgress {
  fraction: number
  stage?: string
}

let nextId = 1

function run<T>(
  payload: Record<string, unknown>,
  transfer: Transferable[],
  onProgress?: (progress: JobProgress) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Could not start the audio worker'))
      return
    }
    const id = nextId++

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data
      if (message.id !== id) return
      if (message.type === 'progress') {
        onProgress?.({ fraction: message.fraction, stage: message.stage })
        return
      }
      worker.terminate()
      if (message.type === 'done') resolve(message.result as T)
      else reject(new Error(message.message ?? 'Audio processing failed'))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Audio worker crashed'))
    }
    worker.postMessage({ id, ...payload }, transfer)
  })
}

/** Copies, so the caller keeps its own arrays intact. */
function copies(channels: Float32Array[]): { data: Float32Array[]; transfer: Transferable[] } {
  const data = channels.map((c) => Float32Array.from(c))
  return { data, transfer: data.map((c) => c.buffer as ArrayBuffer) }
}

export function analyseAudioInWorker(
  channels: Float32Array[], sampleRate: number,
  onProgress?: (progress: JobProgress) => void,
): Promise<AudioAnalysis> {
  const { data, transfer } = copies(channels)
  return run<AudioAnalysis>({ kind: 'analyse', channels: data, sampleRate }, transfer, onProgress)
}

export function separateStemsInWorker(
  channels: Float32Array[], sampleRate: number,
  options?: Partial<StemOptions>,
  onProgress?: (progress: JobProgress) => void,
): Promise<StemSet> {
  const { data, transfer } = copies(channels)
  return run<StemSet>({ kind: 'stems', channels: data, sampleRate, options }, transfer, onProgress)
}

/**
 * Separate a song and pull the distinct sounds out of it. The heaviest job in
 * the app — a four-minute track is tens of seconds — so it reports progress
 * in stages the UI can name.
 */
export async function dissectInWorker(
  channels: Float32Array[], sampleRate: number,
  options?: Omit<DissectOptions, 'onProgress'>,
  onProgress?: (progress: JobProgress) => void,
): Promise<ExtractedSound[]> {
  const { data, transfer } = copies(channels)
  const sounds = await run<(ExtractedSound & { bestIndex: number })[]>(
    { kind: 'dissect', channels: data, sampleRate, options }, transfer, onProgress,
  )
  // Re-link the exemplar: it crossed as an index so its audio travelled once.
  return sounds.map((sound) => ({ ...sound, best: sound.takes[sound.bestIndex] ?? sound.takes[0] }))
}

export function warpInWorker(
  channels: Float32Array[], stretch: number, semitones: number,
  onProgress?: (progress: JobProgress) => void,
): Promise<Float32Array[]> {
  const { data, transfer } = copies(channels)
  return run<Float32Array[]>({ kind: 'warp', channels: data, stretch, semitones }, transfer, onProgress)
}
