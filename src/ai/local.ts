/**
 * The local provider: musical assistance from theory and pattern libraries
 * rather than a model. It runs instantly, offline, and its reasoning is
 * inspectable — which for "what chords fit this melody" is often enough.
 *
 * Where a model would genuinely do better (style transfer, "make it sound
 * more like this reference", stem separation), the seam in `types.ts` is
 * where that plugs in.
 */

import { getPreset } from '../audio/instruments'
import { DEFAULT_CHANNEL } from '../audio/engine'
import { uid } from '../lib/id'
import {
  createClip, createNote, createTrack, type Clip, type Note, type Project,
} from '../music/project'
import {
  chordNotes, diatonicChord, NOTE_NAMES, PROGRESSIONS, SCALES, snapToScale,
  type ChordQuality,
} from '../music/theory'
import type { Capability, MusicalContext, MusicProvider, Suggestion } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add a track and a clip to a project, without touching the original. */
function withPart(
  project: Project,
  spec: { name: string; presetId: string; notes: Note[]; lengthBeats: number; channel?: Partial<typeof DEFAULT_CHANNEL> },
): Project {
  const preset = getPreset(spec.presetId)
  const track = createTrack({
    name: spec.name,
    presetId: spec.presetId,
    isDrum: preset.engine === 'drum',
    color: preset.hue,
    channel: { ...DEFAULT_CHANNEL, ...spec.channel },
  })
  const clip = createClip(track.id, {
    name: spec.name,
    startBeat: 0,
    contentBeats: spec.lengthBeats,
    lengthBeats: spec.lengthBeats,
    notes: spec.notes,
  })
  return {
    ...project,
    tracks: [...project.tracks, track],
    clips: [...project.clips, clip],
    lengthBeats: Math.max(project.lengthBeats, spec.lengthBeats),
    updatedAt: Date.now(),
  }
}

/** Every melodic note in the project, in absolute song beats. */
function melodicNotes(project: Project): { midi: number; start: number; duration: number; velocity: number }[] {
  const drumTracks = new Set(project.tracks.filter((t) => t.isDrum).map((t) => t.id))
  const out: { midi: number; start: number; duration: number; velocity: number }[] = []
  for (const clip of project.clips) {
    if (drumTracks.has(clip.trackId)) continue
    const repeats = Math.max(1, Math.round(clip.lengthBeats / Math.max(0.001, clip.contentBeats)))
    for (let r = 0; r < repeats; r++) {
      for (const note of clip.notes) {
        out.push({
          midi: note.midi,
          start: clip.startBeat + r * clip.contentBeats + note.start,
          duration: note.duration,
          velocity: note.velocity,
        })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** How many bars of material there are, clamped to something loopable. */
function barsInUse(project: Project): number {
  const end = project.clips.reduce((m, c) => Math.max(m, c.startBeat + c.lengthBeats), 0)
  const bars = Math.round(end / project.beatsPerBar)
  return Math.max(2, Math.min(8, bars || 4))
}

function chordLabel(root: number, quality: ChordQuality): string {
  const suffix: Partial<Record<ChordQuality, string>> = {
    maj: '', min: 'm', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4',
    maj7: 'maj7', min7: 'm7', dom7: '7', min7b5: 'm7♭5', dim7: 'dim7',
    maj9: 'maj9', min9: 'm9', add9: 'add9', six: '6', min6: 'm6',
  }
  return `${NOTE_NAMES[((root % 12) + 12) % 12]}${suffix[quality] ?? quality}`
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

/**
 * Pick a chord per bar by scoring each diatonic degree against the melody
 * notes in that bar: a chord tone scores its note's duration, a non-chord
 * tone costs a little. Simple, and it agrees with what most people would
 * choose by ear.
 */
function fitChords(project: Project, bars: number): { root: number; quality: ChordQuality }[] {
  const notes = melodicNotes(project)
  const { root, scale } = project.key
  const degrees = SCALES[scale]?.steps.length ?? 7

  return Array.from({ length: bars }, (_, bar) => {
    const from = bar * project.beatsPerBar
    const to = from + project.beatsPerBar
    const inBar = notes.filter((n) => n.start < to && n.start + n.duration > from)

    let best: { root: number; quality: ChordQuality; score: number } | null = null
    for (let degree = 0; degree < degrees; degree++) {
      const chord = diatonicChord(root, scale, degree, inBar.length > 0)
      const tones = new Set(chordNotes(chord.root, chord.quality).map((m) => ((m % 12) + 12) % 12))
      let score = 0
      for (const note of inBar) {
        const pc = ((note.midi % 12) + 12) % 12
        const weight = Math.min(note.duration, project.beatsPerBar) * (0.6 + note.velocity * 0.4)
        score += tones.has(pc) ? weight : -weight * 0.45
      }
      // With nothing to fit, lean on the tonic and the usual suspects.
      if (inBar.length === 0) score = degree === 0 ? 1 : degree === 5 || degree === 3 ? 0.6 : 0.2
      // A bar-one chord that isn't the tonic needs to earn it.
      if (bar === 0 && degree !== 0) score -= 0.15
      if (!best || score > best.score) best = { ...chord, score }
    }
    return { root: best!.root, quality: best!.quality }
  })
}

function chordSuggestions(context: MusicalContext): Suggestion[] {
  const { project } = context
  const bars = barsInUse(project)
  const beatsPerBar = project.beatsPerBar
  const suggestions: Suggestion[] = []

  const build = (
    progression: { root: number; quality: ChordQuality }[],
    name: string,
    detail: string,
    presetId: string,
  ): Suggestion => ({
    id: uid('sug'),
    capability: 'chords',
    title: progression.map((c) => chordLabel(c.root, c.quality)).join(' – '),
    detail,
    apply: (p) => withPart(p, {
      name,
      presetId,
      lengthBeats: progression.length * beatsPerBar,
      channel: { volume: 0.45, reverbSend: 0.32 },
      notes: progression.flatMap((chord, bar) =>
        // Voiced in first inversion around middle C, which keeps the
        // movement smooth instead of jumping around the keyboard.
        chordNotes(chord.root, chord.quality, 1).map((midi) =>
          createNote(midi, bar * beatsPerBar, beatsPerBar - 0.05, 0.55),
        ),
      ),
    }),
  })

  const fitted = fitChords(project, bars)
  suggestions.push(build(
    fitted, 'Chords', 'Fitted to the notes already written, bar by bar.', 'warm-pad',
  ))

  // Two well-worn progressions in the project's key, as alternatives.
  for (const shape of PROGRESSIONS.slice(0, 3)) {
    const progression = shape.degrees.map((degree) =>
      diatonicChord(project.key.root, project.key.scale, degree, false),
    )
    suggestions.push(build(progression, 'Chords', shape.label, 'rhodes'))
  }
  return suggestions.slice(0, 4)
}

// ---------------------------------------------------------------------------
// Bass
// ---------------------------------------------------------------------------

/** Chord roots per bar, read back from whichever track plays chords. */
function harmonyRoots(project: Project, bars: number): number[] {
  const notes = melodicNotes(project)
  return Array.from({ length: bars }, (_, bar) => {
    const from = bar * project.beatsPerBar
    const to = from + project.beatsPerBar
    const inBar = notes.filter((n) => n.start >= from - 0.01 && n.start < to)
    if (inBar.length === 0) return project.key.root + 48
    // The lowest note that starts in the bar is almost always the root.
    return Math.min(...inBar.map((n) => n.midi))
  })
}

function bassSuggestions(context: MusicalContext): Suggestion[] {
  const { project } = context
  const bars = barsInUse(project)
  const beatsPerBar = project.beatsPerBar
  const roots = harmonyRoots(project, bars).map((midi) => {
    let m = midi
    while (m > 45) m -= 12
    while (m < 28) m += 12
    return m
  })

  const patterns: { name: string; detail: string; presetId: string; make(root: number, bar: number): Note[] }[] = [
    {
      name: 'Root bass', detail: 'One long root note per bar — stays out of the way.',
      presetId: 'sub-bass',
      make: (root, bar) => [createNote(root, bar * beatsPerBar, beatsPerBar - 0.1, 0.9)],
    },
    {
      name: 'Driving bass', detail: 'Eighth-note pulse under the chords, club-ready.',
      presetId: 'bass-guitar',
      make: (root, bar) => Array.from({ length: beatsPerBar * 2 }, (_, i) =>
        createNote(root, bar * beatsPerBar + i * 0.5, 0.4, i % 2 === 0 ? 0.9 : 0.65)),
    },
    {
      name: 'Walking bass', detail: 'Steps through the scale between roots — jazz and lo-fi.',
      presetId: 'upright-bass',
      make: (root, bar) => [0, 1, 2, 3].map((beat) =>
        createNote(
          beat === 0 ? root : snapToScale(root + [0, 3, 5, 7][beat], project.key.root, project.key.scale),
          bar * beatsPerBar + beat, 0.85, beat === 0 ? 0.9 : 0.7,
        )),
    },
  ]

  return patterns.map((pattern) => ({
    id: uid('sug'),
    capability: 'bass' as Capability,
    title: pattern.name,
    detail: pattern.detail,
    apply: (p: Project) => withPart(p, {
      name: 'Bass',
      presetId: pattern.presetId,
      lengthBeats: bars * beatsPerBar,
      channel: { volume: 0.8, reverbSend: 0.03 },
      notes: roots.flatMap((root, bar) => pattern.make(root, bar)),
    }),
  }))
}

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

interface DrumStyle {
  name: string
  detail: string
  kit: string
  bpmHint: [number, number]
  /** Steps are sixteenths: [piece midi, step index, velocity]. */
  steps: [number, number, number][]
}

const K = 36, S = 38, CL = 39, HC = 42, HO = 46

const DRUM_STYLES: DrumStyle[] = [
  {
    name: 'Four on the floor', detail: 'House and progressive — kick every beat, offbeat hats.',
    kit: 'kit-909', bpmHint: [118, 132],
    steps: [
      ...[0, 4, 8, 12].map((s) => [K, s, 1] as [number, number, number]),
      ...[4, 12].map((s) => [CL, s, 0.85] as [number, number, number]),
      ...[2, 6, 10, 14].map((s) => [HO, s, 0.5] as [number, number, number]),
      ...[0, 4, 8, 12].map((s) => [HC, s, 0.4] as [number, number, number]),
    ],
  },
  {
    name: 'Boom bap', detail: 'Classic hip-hop swing — kick on 1 and the and of 2.',
    kit: 'kit-lofi', bpmHint: [80, 96],
    steps: [
      [K, 0, 1], [K, 6, 0.9], [K, 10, 0.75],
      [S, 4, 0.9], [S, 12, 0.9],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [HC, s, s % 4 === 0 ? 0.55 : 0.35] as [number, number, number]),
    ],
  },
  {
    name: 'Trap', detail: 'Half-time snare with rolling hats.',
    kit: 'kit-trap', bpmHint: [130, 160],
    steps: [
      [K, 0, 1], [K, 3, 0.8], [K, 8, 0.95], [K, 11, 0.7],
      [S, 8, 0.95],
      ...Array.from({ length: 16 }, (_, s) => [HC, s, s % 4 === 0 ? 0.55 : 0.32] as [number, number, number]),
      [HC, 13, 0.4], [HC, 14, 0.45], [HC, 15, 0.5],
    ],
  },
  {
    name: 'Rock beat', detail: 'Straight backbeat on a live kit.',
    kit: 'kit-acoustic', bpmHint: [90, 150],
    steps: [
      [K, 0, 1], [K, 8, 0.95], [K, 10, 0.7],
      [S, 4, 0.95], [S, 12, 0.95],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [HC, s, s % 4 === 0 ? 0.6 : 0.4] as [number, number, number]),
    ],
  },
  {
    name: 'Teental (tabla)', detail: 'A 16-beat North Indian cycle — Dha Dhin Dhin Dha.',
    kit: 'kit-tabla', bpmHint: [60, 140],
    steps: [
      [45, 0, 1], [41, 2, 0.75], [41, 4, 0.75], [45, 6, 0.9],
      [45, 8, 0.85], [41, 10, 0.75], [40, 12, 0.8], [36, 14, 0.7],
      [43, 1, 0.4], [43, 5, 0.4], [43, 9, 0.4], [43, 13, 0.4],
    ],
  },
  {
    name: 'Amapiano', detail: 'Log drums where the bass line would be. South Africa.',
    kit: 'kit-amapiano', bpmHint: [108, 118],
    steps: [
      [K, 0, 1], [K, 6, 0.9], [K, 12, 0.95],
      [40, 8, 1], [43, 10, 0.8], [41, 14, 0.9],
      [39, 4, 0.6],
      ...[2, 6, 10, 14].map((s) => [70, s, 0.45] as [number, number, number]),
      ...[0, 8].map((s) => [72, s, 0.3] as [number, number, number]),
    ],
  },
  {
    name: 'Afrobeats', detail: 'The Lagos pop groove — rolling kick, rim, shakers.',
    kit: 'kit-afrobeats', bpmHint: [98, 112],
    steps: [
      [K, 0, 1], [K, 6, 0.9], [K, 10, 0.85],
      [37, 4, 0.7], [37, 12, 0.7],
      [40, 14, 0.75], [41, 7, 0.6], [43, 11, 0.6],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [70, s, s % 4 === 0 ? 0.5 : 0.35] as [number, number, number]),
    ],
  },
  {
    name: 'Afro house', detail: 'Four to the floor under layered African percussion.',
    kit: 'kit-afrohouse', bpmHint: [118, 128],
    steps: [
      ...[0, 4, 8, 12].map((s) => [K, s, 1] as [number, number, number]),
      ...[4, 12].map((s) => [CL, s, 0.8] as [number, number, number]),
      ...[2, 6, 10, 14].map((s) => [HO, s, 0.5] as [number, number, number]),
      [41, 3, 0.7], [43, 7, 0.7], [40, 11, 0.75], [43, 15, 0.7],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [70, s, 0.35] as [number, number, number]),
    ],
  },
  {
    name: 'Techno', detail: 'Hard, dry and mechanical — the Berlin version of four on the floor.',
    kit: 'kit-techno', bpmHint: [128, 145],
    steps: [
      ...[0, 4, 8, 12].map((s) => [K, s, 1] as [number, number, number]),
      [CL, 12, 0.75], [70, 6, 0.4], [70, 14, 0.45],
      ...[2, 6, 10, 14].map((s) => [HO, s, 0.45] as [number, number, number]),
      ...[1, 3, 5, 7, 9, 11, 13, 15].map((s) => [HC, s, 0.3] as [number, number, number]),
    ],
  },
  {
    name: 'Breakbeat', detail: 'The funk break jungle and drum & bass were built on.',
    kit: 'kit-breakbeat', bpmHint: [160, 180],
    steps: [
      [K, 0, 1], [K, 10, 0.9],
      [S, 4, 0.95], [S, 12, 0.95], [40, 7, 0.4], [40, 14, 0.45],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [HC, s, s % 4 === 0 ? 0.55 : 0.35] as [number, number, number]),
      [HO, 6, 0.5],
    ],
  },
  {
    name: 'Reggaeton', detail: 'The dembow — one syncopated snare figure, repeated.',
    kit: 'kit-reggaeton', bpmHint: [88, 100],
    steps: [
      ...[0, 4, 8, 12].map((s) => [K, s, 1] as [number, number, number]),
      [S, 3, 0.9], [S, 6, 0.85], [S, 11, 0.9], [S, 14, 0.85],
      ...[2, 6, 10, 14].map((s) => [HC, s, 0.4] as [number, number, number]),
      ...[0, 8].map((s) => [70, s, 0.35] as [number, number, number]),
    ],
  },
  {
    name: 'Latin groove', detail: 'Congas and clave over a steady pulse.',
    kit: 'kit-latin', bpmHint: [90, 130],
    steps: [
      [36, 0, 0.9], [38, 2, 0.7], [40, 3, 0.8], [38, 6, 0.7],
      [36, 8, 0.9], [38, 10, 0.7], [40, 11, 0.8], [38, 14, 0.7],
      [47, 0, 0.6], [47, 3, 0.6], [47, 6, 0.6], [47, 10, 0.6], [47, 12, 0.6],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [70, s, 0.3] as [number, number, number]),
    ],
  },
]

function drumSuggestions(context: MusicalContext): Suggestion[] {
  const { project } = context
  const bars = Math.min(4, barsInUse(project))
  const beatsPerBar = project.beatsPerBar

  // Offer whatever suits the project tempo first, but keep all of them.
  const ordered = [...DRUM_STYLES].sort((a, b) => fitScore(b) - fitScore(a))
  function fitScore(style: DrumStyle) {
    const [lo, hi] = style.bpmHint
    return project.bpm >= lo && project.bpm <= hi ? 1 : -Math.min(Math.abs(project.bpm - lo), Math.abs(project.bpm - hi)) / 100
  }

  return ordered.map((style) => ({
    id: uid('sug'),
    capability: 'drums' as Capability,
    title: style.name,
    detail: `${style.detail} · ${getPreset(style.kit).name}`,
    apply: (p: Project) => withPart(p, {
      name: 'Drums',
      presetId: style.kit,
      lengthBeats: bars * beatsPerBar,
      channel: { volume: 0.85, reverbSend: 0.05 },
      notes: Array.from({ length: bars }).flatMap((_, bar) =>
        style.steps.map(([midi, step, velocity]) =>
          createNote(midi, bar * beatsPerBar + step * 0.25, 0.25, velocity),
        ),
      ),
    }),
  }))
}

// ---------------------------------------------------------------------------
// Harmony
// ---------------------------------------------------------------------------

function harmonySuggestions(context: MusicalContext): Suggestion[] {
  const { project, clipId } = context
  const clip = project.clips.find((c) => c.id === clipId)
  const track = clip && project.tracks.find((t) => t.id === clip.trackId)
  if (!clip || !track || track.isDrum || clip.notes.length === 0) return []

  const make = (steps: number, name: string, detail: string): Suggestion => ({
    id: uid('sug'),
    capability: 'harmony',
    title: name,
    detail,
    apply: (p) => {
      const source = p.clips.find((c) => c.id === clip.id)
      if (!source) return p
      const preset = getPreset(track.presetId)
      const notes = source.notes.map((note) => {
        // Move by scale steps, not semitones, so the harmony stays in key.
        const raw = note.midi + steps
        const snapped = snapToScale(raw, p.key.root, p.key.scale)
        return createNote(
          Math.max(preset.range[0], Math.min(preset.range[1], snapped)),
          note.start, note.duration, note.velocity * 0.75,
        )
      })
      return withPart(p, {
        name: `${track.name} harmony`,
        presetId: track.presetId,
        lengthBeats: source.contentBeats,
        channel: { volume: 0.5, reverbSend: 0.25 },
        notes,
      })
    },
  })

  return [
    make(-3, 'A third below', 'The classic second voice — sits under the tune without competing.'),
    make(4, 'A third above', 'Brighter and more prominent. Good for a chorus lift.'),
    make(-12, 'An octave below', 'Thickens the line without changing the harmony.'),
    make(7, 'A fifth above', 'Open and slightly medieval. Works well on synths and brass.'),
  ]
}

// ---------------------------------------------------------------------------
// Arrangement
// ---------------------------------------------------------------------------

function arrangementSuggestions(context: MusicalContext): Suggestion[] {
  const { project } = context
  const out: Suggestion[] = []

  const longest = [...project.clips].sort((a, b) => b.lengthBeats - a.lengthBeats)[0]
  if (longest) {
    out.push({
      id: uid('sug'),
      capability: 'arrangement',
      title: 'Double the section',
      detail: 'Repeat everything once more so there is room to build.',
      apply: (p) => {
        const end = p.clips.reduce((m, c) => Math.max(m, c.startBeat + c.lengthBeats), 0)
        const copies: Clip[] = p.clips.map((clip) => ({
          ...clip,
          id: uid('c'),
          startBeat: clip.startBeat + end,
          notes: clip.notes.map((n) => ({ ...n, id: uid('n') })),
        }))
        return { ...p, clips: [...p.clips, ...copies], lengthBeats: end * 2, updatedAt: Date.now() }
      },
    })
  }

  const busiest = project.tracks.find((t) => !t.isDrum)
  if (busiest) {
    out.push({
      id: uid('sug'),
      capability: 'arrangement',
      title: 'Strip the intro back',
      detail: `Mute everything but ${busiest.name} for the first bars, then bring the rest in.`,
      apply: (p) => {
        const bar = p.beatsPerBar
        return {
          ...p,
          clips: p.clips.map((clip) =>
            clip.trackId === busiest.id
              ? clip
              : { ...clip, startBeat: clip.startBeat + bar * 4, id: clip.id },
          ),
          lengthBeats: p.lengthBeats + bar * 4,
          updatedAt: Date.now(),
        }
      },
    })
  }

  return out
}

// ---------------------------------------------------------------------------

export const localProvider: MusicProvider = {
  id: 'local',
  label: 'Local (theory-based)',
  remote: false,
  capabilities: ['chords', 'bass', 'drums', 'harmony', 'arrangement'],
  async suggest(context: MusicalContext, capability: Capability): Promise<Suggestion[]> {
    switch (capability) {
      case 'chords': return chordSuggestions(context)
      case 'bass': return bassSuggestions(context)
      case 'drums': return drumSuggestions(context)
      case 'harmony': return harmonySuggestions(context)
      case 'arrangement': return arrangementSuggestions(context)
      default: return []
    }
  },
}
