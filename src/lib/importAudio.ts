/**
 * Bringing recorded audio into a project: decode, analyse, store, and drop it
 * on the timeline as a clip that follows the project tempo.
 */

import { engine } from '../audio/engine'
import { analyseAudioInWorker } from '../audio/workers'
import { useStore } from '../state/store'
import {
  bufferToChannels, importAudioFile, updateSampleMeta, type SampleMeta,
} from './samples'

export interface ImportResult {
  meta: SampleMeta
  buffer: AudioBuffer
  trackId: string
  clipId: string
}

const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm|weba|aif|aiff)$/i

export function looksLikeAudio(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name)
}

/**
 * Decode a file, work out its tempo and key, and add it to the arrangement.
 * Analysis runs in a worker; the clip appears as soon as the audio is decoded
 * so there's something to look at while that finishes.
 */
export async function importAudioIntoProject(
  file: File, options: { startBeat?: number; trackId?: string } = {},
): Promise<ImportResult | null> {
  const store = useStore.getState()
  const ctx = await engine.resume()

  const job = store.startJob(`Reading ${file.name}`)
  try {
    const { meta, buffer } = await importAudioFile(ctx, file)
    store.updateJob(job, 0.25, `Analysing ${meta.name}`)

    const trackId = options.trackId ?? store.addAudioTrack(meta.name)
    const clipId = store.addAudioClipFromSample(trackId, meta.id, {
      startBeat: options.startBeat ?? 0,
      name: meta.name,
    })

    const analysis = await analyseAudioInWorker(
      bufferToChannels(buffer), buffer.sampleRate,
      ({ fraction, stage }) => store.updateJob(job, 0.25 + fraction * 0.7, stage ? `${stage} — ${meta.name}` : undefined),
    )

    await updateSampleMeta(meta.id, { analysis })
    meta.analysis = analysis

    // Now that the tempo is known, let the clip follow the project tempo.
    useStore.getState().updateAudioClip(clipId, {
      originalBpm: analysis.beat.bpm,
      warp: true,
    })

    useStore.getState().flash(
      `${meta.name}: ${Math.round(analysis.beat.bpm)} BPM, ${describeKey(analysis)}`,
      'good',
    )
    return { meta, buffer, trackId, clipId }
  } catch (error) {
    useStore.getState().flash(
      error instanceof Error ? `Could not import: ${error.message}` : 'Could not import that file',
      'warn',
    )
    return null
  } finally {
    useStore.getState().endJob(job)
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function describeKey(analysis: { key: { root: number; mode: string; tuningCents: number } }): string {
  const name = `${NOTE_NAMES[analysis.key.root]} ${analysis.key.mode}`
  const cents = Math.round(analysis.key.tuningCents)
  return Math.abs(cents) >= 8 ? `${name} (${cents > 0 ? '+' : ''}${cents}¢)` : name
}
