/**
 * The starter groove. Four bars, five tracks, in A minor at 120 BPM — enough
 * to hear what the app sounds like and immediately start changing things.
 *
 * Built from the theory helpers rather than a data dump, so it stays readable
 * and is easy to riff on.
 */

import { DEFAULT_CHANNEL } from '../audio/engine'
import { getPreset } from '../audio/instruments'
import { createClip, createNote, createTrack, emptyProject, type Clip, type Note, type Project } from './project'
import { chordNotes, type ChordQuality } from './theory'

const BEATS_PER_BAR = 4
const BARS = 4
const LEN = BARS * BEATS_PER_BAR

/** i – VI – III – VII in A minor: the progression under half of modern pop. */
const PROGRESSION: { root: number; quality: ChordQuality }[] = [
  { root: 57, quality: 'min7' },  // Am7
  { root: 53, quality: 'maj7' },  // Fmaj7
  { root: 60, quality: 'maj7' },  // Cmaj7
  { root: 55, quality: 'dom7' },  // G7
]

function drumPattern(): Note[] {
  const notes: Note[] = []
  const push = (midi: number, beat: number, velocity: number) =>
    notes.push(createNote(midi, beat, 0.25, velocity))

  for (let bar = 0; bar < BARS; bar++) {
    const b = bar * BEATS_PER_BAR
    // Four on the floor, with the last bar opening up.
    for (let beat = 0; beat < 4; beat++) push(36, b + beat, beat === 0 ? 1 : 0.88)
    push(39, b + 1, 0.85)
    push(39, b + 3, 0.85)
    // Sixteenth hats with a light swing in the accents.
    for (let step = 0; step < 16; step++) {
      const at = b + step * 0.25
      if (step % 4 === 2) push(46, at, 0.55)          // offbeat open hat
      else push(42, at, step % 4 === 0 ? 0.6 : 0.34)  // closed hat
    }
    if (bar === 3) {
      push(38, b + 3.5, 0.7)
      push(38, b + 3.75, 0.85)
    }
  }
  return notes
}

function bassLine(): Note[] {
  const notes: Note[] = []
  PROGRESSION.forEach((chord, bar) => {
    const root = chord.root - 24
    const b = bar * BEATS_PER_BAR
    notes.push(createNote(root, b, 1.4, 0.95))
    notes.push(createNote(root, b + 1.5, 0.4, 0.7))
    notes.push(createNote(root, b + 2, 1.4, 0.9))
    notes.push(createNote(root + (bar % 2 === 0 ? 7 : 5), b + 3.5, 0.4, 0.75))
  })
  return notes
}

function padChords(): Note[] {
  const notes: Note[] = []
  PROGRESSION.forEach((chord, bar) => {
    for (const midi of chordNotes(chord.root, chord.quality, 1)) {
      notes.push(createNote(midi, bar * BEATS_PER_BAR, BEATS_PER_BAR - 0.05, 0.5))
    }
  })
  return notes
}

function arpeggio(): Note[] {
  const notes: Note[] = []
  PROGRESSION.forEach((chord, bar) => {
    const tones = chordNotes(chord.root + 12, chord.quality, 0)
    // Up-and-back over the chord tones, sixteenths.
    const shape = [0, 1, 2, 3, 2, 1, 2, 3]
    for (let step = 0; step < 8; step++) {
      const midi = tones[shape[step] % tones.length]
      notes.push(createNote(midi, bar * BEATS_PER_BAR + step * 0.5, 0.4, step % 4 === 0 ? 0.8 : 0.6))
    }
  })
  return notes
}

function melody(): Note[] {
  // A simple singable line over the changes — the kind of thing you'd hum.
  const line: [number, number, number][] = [
    [69, 0.5, 1.5], [72, 2, 1], [71, 3, 0.75],
    [69, 4.5, 1.5], [67, 6, 1.5],
    [72, 8.5, 1.5], [74, 10, 1], [72, 11, 0.75],
    [71, 12.5, 1], [69, 14, 1.75],
  ]
  return line.map(([midi, start, duration]) => createNote(midi, start, duration, 0.72))
}

export function demoProject(): Project {
  const project = emptyProject('First Sketch')
  project.bpm = 120
  project.key = { root: 9, scale: 'minor' } // A minor
  project.lengthBeats = LEN * 2

  const parts: { name: string; presetId: string; notes: Note[]; channel?: Partial<typeof DEFAULT_CHANNEL> }[] = [
    { name: 'Drums', presetId: 'kit-909', notes: drumPattern(), channel: { volume: 0.82, reverbSend: 0.05 } },
    { name: 'Bass', presetId: 'sub-bass', notes: bassLine(), channel: { volume: 0.8, reverbSend: 0.02 } },
    { name: 'Arp', presetId: 'pluck-synth', notes: arpeggio(), channel: { volume: 0.5, reverbSend: 0.22, delaySend: 0.28 } },
    { name: 'Pad', presetId: 'warm-pad', notes: padChords(), channel: { volume: 0.42, reverbSend: 0.4 } },
    { name: 'Melody', presetId: 'bansuri', notes: melody(), channel: { volume: 0.55, reverbSend: 0.35, delaySend: 0.2 } },
  ]

  const clips: Clip[] = []
  for (const part of parts) {
    const isDrum = part.presetId.startsWith('kit-')
    const track = createTrack({
      name: part.name,
      presetId: part.presetId,
      isDrum,
      color: getPreset(part.presetId).hue,
      channel: { ...DEFAULT_CHANNEL, ...part.channel },
    })
    project.tracks.push(track)
    clips.push(createClip(track.id, {
      name: part.name,
      startBeat: 0,
      contentBeats: LEN,
      lengthBeats: LEN * 2,
      notes: part.notes,
    }))
  }

  project.clips = clips
  return project
}
