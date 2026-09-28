/**
 * Style profiles: everything the app knows about how a genre is put together.
 *
 * One list, two readers. The Ideas panel uses the groove to offer a drum
 * pattern; the song composer uses the whole profile — tempo, kit, tonality,
 * progressions, which instruments play which job, how hard to duck, and how a
 * track of this kind is shaped over time.
 *
 * Keeping them together is the point. A style is not a drum pattern plus a
 * separate list of instruments that happen to suit it; it is one idea, and
 * when someone types "amapiano" they mean all of it at once.
 *
 * Pure data with no audio imports, so it can be checked in tests — and it is:
 * every preset named here is validated against the real instrument library.
 */

import type { ScaleId } from '../music/theory'

/** What each part of an arrangement is for. */
export type PartRole = 'drums' | 'bass' | 'chords' | 'lead' | 'pad' | 'fx'

export interface Style {
  id: string
  name: string
  detail: string
  /** Words in a prompt that pick this style. */
  keywords: string[]
  kit: string
  bpmHint: [number, number]
  /** Steps are sixteenths: [piece midi, step index, velocity]. */
  steps: [number, number, number][]

  // --- the rest is for composing a whole song -----------------------------
  /** Tonality this style tends to live in. */
  scale?: ScaleId
  /** Chord progressions as scale degrees, best first. */
  progressions?: number[][]
  /** Candidate instruments per job, best first. */
  instruments?: Partial<Record<Exclude<PartRole, 'drums' | 'fx'>, string[]>>
  /** Sidechain duck for everything that is not the drums. */
  pump?: number
  /** How busy the parts are, 0..1. */
  density?: number
  /** Bars per section. Dance music moves in 8s; a song in 4s. */
  sectionBars?: number
  /** Whether a riser and an impact belong before each drop. */
  transitions?: boolean
  /** Swing as a fraction of a sixteenth, 0 for straight. */
  swing?: number
}

const K = 36, S = 38, CL = 39, HC = 42, HO = 46

export const STYLES: Style[] = [
  {
    id: 'house', keywords: ['house', 'four on the floor', 'club', 'dance', 'progressive', 'deep house', 'edm'],
    scale: 'minor', pump: 0.75, density: 0.6, sectionBars: 8, transitions: true,
    progressions: [[5, 3, 0, 4], [5, 3, 4, 4], [0, 5, 3, 4]],
    instruments: {
      bass: ['sub-bass', 'moog-bass', 'reese-bass'],
      chords: ['house-stab', 'future-chords', 'rhodes'],
      lead: ['supersaw', 'trance-pluck', 'pluck-synth'],
      pad: ['warm-pad', 'gated-pad', 'string-machine'],
    },
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
    id: 'boom-bap', keywords: ['boom bap', 'hip hop', 'hip-hop', 'rap', 'lo-fi', 'lofi', 'chill', 'study', 'jazzy'],
    scale: 'minor', pump: 0, density: 0.45, sectionBars: 4, transitions: false, swing: 0.16,
    progressions: [[1, 4, 2, 5], [5, 3, 0, 4], [0, 5, 3, 4]],
    instruments: {
      bass: ['upright-bass', 'bass-guitar', 'sub-bass'],
      chords: ['rhodes', 'wurli', 'mellotron'],
      lead: ['vibraphone', 'music-box', 'flugelhorn'],
      pad: ['mellotron', 'warm-pad', 'string-machine'],
    },
    name: 'Boom bap', detail: 'Classic hip-hop swing — kick on 1 and the and of 2.',
    kit: 'kit-lofi', bpmHint: [80, 96],
    steps: [
      [K, 0, 1], [K, 6, 0.9], [K, 10, 0.75],
      [S, 4, 0.9], [S, 12, 0.9],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [HC, s, s % 4 === 0 ? 0.55 : 0.35] as [number, number, number]),
    ],
  },
  {
    id: 'trap', keywords: ['trap', 'drill', '808', 'hard', 'dark rap'],
    scale: 'harmonicMinor', pump: 0, density: 0.5, sectionBars: 4, transitions: true,
    progressions: [[0, 5, 3, 4], [0, 6, 5, 4], [5, 3, 0, 4]],
    instruments: {
      bass: ['808-bass', 'sub-bass', 'fm-bass'],
      chords: ['dark-drone', 'glass-pad', 'fm-bell-pad'],
      lead: ['music-box', 'kalimba', 'glockenspiel'],
      pad: ['dark-drone', 'choir-pad', 'glass-pad'],
    },
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
    id: 'rock', keywords: ['rock', 'indie', 'band', 'guitar', 'alternative', 'punk', 'garage'],
    scale: 'major', pump: 0, density: 0.55, sectionBars: 4, transitions: false,
    progressions: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 4, 4]],
    instruments: {
      bass: ['bass-guitar', 'moog-bass', 'upright-bass'],
      chords: ['electric-crunch', 'electric-clean', 'steel-guitar'],
      lead: ['electric-clean', 'twelve-string', 'combo-organ'],
      pad: ['string-machine', 'combo-organ', 'mellotron'],
    },
    name: 'Rock beat', detail: 'Straight backbeat on a live kit.',
    kit: 'kit-acoustic', bpmHint: [90, 150],
    steps: [
      [K, 0, 1], [K, 8, 0.95], [K, 10, 0.7],
      [S, 4, 0.95], [S, 12, 0.95],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s) => [HC, s, s % 4 === 0 ? 0.6 : 0.4] as [number, number, number]),
    ],
  },
  {
    id: 'indian', keywords: ['indian', 'bollywood', 'classical indian', 'raga', 'sitar', 'tabla', 'hindustani', 'carnatic', 'desi'],
    scale: 'kafi', pump: 0, density: 0.5, sectionBars: 4, transitions: false,
    progressions: [[0, 3, 0, 4], [0, 6, 5, 0], [0, 4, 3, 0]],
    instruments: {
      bass: ['upright-bass', 'sub-bass', 'bass-guitar'],
      chords: ['harmonium', 'santoor', 'tanpura'],
      lead: ['bansuri', 'sitar', 'sarangi'],
      pad: ['tanpura', 'harmonium', 'choir-pad'],
    },
    name: 'Teental (tabla)', detail: 'A 16-beat North Indian cycle — Dha Dhin Dhin Dha.',
    kit: 'kit-tabla', bpmHint: [60, 140],
    steps: [
      [45, 0, 1], [41, 2, 0.75], [41, 4, 0.75], [45, 6, 0.9],
      [45, 8, 0.85], [41, 10, 0.75], [40, 12, 0.8], [36, 14, 0.7],
      [43, 1, 0.4], [43, 5, 0.4], [43, 9, 0.4], [43, 13, 0.4],
    ],
  },
  {
    id: 'amapiano', keywords: ['amapiano', 'piano', 'south africa', 'log drum', 'yanos'],
    scale: 'minor', pump: 0.55, density: 0.5, sectionBars: 8, transitions: true,
    progressions: [[5, 3, 0, 4], [0, 5, 3, 4], [1, 4, 0, 5]],
    instruments: {
      bass: ['logdrum-bass', 'sub-bass', 'moog-bass'],
      chords: ['rhodes', 'future-chords', 'grand-piano'],
      lead: ['kalimba', 'marimba', 'afro-lead'],
      pad: ['gated-pad', 'warm-pad', 'choir-pad'],
    },
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
    id: 'afrobeats', keywords: ['afrobeats', 'afrobeat', 'afro', 'lagos', 'nigeria', 'wizkid', 'burna'],
    scale: 'major', pump: 0.35, density: 0.55, sectionBars: 4, transitions: false,
    progressions: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 1, 4]],
    instruments: {
      bass: ['bass-guitar', 'sub-bass', 'moog-bass'],
      chords: ['nylon-guitar', 'rhodes', 'balafon'],
      lead: ['kora', 'afro-lead', 'marimba'],
      pad: ['warm-pad', 'choir-pad', 'string-machine'],
    },
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
    id: 'afro-house', keywords: ['afro house', 'afrohouse', 'tribal', 'organic house'],
    scale: 'minor', pump: 0.7, density: 0.65, sectionBars: 8, transitions: true,
    progressions: [[5, 3, 0, 4], [0, 6, 5, 4], [5, 4, 3, 4]],
    instruments: {
      bass: ['sub-bass', 'moog-bass', 'logdrum-bass'],
      chords: ['mbira', 'rhodes', 'balafon'],
      lead: ['kora', 'ngoni', 'afro-lead'],
      pad: ['warm-pad', 'gated-pad', 'choir-pad'],
    },
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
    id: 'techno', keywords: ['techno', 'berlin', 'industrial', 'warehouse', 'minimal', 'hard dance'],
    scale: 'phrygian', pump: 0.85, density: 0.7, sectionBars: 8, transitions: true,
    progressions: [[0, 0, 5, 5], [0, 6, 0, 5], [0, 1, 0, 6]],
    instruments: {
      bass: ['reese-bass', 'acid-bass', 'sub-bass'],
      chords: ['hoover', 'supersaw-stab', 'dark-drone'],
      lead: ['acid-bass', 'square-lead', 'bigroom-lead'],
      pad: ['dark-drone', 'glass-pad', 'gated-pad'],
    },
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
    id: 'dnb', keywords: ['drum and bass', 'drum & bass', 'dnb', 'jungle', 'breakbeat', 'breaks', 'liquid'],
    scale: 'minor', pump: 0.4, density: 0.7, sectionBars: 8, transitions: true,
    progressions: [[5, 3, 0, 4], [1, 4, 0, 0], [5, 2, 3, 4]],
    instruments: {
      bass: ['reese-bass', 'neuro-bass', 'sub-bass'],
      chords: ['rhodes', 'future-chords', 'glass-pad'],
      lead: ['pluck-synth', 'vibraphone', 'trance-pluck'],
      pad: ['glass-pad', 'warm-pad', 'choir-pad'],
    },
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
    id: 'reggaeton', keywords: ['reggaeton', 'dembow', 'latin urban', 'perreo'],
    scale: 'minor', pump: 0.3, density: 0.5, sectionBars: 4, transitions: false,
    progressions: [[5, 3, 0, 4], [0, 5, 3, 4], [5, 4, 3, 4]],
    instruments: {
      bass: ['sub-bass', '808-bass', 'moog-bass'],
      chords: ['nylon-guitar', 'future-chords', 'rhodes'],
      lead: ['pluck-synth', 'marimba', 'steel-drum'],
      pad: ['warm-pad', 'gated-pad', 'choir-pad'],
    },
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
    id: 'latin', keywords: ['latin', 'salsa', 'bossa', 'samba', 'cuban', 'brazil', 'mambo'],
    scale: 'dorian', pump: 0, density: 0.6, sectionBars: 4, transitions: false, swing: 0.08,
    progressions: [[1, 4, 0, 0], [0, 3, 4, 0], [5, 1, 4, 0]],
    instruments: {
      bass: ['upright-bass', 'bass-guitar', 'sub-bass'],
      chords: ['nylon-guitar', 'grand-piano', 'rhodes'],
      lead: ['flugelhorn', 'trumpet', 'marimba'],
      pad: ['string-machine', 'warm-pad', 'combo-organ'],
    },
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

