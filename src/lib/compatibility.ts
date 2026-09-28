/**
 * Which two songs will actually work together.
 *
 * The Mashup Lab could already do the hard part — pull two records onto one
 * grid, correct their tuning, take the vocal from one and the beat from the
 * other. What it could not do was tell you *which* two records to try. That is
 * the part people actually find hard, and it is the part a computer is good at:
 * the answer is mostly arithmetic on tempo and key.
 *
 * Pure: no audio, no DOM, no storage. It reads analyses and returns scores and
 * sentences.
 */

import { NOTE_NAMES } from '../music/theory'

export interface SongFacts {
  id: string
  name: string
  bpm: number
  /** Pitch class 0-11. */
  root: number
  mode: 'major' | 'minor'
  /** How far from A440 the recording sits. */
  tuningCents: number
  loudnessDb: number
  durationSec: number
  /** 0..1, how sure the key detection was. */
  keyConfidence: number
}

export interface Compatibility {
  a: SongFacts
  b: SongFacts
  /** 0..1, higher is better. */
  score: number
  /** What B's tempo has to do to meet A. 1 means nothing. */
  speed: number
  /** Whether B should be played at half or double time to meet A. */
  timeShift: 'none' | 'half' | 'double'
  /** Semitones to move B, including its tuning offset. */
  transpose: number
  /** Plain sentences: why this pairing works, or does not. */
  notes: string[]
  /** One word for the UI. */
  verdict: 'great' | 'workable' | 'a stretch'
}

/** Stretching past this is audible, per the phase vocoder's own limits. */
const COMFORTABLE_STRETCH = 0.08
const AUDIBLE_STRETCH = 0.15

/**
 * How far B's tempo is from A's, allowing for half and double time.
 *
 * A 140 BPM track over a 70 BPM one is not a tempo problem — it is the same
 * tempo counted differently, and it is how half the mashups ever made work.
 */
export function tempoMatch(aBpm: number, bBpm: number): { speed: number; shift: Compatibility['timeShift'] } {
  // The shift names what happens to *B*: 'double' means B's own tempo is read
  // as twice what it says, which is what lets a 70 BPM record sit under a 140
  // BPM one with no stretching at all.
  const options: { speed: number; shift: Compatibility['timeShift'] }[] = [
    { speed: aBpm / bBpm, shift: 'none' },
    { speed: aBpm / (bBpm * 2), shift: 'double' },
    { speed: aBpm / (bBpm / 2), shift: 'half' },
  ]
  // The one that asks for the least stretching.
  return options.reduce((best, option) =>
    Math.abs(Math.log2(option.speed)) < Math.abs(Math.log2(best.speed)) ? option : best)
}

/** Distance round the circle of fifths, 0-6. */
export function fifthsDistance(a: number, b: number): number {
  // Position on the circle: each step of 7 semitones is one fifth.
  const positionOf = (pitchClass: number) => (pitchClass * 7) % 12
  const raw = Math.abs(positionOf(a) - positionOf(b))
  return Math.min(raw, 12 - raw)
}

export interface KeyRelation {
  /** Semitones to move B so it agrees with A. */
  transpose: number
  /** 0..1 — how well the keys get on once B has moved. */
  score: number
  note: string
}

/**
 * What B has to do to sit in A's key, and how happy that is.
 *
 * Moving a recording more than a few semitones makes it sound like a recording
 * that has been moved, so a pairing needing five semitones scores worse than
 * one needing one — even though both end up in the same key.
 */
export function keyRelation(a: SongFacts, b: SongFacts): KeyRelation {
  const sameMode = a.mode === b.mode
  // The relative major/minor shares every note, so it is free to treat as home.
  const relativeRoot = b.mode === 'minor' ? (b.root + 3) % 12 : (b.root + 9) % 12
  const candidates = sameMode
    ? [{ root: b.root, penalty: 0, how: 'same kind of key' }]
    : [
      { root: relativeRoot, penalty: 0, how: 'relative major/minor — same notes' },
      { root: b.root, penalty: 0.25, how: 'one is major and one is minor' },
    ]

  let best: KeyRelation = { transpose: 0, score: 0, note: '' }
  for (const candidate of candidates) {
    // Shortest way round: up 5 is the same as down 7.
    let semitones = (a.root - candidate.root + 12) % 12
    if (semitones > 6) semitones -= 12
    // Include the recording's own tuning offset, the way the lab already does.
    const withTuning = semitones - (b.tuningCents - a.tuningCents) / 100
    const distance = Math.abs(semitones)
    const fifths = fifthsDistance(a.root, candidate.root)
    // Near on the circle of fifths sounds related; far sounds like a key change.
    const score = Math.max(0, 1 - distance * 0.11 - fifths * 0.06 - candidate.penalty)
    if (score > best.score) {
      best = {
        transpose: Number(withTuning.toFixed(2)),
        score,
        note: distance === 0
          ? `both in ${NOTE_NAMES[a.root]} ${a.mode} — ${candidate.how}`
          : `${NOTE_NAMES[b.root]} ${b.mode} → ${NOTE_NAMES[a.root]} ${a.mode}, ${distance > 0 ? 'up' : 'down'} ${Math.abs(distance)} semitone${Math.abs(distance) === 1 ? '' : 's'}`,
      }
    }
  }
  return best
}

/** Score one pairing, with A as the track that sets the target. */
export function scorePair(a: SongFacts, b: SongFacts): Compatibility {
  const { speed, shift } = tempoMatch(a.bpm, b.bpm)
  const stretch = Math.abs(speed - 1)
  const key = keyRelation(a, b)
  const notes: string[] = []

  // Tempo carries the most weight: a mashup out of time is not a mashup.
  const tempoScore = stretch <= COMFORTABLE_STRETCH
    ? 1
    : stretch <= AUDIBLE_STRETCH
      ? 1 - (stretch - COMFORTABLE_STRETCH) / (AUDIBLE_STRETCH - COMFORTABLE_STRETCH) * 0.5
      : Math.max(0, 0.5 - (stretch - AUDIBLE_STRETCH))

  if (shift !== 'none') {
    notes.push(`${b.name} counted at ${shift} time — ${Math.round(b.bpm)} against ${Math.round(a.bpm)}`)
  }
  notes.push(stretch < 0.01
    ? 'the tempos already agree'
    : `${b.name} shifts ${(stretch * 100).toFixed(1)}%${stretch > AUDIBLE_STRETCH ? ', which will be audible' : ''}`)
  notes.push(key.note)

  if (a.keyConfidence < 0.5 || b.keyConfidence < 0.5) {
    notes.push('the key of one of these is a guess, so trust your ears over the number')
  }

  const confidence = Math.min(a.keyConfidence, b.keyConfidence)
  // Multiplied, not added. Adding lets a perfect key rescue a tempo that
  // cannot be matched — and a mashup out of time is not a mashup, however
  // well the keys get on. Tempo has to be able to veto.
  const score = tempoScore * (0.65 + 0.35 * key.score) * (0.85 + 0.15 * confidence)
  return {
    a, b, score, speed, timeShift: shift, transpose: key.transpose, notes,
    verdict: score > 0.8 ? 'great' : score > 0.55 ? 'workable' : 'a stretch',
  }
}

/**
 * Every pairing worth trying, best first.
 *
 * Both directions are scored, because which song sets the target changes the
 * answer: stretching the shorter, simpler record is usually the better trade,
 * and the two are not symmetric once tuning comes in.
 */
export function rankPairs(songs: SongFacts[]): Compatibility[] {
  const out: Compatibility[] = []
  for (const a of songs) {
    for (const b of songs) {
      if (a.id === b.id) continue
      out.push(scorePair(a, b))
    }
  }
  return out.sort((x, y) => y.score - x.score)
}

/**
 * Which stems to take from which song.
 *
 * The louder, denser record makes a better bed; the other gives up its vocal.
 * It is a rule of thumb rather than a law, which is why it is a suggestion the
 * user can override rather than something applied silently.
 */
export function suggestStems(pair: Compatibility): {
  a: 'full' | ('vocals' | 'drums' | 'bass' | 'other')[]
  b: ('vocals' | 'drums' | 'bass' | 'other')[]
  why: string
} {
  // A sets the grid, so A keeps the parts that define the groove.
  const bIsQuieter = pair.b.loudnessDb < pair.a.loudnessDb
  if (bIsQuieter) {
    return {
      a: ['drums', 'bass', 'other'],
      b: ['vocals'],
      why: `${pair.b.name} is the quieter record, so it gives up the vocal and ${pair.a.name} keeps the groove`,
    }
  }
  return {
    a: ['drums', 'bass'],
    b: ['vocals', 'other'],
    why: `${pair.b.name} is the fuller record, so it brings the vocal and the tune over ${pair.a.name}'s beat`,
  }
}
