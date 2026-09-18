/**
 * The user's own instruments: building them out of extracted sounds, keeping
 * them, and putting them back on the shelf next time the app opens.
 *
 * Two stores, for the same reason projects and audio are already split: the
 * definitions are small JSON and live in localStorage, while the audio is
 * large and lives in IndexedDB alongside every other sample. An instrument is
 * therefore a preset whose zones name sample ids — which also means a project
 * bundle already knows how to carry the audio, and a sampled instrument
 * survives being sent to someone else.
 */

import {
  forgetSample, noteZones, provideSample, registerInstrument, samplerSampleIds,
  unregisterInstrument, userInstruments, type SamplerZone,
} from '../audio/instruments'
import type { ExtractedSound } from '../audio/analysis/dissect'
import { isPercussive, kitSlotFor } from '../audio/analysis/sounds'
import type { PresetBase } from '../audio/types'
import { uid } from './id'
import { createSample, deleteSample, ensureSample, loadSampleIndex } from './samples'

const KEY = 'overtone.instruments'

/** How far a sampled note is stretched before it starts to sound wrong. */
const ZONE_REACH = 7

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function readStored(): PresetBase[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as PresetBase[]) : []
    return Array.isArray(list) ? list.filter((p) => p && p.engine === 'sampler') : []
  } catch {
    return []
  }
}

function writeStored(list: PresetBase[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Save an instrument and put it on the shelf immediately. */
export function saveInstrument(preset: PresetBase): boolean {
  const list = readStored().filter((p) => p.id !== preset.id)
  list.push(preset)
  registerInstrument(preset)
  return writeStored(list)
}

/**
 * Remove an instrument, and the audio behind it — but only the audio nothing
 * else is still using. Two kits built from the same song can share a slice.
 */
export async function removeInstrument(id: string): Promise<void> {
  const stored = readStored()
  const going = stored.find((p) => p.id === id)
  const remaining = stored.filter((p) => p.id !== id)
  writeStored(remaining)
  unregisterInstrument(id)
  if (!going) return

  const stillUsed = new Set(remaining.flatMap((p) => samplerSampleIds(p)))
  for (const sampleId of samplerSampleIds(going)) {
    if (stillUsed.has(sampleId)) continue
    forgetSample(sampleId)
    await deleteSample(sampleId)
  }
}

/**
 * Put every stored instrument back, with its audio decoded and handed to the
 * sampler. Called once at startup.
 *
 * An instrument whose audio has gone (cleared site data, or a project bundle
 * that arrived without it) is kept rather than deleted: the definition is
 * still meaningful, and the samples may come back with the next bundle.
 */
export async function restoreInstruments(
  ctx: BaseAudioContext,
): Promise<{ restored: number; silent: string[] }> {
  const stored = readStored()
  if (stored.length === 0) return { restored: 0, silent: [] }
  await loadSampleIndex()

  const silent: string[] = []
  for (const preset of stored) {
    let missing = false
    for (const sampleId of samplerSampleIds(preset)) {
      const buffer = await ensureSample(ctx, sampleId)
      if (buffer) provideSample(sampleId, buffer)
      else missing = true
    }
    if (missing) silent.push(preset.name)
    registerInstrument(preset)
  }
  return { restored: stored.length, silent }
}

/** Make sure a preset's audio is loaded — used when a bundle brings one in. */
export async function hydrateInstrument(ctx: BaseAudioContext, preset: PresetBase): Promise<boolean> {
  let complete = true
  for (const sampleId of samplerSampleIds(preset)) {
    const buffer = await ensureSample(ctx, sampleId)
    if (buffer) provideSample(sampleId, buffer)
    else complete = false
  }
  return complete
}

export function storedInstruments(): PresetBase[] {
  return userInstruments()
}

/**
 * Take on the instruments a bundle brought with it, so its tracks play the
 * sound they were written for rather than falling back to a piano.
 *
 * An instrument already here under the same id is left alone: ids are unique
 * per creation, so the same id means the same instrument.
 */
export async function installBundleInstruments(
  ctx: BaseAudioContext, instruments: PresetBase[],
): Promise<number> {
  const known = new Set(readStored().map((p) => p.id))
  let added = 0
  for (const preset of instruments) {
    if (known.has(preset.id)) {
      await hydrateInstrument(ctx, preset)
      registerInstrument(preset)
      continue
    }
    await hydrateInstrument(ctx, preset)
    if (saveInstrument(preset)) added++
  }
  return added
}

// ---------------------------------------------------------------------------
// Building one out of extracted sounds
// ---------------------------------------------------------------------------

async function storeTake(
  ctx: BaseAudioContext, audio: Float32Array, sampleRate: number, name: string, sourceId?: string,
): Promise<string> {
  const { meta, buffer } = await createSample(ctx, [audio], sampleRate, name, { sourceId })
  provideSample(meta.id, buffer)
  return meta.id
}

/**
 * A drum kit from a set of one-shots, laid out on the notes every other drum
 * machine uses — so a pattern written for the 909 plays on a kit made out of
 * someone's record.
 */
export async function kitFromSounds(
  ctx: BaseAudioContext,
  sounds: { sound: ExtractedSound; name: string }[],
  options: { name: string; sourceName?: string; sourceId?: string },
): Promise<PresetBase | null> {
  const zones: SamplerZone[] = []
  const taken = new Set<number>()

  for (const { sound, name } of sounds) {
    const midi = kitSlotFor(sound.kind, taken)
    taken.add(midi)
    const sampleId = await storeTake(
      ctx, sound.best.audio, sound.sampleRate, `${options.name} — ${name}`, options.sourceId,
    )
    zones.push({
      sampleId, rootMidi: midi, lo: midi, hi: midi, name, oneShot: true, gain: 1,
    })
  }
  if (zones.length === 0) return null

  const slots = zones.map((z) => z.rootMidi)
  return {
    id: uid('kit'),
    name: options.name,
    family: 'drums',
    engine: 'sampler',
    blurb: options.sourceName
      ? `Drums taken out of ${options.sourceName}.`
      : 'A kit built from an imported recording.',
    tags: ['sampled', 'yours', 'kit', ...(options.sourceName ? [options.sourceName.toLowerCase()] : [])],
    centerMidi: 36,
    range: [Math.min(...slots), Math.max(...slots)],
    polyphony: 12,
    hue: 96,
    params: { zones, gain: 0.9, a: 0.001, d: 0.1, s: 1, r: 0.02 },
    userMade: true,
    sourceName: options.sourceName,
    createdAt: Date.now(),
  }
}

/**
 * A playable instrument from a pitched sound. Each recorded note covers the
 * few semitones either side of itself, so most of what you play is a real
 * recording rather than something stretched a long way from one.
 */
export async function instrumentFromSound(
  ctx: BaseAudioContext,
  sound: ExtractedSound,
  options: { name: string; sourceName?: string; sourceId?: string },
): Promise<PresetBase | null> {
  const pitched = sound.takes.filter((t) => t.midi !== null)
  const takes = (pitched.length ? pitched : sound.takes)
    .slice()
    .sort((a, b) => (a.midi ?? 60) - (b.midi ?? 60))
  if (takes.length === 0) return null

  const roots = takes.map((t) => t.midi ?? 60)
  const layout = noteZones(roots, ZONE_REACH)
  const zones: SamplerZone[] = []
  for (let i = 0; i < takes.length; i++) {
    const spread = layout[i]
    const sampleId = await storeTake(
      ctx, takes[i].audio, sound.sampleRate,
      `${options.name} — ${noteName(spread.rootMidi)}`, options.sourceId,
    )
    zones.push({ sampleId, ...spread, name: noteName(spread.rootMidi) })
  }

  const held = sound.kind === 'texture' || sound.features.decaySec > 0.6
  return {
    id: uid('inst'),
    name: options.name,
    family: sound.kind === 'bass' ? 'bass' : sound.kind === 'vocal' ? 'voice' : 'sampled',
    engine: 'sampler',
    blurb: options.sourceName
      ? `${sound.label} taken out of ${options.sourceName}.`
      : `${sound.label} from an imported recording.`,
    tags: ['sampled', 'yours', sound.kind, ...(options.sourceName ? [options.sourceName.toLowerCase()] : [])],
    centerMidi: roots[Math.floor(roots.length / 2)],
    range: [zones[0].lo, zones[zones.length - 1].hi],
    polyphony: sound.kind === 'bass' ? 1 : 8,
    hue: 96,
    params: {
      zones,
      gain: 0.85,
      a: held ? 0.02 : 0.002,
      d: 0.12,
      s: 1,
      // A held sound wants a real release; a plucked one should stop when the
      // recording does.
      r: held ? 0.18 : 0.05,
    },
    userMade: true,
    sourceName: options.sourceName,
    createdAt: Date.now(),
  }
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

/**
 * A short, distinct name for a sound taken out of a song.
 *
 * A song often has two hi-hats or three different snares, and two pads both
 * labelled "Closed hat" are impossible to tell apart — in the list, and later
 * on the kit.
 */
export function nameFor(sound: ExtractedSound, sourceName: string, used: Set<string>): string {
  return distinct(`${trim(sourceName)} ${sound.label}`, used)
}

/** The same, for a drum pad, where the song's name is already on the kit. */
export function padName(sound: ExtractedSound, used: Set<string>): string {
  return distinct(sound.label, used)
}

function distinct(base: string, used: Set<string>): string {
  let name = base
  let n = 2
  while (used.has(name)) name = `${base} ${n++}`
  used.add(name)
  return name
}

function trim(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]{2,4}$/i, '')
  return withoutExtension.length > 22 ? `${withoutExtension.slice(0, 22).trimEnd()}…` : withoutExtension
}

/** Split a set of extracted sounds the way they should be saved. */
export function planImport(sounds: ExtractedSound[]): {
  kit: ExtractedSound[]
  instruments: ExtractedSound[]
} {
  return {
    kit: sounds.filter((s) => isPercussive(s.kind)),
    instruments: sounds.filter((s) => !isPercussive(s.kind)),
  }
}
