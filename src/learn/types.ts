/**
 * The teaching layer.
 *
 * Every explanation here is paired with something you can hear, played by the
 * same synthesis engine the studio uses. That is the whole reason this lives
 * inside the app rather than in a document: you cannot read what a bowed
 * string sounds like, or what makes a minor chord sad. You have to hear the
 * two next to each other.
 *
 * Lessons are pure data. Nothing here touches the audio engine — the player
 * does that — so the curriculum can be checked for correctness in tests.
 */

/** A note inside a demo: MIDI pitch, start in beats, length in beats. */
export type DemoNote = [midi: number, startBeat: number, lengthBeats: number, velocity?: number]

export interface DemoVoice {
  /** Preset id from the instrument library. */
  preset: string
  notes: DemoNote[]
  /** 0..1, relative level for this voice. */
  gain?: number
  /** Sidechain duck depth, 0..1 — the only way to teach pumping is to hear it. */
  pump?: number
  /** How often that duck repeats, in beats. Defaults to every beat. */
  pumpBeats?: number
}

export interface Demo {
  /** Button label — say what will happen, e.g. "Hear a major third". */
  label: string
  /** One line under the button, when the label needs context. */
  note?: string
  bpm?: number
  voices: DemoVoice[]
}

/**
 * Two or more demos meant to be heard back to back. The UI lays them out as a
 * row so the comparison is one click apart, which is the point.
 */
export interface Comparison {
  prompt: string
  options: Demo[]
}

export type Block =
  | { kind: 'text'; body: string }
  /** A short aside — history, a bit of physics, a piece of trivia worth knowing. */
  | { kind: 'aside'; title: string; body: string }
  | { kind: 'demo'; demo: Demo }
  | { kind: 'compare'; comparison: Comparison }
  /** A concrete thing to go and do in the studio. */
  | { kind: 'try'; body: string; action?: TryAction }
  /** Terms introduced here, added to the glossary as the learner meets them. */
  | { kind: 'terms'; terms: { term: string; meaning: string }[] }

export type TryAction =
  | { kind: 'open-hum' }
  | { kind: 'open-mashup' }
  | { kind: 'open-ideas' }
  | { kind: 'open-instruments' }
  | { kind: 'load-demo-project' }

export interface Lesson {
  id: string
  title: string
  /** One line: what you will know after this. */
  summary: string
  blocks: Block[]
}

export interface Module {
  id: string
  title: string
  /** What this module is for, in one sentence. */
  summary: string
  /** Emoji used as the module's mark in the browser. */
  icon: string
  hue: number
  lessons: Lesson[]
}

// ---------------------------------------------------------------------------
// Helpers for writing lessons compactly
// ---------------------------------------------------------------------------

export const text = (body: string): Block => ({ kind: 'text', body })
export const aside = (title: string, body: string): Block => ({ kind: 'aside', title, body })
export const terms = (...pairs: [string, string][]): Block =>
  ({ kind: 'terms', terms: pairs.map(([term, meaning]) => ({ term, meaning })) })
export const tryThis = (body: string, action?: TryAction): Block => ({ kind: 'try', body, action })

export const demo = (
  label: string, preset: string, notes: DemoNote[],
  options: { note?: string; bpm?: number; gain?: number } = {},
): Block => ({
  kind: 'demo',
  demo: {
    label, note: options.note, bpm: options.bpm ?? 96,
    voices: [{ preset, notes, gain: options.gain }],
  },
})

export const layered = (
  label: string, voices: DemoVoice[],
  options: { note?: string; bpm?: number } = {},
): Block => ({
  kind: 'demo',
  demo: { label, note: options.note, bpm: options.bpm ?? 96, voices },
})

export const compare = (prompt: string, ...options: Demo[]): Block =>
  ({ kind: 'compare', comparison: { prompt, options } })

export const option = (
  label: string, preset: string, notes: DemoNote[],
  options: { note?: string; bpm?: number } = {},
): Demo => ({
  label, note: options.note, bpm: options.bpm ?? 96,
  voices: [{ preset, notes }],
})

// --- note-building shorthand ----------------------------------------------

/** A run of notes, one after another, each `length` beats long. */
export function sequence(midis: number[], length = 0.5, start = 0, velocity = 0.85): DemoNote[] {
  return midis.map((midi, i) => [midi, start + i * length, length * 0.92, velocity] as DemoNote)
}

/** Several notes sounding together. */
export function stack(midis: number[], start = 0, length = 2, velocity = 0.8): DemoNote[] {
  return midis.map((midi) => [midi, start, length, velocity] as DemoNote)
}

/** Chords in succession: each entry is a set of pitches. */
export function chordRun(chords: number[][], length = 2, start = 0, velocity = 0.75): DemoNote[] {
  return chords.flatMap((chord, i) => stack(chord, start + i * length, length * 0.95, velocity))
}
