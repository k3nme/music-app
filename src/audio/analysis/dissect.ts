/**
 * Turning a song into a list of the distinct sounds it is made of.
 *
 * This is the orchestration layer over `sounds.ts`: run each separated stem
 * through onsets → slices → features → classification → clustering, then keep
 * the best example of each distinct sound.
 *
 * Pitched sounds get more than one example where the song provides them. One
 * recording stretched across a keyboard sounds like a recording stretched
 * across a keyboard; four notes spread over the range sounds like an
 * instrument. The song usually has the notes, so it would be a waste not to
 * take them.
 *
 * Pure, like everything in this directory: it runs in the worker and in tests.
 */

import {
  classifySound, clusterSounds, cutSlice, describeSound, findOnsets, fingerprint,
  isPercussive, sliceRegions, soundLabel, type SoundFeatures, type SoundKind,
} from './sounds'

export type StemName = 'vocals' | 'drums' | 'bass' | 'other'

export interface SoundTake {
  /** MIDI note this example was played at, when it is pitched. */
  midi: number | null
  audio: Float32Array
  /** Where in the song it came from. */
  atSec: number
  peak: number
}

export interface ExtractedSound {
  /** Stable within one run, so the UI can track selection. */
  id: string
  kind: SoundKind
  /** "Kick", "Voice" — what the UI shows. */
  label: string
  stem: StemName
  /** The example to use. Always one of `takes`. */
  best: SoundTake
  /** Every example kept, lowest note first. One for anything percussive. */
  takes: SoundTake[]
  features: SoundFeatures
  /** How many times this sound occurs in the song. */
  count: number
  sampleRate: number
}

export interface DissectOptions {
  /** Ignore anything quieter than this share of the stem's peak. */
  floor?: number
  /** Most sounds to return, best first. */
  maxSounds?: number
  /** Most examples to keep for one pitched sound. */
  maxTakes?: number
  /** Cap the slices examined per stem, for a long song. */
  maxSlicesPerStem?: number
  onProgress?: (fraction: number, stage: string) => void
}

const STEM_ORDER: StemName[] = ['drums', 'bass', 'other', 'vocals']

/** Longest slice worth keeping, per stem. A pad needs room; a hat does not. */
const MAX_SLICE_SEC: Record<StemName, number> = {
  drums: 2, bass: 2.5, other: 3, vocals: 3,
}

export function dissectStems(
  stems: Record<StemName, Float32Array[]>,
  sampleRate: number,
  options: DissectOptions = {},
): ExtractedSound[] {
  const floor = options.floor ?? 0.04
  const maxSounds = options.maxSounds ?? 24
  const maxTakes = options.maxTakes ?? 4
  const maxSlices = options.maxSlicesPerStem ?? 320
  const report = options.onProgress ?? (() => {})

  const found: ExtractedSound[] = []
  let serial = 0

  STEM_ORDER.forEach((stem, stemIndex) => {
    const channels = stems[stem]
    if (!channels?.length) return
    report(stemIndex / STEM_ORDER.length, `Listening to the ${stem}`)

    const mono = toMono(channels)
    let stemPeak = 0
    for (let i = 0; i < mono.length; i++) stemPeak = Math.max(stemPeak, Math.abs(mono[i]))
    // A stem that separation found nothing for is silence with rounding in it.
    if (stemPeak < 0.005) return

    const onsets = findOnsets(mono, sampleRate)
    const regions = sliceRegions(mono, sampleRate, onsets, { maxLenSec: MAX_SLICE_SEC[stem] })
    const considered = thin(regions, maxSlices)

    const items = considered.map((region) => {
      const audio = cutSlice(mono, sampleRate, region)
      const features = describeSound(audio, sampleRate)
      return {
        kind: classifySound(features, stem),
        print: fingerprint(audio, sampleRate),
        peak: features.peak,
        audio,
        features,
        atSec: region.startSec,
      }
    }).filter((item) => item.peak > stemPeak * floor)

    for (const cluster of clusterSounds(items)) {
      const members = cluster.members
      const exemplar = members[cluster.bestIndex]
      const takes = isPercussive(cluster.kind)
        ? [toTake(exemplar)]
        : spreadOfNotes(members, maxTakes)

      found.push({
        id: `x${++serial}`,
        kind: cluster.kind,
        label: soundLabel(cluster.kind),
        stem,
        best: takes.find((t) => t.atSec === exemplar.atSec) ?? takes[0],
        takes,
        features: exemplar.features,
        count: cluster.count,
        sampleRate,
      })
    }
  })

  report(1, 'Done')

  // Most-used first: the sounds a song leans on are the ones worth having.
  return found
    .sort((a, b) => b.count * b.best.peak - a.count * a.best.peak)
    .slice(0, maxSounds)
}

type Item = {
  kind: SoundKind; print: Float32Array; peak: number
  audio: Float32Array; features: SoundFeatures; atSec: number
}

function toTake(item: Item): SoundTake {
  return { midi: item.features.pitchMidi, audio: item.audio, atSec: item.atSec, peak: item.peak }
}

/**
 * Pick examples at different pitches: the cleanest take of each note, spread
 * as widely across the range as the song allows.
 */
function spreadOfNotes(members: Item[], limit: number): SoundTake[] {
  const byNote = new Map<number, Item>()
  for (const member of members) {
    const midi = member.features.pitchMidi
    if (midi === null) continue
    const existing = byNote.get(midi)
    if (!existing || member.peak > existing.peak) byNote.set(midi, member)
  }
  if (byNote.size === 0) {
    const loudest = members.reduce((best, m) => (m.peak > best.peak ? m : best), members[0])
    return [toTake(loudest)]
  }

  const notes = [...byNote.keys()].sort((a, b) => a - b)
  if (notes.length <= limit) return notes.map((midi) => toTake(byNote.get(midi)!))

  // Evenly spaced across the range, ends included — the ends are what decide
  // how far the instrument can be played before it starts sounding stretched.
  const picked: number[] = []
  for (let i = 0; i < limit; i++) {
    picked.push(notes[Math.round((i * (notes.length - 1)) / (limit - 1))])
  }
  return [...new Set(picked)].map((midi) => toTake(byNote.get(midi)!))
}

function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const out = new Float32Array(channels[0].length)
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length
  }
  return out
}

/** Keep at most `limit` regions, evenly spread through the song. */
function thin<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  const out: T[] = []
  for (let i = 0; i < limit; i++) out.push(items[Math.floor((i * items.length) / limit)])
  return out
}
