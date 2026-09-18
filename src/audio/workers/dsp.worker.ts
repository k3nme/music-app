/// <reference lib="webworker" />
/**
 * Heavy signal processing, off the main thread.
 *
 * Analysing a four-minute song, separating its stems, or phase-vocoding it to
 * a new tempo are all multi-second jobs. On the UI thread each one would
 * freeze the app and stall audio callbacks.
 */

import { analyseAudio } from '../analysis/audio'
import { dissectStems, type DissectOptions, type ExtractedSound } from '../analysis/dissect'
import { separateStems, type StemOptions } from '../spectral/stems'
import { warp } from '../spectral/vocoder'

type Job =
  | { id: number; kind: 'analyse'; channels: Float32Array[]; sampleRate: number }
  | { id: number; kind: 'stems'; channels: Float32Array[]; sampleRate: number; options?: Partial<StemOptions> }
  | { id: number; kind: 'warp'; channels: Float32Array[]; stretch: number; semitones: number }
  | {
      id: number; kind: 'dissect'; channels: Float32Array[]; sampleRate: number
      options?: Omit<DissectOptions, 'onProgress'>
    }

const post = (message: unknown, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(message, transfer ?? [])

self.onmessage = (event: MessageEvent<Job>) => {
  const job: Job = event.data
  const progress = (fraction: number, stage?: string) =>
    post({ id: job.id, type: 'progress', fraction, stage })

  try {
    if (job.kind === 'analyse') {
      const analysis = analyseAudio(job.channels, job.sampleRate, progress)
      post({ id: job.id, type: 'done', result: analysis })
      return
    }

    if (job.kind === 'stems') {
      const stems = separateStems(job.channels, job.sampleRate, {
        ...job.options,
        onProgress: (fraction) => progress(fraction, 'Separating'),
      })
      // Hand the buffers over rather than copying them; they're large.
      const transfer: Transferable[] = []
      for (const name of Object.keys(stems) as (keyof typeof stems)[]) {
        for (const channel of stems[name]) transfer.push(channel.buffer as ArrayBuffer)
      }
      post({ id: job.id, type: 'done', result: stems }, transfer)
      return
    }

    if (job.kind === 'dissect') {
      // Separation is most of the work, so it gets most of the progress bar.
      const stems = separateStems(job.channels, job.sampleRate, {
        onProgress: (fraction) => progress(fraction * 0.7, 'Separating the layers'),
      })
      const sounds = dissectStems(stems, job.sampleRate, {
        ...job.options,
        onProgress: (fraction, stage) => progress(0.7 + fraction * 0.3, stage),
      })
      const transfer: Transferable[] = []
      for (const sound of sounds) {
        for (const take of sound.takes) transfer.push(take.audio.buffer as ArrayBuffer)
      }
      // `best` is one of `takes`, so it travels with them and is re-linked on
      // the other side rather than being sent (and transferred) twice.
      const result = sounds.map((sound) => ({
        ...sound,
        bestIndex: sound.takes.indexOf(sound.best),
        best: undefined,
      })) as unknown as ExtractedSound[]
      post({ id: job.id, type: 'done', result }, transfer)
      return
    }

    if (job.kind === 'warp') {
      const total = job.channels.length
      const out = job.channels.map((channel, index) =>
        warp(channel, job.stretch, job.semitones, {
          onProgress: (fraction) => progress((index + fraction) / total, 'Warping'),
        }),
      )
      post({ id: job.id, type: 'done', result: out }, out.map((c) => c.buffer as ArrayBuffer))
      return
    }

    post({ id: (job as Job).id, type: 'error', message: 'Unknown job' })
  } catch (error) {
    post({
      id: job.id, type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
