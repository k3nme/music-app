/**
 * Plain-language explanations for the words the interface uses.
 *
 * The studio is full of terms that are obvious once you know them and opaque
 * until then — warp, send, velocity, semitone, stem. Rather than removing them
 * (they are the words everyone else uses, so learning them is useful), each
 * one explains itself where it appears and links to the lesson that covers it.
 *
 * Definitions from the curriculum are pulled in automatically so the two can
 * never drift apart.
 */

import { allTerms } from './curriculum'

export interface GlossaryEntry {
  term: string
  meaning: string
  /** Lesson to open for the full explanation, if there is one. */
  lessonId?: string
}

/** Terms that only exist because this is software, not because music has them. */
const INTERFACE_TERMS: GlossaryEntry[] = [
  { term: 'Track', meaning: 'One instrument or one audio recording, on its own row.' },
  { term: 'Clip', meaning: 'A block of music on the timeline. Drag it to move it, drag its right edge to repeat it.' },
  { term: 'Loop', meaning: 'Play a section over and over. The purple band at the top of the timeline sets where.' },
  { term: 'Mute', meaning: 'Silence this track.' },
  { term: 'Solo', meaning: 'Silence everything else. The quickest way to hear what one part is doing.' },
  { term: 'Metronome', meaning: 'A click on every beat, to play or sing in time against.' },
  { term: 'Grid', meaning: 'The invisible lines notes snap to. 1/4 is one note per beat, 1/16 is four.' },
  { term: 'Snap', meaning: 'Pull edits onto the grid so timing stays tidy.' },
  {
    term: 'Quantise',
    meaning: 'Move notes onto the grid. Full strength sounds mechanical; around 80% fixes the sloppiness and keeps the feel.',
  },
  { term: 'Piano roll', meaning: 'The note editor. Higher up the screen means a higher note; further right means later.' },
  { term: 'Pan', meaning: 'Place a sound towards the left or right speaker.', lessonId: 'arrange-mixing' },
  { term: 'Send', meaning: 'How much of this track is fed to a shared effect like reverb or delay.' },
  { term: 'Drive', meaning: 'Deliberate distortion. A little adds warmth and grit; a lot is an effect in itself.' },
  { term: 'Tone', meaning: 'Rolls off the high frequencies. Use it to stop two parts fighting.', lessonId: 'arrange-mixing' },
  { term: 'Fader', meaning: 'A volume slider.' },
  { term: 'Master', meaning: 'Where every track ends up mixed together, just before it reaches your ears.' },
  { term: 'Delay', meaning: 'An echo, timed to the beat.' },
  { term: 'Warp', meaning: 'Stretch recorded audio to match the song tempo without changing its pitch.' },
  { term: 'Repitch', meaning: 'Speed audio up or down and let the pitch move with it, the way a record player does.' },
  { term: 'Transpose', meaning: 'Move something up or down in pitch, keeping everything else the same.' },
  {
    term: 'Semitone',
    meaning: 'The smallest step in Western music — one key to the very next key.',
    lessonId: 'notes-twelve',
  },
  {
    term: 'Cents',
    meaning: 'A hundredth of a semitone. Used for tuning differences too small to be a note.',
  },
  {
    term: 'Stem',
    meaning: 'One layer of a finished song pulled out on its own — the vocal, the drums, the bass.',
  },
  { term: 'Bounce / render', meaning: 'Turn the whole arrangement into a single audio file.' },
  { term: 'Source tempo', meaning: 'The speed a recording was originally made at. Everything else is worked out from it.' },
  {
    term: 'Concert pitch',
    meaning: 'The agreed reference every instrument tunes to (A = 440 Hz). Plenty of recordings sit slightly off it.',
  },
  { term: 'Velocity', meaning: 'How hard a note is played. Alt-drag a note up or down to change it.', lessonId: 'sound-loudness' },
]

let cache: GlossaryEntry[] | null = null

export function glossary(): GlossaryEntry[] {
  if (cache) return cache
  const fromLessons = allTerms().map(({ term, meaning, lessonId }) => ({ term, meaning, lessonId }))
  const seen = new Set(fromLessons.map((entry) => entry.term.toLowerCase()))
  const merged = [
    ...fromLessons,
    ...INTERFACE_TERMS.filter((entry) => !seen.has(entry.term.toLowerCase())),
  ]
  cache = merged.sort((a, b) => a.term.localeCompare(b.term))
  return cache
}

/**
 * Look up a term. Matches loosely — "BPM" finds "Tempo / BPM", "reverb" finds
 * "Reverb" — so callers can pass the word as it appears in the interface.
 */
export function explain(term: string): GlossaryEntry | null {
  const needle = term.trim().toLowerCase()
  if (!needle) return null
  const entries = glossary()
  return (
    entries.find((entry) => entry.term.toLowerCase() === needle) ??
    entries.find((entry) =>
      entry.term.toLowerCase().split(/\s*\/\s*/).includes(needle)) ??
    entries.find((entry) => entry.term.toLowerCase().startsWith(needle)) ??
    null
  )
}

export function searchGlossary(query: string): GlossaryEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return glossary()
  return glossary().filter((entry) =>
    entry.term.toLowerCase().includes(needle) || entry.meaning.toLowerCase().includes(needle))
}
