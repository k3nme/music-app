/**
 * The logic behind the Mashup Lab.
 *
 * Putting two finished songs together means agreeing on four things: where the
 * bar line is, how fast, what key, and what tuning reference. The analysis
 * layer works those out per track; this decides what to cut, how far to warp
 * it, and what to hand back.
 *
 * None of it touches lyrics or language. Everything here operates on the
 * spectrogram and the beat grid, so a Tamil vocal over a Norwegian drum break
 * is the same problem as any other.
 */

import type { AudioAnalysis } from '../audio/analysis/audio'
import { mixStems, STEM_NAMES, type StemName, type StemSet } from '../audio/spectral/stems'
import { planMatch, type KeySpec, type MatchPlan } from '../music/matching'
import type { SampleMeta } from './samples'

export type StemSelection = 'full' | StemName[]

export interface Deck {
  id: string
  meta: SampleMeta
  analysis: AudioAnalysis
  channels: Float32Array[]
  sampleRate: number
  /** Separated stems, once the user asks for them. */
  stems: StemSet | null
  separating: boolean
  selection: StemSelection
  gain: number
  enabled: boolean
  /** Bars after the first detected downbeat to start from. */
  startBar: number
}

export interface DeckPlan extends MatchPlan {
  deckId: string
  /** Where the cut starts in the source, in seconds. */
  startSec: number
  /** How much source is used, in seconds. */
  sourceSeconds: number
}

/**
 * Seconds per bar for a track, from its own detected tempo.
 * `sourceBpm` may be half or double the detected value when that gives a
 * gentler stretch.
 */
export function barSeconds(bpm: number, beatsPerBar = 4): number {
  return (beatsPerBar * 60) / Math.max(1, bpm)
}

/**
 * Cut `bars` of a track starting `startBar` bars after its first downbeat.
 *
 * Cutting from the downbeat rather than from zero is what makes two clips line
 * up when they're dropped on the same bar line.
 */
export function sliceFromDownbeat(
  channels: Float32Array[], sampleRate: number, analysis: AudioAnalysis,
  startBar: number, bars: number, sourceBpm?: number,
): { channels: Float32Array[]; startSec: number; seconds: number } {
  const bpm = sourceBpm ?? analysis.beat.bpm
  const perBar = barSeconds(bpm, analysis.beat.beatsPerBar)
  const startSec = Math.max(0, analysis.beat.downbeatSec + startBar * perBar)
  const seconds = bars * perBar

  const startSample = Math.min(channels[0].length - 1, Math.floor(startSec * sampleRate))
  const endSample = Math.min(channels[0].length, Math.floor((startSec + seconds) * sampleRate))
  const length = Math.max(1, endSample - startSample)

  return {
    channels: channels.map((channel) => {
      const out = new Float32Array(length)
      out.set(channel.subarray(startSample, startSample + length))
      return out
    }),
    startSec,
    seconds: length / sampleRate,
  }
}

/** The channels a deck contributes, given which stems are selected. */
export function deckChannels(deck: Deck): Float32Array[] {
  if (deck.selection === 'full' || !deck.stems) return deck.channels
  const selected = deck.selection.filter((name) => STEM_NAMES.includes(name))
  if (selected.length === 0) return deck.channels.map((c) => new Float32Array(c.length))
  return mixStems(deck.stems, selected)
}

/** Whether a deck needs separated stems before it can be used as configured. */
export function deckNeedsStems(deck: Deck): boolean {
  return deck.selection !== 'full' && !deck.stems
}

export function planFor(deck: Deck, targetBpm: number, targetKey: KeySpec, options: {
  matchKey?: boolean; correctTuning?: boolean; bars: number
}): DeckPlan {
  const plan = planMatch(deck.analysis, targetBpm, targetKey, options)
  const perBar = barSeconds(plan.sourceBpm, deck.analysis.beat.beatsPerBar)
  return {
    ...plan,
    deckId: deck.id,
    startSec: deck.analysis.beat.downbeatSec + deck.startBar * perBar,
    sourceSeconds: options.bars * perBar,
  }
}

/** Apply a level trim so stems from different masters sit together. */
export function levelMatch(deck: Deck, targetDb: number): number {
  const source = deck.analysis.loudnessDb
  if (!Number.isFinite(source) || source <= -99) return 1
  const gainDb = Math.max(-12, Math.min(12, targetDb - source))
  return Math.pow(10, gainDb / 20)
}

export const SECTION_OPTIONS = [4, 8, 16, 32] as const

/** A short, honest label for what a deck is contributing. */
export function describeSelection(selection: StemSelection): string {
  if (selection === 'full') return 'Full mix'
  if (selection.length === 0) return 'Nothing'
  if (selection.length === STEM_NAMES.length) return 'Full mix (recombined)'
  return selection.map((name) => name[0].toUpperCase() + name.slice(1)).join(' + ')
}
