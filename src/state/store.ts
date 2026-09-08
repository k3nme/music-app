/**
 * Application state. One zustand store holds the project plus UI state, and a
 * subscription reconciles the audio engine with it after every change.
 *
 * The playhead deliberately lives *outside* the store — it moves 60 times a
 * second, and pushing that through React would re-render the whole app. The
 * `usePlayhead` hook reads it straight from the engine instead.
 */

import { create } from 'zustand'
import { engine, type ChannelSettings, type MasterSettings } from '../audio/engine'
import { getPreset, isDrumPreset } from '../audio/instruments'
import {
  clipsForTrack, collectNotes, contentEndBeat, createClip, createTrack,
  emptyProject, type Clip, type Note, type Project, type Track,
} from '../music/project'
import type { ScaleId } from '../music/theory'
import { GRID_OPTIONS } from '../music/quantize'

export type EditorTab = 'notes' | 'mixer' | 'keyboard'

export interface UIState {
  selectedTrackId: string | null
  selectedClipId: string | null
  selectedNoteIds: string[]
  /** Editing grid in beats. */
  grid: number
  snap: boolean
  humOpen: boolean
  instrumentPickerFor: string | null
  helpOpen: boolean
  editorTab: EditorTab
  /** Octave offset for the on-screen/computer keyboard. */
  keyboardOctave: number
  /** Transport toggles live here so the engine and the UI can't disagree. */
  loopEnabled: boolean
  metronome: boolean
  status: { message: string; tone: 'info' | 'warn' | 'good' } | null
}

interface Store extends UIState {
  project: Project
  past: Project[]
  future: Project[]
  playing: boolean
  audioReady: boolean

  // --- project ---
  setProject(project: Project, options?: { resetHistory?: boolean }): void
  newProject(): void
  rename(name: string): void
  setBpm(bpm: number): void
  setKey(root: number, scale: ScaleId): void
  setLength(beats: number): void
  setMaster(patch: Partial<MasterSettings>): void

  // --- tracks ---
  addTrack(presetId: string, name?: string): string
  removeTrack(trackId: string): void
  updateTrack(trackId: string, patch: Partial<Track>): void
  setTrackPreset(trackId: string, presetId: string): void
  updateChannel(trackId: string, patch: Partial<ChannelSettings>): void
  toggleMute(trackId: string): void
  toggleSolo(trackId: string): void
  moveTrack(trackId: string, delta: number): void

  // --- clips ---
  addClip(trackId: string, startBeat: number, lengthBeats?: number): string
  updateClip(clipId: string, patch: Partial<Clip>): void
  removeClip(clipId: string): void
  duplicateClip(clipId: string): string | null
  setClipNotes(clipId: string, notes: Note[]): void

  // --- notes ---
  addNote(clipId: string, note: Note): void
  updateNote(clipId: string, noteId: string, patch: Partial<Note>): void
  updateNotes(clipId: string, ids: string[], patch: (note: Note) => Partial<Note>): void
  removeNotes(clipId: string, ids: string[]): void

  // --- selection & ui ---
  select(trackId: string | null, clipId?: string | null): void
  setSelectedNotes(ids: string[]): void
  setUI(patch: Partial<UIState>): void
  flash(message: string, tone?: 'info' | 'warn' | 'good'): void

  // --- transport ---
  togglePlay(): Promise<void>
  play(fromBeat?: number): Promise<void>
  stop(): void
  setPlaying(playing: boolean): void

  // --- history ---
  commit(): void
  undo(): void
  redo(): void
}

const HISTORY_LIMIT = 60

function cloneProject(p: Project): Project {
  return typeof structuredClone === 'function' ? structuredClone(p) : JSON.parse(JSON.stringify(p))
}

function touch(project: Project): Project {
  return { ...project, updatedAt: Date.now() }
}

export const useStore = create<Store>((set, get) => ({
  project: emptyProject(),
  past: [],
  future: [],
  playing: false,
  audioReady: false,

  selectedTrackId: null,
  selectedClipId: null,
  selectedNoteIds: [],
  grid: 0.25,
  snap: true,
  humOpen: false,
  instrumentPickerFor: null,
  helpOpen: false,
  editorTab: 'notes',
  keyboardOctave: 4,
  loopEnabled: true,
  metronome: false,
  status: null,

  // --- project ------------------------------------------------------------

  setProject(project, options) {
    set((s) => ({
      project,
      past: options?.resetHistory ? [] : [...s.past.slice(-HISTORY_LIMIT), cloneProject(s.project)],
      future: [],
      selectedTrackId: project.tracks[0]?.id ?? null,
      selectedClipId: project.clips[0]?.id ?? null,
      selectedNoteIds: [],
    }))
  },

  newProject() {
    engine.stop(0)
    get().setProject(emptyProject(), { resetHistory: true })
    set({ playing: false })
  },

  rename(name) {
    set((s) => ({ project: touch({ ...s.project, name }) }))
  },

  setBpm(bpm) {
    const clamped = Math.max(20, Math.min(300, Math.round(bpm)))
    set((s) => ({ project: touch({ ...s.project, bpm: clamped }) }))
  },

  setKey(root, scale) {
    set((s) => ({ project: touch({ ...s.project, key: { root, scale } }) }))
  },

  setLength(beats) {
    set((s) => ({ project: touch({ ...s.project, lengthBeats: Math.max(4, Math.round(beats)) }) }))
  },

  setMaster(patch) {
    set((s) => ({ project: touch({ ...s.project, master: { ...s.project.master, ...patch } }) }))
  },

  // --- tracks -------------------------------------------------------------

  addTrack(presetId, name) {
    const preset = getPreset(presetId)
    const track = createTrack({
      presetId,
      name: name ?? preset.name,
      isDrum: isDrumPreset(presetId),
      color: preset.hue,
    })
    get().commit()
    set((s) => ({
      project: touch({ ...s.project, tracks: [...s.project.tracks, track] }),
      selectedTrackId: track.id,
    }))
    return track.id
  },

  removeTrack(trackId) {
    get().commit()
    engine.removeTrack(trackId)
    set((s) => {
      const tracks = s.project.tracks.filter((t) => t.id !== trackId)
      return {
        project: touch({
          ...s.project,
          tracks,
          clips: s.project.clips.filter((c) => c.trackId !== trackId),
        }),
        selectedTrackId: s.selectedTrackId === trackId ? tracks[0]?.id ?? null : s.selectedTrackId,
        selectedClipId: null,
      }
    })
  },

  updateTrack(trackId, patch) {
    set((s) => ({
      project: touch({
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      }),
    }))
  },

  setTrackPreset(trackId, presetId) {
    get().commit()
    const preset = getPreset(presetId)
    const drum = isDrumPreset(presetId)
    set((s) => ({
      project: touch({
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                presetId,
                isDrum: drum,
                color: preset.hue,
                // Keep a user-given name, replace an auto one.
                name: s.project.tracks.some((x) => x.id === t.id && x.name === getPreset(t.presetId).name)
                  ? preset.name : t.name,
              }
            : t,
        ),
      }),
    }))
  },

  updateChannel(trackId, patch) {
    set((s) => ({
      project: touch({
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId ? { ...t, channel: { ...t.channel, ...patch } } : t,
        ),
      }),
    }))
  },

  toggleMute(trackId) {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (track) get().updateTrack(trackId, { muted: !track.muted })
  },

  toggleSolo(trackId) {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (track) get().updateTrack(trackId, { soloed: !track.soloed })
  },

  moveTrack(trackId, delta) {
    set((s) => {
      const tracks = [...s.project.tracks]
      const i = tracks.findIndex((t) => t.id === trackId)
      const j = i + delta
      if (i < 0 || j < 0 || j >= tracks.length) return s
      ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
      return { project: touch({ ...s.project, tracks }) }
    })
  },

  // --- clips --------------------------------------------------------------

  addClip(trackId, startBeat, lengthBeats) {
    const { project } = get()
    const bars = project.beatsPerBar
    const length = lengthBeats ?? bars * 4
    const clip = createClip(trackId, {
      startBeat: Math.max(0, startBeat),
      lengthBeats: length,
      contentBeats: length,
      name: `Clip ${clipsForTrack(project, trackId).length + 1}`,
    })
    get().commit()
    set((s) => ({
      project: touch({
        ...s.project,
        clips: [...s.project.clips, clip],
        lengthBeats: Math.max(s.project.lengthBeats, clip.startBeat + clip.lengthBeats),
      }),
      selectedClipId: clip.id,
      selectedTrackId: trackId,
    }))
    return clip.id
  },

  updateClip(clipId, patch) {
    set((s) => {
      const clips = s.project.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c))
      const end = clips.reduce((m, c) => Math.max(m, c.startBeat + c.lengthBeats), 0)
      return {
        project: touch({ ...s.project, clips, lengthBeats: Math.max(s.project.lengthBeats, end) }),
      }
    })
  },

  removeClip(clipId) {
    get().commit()
    set((s) => ({
      project: touch({ ...s.project, clips: s.project.clips.filter((c) => c.id !== clipId) }),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }))
  },

  duplicateClip(clipId) {
    const source = get().project.clips.find((c) => c.id === clipId)
    if (!source) return null
    const copy = createClip(source.trackId, {
      ...source,
      startBeat: source.startBeat + source.lengthBeats,
      name: source.name,
    })
    copy.notes = source.notes.map((n) => ({ ...n, id: `${n.id}x${Math.random().toString(36).slice(2, 6)}` }))
    get().commit()
    set((s) => ({
      project: touch({
        ...s.project,
        clips: [...s.project.clips, copy],
        lengthBeats: Math.max(s.project.lengthBeats, copy.startBeat + copy.lengthBeats),
      }),
      selectedClipId: copy.id,
    }))
    return copy.id
  },

  setClipNotes(clipId, notes) {
    get().commit()
    set((s) => ({
      project: touch({
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === clipId ? { ...c, notes } : c)),
      }),
    }))
  },

  // --- notes --------------------------------------------------------------

  addNote(clipId, note) {
    get().commit()
    set((s) => ({
      project: touch({
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === clipId ? { ...c, notes: [...c.notes, note] } : c)),
      }),
      selectedNoteIds: [note.id],
    }))
  },

  updateNote(clipId, noteId, patch) {
    set((s) => ({
      project: touch({
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)) }
            : c,
        ),
      }),
    }))
  },

  updateNotes(clipId, ids, patch) {
    const idSet = new Set(ids)
    set((s) => ({
      project: touch({
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: c.notes.map((n) => (idSet.has(n.id) ? { ...n, ...patch(n) } : n)) }
            : c,
        ),
      }),
    }))
  },

  removeNotes(clipId, ids) {
    const idSet = new Set(ids)
    get().commit()
    set((s) => ({
      project: touch({
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId ? { ...c, notes: c.notes.filter((n) => !idSet.has(n.id)) } : c,
        ),
      }),
      selectedNoteIds: s.selectedNoteIds.filter((id) => !idSet.has(id)),
    }))
  },

  // --- selection & ui -----------------------------------------------------

  select(trackId, clipId) {
    set((s) => ({
      selectedTrackId: trackId,
      selectedClipId: clipId === undefined ? s.selectedClipId : clipId,
      selectedNoteIds: [],
    }))
  },

  setSelectedNotes(ids) {
    set({ selectedNoteIds: ids })
  },

  setUI(patch) {
    set(patch as Partial<Store>)
  },

  flash(message, tone = 'info') {
    set({ status: { message, tone } })
    window.setTimeout(() => {
      if (get().status?.message === message) set({ status: null })
    }, 3200)
  },

  // --- transport ----------------------------------------------------------

  async togglePlay() {
    if (get().playing) get().stop()
    else await get().play()
  },

  async play(fromBeat) {
    await engine.resume()
    set({ audioReady: true })
    syncEngine(get().project, true)
    await engine.play(fromBeat)
    set({ playing: true })
  },

  stop() {
    engine.stop()
    set({ playing: false })
  },

  setPlaying(playing) {
    set({ playing })
  },

  // --- history ------------------------------------------------------------

  commit() {
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT), cloneProject(s.project)],
      future: [],
    }))
  },

  undo() {
    set((s) => {
      const previous = s.past[s.past.length - 1]
      if (!previous) return s
      return {
        project: previous,
        past: s.past.slice(0, -1),
        future: [cloneProject(s.project), ...s.future].slice(0, HISTORY_LIMIT),
      }
    })
  },

  redo() {
    set((s) => {
      const next = s.future[0]
      if (!next) return s
      return {
        project: next,
        past: [...s.past.slice(-HISTORY_LIMIT), cloneProject(s.project)],
        future: s.future.slice(1),
      }
    })
  },
}))

// ---------------------------------------------------------------------------
// Engine reconciliation
// ---------------------------------------------------------------------------

let lastSynced: Project | null = null

/** Push the project into the audio engine. Cheap when nothing changed. */
export function syncEngine(project: Project, force = false) {
  if (!engine.ready) return
  const previous = lastSynced
  lastSynced = project

  if (force || !previous || previous.bpm !== project.bpm) engine.setBpm(project.bpm)
  if (force || !previous || previous.master !== project.master) {
    engine.setMaster(project.master)
    if (!previous || previous.master.reverbSize !== project.master.reverbSize) {
      engine.setReverbSize(project.master.reverbSize)
    }
  }

  const soloed = project.tracks.some((t) => t.soloed)
  for (const track of project.tracks) {
    const muted = track.muted || (soloed && !track.soloed)
    engine.ensureTrack(track.id, track.presetId, { ...track.channel, muted })
    engine.updateChannel(track.id, { ...track.channel, muted })
  }
  if (previous) {
    const live = new Set(project.tracks.map((t) => t.id))
    for (const old of previous.tracks) if (!live.has(old.id)) engine.removeTrack(old.id)
  }

  engine.songEndBeat = Math.max(project.lengthBeats, contentEndBeat(project))
}

// Keep the engine in step with the store.
useStore.subscribe((state, prev) => {
  if (state.project !== prev.project) syncEngine(state.project)
  if (state.loopEnabled !== prev.loopEnabled) engine.loopEnabled = state.loopEnabled
  if (state.metronome !== prev.metronome) engine.metronome = state.metronome
})

// The scheduler pulls notes straight from the current project.
engine.setNoteSource((from, to) => collectNotes(useStore.getState().project, from, to))
engine.onStop = () => useStore.getState().setPlaying(false)

export const GRIDS = GRID_OPTIONS
