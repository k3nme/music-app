/**
 * Writing a whole song from a brief.
 *
 * Not a model — a composer built out of the same music theory the Learn module
 * teaches. It picks a progression, writes a bass line that follows it, a chord
 * part that voices it, a melody that sits in the key and remembers its own
 * first phrase, a drum pattern from the style, and then *arranges* all of it:
 * parts come in and drop out across sections, because the difference between a
 * loop and a song is what changes over time.
 *
 * Two properties are worth stating, because they are what make it usable:
 *
 * - **Deterministic.** Same brief and same seed, same song. A new seed is a new
 *   version of the same idea, which is what "try again" should mean.
 * - **Pure.** It returns a Project and touches nothing. That is the same
 *   contract every suggestion has, so a generated song is as undoable as any
 *   other edit — and a remote model could return one the same way.
 */

import { DEFAULT_CHANNEL } from '../audio/engine'
import {
  createClip, createNote, createTrack, emptyProject,
  type Clip, type Note, type Project, type Track,
} from '../music/project'
import { chordNotes, diatonicChord, NOTE_NAMES, SCALES, snapToScale } from '../music/theory'
import { mulberry, type PartName, type SongBrief } from './prompt'
import type { PartRole, Style } from './styles'

/** One span of the arrangement, and what plays in it. */
export interface Section {
  kind: 'intro' | 'verse' | 'build' | 'drop' | 'break' | 'outro'
  label: string
  startBar: number
  bars: number
  /** Parts that sound in this section. */
  parts: PartName[]
  /** 0..1, relative to the song's own energy. */
  intensity: number
}

export interface SongPlan {
  brief: SongBrief
  sections: Section[]
  /** Chord roots and qualities, one per bar of the progression cycle. */
  chords: { root: number; quality: string; degree: number }[]
  /** What plays each job. */
  cast: Partial<Record<PartRole, string>>
}

const BEATS_PER_BAR = 4

// ---------------------------------------------------------------------------
// The shape of the song
// ---------------------------------------------------------------------------

/**
 * Lay out sections to fill the requested length.
 *
 * Dance styles get intro → build → drop → break → build → drop → outro, which
 * is the shape of nearly every club record. Everything else gets the song form
 * it actually uses: intro, verse, chorus, verse, chorus, out.
 */
export function planSections(brief: SongBrief): Section[] {
  const unit = brief.style.sectionBars ?? 4
  const dance = (brief.style.transitions ?? false) && unit >= 8

  const template: { kind: Section['kind']; label: string; bars: number; parts: PartName[]; intensity: number }[] =
    dance
      ? [
        { kind: 'intro', label: 'Intro', bars: unit, parts: ['drums', 'pad'], intensity: 0.35 },
        { kind: 'build', label: 'Build', bars: unit, parts: ['drums', 'bass', 'chords', 'pad'], intensity: 0.6 },
        { kind: 'drop', label: 'Drop', bars: unit, parts: ['drums', 'bass', 'chords', 'lead'], intensity: 1 },
        { kind: 'break', label: 'Breakdown', bars: unit, parts: ['chords', 'pad', 'lead'], intensity: 0.4 },
        { kind: 'build', label: 'Build', bars: unit, parts: ['drums', 'bass', 'chords', 'pad'], intensity: 0.7 },
        { kind: 'drop', label: 'Drop', bars: unit, parts: ['drums', 'bass', 'chords', 'lead', 'pad'], intensity: 1 },
        { kind: 'outro', label: 'Outro', bars: unit, parts: ['drums', 'pad'], intensity: 0.3 },
      ]
      : [
        { kind: 'intro', label: 'Intro', bars: unit, parts: ['chords', 'pad'], intensity: 0.35 },
        { kind: 'verse', label: 'Verse', bars: unit * 2, parts: ['drums', 'bass', 'chords'], intensity: 0.6 },
        { kind: 'drop', label: 'Chorus', bars: unit * 2, parts: ['drums', 'bass', 'chords', 'lead', 'pad'], intensity: 1 },
        { kind: 'verse', label: 'Verse', bars: unit * 2, parts: ['drums', 'bass', 'chords', 'lead'], intensity: 0.65 },
        { kind: 'drop', label: 'Chorus', bars: unit * 2, parts: ['drums', 'bass', 'chords', 'lead', 'pad'], intensity: 1 },
        { kind: 'outro', label: 'Outro', bars: unit, parts: ['chords', 'pad'], intensity: 0.3 },
      ]

  // Fill the requested length by cycling the middle of the template, with the
  // intro and the ending reserved. An earlier version filled forwards and cut
  // to the outro as soon as the next section would overrun, which quietly
  // dropped the second chorus — the song spent its last third winding down
  // from a climax it never reached.
  const total = Math.max(unit * 2, brief.bars)
  const head = template[0]
  const tail = template[template.length - 1]
  const body = template.slice(1, -1)

  const sections: Section[] = []
  let bar = 0
  const emit = (entry: typeof template[number], bars: number) => {
    if (bars <= 0) return
    sections.push({ ...entry, startBar: bar, bars, parts: [...entry.parts] })
    bar += bars
  }

  if (total <= unit * 2) {
    // Too short for a shape: give them the main section, which is the part
    // anyone asking for a loop actually wants.
    const main = body.find((entry) => entry.kind === 'drop') ?? body[0] ?? head
    emit(main, total)
    return trimParts(sections, brief)
  }

  emit(head, Math.min(head.bars, total - tail.bars))
  for (let i = 0; bar < total - tail.bars; i++) {
    const entry = body[i % body.length]
    emit(entry, Math.min(entry.bars, total - tail.bars - bar))
  }
  emit(tail, total - bar)

  return trimParts(sections, brief)
}

/** Drop whatever the prompt asked to leave out. */
function trimParts(sections: Section[], brief: SongBrief): Section[] {
  if (brief.without.length) {
    for (const section of sections) {
      section.parts = section.parts.filter((part) => !brief.without.includes(part))
    }
  }
  return sections
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * Choose the instrument for each job.
 *
 * Anything named in the prompt wins, placed in whichever job it can do. After
 * that the style's own list decides, varied by the seed so two goes at the same
 * prompt are not identical.
 */
export function castParts(
  brief: SongBrief,
  seed: number,
  available: { id: string; family: string; userMade?: boolean }[] = [],
): Partial<Record<PartRole, string>> {
  const random = mulberry(seed + 7)
  const style = brief.style
  const cast: Partial<Record<PartRole, string>> = {}

  const pick = (candidates: string[] | undefined, fallback: string): string => {
    const list = (candidates ?? []).filter((id) => exists(id, available))
    if (list.length === 0) return fallback
    // Favour the style's first choice, but not always.
    const index = random() < 0.6 ? 0 : Math.floor(random() * list.length)
    return list[index]
  }

  cast.drums = style.kit
  cast.bass = pick(style.instruments?.bass, 'sub-bass')
  cast.chords = pick(style.instruments?.chords, 'rhodes')
  cast.lead = pick(style.instruments?.lead, 'pluck-synth')
  cast.pad = pick(style.instruments?.pad, 'warm-pad')

  // A named instrument takes the job it is best suited to.
  for (const id of brief.wanted) {
    const entry = available.find((p) => p.id === id)
    if (!entry) continue
    if (entry.family === 'drums') cast.drums = id
    else if (entry.family === 'bass') cast.bass = id
    else if (isPadLike(id)) cast.pad = id
    else if (isChordLike(id)) cast.chords = id
    else cast.lead = id
  }

  // "Use my sounds": a sampled kit is the one swap that always works, because
  // a kit taken out of a song is laid out on the same notes.
  if (brief.useMySounds) {
    const mine = available.filter((p) => p.userMade)
    const myKit = mine.find((p) => p.family === 'drums')
    if (myKit) cast.drums = myKit.id
    const myBass = mine.find((p) => p.family === 'bass')
    if (myBass) cast.bass = myBass.id
    const myLead = mine.find((p) => p.family !== 'drums' && p.family !== 'bass')
    if (myLead) cast.lead = myLead.id
  }

  return cast
}

function exists(id: string, available: { id: string }[]): boolean {
  return available.length === 0 || available.some((p) => p.id === id)
}

const PAD_LIKE = ['pad', 'strings', 'choir', 'tanpura', 'drone', 'mellotron', 'ensemble']
const CHORD_LIKE = ['piano', 'rhodes', 'wurli', 'guitar', 'organ', 'harmonium', 'stab', 'chords', 'harp']

function isPadLike(id: string): boolean {
  return PAD_LIKE.some((word) => id.includes(word))
}
function isChordLike(id: string): boolean {
  return CHORD_LIKE.some((word) => id.includes(word))
}

// ---------------------------------------------------------------------------
// The parts
// ---------------------------------------------------------------------------

/** The chord cycle: one chord per bar, repeating. */
export function planChords(brief: SongBrief, seed: number, variation = 0) {
  const random = mulberry(seed + 11)
  const options = brief.style.progressions ?? [[0, 4, 5, 3]]
  const degrees = options[(Math.floor(random() * options.length) + variation) % options.length]
  return degrees.map((degree) => {
    const { root, quality } = diatonicChord(brief.root + 48, brief.scale, degree, brief.energy < 0.5)
    return { root, quality: quality as string, degree }
  })
}

/** Bass: the root of each chord, rhythmically shaped by the style. */
function writeBass(plan: SongPlan, bar: number, intensity: number, seed: number): Note[] {
  const { chords, brief } = plan
  const chord = chords[bar % chords.length]
  const random = mulberry(seed + bar * 31)
  const root = chord.root - 24
  const notes: Note[] = []
  const dance = (brief.style.sectionBars ?? 4) >= 8

  if (dance) {
    // Offbeat eighths under a four-to-the-floor kick — the bass lives in the
    // gaps between kicks, which is what makes the two audible at once.
    for (let eighth = 0; eighth < 8; eighth++) {
      if (eighth % 2 === 0) continue
      notes.push(createNote(root, eighth * 0.5, 0.4, 0.9))
    }
  } else {
    notes.push(createNote(root, 0, 1.4, 0.95))
    if (intensity > 0.5) notes.push(createNote(root, 1.5, 0.4, 0.8))
    notes.push(createNote(root, 2, 1.4, 0.9))
    if (intensity > 0.7 && random() < 0.5) {
      notes.push(createNote(root + (random() < 0.5 ? 7 : 5), 3.5, 0.4, 0.75))
    }
  }
  return notes
}

/** Chords: the voicing, played in the rhythm the style wants. */
function writeChords(plan: SongPlan, bar: number, intensity: number, seed: number): Note[] {
  const { chords, brief } = plan
  const chord = chords[bar % chords.length]
  const random = mulberry(seed + bar * 17)
  // Keep the voicing in one octave-ish band so the part does not leap about
  // when the progression does.
  const inversion = Math.floor(random() * 3)
  const voiced = chordNotes(chord.root, chord.quality as never, inversion)
    .map((midi) => (midi > 76 ? midi - 12 : midi))

  const stabs = (brief.style.sectionBars ?? 4) >= 8 && intensity > 0.5
  const notes: Note[] = []
  if (stabs) {
    // Short chords on the offbeats.
    for (const beat of [0.5, 1.5, 2.5, 3.5]) {
      if (beat > 1.5 && intensity < 0.8 && random() < 0.4) continue
      for (const midi of voiced) notes.push(createNote(midi, beat, 0.35, 0.65))
    }
  } else {
    for (const midi of voiced) notes.push(createNote(midi, 0, 3.8, 0.6))
  }
  return notes
}

/** Pad: the same harmony, held. */
function writePad(plan: SongPlan, bar: number): Note[] {
  const chord = plan.chords[bar % plan.chords.length]
  return chordNotes(chord.root - 12, chord.quality as never, 0)
    .map((midi) => createNote(midi, 0, 3.95, 0.45))
}

/**
 * Melody: a motif, then variations of it.
 *
 * The thing that makes a tune a tune rather than a run of in-key notes is that
 * it repeats itself. So one phrase is written, and later bars restate it —
 * transposed within the scale, or with its ending changed — instead of being
 * generated afresh each time.
 */
function writeMelody(plan: SongPlan, bar: number, intensity: number, seed: number, motif: Motif): Note[] {
  const { brief, chords } = plan
  const chord = chords[bar % chords.length]
  const random = mulberry(seed + bar * 23)
  const phrase = bar % 4

  // Rest in the bar before a phrase repeats: a melody needs to breathe.
  if (phrase === 3 && intensity < 0.9 && random() < 0.5) return []

  const centre = 72 + Math.round((brief.brightness - 0.5) * 12)
  const shift = phrase === 0 ? 0 : [0, 2, -1, 1][phrase] ?? 0
  const notes: Note[] = []

  for (const step of motif.steps) {
    if (step.rest) continue
    if (intensity < 0.6 && step.optional) continue
    const wanted = centre + step.degree * 2 + shift
    // Land the phrase's first note on a chord tone, so it belongs to the bar.
    const target = step.start === 0
      ? nearestChordTone(wanted, chord.root, chord.quality as string)
      : snapToScale(wanted, brief.root, brief.scale)
    notes.push(createNote(
      Math.max(48, Math.min(96, target)),
      step.start,
      step.length,
      step.accent ? 0.9 : 0.72,
    ))
  }
  return notes
}

interface Motif {
  steps: { degree: number; start: number; length: number; accent?: boolean; optional?: boolean; rest?: boolean }[]
}

/** Write one short phrase to build the whole melody out of. */
function makeMotif(seed: number, energy: number): Motif {
  const random = mulberry(seed + 5)
  const shapes: Motif[] = [
    { steps: [
      { degree: 0, start: 0, length: 0.75, accent: true },
      { degree: 2, start: 1, length: 0.5 },
      { degree: 1, start: 1.5, length: 0.5, optional: true },
      { degree: 3, start: 2, length: 1.4 },
    ] },
    { steps: [
      { degree: 4, start: 0, length: 0.5, accent: true },
      { degree: 3, start: 0.5, length: 0.5 },
      { degree: 1, start: 1, length: 1 },
      { degree: 2, start: 2.5, length: 1.2, optional: true },
    ] },
    { steps: [
      { degree: 0, start: 0, length: 1.9, accent: true },
      { degree: 2, start: 2, length: 0.5 },
      { degree: 4, start: 2.5, length: 1.4 },
    ] },
    { steps: [
      { degree: 2, start: 0.5, length: 0.5, accent: true },
      { degree: 4, start: 1, length: 0.5 },
      { degree: 3, start: 1.5, length: 0.5, optional: true },
      { degree: 1, start: 2, length: 0.5 },
      { degree: 0, start: 2.5, length: 1.4 },
    ] },
  ]
  const base = shapes[Math.floor(random() * shapes.length)]
  // A busier brief gets a busier phrase.
  if (energy > 0.75 && random() < 0.5) {
    return { steps: base.steps.map((step) => ({ ...step, optional: false })) }
  }
  return base
}

function nearestChordTone(midi: number, chordRoot: number, quality: string): number {
  const tones = chordNotes(chordRoot, quality as never, 0).map((n) => ((n % 12) + 12) % 12)
  for (let distance = 0; distance < 7; distance++) {
    for (const direction of [1, -1]) {
      const candidate = midi + distance * direction
      if (tones.includes(((candidate % 12) + 12) % 12)) return candidate
    }
  }
  return midi
}

/** Drums: the style's pattern, thinned out when the section is quieter. */
function writeDrums(style: Style, bar: number, intensity: number, seed: number, lastBarOfSection: boolean): Note[] {
  const random = mulberry(seed + bar * 13)
  const notes: Note[] = []
  for (const [midi, step, velocity] of style.steps) {
    // The kick and snare hold the section together; the rest thins out first.
    const essential = midi === 36 || midi === 38
    if (!essential && intensity < 0.55 && random() > intensity + 0.25) continue
    if (intensity < 0.4 && !essential) continue
    const swing = style.swing && step % 2 === 1 ? style.swing * 0.25 : 0
    notes.push(createNote(midi, step * 0.25 + swing, 0.25, velocity * (0.7 + intensity * 0.3)))
  }
  // A fill in the last bar before something changes.
  if (lastBarOfSection && intensity > 0.45) {
    for (let i = 0; i < 4; i++) {
      notes.push(createNote(38, 3 + i * 0.25, 0.25, 0.5 + i * 0.12))
    }
  }
  return notes
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

export function planSong(
  brief: SongBrief, seed: number,
  available?: Parameters<typeof castParts>[2], variation = 0,
): SongPlan {
  return {
    brief,
    sections: planSections(brief),
    chords: planChords(brief, seed, variation),
    cast: castParts(brief, seed, available),
  }
}

/**
 * Write the song.
 *
 * Every part is one clip per section rather than one long clip, so the
 * arrangement is editable afterwards: sections can be moved, muted or deleted
 * as blocks, which is how anyone would actually work with it.
 */
export function composeSong(
  brief: SongBrief,
  options: {
    seed?: number
    available?: Parameters<typeof castParts>[2]
    name?: string
    /** Rotates the choices, so several goes at one prompt really do differ. */
    variation?: number
  } = {},
): Project {
  const seed = options.seed ?? 1
  const plan = planSong(brief, seed, options.available, options.variation ?? 0)
  const { sections, cast } = plan
  const motif = makeMotif(seed, brief.energy)

  const base = emptyProject(options.name ?? songName(seed))
  const project: Project = {
    ...base,
    bpm: brief.bpm,
    key: { root: brief.root, scale: brief.scale },
    // Headroom, in two places. Every part plays at once from the first bar,
    // which is not how someone building an arrangement by hand arrives at one
    // — and the shared reverb and delay keep *accumulating* across a
    // three-minute render, so a mix that measures fine over eight bars can
    // still be over unity by the last chorus. Both returns come down as well
    // as the fader.
    master: {
      ...base.master,
      volume: 0.58,
      reverbAmount: 0.55,
      delayFeedback: 0.26,
    },
  }

  const tracks: Track[] = []
  const clips: Clip[] = []
  const totalBars = sections.reduce((sum, section) => sum + section.bars, 0)

  const wanted: PartName[] = ['drums', 'bass', 'chords', 'pad', 'lead']
  for (const part of wanted) {
    if (brief.without.includes(part)) continue
    if (!sections.some((section) => section.parts.includes(part))) continue

    const presetId = cast[part === 'lead' ? 'lead' : part] ?? 'warm-pad'
    const track = createTrack({
      name: PART_LABELS[part],
      presetId,
      isDrum: part === 'drums',
      channel: { ...DEFAULT_CHANNEL, ...mixFor(part, brief) },
    })
    tracks.push(track)

    for (const section of sections) {
      if (!section.parts.includes(part)) continue
      const notes: Note[] = []
      for (let bar = 0; bar < section.bars; bar++) {
        const absolute = section.startBar + bar
        const last = bar === section.bars - 1
        const barNotes = writePart(part, plan, absolute, section.intensity, seed, motif, last)
        for (const note of barNotes) {
          notes.push({ ...note, start: note.start + bar * BEATS_PER_BAR })
        }
      }
      if (notes.length === 0) continue
      clips.push(createClip(track.id, {
        name: `${PART_LABELS[part]} · ${section.label}`,
        startBeat: section.startBar * BEATS_PER_BAR,
        contentBeats: section.bars * BEATS_PER_BAR,
        lengthBeats: section.bars * BEATS_PER_BAR,
        notes,
      }))
    }
  }

  // Transitions: a riser into every drop, an impact on its downbeat. Only for
  // styles that use them — a jazz trio does not need a festival riser.
  if (brief.style.transitions && !brief.without.includes('drums')) {
    const fx = createTrack({
      name: 'Transitions',
      presetId: 'kit-fx',
      isDrum: true,
      // Quiet on purpose. An impact lands on the downbeat of a drop, which is
      // the one moment every other part is also at its loudest — it is the
      // peak of the whole song, and it is the thing that pushes a generated
      // mix over unity.
      channel: { ...DEFAULT_CHANNEL, volume: 0.3, reverbSend: 0.25 },
    })
    const notes: { bar: number; note: Note }[] = []
    for (const section of sections) {
      if (section.kind !== 'drop' || section.startBar === 0) continue
      // A two-bar riser ending exactly on the drop, and the impact that lands.
      notes.push({ bar: section.startBar - 2, note: createNote(37, 0, 0.25, 0.6) })
      notes.push({ bar: section.startBar, note: createNote(41, 0, 0.25, 0.7) })
    }
    if (notes.length > 0) {
      tracks.push(fx)
      clips.push(createClip(fx.id, {
        name: 'Transitions',
        startBeat: 0,
        contentBeats: totalBars * BEATS_PER_BAR,
        lengthBeats: totalBars * BEATS_PER_BAR,
        notes: notes.map(({ bar, note }) => ({ ...note, start: bar * BEATS_PER_BAR + note.start })),
      }))
    }
  }

  return {
    ...project,
    tracks,
    clips,
    lengthBeats: totalBars * BEATS_PER_BAR,
    loopEnd: Math.min(totalBars, 8) * BEATS_PER_BAR,
    updatedAt: Date.now(),
  } as Project
}

const PART_LABELS: Record<PartName, string> = {
  drums: 'Drums', bass: 'Bass', chords: 'Chords', pad: 'Pad', lead: 'Melody',
}

function writePart(
  part: PartName, plan: SongPlan, bar: number, intensity: number,
  seed: number, motif: Motif, lastBarOfSection: boolean,
): Note[] {
  switch (part) {
    case 'drums': return writeDrums(plan.brief.style, bar, intensity, seed, lastBarOfSection)
    case 'bass': return writeBass(plan, bar, intensity, seed)
    case 'chords': return writeChords(plan, bar, intensity, seed)
    case 'pad': return writePad(plan, bar)
    case 'lead': return writeMelody(plan, bar, intensity, seed, motif)
  }
}

/**
 * Levels, sends and duck per part — a rough mix, not a finished one.
 *
 * Deliberately conservative. Five or six parts playing at once sum well above
 * unity if each is set to a level that sounds right on its own, and the master
 * limiter hides it right up until someone renders the track and finds the peak
 * over 1. Better to start quiet and let the user push things up.
 */
function mixFor(part: PartName, brief: SongBrief): Partial<typeof DEFAULT_CHANNEL> {
  const pump = brief.style.pump ?? 0
  switch (part) {
    case 'drums': return { volume: 0.68, reverbSend: 0.03 }
    case 'bass': return { volume: 0.58, reverbSend: 0.02, pump: pump * 0.7, pumpBeats: 1 }
    case 'chords': return { volume: 0.34, reverbSend: 0.13, delaySend: 0.06, pump, pumpBeats: 1 }
    case 'pad': return { volume: 0.24, reverbSend: 0.24, pump, pumpBeats: 1 }
    case 'lead': return { volume: 0.4, reverbSend: 0.18, delaySend: 0.1, pump: pump * 0.5, pumpBeats: 1 }
  }
}

/** A name for the song, so it is not another "Untitled". */
function songName(seed: number): string {
  const random = mulberry(seed + 3)
  const adjectives = ['Midnight', 'Paper', 'Glass', 'Slow', 'Neon', 'Quiet', 'Velvet', 'Iron', 'Amber', 'Hollow']
  const nouns = ['Rooms', 'Lights', 'Hours', 'Signal', 'Weather', 'Motion', 'Distance', 'Letters', 'Static', 'Tides']
  const adjective = adjectives[Math.floor(random() * adjectives.length)]
  const noun = nouns[Math.floor(random() * nouns.length)]
  return `${adjective} ${noun}`
}

/** A sentence describing what was written, for showing back. */
export function describePlan(plan: SongPlan): string {
  const { brief, chords, sections } = plan
  const names = chords.map((chord) => {
    const name = NOTE_NAMES[((chord.root % 12) + 12) % 12]
    return chord.quality.startsWith('min') ? `${name}m` : name
  })
  return `${names.join(' – ')} · ${sections.length} sections · ${SCALES[brief.scale].label}`
}
