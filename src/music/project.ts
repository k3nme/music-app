/**
 * The project data model — the thing that gets saved, shared and rendered.
 *
 * Time is measured in beats (floats) everywhere. Seconds only appear at the
 * audio layer, so a tempo change never has to rewrite any musical data.
 */

import { DEFAULT_CHANNEL, DEFAULT_MASTER, type ChannelSettings, type MasterSettings, type QueuedNote } from '../audio/engine'
import { uid } from '../lib/id'
import type { ScaleId } from './theory'

export const PROJECT_VERSION = 1

export interface Note {
  id: string
  midi: number
  /** Beats from the start of the clip's content. */
  start: number
  /** Beats. */
  duration: number
  /** 0..1 */
  velocity: number
}

export interface Clip {
  id: string
  trackId: string
  name: string
  /** Position on the arrangement timeline, in beats. */
  startBeat: number
  /** How long the clip occupies the timeline. A multiple of `contentBeats` repeats it. */
  lengthBeats: number
  /** The loop length of the material inside the clip. */
  contentBeats: number
  notes: Note[]
}

/**
 * A slice of recorded audio on the timeline.
 *
 * Length is deliberately *derived* rather than stored: a warped clip's
 * timeline length depends on the project tempo, so computing it means a tempo
 * change re-fits every warped clip for free instead of leaving stale numbers
 * in the project.
 */
export interface AudioClip {
  id: string
  trackId: string
  name: string
  /** Position on the arrangement timeline, in beats. */
  startBeat: number
  /** Which stored sample this plays. */
  sampleId: string
  /** Seconds into the source where playback starts. */
  offsetSec: number
  /** Seconds of source material used. */
  sourceDurationSec: number
  gain: number
  fadeInBeats: number
  fadeOutBeats: number
  /** Transposition. Non-zero always goes through the phase vocoder. */
  pitchSemitones: number
  /** Follow the project tempo. */
  warp: boolean
  /** 'stretch' keeps the pitch; 'repitch' drags it along, like a turntable. */
  warpMode: 'stretch' | 'repitch'
  /** The tempo the material was recorded at; needed to warp it. */
  originalBpm: number | null
  reverse: boolean
  /** Colour hint, inherited from the track unless the clip overrides it. */
  hue?: number
}

export interface Track {
  id: string
  name: string
  /** MIDI tracks play an instrument; audio tracks play clips of samples. */
  kind: 'midi' | 'audio'
  presetId: string
  channel: ChannelSettings
  muted: boolean
  soloed: boolean
  /** Piano roll or drum grid. Derived from the preset, cached for layout. */
  isDrum: boolean
  /** Collapsed height in the arrangement. */
  color: number
}

export interface ProjectKey {
  root: number // pitch class 0-11
  scale: ScaleId
}

export interface Project {
  version: number
  id: string
  name: string
  bpm: number
  beatsPerBar: number
  key: ProjectKey
  tracks: Track[]
  clips: Clip[]
  audioClips: AudioClip[]
  master: MasterSettings
  /** Arrangement length in beats. */
  lengthBeats: number
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createNote(midi: number, start: number, duration = 1, velocity = 0.8): Note {
  return { id: uid('n'), midi, start, duration, velocity }
}

export function createTrack(partial: Partial<Track> = {}): Track {
  return {
    id: uid('t'),
    name: 'Track',
    kind: 'midi',
    presetId: 'warm-pad',
    channel: { ...DEFAULT_CHANNEL },
    muted: false,
    soloed: false,
    isDrum: false,
    color: Math.floor(Math.random() * 360),
    ...partial,
  }
}

export function createClip(trackId: string, partial: Partial<Clip> = {}): Clip {
  const contentBeats = partial.contentBeats ?? 16
  return {
    id: uid('c'),
    trackId,
    name: 'Clip',
    startBeat: 0,
    lengthBeats: partial.lengthBeats ?? contentBeats,
    contentBeats,
    notes: [],
    ...partial,
  }
}

export function createAudioClip(
  trackId: string, sampleId: string, partial: Partial<AudioClip> = {},
): AudioClip {
  return {
    id: uid('a'),
    trackId,
    sampleId,
    name: 'Audio',
    startBeat: 0,
    offsetSec: 0,
    sourceDurationSec: 0,
    gain: 1,
    fadeInBeats: 0.02,
    fadeOutBeats: 0.05,
    pitchSemitones: 0,
    warp: true,
    warpMode: 'stretch',
    originalBpm: null,
    reverse: false,
    ...partial,
  }
}

export function emptyProject(name = 'Untitled'): Project {
  const now = Date.now()
  return {
    version: PROJECT_VERSION,
    id: uid('p'),
    name,
    bpm: 120,
    beatsPerBar: 4,
    key: { root: 0, scale: 'minor' },
    tracks: [],
    clips: [],
    audioClips: [],
    master: { ...DEFAULT_MASTER },
    lengthBeats: 64,
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Tracks that should be heard, accounting for solo. */
export function audibleTrackIds(project: Project): Set<string> {
  const soloed = project.tracks.filter((t) => t.soloed)
  const pool = soloed.length > 0 ? soloed : project.tracks
  return new Set(pool.filter((t) => !t.muted).map((t) => t.id))
}

/**
 * Every note that starts inside [fromBeat, toBeat), expanded across clip
 * repeats. This is the scheduler's only view of the project.
 */
export function collectNotes(project: Project, fromBeat: number, toBeat: number): QueuedNote[] {
  const out: QueuedNote[] = []
  const audible = audibleTrackIds(project)

  for (const clip of project.clips) {
    if (!audible.has(clip.trackId)) continue
    const clipEnd = clip.startBeat + clip.lengthBeats
    if (clipEnd <= fromBeat || clip.startBeat >= toBeat) continue
    if (clip.contentBeats <= 0) continue

    const repeats = Math.max(1, Math.ceil(clip.lengthBeats / clip.contentBeats))
    for (let r = 0; r < repeats; r++) {
      const passStart = clip.startBeat + r * clip.contentBeats
      if (passStart >= clipEnd) break
      if (passStart >= toBeat) break
      if (passStart + clip.contentBeats <= fromBeat) continue

      for (const note of clip.notes) {
        const absolute = passStart + note.start
        if (absolute < fromBeat || absolute >= toBeat) continue
        if (absolute >= clipEnd) continue
        // A note is trimmed if the clip ends before it does.
        const duration = Math.min(note.duration, clipEnd - absolute)
        if (duration <= 0.001) continue
        out.push({
          trackId: clip.trackId,
          midi: note.midi,
          velocity: note.velocity,
          startBeat: absolute,
          durationBeats: duration,
        })
      }
    }
  }
  return out
}

/**
 * Playback speed for an audio clip: how many source seconds pass per timeline
 * second. 1 means untouched.
 */
export function audioClipSpeed(clip: AudioClip, bpm: number): number {
  if (!clip.warp || !clip.originalBpm || clip.originalBpm <= 0) return 1
  return bpm / clip.originalBpm
}

/** How much of the timeline an audio clip occupies, in beats. */
export function audioClipLengthBeats(clip: AudioClip, bpm: number): number {
  const speed = audioClipSpeed(clip, bpm)
  const timelineSeconds = clip.sourceDurationSec / Math.max(1e-6, speed)
  return (timelineSeconds * bpm) / 60
}

export interface ScheduledAudio {
  clip: AudioClip
  trackId: string
  /** Song beat the clip starts on. */
  startBeat: number
  lengthBeats: number
  speed: number
}

/** Audio clips overlapping a window, with their derived timing. */
export function collectAudio(project: Project, fromBeat: number, toBeat: number): ScheduledAudio[] {
  const audible = audibleTrackIds(project)
  const out: ScheduledAudio[] = []
  for (const clip of project.audioClips ?? []) {
    if (!audible.has(clip.trackId)) continue
    const lengthBeats = audioClipLengthBeats(clip, project.bpm)
    if (lengthBeats <= 0) continue
    if (clip.startBeat + lengthBeats <= fromBeat || clip.startBeat >= toBeat) continue
    out.push({
      clip,
      trackId: clip.trackId,
      startBeat: clip.startBeat,
      lengthBeats,
      speed: audioClipSpeed(clip, project.bpm),
    })
  }
  return out
}

export function audioClipsForTrack(project: Project, trackId: string): AudioClip[] {
  return (project.audioClips ?? []).filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startBeat - b.startBeat)
}

/** Every sample id the project depends on. */
export function projectSampleIds(project: Project): string[] {
  return [...new Set((project.audioClips ?? []).map((c) => c.sampleId))]
}

/** Last beat with anything on it — used for auto-sizing the arrangement. */
export function contentEndBeat(project: Project): number {
  let end = 0
  for (const clip of project.clips) end = Math.max(end, clip.startBeat + clip.lengthBeats)
  for (const clip of project.audioClips ?? []) {
    end = Math.max(end, clip.startBeat + audioClipLengthBeats(clip, project.bpm))
  }
  return end
}

export function clipsForTrack(project: Project, trackId: string): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.startBeat - b.startBeat)
}

/** Beats -> "bar.beat" for display, 1-indexed like every DAW. */
export function formatPosition(beat: number, beatsPerBar: number): string {
  const bar = Math.floor(beat / beatsPerBar) + 1
  const inBar = beat - (bar - 1) * beatsPerBar
  return `${bar}.${Math.floor(inBar) + 1}`
}
