/**
 * The local provider: musical assistance from theory and pattern libraries
 * rather than a model. It runs instantly, offline, and its reasoning is
 * inspectable — which for "what chords fit this melody" is often enough.
 *
 * Where a model would genuinely do better (style transfer, "make it sound
 * more like this reference", stem separation), the seam in `types.ts` is
 * where that plugs in.
 */

import { allPresets, getPreset } from '../audio/instruments'
import { DEFAULT_CHANNEL } from '../audio/engine'
import { uid } from '../lib/id'
import {
  createClip, createNote, createTrack, type Clip, type Note, type Project,
} from '../music/project'
import {
  chordNotes, diatonicChord, NOTE_NAMES, PROGRESSIONS, SCALES, snapToScale,
  type ChordQuality,
} from '../music/theory'
import { composeSong, describePlan, planSong, readRemixSource, remixProject } from './compose'
import { audioClipLengthBeats } from '../music/project'
import { getSampleMeta } from '../lib/samples'
import { describeBrief, readPrompt } from './prompt'
import { STYLES, type Style } from './styles'
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

function drumSuggestions(context: MusicalContext): Suggestion[] {
  const { project } = context
  const bars = Math.min(4, barsInUse(project))
  const beatsPerBar = project.beatsPerBar

  // Offer whatever suits the project tempo first, but keep all of them.
  const ordered = [...STYLES].sort((a, b) => fitScore(b) - fitScore(a))
  function fitScore(style: Style) {
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
// A whole song, from a sentence
// ---------------------------------------------------------------------------

/**
 * Write a complete arrangement from a prompt.
 *
 * Three takes on the same brief rather than one, because the first answer to
 * "make me a song" is rarely the one you keep, and hearing three makes it
 * obvious what you actually wanted.
 */
function songSuggestions(context: MusicalContext): Suggestion[] {
  const prompt = context.prompt ?? ''
  const base = context.seed ?? 1
  const available = allPresets().map((preset) => ({
    id: preset.id, family: preset.family as string, userMade: preset.userMade,
  }))

  if (context.keep && context.keep.length > 0) return remixSuggestions(context, available, base)

  return [0, 1, 2].map((offset) => {
    // The brief is read at one seed and *rotated* by the take number, so the
    // three differ by construction. Letting each take re-read at its own seed
    // looked right and was not: the seed's own choice and the rotation cancel
    // out often enough that two takes land on the same key and progression.
    // The seed still varies the casting, the voicings and the melody.
    const seed = base + offset * 977
    const brief = readPrompt(prompt, { seed: base, variation: offset })
    const plan = planSong(brief, seed, available, offset)
    const song = composeSong(brief, { seed, available, variation: offset })
    return {
      id: uid('sug'),
      capability: 'song' as Capability,
      title: song.name,
      detail: `${describeBrief(brief)} · ${describePlan(plan)}`,
      reasons: brief.reasons,
      replacesProject: true,
      // Keep the project's identity so this is an edit of the open document,
      // not a new file — which is what makes undo put the old one back.
      apply: (project: Project) => ({ ...song, id: project.id }),
    }
  })
}

/**
 * Write around a record that is already on the timeline.
 *
 * The audio's own analysis — the tempo, key and tuning worked out when it was
 * imported — decides the tempo and key, and which stems are being kept decides
 * which parts get written at all.
 */
function remixSuggestions(
  context: MusicalContext,
  available: { id: string; family: string; userMade?: boolean }[],
  base: number,
): Suggestion[] {
  const { project } = context
  const keep = new Set(context.keep ?? [])
  const clips = (project.audioClips ?? [])
    .filter((clip) => keep.has(clip.trackId))
    .map((clip) => {
      const meta = getSampleMeta(clip.sampleId)
      const analysis = meta?.analysis
      return {
        trackId: clip.trackId,
        startBeat: clip.startBeat,
        lengthBeats: audioClipLengthBeats(clip, project.bpm),
        stem: meta?.stem,
        analysis: analysis
          ? { bpm: analysis.beat.bpm, root: analysis.key.root, mode: analysis.key.mode }
          : null,
      }
    })

  const source = readRemixSource(clips, {
    bpm: project.bpm, root: project.key.root, scale: project.key.scale,
  })
  if (!source) return []

  return [0, 1, 2].map((offset) => {
    const seed = base + offset * 977
    const brief = readPrompt(context.prompt ?? '', { seed: base, variation: offset })
    // The record's tempo and key win, so the brief is only asked about style.
    const remixBrief = { ...brief, bpm: source.bpm, root: source.root, scale: source.scale }
    const plan = planSong(remixBrief, seed, available, offset)
    const remixed = remixProject(project, brief, source, {
      seed, keep: [...keep], available, variation: offset,
    })
    return {
      id: uid('sug'),
      capability: 'song' as Capability,
      title: `${brief.style.name} remix ${offset + 1}`,
      detail: `${describeBrief(remixBrief)} · ${describePlan(plan)}`,
      reasons: [...source.reasons, ...brief.reasons.filter((r) => !/BPM|key of/.test(r))],
      replacesProject: true,
      apply: () => remixed,
    }
  })
}

// ---------------------------------------------------------------------------

export const localProvider: MusicProvider = {
  id: 'local',
  label: 'Local (theory-based)',
  remote: false,
  capabilities: ['chords', 'bass', 'drums', 'harmony', 'arrangement', 'song'],
  async suggest(context: MusicalContext, capability: Capability): Promise<Suggestion[]> {
    switch (capability) {
      case 'chords': return chordSuggestions(context)
      case 'bass': return bassSuggestions(context)
      case 'drums': return drumSuggestions(context)
      case 'harmony': return harmonySuggestions(context)
      case 'arrangement': return arrangementSuggestions(context)
      case 'song': return songSuggestions(context)
      default: return []
    }
  },
}
