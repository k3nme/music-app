/**
 * Note names, scales, chords and the pitch <-> frequency plumbing.
 * MIDI note numbers are the common currency everywhere in Overtone:
 * 60 = middle C, 69 = A440.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const A4_MIDI = 69

/** Concert pitch. Exposed so alternate tunings (432, historical) can be added later. */
export let referenceHz = 440

export function midiToFreq(midi: number, detuneCents = 0): number {
  return referenceHz * Math.pow(2, (midi - A4_MIDI + detuneCents / 100) / 12)
}

export function freqToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / referenceHz)
}

export function midiToName(midi: number): string {
  const n = Math.round(midi)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((Math.round(midi) % 12) + 12) % 12)
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/**
 * Semitone offsets from the root. Deliberately broad: the point of Overtone is
 * that a raga and a blues scale are equally first-class.
 */
export const SCALES: Record<string, { label: string; steps: number[]; group: string }> = {
  major:          { label: 'Major',            steps: [0, 2, 4, 5, 7, 9, 11],     group: 'Common' },
  minor:          { label: 'Natural minor',    steps: [0, 2, 3, 5, 7, 8, 10],     group: 'Common' },
  harmonicMinor:  { label: 'Harmonic minor',   steps: [0, 2, 3, 5, 7, 8, 11],     group: 'Common' },
  melodicMinor:   { label: 'Melodic minor',    steps: [0, 2, 3, 5, 7, 9, 11],     group: 'Common' },
  pentaMajor:     { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9],            group: 'Common' },
  pentaMinor:     { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10],           group: 'Common' },
  blues:          { label: 'Blues',            steps: [0, 3, 5, 6, 7, 10],        group: 'Common' },
  dorian:         { label: 'Dorian',           steps: [0, 2, 3, 5, 7, 9, 10],     group: 'Modes' },
  phrygian:       { label: 'Phrygian',         steps: [0, 1, 3, 5, 7, 8, 10],     group: 'Modes' },
  lydian:         { label: 'Lydian',           steps: [0, 2, 4, 6, 7, 9, 11],     group: 'Modes' },
  mixolydian:     { label: 'Mixolydian',       steps: [0, 2, 4, 5, 7, 9, 10],     group: 'Modes' },
  locrian:        { label: 'Locrian',          steps: [0, 1, 3, 5, 6, 8, 10],     group: 'Modes' },
  phrygianDom:    { label: 'Phrygian dominant',steps: [0, 1, 4, 5, 7, 8, 10],     group: 'World' },
  hungarianMinor: { label: 'Hungarian minor',  steps: [0, 2, 3, 6, 7, 8, 11],     group: 'World' },
  bhairav:        { label: 'Bhairav',          steps: [0, 1, 4, 5, 7, 8, 11],     group: 'World' },
  yaman:          { label: 'Yaman',            steps: [0, 2, 4, 6, 7, 9, 11],     group: 'World' },
  bhupali:        { label: 'Bhupali',          steps: [0, 2, 4, 7, 9],            group: 'World' },
  kafi:           { label: 'Kafi',             steps: [0, 2, 3, 5, 7, 9, 10],     group: 'World' },
  hirajoshi:      { label: 'Hirajoshi',        steps: [0, 2, 3, 7, 8],            group: 'World' },
  inSen:          { label: 'In sen',           steps: [0, 1, 5, 7, 10],           group: 'World' },
  arabic:         { label: 'Arabic (Hijaz)',   steps: [0, 1, 4, 5, 7, 8, 11],     group: 'World' },
  wholeTone:      { label: 'Whole tone',       steps: [0, 2, 4, 6, 8, 10],        group: 'Colour' },
  chromatic:      { label: 'Chromatic (off)',  steps: [0,1,2,3,4,5,6,7,8,9,10,11],group: 'Colour' },
}

export type ScaleId = keyof typeof SCALES

/** Every MIDI pitch class allowed by a key. */
export function scalePitchClasses(root: number, scale: ScaleId): Set<number> {
  const steps = SCALES[scale]?.steps ?? SCALES.chromatic.steps
  return new Set(steps.map((s) => (((root + s) % 12) + 12) % 12))
}

export function isInScale(midi: number, root: number, scale: ScaleId): boolean {
  return scalePitchClasses(root, scale).has((((Math.round(midi) % 12) + 12) % 12))
}

/**
 * Snap a pitch to the nearest note in the key. Ties resolve downward, which
 * sounds more natural for sung input (people scoop up to notes, so the lower
 * neighbour is usually the intended one).
 */
export function snapToScale(midi: number, root: number, scale: ScaleId): number {
  const allowed = scalePitchClasses(root, scale)
  if (allowed.size === 0) return Math.round(midi)
  const target = Math.round(midi)
  for (let d = 0; d <= 6; d++) {
    const down = target - d
    if (allowed.has(((down % 12) + 12) % 12)) return down
    const up = target + d
    if (allowed.has(((up % 12) + 12) % 12)) return up
  }
  return target
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export const CHORD_SHAPES: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  six: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
}

export type ChordQuality = keyof typeof CHORD_SHAPES

export function chordNotes(rootMidi: number, quality: ChordQuality, inversion = 0): number[] {
  const shape = CHORD_SHAPES[quality] ?? CHORD_SHAPES.maj
  const notes = shape.map((s) => rootMidi + s)
  for (let i = 0; i < inversion; i++) notes.push(notes.shift()! + 12)
  return notes
}

/** Roman-numeral qualities for the seven diatonic degrees of a major key. */
const MAJOR_DEGREE_QUALITIES: ChordQuality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']
const MINOR_DEGREE_QUALITIES: ChordQuality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']

/** Build the diatonic triad on a scale degree (0-indexed) of a key. */
export function diatonicChord(
  root: number,
  scale: ScaleId,
  degree: number,
  seventh = false,
): { root: number; quality: ChordQuality } {
  const steps = SCALES[scale]?.steps ?? SCALES.major.steps
  const d = ((degree % steps.length) + steps.length) % steps.length
  const chordRoot = root + steps[d] + 12 * Math.floor(degree / steps.length)
  const minorish = [0, 3, 5, 8, 10].includes(steps[1] === 1 ? 3 : steps[2])
  const table = minorish ? MINOR_DEGREE_QUALITIES : MAJOR_DEGREE_QUALITIES
  let quality = table[d % 7] ?? 'maj'
  if (seventh) {
    if (quality === 'maj') quality = d === 4 ? 'dom7' : 'maj7'
    else if (quality === 'min') quality = 'min7'
    else if (quality === 'dim') quality = 'min7b5'
  }
  return { root: chordRoot, quality }
}

/** Common progressions expressed as scale degrees, for the chord helper. */
export const PROGRESSIONS: { id: string; label: string; degrees: number[] }[] = [
  { id: 'pop',      label: 'I–V–vi–IV (pop)',        degrees: [0, 4, 5, 3] },
  { id: 'sad',      label: 'vi–IV–I–V (anthem)',     degrees: [5, 3, 0, 4] },
  { id: 'canon',    label: 'I–V–vi–iii–IV (canon)',  degrees: [0, 4, 5, 2, 3] },
  { id: 'jazz',     label: 'ii–V–I (jazz)',          degrees: [1, 4, 0] },
  { id: 'blues',    label: 'I–IV–I–V (blues)',       degrees: [0, 3, 0, 4] },
  { id: 'andalus',  label: 'i–VII–VI–V (andalusian)',degrees: [0, 6, 5, 4] },
  { id: 'edm',      label: 'vi–IV–V–V (build)',      degrees: [5, 3, 4, 4] },
  { id: 'lofi',     label: 'ii–V–iii–vi (lo-fi)',    degrees: [1, 4, 2, 5] },
]
