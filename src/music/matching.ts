/**
 * Working out how to put two pieces of recorded music together.
 *
 * Three things have to line up: tempo, key, and tuning reference. The third is
 * the one most tools ignore, and it's why transposing a track that was cut 40
 * cents flat can still land out of tune against a modern reference.
 */

import type { AudioAnalysis, KeyEstimate } from '../audio/analysis/audio'
import { NOTE_NAMES, type ScaleId } from './theory'

export interface KeySpec {
  root: number
  /** Only major/minor matter for matching; other scales fall back to their parent. */
  mode: 'major' | 'minor'
}

/**
 * Fold a key onto the root of its relative minor.
 *
 * C major and A minor contain exactly the same notes, so as far as matching is
 * concerned they're the same key and need no transposition between them. Both
 * reduce to A.
 */
export function relativeMinorRoot(key: KeySpec): number {
  return key.mode === 'major' ? (((key.root - 3) % 12) + 12) % 12 : key.root
}

/**
 * Semitones to transpose `from` so it sits in `to`.
 *
 * Chooses the shorter direction: shifting a vocal up 7 semitones wrecks it,
 * down 5 is usually fine. Returns a value in [-6, 5].
 */
export function keyDistance(from: KeySpec, to: KeySpec): number {
  const delta = (((relativeMinorRoot(to) - relativeMinorRoot(from)) % 12) + 12) % 12
  return delta > 6 ? delta - 12 : delta
}

/**
 * The full transposition for a source, including its tuning offset.
 *
 * If a recording sits 40 cents flat, playing it against a modern track needs
 * that 0.4 of a semitone added back on top of the key change.
 */
export function transposeFor(source: KeyEstimate, target: KeySpec, correctTuning = true): number {
  const semitones = keyDistance({ root: source.root, mode: source.mode }, target)
  const tuning = correctTuning ? -source.tuningCents / 100 : 0
  return Math.round((semitones + tuning) * 1000) / 1000
}

/** Playback speed to get `fromBpm` material to play at `toBpm`. */
export function tempoRatio(fromBpm: number, toBpm: number): number {
  if (!fromBpm || fromBpm <= 0) return 1
  return toBpm / fromBpm
}

/**
 * Whether a tempo change is small enough to sound natural.
 *
 * Beyond about 8% the phase vocoder starts to show, and beyond ~15% most
 * material sounds obviously processed. Halving or doubling is the escape
 * hatch: a 150 BPM track sits comfortably against a 75 BPM one.
 */
export function tempoStrain(fromBpm: number, toBpm: number): {
  ratio: number
  percent: number
  advice: 'easy' | 'stretchy' | 'try-half-time'
  suggestedSourceBpm: number
} {
  const options = [fromBpm, fromBpm * 2, fromBpm / 2]
    .filter((bpm) => bpm > 40 && bpm < 300)
    .map((bpm) => ({ bpm, percent: Math.abs(tempoRatio(bpm, toBpm) - 1) }))
    .sort((a, b) => a.percent - b.percent)

  const best = options[0] ?? { bpm: fromBpm, percent: 0 }
  const ratio = tempoRatio(best.bpm, toBpm)
  const percent = Math.abs(ratio - 1) * 100
  return {
    ratio,
    percent,
    advice: percent < 6 ? 'easy' : percent < 14 ? 'stretchy' : 'try-half-time',
    suggestedSourceBpm: best.bpm,
  }
}

export function keyName(key: KeySpec): string {
  return `${NOTE_NAMES[((key.root % 12) + 12) % 12]} ${key.mode}`
}

/** Map a project scale onto the major/minor a matcher can work with. */
export function toKeySpec(root: number, scale: ScaleId): KeySpec {
  const minorish: ScaleId[] = [
    'minor', 'harmonicMinor', 'melodicMinor', 'pentaMinor', 'blues', 'dorian',
    'phrygian', 'locrian', 'hungarianMinor', 'kafi', 'hirajoshi', 'inSen', 'phrygianDom',
  ]
  return { root, mode: minorish.includes(scale) ? 'minor' : 'major' }
}

export interface MatchPlan {
  /** Playback speed multiplier applied to the source. */
  speed: number
  /** Transposition in semitones, tuning included. */
  semitones: number
  /** The source tempo actually used (possibly halved or doubled). */
  sourceBpm: number
  strain: ReturnType<typeof tempoStrain>
}

/** Everything needed to warp one analysed track onto a target tempo and key. */
export function planMatch(
  analysis: AudioAnalysis, targetBpm: number, targetKey: KeySpec,
  options: { matchKey?: boolean; correctTuning?: boolean } = {},
): MatchPlan {
  const strain = tempoStrain(analysis.beat.bpm, targetBpm)
  return {
    speed: strain.ratio,
    semitones: options.matchKey === false ? 0 : transposeFor(analysis.key, targetKey, options.correctTuning ?? true),
    sourceBpm: strain.suggestedSourceBpm,
    strain,
  }
}
