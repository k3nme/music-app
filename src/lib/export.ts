/**
 * Rendering a project out: WAV (offline render of the real signal chain) and
 * MIDI (so an idea started here can move into any other DAW).
 */

import {
  buildChannel, buildMaster, type MasterChain,
} from '../audio/engine'
import { createInstrument, getPreset, initPluck } from '../audio/instruments'
import { audibleTrackIds, contentEndBeat, type Project } from '../music/project'
import { safeName, triggerDownload } from './persistence'

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

export interface RenderOptions {
  sampleRate?: number
  /** Extra seconds after the last note so reverb tails aren't chopped. */
  tailSeconds?: number
  /** Render the loop region instead of the whole arrangement. */
  range?: { startBeat: number; endBeat: number }
  onProgress?: (fraction: number) => void
}

/** Renders the project through the same graph the live engine uses. */
export async function renderProject(project: Project, options: RenderOptions = {}): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100
  const tail = options.tailSeconds ?? 3
  const beatSec = 60 / project.bpm

  const startBeat = options.range?.startBeat ?? 0
  const endBeat = options.range?.endBeat ?? Math.max(contentEndBeat(project), project.lengthBeats)
  const lengthBeats = Math.max(1, endBeat - startBeat)
  const seconds = lengthBeats * beatSec + tail
  const frames = Math.ceil(seconds * sampleRate)

  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: frames, sampleRate })
  // Register the string worklet on this offline context too, or plucked
  // instruments would silently fall back to their approximation.
  await initPluck(ctx)

  const master: MasterChain = buildMaster(ctx, project.master, project.bpm)
  const audible = audibleTrackIds(project)
  const soloed = project.tracks.some((t) => t.soloed)

  const instruments = new Map<string, ReturnType<typeof createInstrument>>()
  for (const track of project.tracks) {
    const muted = track.muted || (soloed && !track.soloed)
    const channel = buildChannel(ctx, master, { ...track.channel, muted })
    const instrument = createInstrument(ctx, getPreset(track.presetId))
    instrument.output.connect(channel.input)
    instruments.set(track.id, instrument)
  }

  // Schedule every note in one pass — offline rendering has no lookahead limit.
  const lead = 0.02
  for (const clip of project.clips) {
    if (!audible.has(clip.trackId)) continue
    const instrument = instruments.get(clip.trackId)
    if (!instrument || clip.contentBeats <= 0) continue
    const clipEnd = clip.startBeat + clip.lengthBeats
    const repeats = Math.max(1, Math.ceil(clip.lengthBeats / clip.contentBeats))

    for (let r = 0; r < repeats; r++) {
      const passStart = clip.startBeat + r * clip.contentBeats
      if (passStart >= clipEnd) break
      for (const note of clip.notes) {
        const absolute = passStart + note.start
        if (absolute < startBeat || absolute >= endBeat || absolute >= clipEnd) continue
        const duration = Math.min(note.duration, clipEnd - absolute)
        if (duration <= 0.001) continue
        instrument.play(
          note.midi,
          (absolute - startBeat) * beatSec + lead,
          duration * beatSec,
          note.velocity,
        )
      }
    }
  }

  // Instruments that buffer their schedule (the string worklet) commit here,
  // once every note is known and before the render starts.
  for (const instrument of instruments.values()) instrument.finalize?.()

  options.onProgress?.(0.1)
  const rendered = await ctx.startRendering()
  options.onProgress?.(1)
  return rendered
}

/** 16-bit PCM WAV. Universally readable, and lossless. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const frames = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = frames * blockAlign
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([out], { type: 'audio/wav' })
}

export async function exportWav(project: Project, options: RenderOptions = {}) {
  const buffer = await renderProject(project, options)
  triggerDownload(encodeWav(buffer), `${safeName(project.name)}.wav`)
}

// ---------------------------------------------------------------------------
// MIDI (Standard MIDI File, format 1)
// ---------------------------------------------------------------------------

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f]
  let v = value >> 7
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80)
    v >>= 7
  }
  return bytes
}

function chunk(id: string, data: number[]): number[] {
  const len = data.length
  return [
    ...id.split('').map((c) => c.charCodeAt(0)),
    (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
    ...data,
  ]
}

const PPQ = 480

export function encodeMidi(project: Project): Blob {
  const tracks: number[][] = []

  // Tempo/meta track.
  const microsPerBeat = Math.round(60_000_000 / project.bpm)
  const tempoTrack: number[] = [
    ...variableLength(0), 0xff, 0x51, 0x03,
    (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff,
    ...variableLength(0), 0xff, 0x58, 0x04, project.beatsPerBar, 2, 24, 8,
    ...variableLength(0), 0xff, 0x2f, 0x00,
  ]
  tracks.push(tempoTrack)

  project.tracks.forEach((track, index) => {
    const events: { tick: number; data: number[] }[] = []
    const channel = track.isDrum ? 9 : index % 15 + (index % 15 >= 9 ? 1 : 0)

    const name = track.name.slice(0, 40)
    events.push({
      tick: 0,
      data: [0xff, 0x03, name.length, ...name.split('').map((c) => c.charCodeAt(0))],
    })

    for (const clip of project.clips.filter((c) => c.trackId === track.id)) {
      const repeats = Math.max(1, Math.ceil(clip.lengthBeats / Math.max(0.001, clip.contentBeats)))
      const clipEnd = clip.startBeat + clip.lengthBeats
      for (let r = 0; r < repeats; r++) {
        const passStart = clip.startBeat + r * clip.contentBeats
        if (passStart >= clipEnd) break
        for (const note of clip.notes) {
          const absolute = passStart + note.start
          if (absolute >= clipEnd) continue
          const duration = Math.min(note.duration, clipEnd - absolute)
          const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127)))
          const midi = Math.max(0, Math.min(127, Math.round(note.midi)))
          events.push({ tick: Math.round(absolute * PPQ), data: [0x90 | channel, midi, velocity] })
          events.push({ tick: Math.round((absolute + duration) * PPQ), data: [0x80 | channel, midi, 0] })
        }
      }
    }

    events.sort((a, b) => a.tick - b.tick || (a.data[0] & 0xf0) - (b.data[0] & 0xf0))
    const bytes: number[] = []
    let last = 0
    for (const event of events) {
      bytes.push(...variableLength(Math.max(0, event.tick - last)), ...event.data)
      last = event.tick
    }
    bytes.push(...variableLength(0), 0xff, 0x2f, 0x00)
    tracks.push(bytes)
  })

  const header = chunk('MThd', [
    0, 1, // format 1
    (tracks.length >> 8) & 0xff, tracks.length & 0xff,
    (PPQ >> 8) & 0xff, PPQ & 0xff,
  ])
  const body = tracks.flatMap((t) => chunk('MTrk', t))
  return new Blob([new Uint8Array([...header, ...body])], { type: 'audio/midi' })
}

export function exportMidi(project: Project) {
  triggerDownload(encodeMidi(project), `${safeName(project.name)}.mid`)
}
