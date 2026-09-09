/**
 * Key detection from a hummed melody.
 *
 * Without this, a take gets snapped into whatever key the project happens to
 * be in — so humming in A minor over a C-minor default quietly bends every
 * note. Detecting the key first means "snap to key" helps instead of fighting.
 *
 * The method is a weighted pitch-class profile compared against each candidate
 * scale: notes in the scale add their weight, notes outside subtract, and the
 * tonic and fifth get a bonus because that's what actually establishes a key.
 */

import { SCALES, type ScaleId } from './theory'

export interface KeyGuess {
  root: number
  scale: ScaleId
  /** 0..1 — how much better this fit than the alternatives. */
  confidence: number
}

/** Scales worth guessing between. Ordered by how common they are. */
const CANDIDATES: ScaleId[] = [
  'major', 'minor', 'pentaMinor', 'pentaMajor', 'dorian', 'mixolydian',
  'harmonicMinor', 'blues', 'phrygian', 'lydian', 'bhairav', 'yaman', 'kafi', 'phrygianDom',
]

/**
 * Scales with fewer notes fit anything, so they need a handicap — otherwise a
 * pentatonic always beats the major scale it's a subset of.
 */
const sizePenalty = (steps: number) => 1 - (7 - steps) * 0.035

export function detectKey(
  notes: { midi: number; duration: number; velocity?: number }[],
): KeyGuess | null {
  if (notes.length < 3) return null

  const weights = new Array(12).fill(0)
  let total = 0
  for (const note of notes) {
    // Long, loud notes say more about the key than passing sixteenths.
    const weight = Math.max(0.05, note.duration) * (0.5 + (note.velocity ?? 0.8) * 0.5)
    weights[((Math.round(note.midi) % 12) + 12) % 12] += weight
    total += weight
  }
  if (total <= 0) return null
  for (let i = 0; i < 12; i++) weights[i] /= total

  // The first and last notes of a phrase are usually the tonic or the fifth.
  const first = ((Math.round(notes[0].midi) % 12) + 12) % 12
  const last = ((Math.round(notes[notes.length - 1].midi) % 12) + 12) % 12

  const scored: { root: number; scale: ScaleId; score: number }[] = []
  for (const scale of CANDIDATES) {
    const steps = SCALES[scale].steps
    for (let root = 0; root < 12; root++) {
      const member = new Set(steps.map((s) => (root + s) % 12))
      let score = 0
      for (let pc = 0; pc < 12; pc++) {
        score += member.has(pc) ? weights[pc] : -weights[pc] * 1.35
      }
      score *= sizePenalty(steps.length)
      score += weights[root] * 0.55                       // tonic presence
      score += weights[(root + 7) % 12] * 0.2             // dominant presence
      if (last === root) score += 0.12                    // phrases tend to land home
      if (first === root) score += 0.06
      scored.push({ root, scale, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  // Compare against the best guess in a *different* key, not a relative mode
  // of the same one — those are genuinely ambiguous and not worth splitting.
  const rival = scored.find((s) => s.root !== best.root) ?? scored[1]
  const margin = best.score - (rival?.score ?? 0)

  return {
    root: best.root,
    scale: best.scale,
    confidence: Math.max(0, Math.min(1, margin * 3.2)),
  }
}
