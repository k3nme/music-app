/**
 * Turns raw analysis output into musical notes: timing onto a grid, pitch into
 * the key, and octaves into the target instrument's range.
 *
 * Quantisation is deliberately a *strength*, not a switch. Pulling a hummed
 * take fully onto a 16th grid makes it stiff; 70-80% keeps the human feel
 * while fixing the sloppiness.
 */

import type { RawNote, PercussiveHit } from '../audio/analysis/pitch'
import { createNote, type Note } from './project'
import { snapToScale, type ScaleId } from './theory'

export interface QuantizeOptions {
  bpm: number
  /** Grid in beats: 1 = quarter, 0.5 = eighth, 0.25 = sixteenth, 1/3 = triplet. */
  grid: number
  /** 0 = keep the performance exactly, 1 = hard onto the grid. */
  strength: number
  /** Shortest allowed note, in beats. */
  minLength: number
  /** Snap pitches into the project key. */
  snapScale: boolean
  root: number
  scale: ScaleId
  /** Drop notes the tracker wasn't sure about. */
  confidenceGate: number
  /** Move the take so the first note lands on beat 0. */
  trimStart: boolean
  /** Stretch each note to meet the next one. */
  legato: boolean
  /** Transpose by octaves to sit inside the instrument's range. */
  fitRange: [number, number] | null
  /** Extra transposition in semitones, applied last. */
  transpose: number
}

export const DEFAULT_QUANTIZE: QuantizeOptions = {
  bpm: 120, grid: 0.25, strength: 0.8, minLength: 0.125,
  snapScale: true, root: 0, scale: 'minor',
  confidenceGate: 0.55, trimStart: true, legato: false,
  fitRange: null, transpose: 0,
}

const snap = (beats: number, grid: number, strength: number) => {
  if (grid <= 0) return beats
  const target = Math.round(beats / grid) * grid
  return beats + (target - beats) * strength
}

/** Shift a pitch by whole octaves until it sits inside `range`. */
export function fitToRange(midi: number, range: [number, number]): number {
  let m = midi
  while (m < range[0] && m + 12 <= range[1]) m += 12
  while (m > range[1] && m - 12 >= range[0]) m -= 12
  return Math.max(range[0], Math.min(range[1], m))
}

export function notesFromAnalysis(raw: RawNote[], options: Partial<QuantizeOptions> = {}): Note[] {
  const o = { ...DEFAULT_QUANTIZE, ...options }
  const beatsPerSecond = o.bpm / 60
  const usable = raw.filter((n) => n.confidence >= o.confidenceGate)
  if (usable.length === 0) return []

  const offset = o.trimStart ? usable[0].startSec : 0
  const notes: Note[] = []

  for (const rawNote of usable) {
    const startBeats = (rawNote.startSec - offset) * beatsPerSecond
    const endBeats = (rawNote.endSec - offset) * beatsPerSecond

    const start = Math.max(0, snap(startBeats, o.grid, o.strength))
    const end = snap(endBeats, o.grid, o.strength)
    const duration = Math.max(o.minLength, end - start)

    let midi = Math.round(rawNote.midi)
    if (o.snapScale) midi = snapToScale(midi, o.root, o.scale)
    midi += o.transpose
    if (o.fitRange) midi = fitToRange(midi, o.fitRange)

    notes.push(createNote(midi, start, duration, rawNote.velocity))
  }

  notes.sort((a, b) => a.start - b.start)

  // Overlaps confuse monophonic instruments and look wrong in the roll.
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].start - notes[i].start
    if (o.legato) {
      notes[i].duration = Math.max(o.minLength, gap)
    } else if (notes[i].start + notes[i].duration > notes[i + 1].start) {
      notes[i].duration = Math.max(o.minLength, gap - 0.02)
    }
  }
  return notes
}

/** Beatboxed or tapped input -> drum notes, using a band-to-piece mapping. */
export function notesFromHits(
  hits: PercussiveHit[],
  bandMap: Record<PercussiveHit['band'], number>,
  options: Partial<QuantizeOptions> = {},
): Note[] {
  const o = { ...DEFAULT_QUANTIZE, ...options }
  if (hits.length === 0) return []
  const beatsPerSecond = o.bpm / 60
  const offset = o.trimStart ? hits[0].timeSec : 0

  const notes = hits.map((hit) => {
    const start = Math.max(0, snap((hit.timeSec - offset) * beatsPerSecond, o.grid, o.strength))
    return createNote(bandMap[hit.band], start, Math.max(0.0625, o.grid / 2), hit.velocity)
  })

  // Collapse duplicates that quantised onto the same slot and piece.
  const seen = new Set<string>()
  return notes.filter((n) => {
    const key = `${n.midi}:${n.start.toFixed(4)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Round a length up to a whole number of bars, so clips loop cleanly. */
export function roundToBars(beats: number, beatsPerBar: number, minBars = 1): number {
  const bars = Math.max(minBars, Math.ceil(beats / beatsPerBar - 0.03))
  return bars * beatsPerBar
}

export const GRID_OPTIONS: { label: string; value: number }[] = [
  { label: '1/4', value: 1 },
  { label: '1/8', value: 0.5 },
  { label: '1/8T', value: 1 / 3 },
  { label: '1/16', value: 0.25 },
  { label: '1/16T', value: 1 / 6 },
  { label: '1/32', value: 0.125 },
  { label: 'Off', value: 0 },
]
