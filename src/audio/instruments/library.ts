/**
 * The instrument library: what ships with the app, plus whatever the user has
 * made.
 *
 * Presets used to be a frozen array. Now that a song can be taken apart into
 * playable sounds, the library has to grow at runtime — and every part of the
 * app that resolves an id (the picker, the piano roll, the mixer, the engine,
 * the offline renderer) should see those additions without knowing anything
 * about where they came from. So lookups go through here.
 *
 * The registry is the audio-side mirror of what the store owns and persists,
 * in the same spirit as `syncEngine`: nothing here writes to disk.
 */

import type { InstrumentFamily, PresetBase } from '../types'
import { ALL_PRESETS, FALLBACK_PRESET } from './presets'

const BUILT_IN = new Map(ALL_PRESETS.map((p) => [p.id, p]))
const user = new Map<string, PresetBase>()

const listeners = new Set<() => void>()
/** Bumped on every change, so React can subscribe without deep comparison. */
let revision = 0

export function registerInstrument(preset: PresetBase) {
  user.set(preset.id, { ...preset, userMade: true })
  revision++
  for (const listener of listeners) listener()
}

export function unregisterInstrument(id: string) {
  if (!user.delete(id)) return
  revision++
  for (const listener of listeners) listener()
}

export function onLibraryChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function libraryRevision(): number {
  return revision
}

export function userInstruments(): PresetBase[] {
  return [...user.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/** Everything playable right now: the user's own first, then the built-ins. */
export function allPresets(): PresetBase[] {
  return user.size ? [...userInstruments(), ...ALL_PRESETS] : ALL_PRESETS
}

export function hasPreset(id: string): boolean {
  return user.has(id) || BUILT_IN.has(id)
}

/**
 * Resolve a preset id. Falls back rather than throwing, because a project can
 * outlive an instrument — a bundle opened on another machine may name a
 * sampled instrument this browser has never seen.
 */
export function getPreset(id: string): PresetBase {
  return user.get(id) ?? BUILT_IN.get(id) ?? FALLBACK_PRESET
}

export function isDrumPreset(id: string): boolean {
  const preset = user.get(id) ?? BUILT_IN.get(id)
  if (!preset) return false
  // A sampled kit is still a kit: it belongs on the drum grid, not the roll.
  return preset.engine === 'drum' || (preset.engine === 'sampler' && preset.family === 'drums')
}

export function searchPresets(query: string): PresetBase[] {
  const q = query.trim().toLowerCase()
  const pool = allPresets()
  if (!q) return pool
  return pool.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.family.includes(q) ||
    p.blurb.toLowerCase().includes(q) ||
    (p.sourceName ?? '').toLowerCase().includes(q) ||
    p.tags.some((t) => t.includes(q)),
  )
}

export function presetsInFamily(family: InstrumentFamily): PresetBase[] {
  return allPresets().filter((p) => p.family === family)
}
