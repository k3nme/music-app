/**
 * Rendering a project out: WAV (offline render of the real signal chain) and
 * MIDI (so an idea started here can move into any other DAW).
 */

import {
  buildChannel, buildMaster, type MasterChain,
} from '../audio/engine'
import { createInstrument, getPreset, initPluck } from '../audio/instruments'
import {
  audibleTrackIds, audioClipLengthBeats, audioClipSpeed, contentEndBeat, type Project,
} from '../music/project'
import { bufferToChannels, channelsToBuffer, getSampleBuffer, getWarped, warpKey } from './samples'
import { warp } from '../audio/spectral/vocoder'
import { safeName, triggerDownload } from './persistence'
import { encodeWavFromBuffer } from './wav'

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
  const channels = new Map<string, ReturnType<typeof buildChannel>>()
  for (const track of project.tracks) {
    const muted = track.muted || (soloed && !track.soloed)
    const channel = buildChannel(ctx, master, { ...track.channel, muted })
    channels.set(track.id, channel)
    if (track.kind === 'audio') continue
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

  // --- audio clips --------------------------------------------------------
  for (const clip of project.audioClips ?? []) {
    if (!audible.has(clip.trackId)) continue
    const channel = channels.get(clip.trackId)
    const raw = getSampleBuffer(clip.sampleId)
    if (!channel || !raw) continue

    const lengthBeats = audioClipLengthBeats(clip, project.bpm)
    const clipStart = clip.startBeat
    if (lengthBeats <= 0 || clipStart >= endBeat || clipStart + lengthBeats <= startBeat) continue

    const speed = audioClipSpeed(clip, project.bpm)
    let source = raw
    if (clip.reverse) {
      source = channelsToBuffer(ctx, bufferToChannels(raw).map((data) => {
        const out = new Float32Array(data.length)
        for (let i = 0; i < data.length; i++) out[i] = data[data.length - 1 - i]
        return out
      }), raw.sampleRate)
    }

    const wantsWarp = Math.abs(clip.pitchSemitones) > 0.001 ||
      (clip.warpMode === 'stretch' && Math.abs(speed - 1) > 0.001)

    let prewarped = false
    if (wantsWarp) {
      const key = warpKey(clip.sampleId, speed, clip.pitchSemitones) + (clip.reverse ? '!rev' : '')
      const cached = getWarped(key)
      if (cached) {
        source = cached
        prewarped = true
      } else {
        // Nothing cached — do it inline. An export is allowed to take its time,
        // and shipping a bounce that doesn't match what was auditioned would
        // be worse.
        const warpedChannels = bufferToChannels(source).map((data) =>
          warp(data, 1 / Math.max(1e-6, speed), clip.pitchSemitones),
        )
        source = channelsToBuffer(ctx, warpedChannels, source.sampleRate)
        prewarped = true
      }
    }

    const node = ctx.createBufferSource()
    node.buffer = source
    const rate = prewarped ? 1 : speed * Math.pow(2, clip.pitchSemitones / 12)
    node.playbackRate.value = rate

    const gain = ctx.createGain()
    const level = Math.max(0.0001, clip.gain)
    const at = (clipStart - startBeat) * beatSec + lead
    const duration = lengthBeats * beatSec
    const fadeIn = Math.max(0.004, clip.fadeInBeats * beatSec)
    const fadeOut = Math.max(0.004, clip.fadeOutBeats * beatSec)

    gain.gain.setValueAtTime(0.0001, Math.max(0, at))
    gain.gain.linearRampToValueAtTime(level, Math.max(0, at) + fadeIn)
    gain.gain.setValueAtTime(level, Math.max(at + fadeIn, at + duration - fadeOut))
    gain.gain.linearRampToValueAtTime(0.0001, at + duration)

    node.connect(gain).connect(channel.input)
    const offset = prewarped ? clip.offsetSec / Math.max(1e-6, speed) : clip.offsetSec
    node.start(Math.max(0, at), Math.max(0, offset), prewarped ? duration : duration * rate)
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
  return encodeWavFromBuffer(buffer)
}

export async function exportWav(project: Project, options: RenderOptions = {}) {
  const buffer = await renderProject(project, options)
  triggerDownload(encodeWav(buffer), `${safeName(project.name)}.wav`)
}

/**
 * Bounce every track to its own WAV. Soloing one track at a time and rendering
 * reuses the exact signal path, so a stem sounds identical to that track in
 * the mix rather than merely similar.
 */
export async function exportTrackStems(
  project: Project, options: RenderOptions & { onTrack?: (name: string, index: number, total: number) => void } = {},
) {
  const tracks = project.tracks
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    options.onTrack?.(track.name, index, tracks.length)
    const soloed: Project = {
      ...project,
      tracks: project.tracks.map((t) => ({ ...t, soloed: t.id === track.id, muted: false })),
    }
    const buffer = await renderProject(soloed, options)
    triggerDownload(encodeWav(buffer), `${safeName(project.name)}-${safeName(track.name)}.wav`)
    // A breath between downloads, or browsers start blocking them.
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
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
