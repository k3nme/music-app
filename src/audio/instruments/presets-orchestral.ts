/**
 * Orchestral, band and vintage-keyboard instruments the first pass skipped.
 *
 * Several of these are conspicuous absences rather than nice-to-haves: an
 * orchestra without a bassoon or a cor anglais is not an orchestra, a jazz
 * section without a muted trumpet is missing its most recognisable colour, and
 * a popular-music library without a harmonica is odd.
 */

import type { PresetBase } from '../types'
import type { DrumPiece } from './drums'
import { fm, kit, piece, pluck, sub } from './preset-kit'

const wind = (
  id: string, name: string, family: PresetBase['family'], blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { wave: OscillatorType; noise: number; chiff: number; cutoff: number; q: number
       a: number; vib: number; filterType?: BiquadFilterType; gain: number; drive?: number },
) =>
  sub({
    id, name, family, blurb, tags, range, centerMidi, polyphony: 4,
    params: {
      wave: o.wave, voices: 1, noiseLevel: o.noise, chiff: o.chiff,
      filterType: o.filterType ?? 'lowpass', cutoff: o.cutoff, resonance: o.q,
      filterEnv: 0.7, keyTrack: 0.6,
      a: o.a, d: 0.2, s: 0.88, r: 0.16, fa: o.a, fd: 0.25, fs: 0.7, fr: 0.14,
      vibratoRate: 5.1, vibratoDepth: o.vib, vibratoDelay: 0.4,
      drive: o.drive ?? 0, gain: o.gain,
    },
  })

const brass = (
  id: string, name: string, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { index: number; a: number; bright: number; gain: number; drive: number; chorus?: number },
) =>
  fm({
    id, name, family: 'brass', blurb, tags, range, centerMidi, polyphony: 6,
    params: {
      ops: [
        { ratio: 1, level: 1, a: o.a, d: 0.3, s: 0.85, r: 0.16, wave: 'sawtooth', velSens: 0.3 },
        { ratio: 1, level: o.index, a: o.a * 2.4, d: 0.5, s: o.bright, r: 0.12, velSens: 0.85 },
        { ratio: 2, level: 0.25, a: o.a * 1.6, d: 0.4, s: 0.5, r: 0.12, velSens: 0.7 },
      ],
      routes: [[1, 0], [2, 0], [0, -1]],
      chorus: o.chorus ?? 0.12, drive: o.drive, gain: o.gain,
      pitchEnv: 0.12, pitchEnvTime: 0.05,
    },
  })

export const ORCHESTRAL_PRESETS: PresetBase[] = [
  // --- woodwind -----------------------------------------------------------
  wind('bassoon', 'Bassoon', 'winds', 'The orchestra\'s bass double reed. Reedy, woody, faintly comic and deeply warm.',
    ['orchestral', 'reed', 'low', 'woodwind', 'classical'], [34, 72], 50,
    { wave: 'sawtooth', noise: 0.09, chiff: 0.2, cutoff: 1250, q: 2.6, a: 0.05, vib: 11,
      filterType: 'bandpass', gain: 0.4 }),
  wind('cor-anglais', 'Cor Anglais', 'winds', 'The oboe\'s larger cousin. Darker, rounder, and the sound of a lonely melody.',
    ['orchestral', 'reed', 'plaintive', 'cinematic'], [52, 81], 64,
    { wave: 'sawtooth', noise: 0.08, chiff: 0.2, cutoff: 2100, q: 3.2, a: 0.045, vib: 15,
      filterType: 'bandpass', gain: 0.34 }),
  wind('piccolo', 'Piccolo', 'winds', 'Half a flute, an octave up. Cuts through absolutely anything.',
    ['orchestral', 'bright', 'high', 'marching'], [74, 103], 86,
    { wave: 'sine', noise: 0.18, chiff: 0.35, cutoff: 6000, q: 1.2, a: 0.025, vib: 12, gain: 0.34 }),
  wind('recorder', 'Recorder', 'winds', 'Simple, pure and slightly hollow. Everyone\'s first instrument.',
    ['folk', 'baroque', 'simple', 'school'], [72, 96], 79,
    { wave: 'sine', noise: 0.2, chiff: 0.42, cutoff: 3600, q: 1.5, a: 0.025, vib: 7, gain: 0.42 }),
  wind('soprano-sax', 'Soprano Sax', 'winds', 'Straight, narrow and penetrating. Smooth jazz and Coltrane alike.',
    ['jazz', 'reed', 'lead', 'smooth'], [56, 87], 70,
    { wave: 'sawtooth', noise: 0.12, chiff: 0.28, cutoff: 2800, q: 2.8, a: 0.035, vib: 16,
      filterType: 'bandpass', gain: 0.32, drive: 0.28 }),
  wind('bari-sax', 'Baritone Sax', 'winds', 'Big, honking and low. Funk sections and rock and roll.',
    ['jazz', 'funk', 'reed', 'low', 'fat'], [36, 68], 48,
    { wave: 'sawtooth', noise: 0.2, chiff: 0.35, cutoff: 1400, q: 2.2, a: 0.045, vib: 13,
      filterType: 'bandpass', gain: 0.4, drive: 0.35 }),
  wind('harmonica', 'Harmonica', 'winds', 'Free reeds, bent notes and breath. Blues, folk and country.',
    ['blues', 'folk', 'country', 'reed', 'pocket'], [60, 96], 72,
    { wave: 'sawtooth', noise: 0.22, chiff: 0.3, cutoff: 2600, q: 3, a: 0.03, vib: 18,
      filterType: 'bandpass', gain: 0.3, drive: 0.35 }),
  sub({
    id: 'melodica', name: 'Melodica', family: 'winds',
    blurb: 'Blown reeds under a keyboard. Dub, reggae and classrooms.',
    tags: ['reggae', 'dub', 'reed', 'toy', 'keyboard'],
    range: [53, 89], centerMidi: 67, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: 1, osc2Wave: 'square', osc2Semi: 0, osc2Level: 0.35,
      noiseLevel: 0.12, chiff: 0.25,
      filterType: 'lowpass', cutoff: 2400, resonance: 1.6, filterEnv: 0.4, keyTrack: 0.5,
      a: 0.03, d: 0.12, s: 0.9, r: 0.1, fa: 0.03, fd: 0.2, fs: 0.8, fr: 0.1,
      vibratoRate: 5, vibratoDepth: 8, vibratoDelay: 0.4, gain: 0.38,
    },
  }),
  wind('ocarina', 'Ocarina', 'winds', 'A clay vessel flute. Pure, round and a bit magical.',
    ['folk', 'game', 'pure', 'vessel'], [67, 91], 76,
    { wave: 'sine', noise: 0.15, chiff: 0.32, cutoff: 3000, q: 1.6, a: 0.03, vib: 10, gain: 0.44 }),

  // --- brass --------------------------------------------------------------
  brass('muted-trumpet', 'Muted Trumpet', 'A mute in the bell: thin, buzzy and intimate. Noir jazz.',
    ['jazz', 'noir', 'mute', 'intimate'], [54, 84], 67,
    { index: 3.4, a: 0.03, bright: 0.5, gain: 0.26, drive: 0.35 }),
  brass('flugelhorn', 'Flugelhorn', 'A trumpet with the edges sanded off. Warmer, rounder, mellower.',
    ['jazz', 'warm', 'mellow', 'ballad'], [52, 82], 64,
    { index: 1.5, a: 0.05, bright: 0.32, gain: 0.32, drive: 0.15 }),
  brass('euphonium', 'Euphonium', 'The brass band\'s tenor voice. Round and singing in the low-mid.',
    ['brass band', 'warm', 'low', 'marching'], [34, 70], 50,
    { index: 1.6, a: 0.06, bright: 0.3, gain: 0.38, drive: 0.18 }),
  brass('horn-stabs', 'Funk Horn Stabs', 'Short, hard section hits. Funk, soul, ska and afrobeat.',
    ['funk', 'soul', 'ska', 'afrobeat', 'stabs'], [48, 84], 64,
    { index: 3, a: 0.012, bright: 0.5, gain: 0.26, drive: 0.4, chorus: 0.5 }),

  // --- strings ------------------------------------------------------------
  sub({
    id: 'contrabass', name: 'Double Bass (bowed)', family: 'bowed',
    blurb: 'The bottom of the orchestra, bowed rather than plucked. Dark and enormous.',
    tags: ['orchestral', 'low', 'classical', 'dark', 'strings'],
    range: [28, 60], centerMidi: 40, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: 2, detune: 10, spread: 0.35,
      osc2Wave: 'sawtooth', osc2Semi: 0, osc2Level: 0.25, noiseLevel: 0.05, chiff: 0.08,
      filterType: 'lowpass', cutoff: 1100, resonance: 1.3, filterEnv: 0.8, keyTrack: 0.5,
      a: 0.1, d: 0.35, s: 0.85, r: 0.3, fa: 0.13, fd: 0.4, fs: 0.6, fr: 0.28,
      vibratoRate: 4.8, vibratoDepth: 10, vibratoDelay: 0.35, chorus: 0.18, gain: 0.5,
    },
  }),
  sub({
    id: 'fiddle', name: 'Folk Fiddle', family: 'bowed',
    blurb: 'A violin played rough and rhythmic. Celtic, bluegrass, Nordic.',
    tags: ['folk', 'celtic', 'bluegrass', 'dance', 'rough'],
    range: [55, 93], centerMidi: 69, polyphony: 4,
    params: {
      wave: 'sawtooth', voices: 2, detune: 13, spread: 0.3,
      noiseLevel: 0.09, chiff: 0.16,
      filterType: 'lowpass', cutoff: 3400, resonance: 1.8, filterEnv: 1.1, keyTrack: 0.55,
      a: 0.03, d: 0.3, s: 0.82, r: 0.2, fa: 0.04, fd: 0.35, fs: 0.65, fr: 0.2,
      vibratoRate: 5.8, vibratoDepth: 9, vibratoDelay: 0.5, drive: 0.15, gain: 0.4,
    },
  }),

  // --- keys ---------------------------------------------------------------
  fm({
    id: 'toy-piano', name: 'Toy Piano', family: 'keys',
    blurb: 'Hammers hitting metal rods. Childlike, slightly out of tune, oddly moving.',
    tags: ['toy', 'childlike', 'indie', 'nostalgic', 'film'],
    range: [60, 96], centerMidi: 72, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.001, d: 0.8, s: 0, r: 0.2, velSens: 0.45 },
        { ratio: 6.3, level: 0.85, a: 0.001, d: 0.12, s: 0, r: 0.05, velSens: 0.85 },
      ],
      routes: [[1, 0], [0, -1]], drive: 0.15, gain: 0.5, pitchEnv: 0.25, pitchEnvTime: 0.015,
    },
  }),
  sub({
    id: 'mellotron', name: 'Mellotron Strings', family: 'keys',
    blurb: 'Tape loops of a string section, wobbling as they play. Prog rock and Beatles.',
    tags: ['retro', 'tape', 'prog', '60s', 'strings', 'wobble'],
    range: [41, 84], centerMidi: 60, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 4, detune: 19, spread: 0.7,
      noiseLevel: 0.05,
      filterType: 'lowpass', cutoff: 1900, resonance: 1, filterEnv: 0.4, keyTrack: 0.4,
      a: 0.12, d: 0.5, s: 0.85, r: 0.5, fa: 0.16, fd: 0.6, fs: 0.75, fr: 0.45,
      // Tape wow: a slow, slightly unsteady pitch drift.
      vibratoRate: 1.6, vibratoDepth: 7, vibratoDelay: 0.05,
      chorus: 0.7, drive: 0.2, gain: 0.34,
    },
  }),
  sub({
    id: 'combo-organ', name: 'Combo Organ', family: 'keys',
    blurb: 'Cheap 60s transistor organ. Thin, buzzy and full of attitude.',
    tags: ['60s', 'garage', 'psych', 'retro', 'organ'],
    range: [41, 89], centerMidi: 64, polyphony: 8,
    params: {
      wave: 'square', voices: 2, detune: 9, spread: 0.3,
      osc2Wave: 'square', osc2Semi: 12, osc2Level: 0.45,
      filterType: 'lowpass', cutoff: 3200, resonance: 1.4, filterEnv: 0.2, keyTrack: 0.4,
      a: 0.008, d: 0.05, s: 1, r: 0.05, fa: 0.008, fd: 0.1, fs: 0.9, fr: 0.05,
      vibratoRate: 6.4, vibratoDepth: 9, vibratoDelay: 0.2,
      drive: 0.3, chorus: 0.3, gain: 0.34,
    },
  }),

  // --- tuned percussion ---------------------------------------------------
  fm({
    id: 'crotales', name: 'Crotales', family: 'mallets',
    blurb: 'Small tuned bronze discs. Piercing, glassy, and used sparingly for a reason.',
    tags: ['orchestral', 'bright', 'bells', 'cinematic', 'high'],
    range: [84, 108], centerMidi: 93, polyphony: 6,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.001, d: 2.4, s: 0, r: 0.6, velSens: 0.4 },
        { ratio: 4.7, level: 1.1, a: 0.001, d: 0.5, s: 0, r: 0.15, velSens: 0.85 },
      ],
      routes: [[1, 0], [0, -1]], gain: 0.34,
    },
  }),
  fm({
    id: 'handbells', name: 'Handbells', family: 'mallets',
    blurb: 'Tuned bells rung by hand. Warm, round and choral.',
    tags: ['bells', 'choral', 'christmas', 'warm'],
    range: [60, 96], centerMidi: 72, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.004, d: 2.8, s: 0, r: 0.7, velSens: 0.4 },
        { ratio: 2.4, level: 0.7, a: 0.003, d: 0.9, s: 0, r: 0.25, velSens: 0.75 },
        { ratio: 5.2, level: 0.22, a: 0.002, d: 0.4, s: 0, r: 0.12, velSens: 0.85 },
      ],
      routes: [[1, 0], [2, 0], [0, -1]], chorus: 0.25, gain: 0.44,
    },
  }),
  sub({
    id: 'glass-harmonica', name: 'Glass Harmonica', family: 'mallets',
    blurb: 'Wet fingers on spinning glass. Pure, eerie, and impossible to locate in a room.',
    tags: ['glass', 'eerie', 'pure', 'cinematic', 'ethereal'],
    range: [60, 96], centerMidi: 74, polyphony: 8,
    params: {
      wave: 'sine', voices: 3, detune: 6, spread: 0.7,
      osc2Wave: 'sine', osc2Semi: 19, osc2Level: 0.18,
      filterType: 'lowpass', cutoff: 3400, resonance: 0.8, filterEnv: 0.3, keyTrack: 0.4,
      a: 0.4, d: 0.6, s: 0.9, r: 0.9, fa: 0.5, fd: 0.8, fs: 0.85, fr: 0.8,
      vibratoRate: 4.2, vibratoDepth: 6, vibratoDelay: 0.6, chorus: 0.7, gain: 0.32,
    },
  }),
  pluck({
    id: 'dulcimer', name: 'Hammered Dulcimer', family: 'plucked',
    blurb: 'Struck strings over a trapezoid box. Appalachian, Persian and everywhere between.',
    tags: ['folk', 'appalachian', 'hammered', 'bright', 'shimmer'],
    range: [52, 88], centerMidi: 67, polyphony: 12,
    params: {
      sustain: 3, damping: 0.2, decayKeyScale: 0.4, pluckPosition: 0.18,
      excitationTone: 0.82, inharmonicity: 0.025, releaseDamp: 3.5, bodyMix: 0.72, gain: 0.5,
      body: [{ freq: 380, q: 1.5, gain: 5 }, { freq: 1800, q: 1.4, gain: 4 }],
    },
  }),

  // --- voices -------------------------------------------------------------
  sub({
    id: 'male-choir', name: 'Male Choir', family: 'voice',
    blurb: 'Low voices in unison. Orthodox, monastic, and very effective under strings.',
    tags: ['vocal', 'choir', 'low', 'cinematic', 'sacred'],
    range: [36, 69], centerMidi: 50, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 5, detune: 16, spread: 0.7,
      noiseLevel: 0.05, chiff: 0.08,
      osc2Wave: 'triangle', osc2Semi: 0, osc2Level: 0.4,
      filterType: 'bandpass', cutoff: 520, resonance: 3, filterEnv: 0.4, keyTrack: 0.75,
      a: 0.3, d: 0.8, s: 0.88, r: 0.8, fa: 0.35, fd: 1, fs: 0.8, fr: 0.7,
      vibratoRate: 4.4, vibratoDepth: 9, vibratoDelay: 0.5, chorus: 0.85, gain: 0.36,
    },
  }),
  sub({
    id: 'soprano-voice', name: 'Soprano', family: 'voice',
    blurb: 'A single high voice. Operatic, wordless, and instantly cinematic.',
    tags: ['vocal', 'opera', 'high', 'cinematic', 'solo'],
    range: [60, 93], centerMidi: 72, polyphony: 3,
    params: {
      wave: 'sawtooth', voices: 2, detune: 8, spread: 0.3,
      noiseLevel: 0.06, chiff: 0.12,
      filterType: 'bandpass', cutoff: 1400, resonance: 4.5, filterEnv: 0.6, keyTrack: 0.8,
      a: 0.12, d: 0.4, s: 0.85, r: 0.5, fa: 0.14, fd: 0.5, fs: 0.75, fr: 0.45,
      vibratoRate: 5.6, vibratoDepth: 22, vibratoDelay: 0.25, chorus: 0.35, gain: 0.32,
    },
  }),
]

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

const p = (spec: DrumPiece): DrumPiece => piece(spec)

export const ORCHESTRAL_KITS: PresetBase[] = [
  kit('kit-orchestral', 'Orchestral Percussion',
    'Timpani, concert bass drum, gong and cymbals. For endings, mostly.',
    ['orchestral', 'cinematic', 'timpani', 'epic', 'classical'], {
      36: p({ type: 'membrane', name: 'Timpani Low', tune: 66, decay: 1.6, level: 1, bend: 1.25, bendTime: 0.12, tone: 0.3, snap: 0.3 }),
      38: p({ type: 'membrane', name: 'Timpani Mid', tune: 88, decay: 1.4, level: 0.95, bend: 1.2, bendTime: 0.1, tone: 0.35, snap: 0.35 }),
      40: p({ type: 'membrane', name: 'Timpani High', tune: 116, decay: 1.2, level: 0.95, bend: 1.18, bendTime: 0.1, tone: 0.4, snap: 0.4 }),
      41: p({ type: 'membrane', name: 'Bass Drum', tune: 48, decay: 1.5, level: 1, bend: 1.5, bendTime: 0.1, tone: 0.2, snap: 0.25 }),
      43: p({ type: 'snare', name: 'Field Snare', tune: 240, decay: 0.1, level: 0.75, tone: 0.8, snap: 0.95 }),
      45: p({ type: 'cymbal', name: 'Crash Cymbals', tune: 300, decay: 2.6, level: 0.5, tone: 0.55 }),
      47: p({ type: 'cymbal', name: 'Tam-tam', tune: 100, decay: 4, level: 0.6, tone: 0.25 }),
      49: p({ type: 'click', name: 'Woodblock', tune: 1000, decay: 0.06, level: 0.5 }),
      51: p({ type: 'shaker', name: 'Tambourine', tune: 0, decay: 0.2, level: 0.4, tone: 0.85 }),
    }, 0.92),

  kit('kit-jazz-brush', 'Jazz Brushes',
    'Brushes swept across the snare, ride cymbal doing the timekeeping.',
    ['jazz', 'brushes', 'swing', 'soft', 'ballad'], {
      36: p({ type: 'kick', name: 'Kick', tune: 52, decay: 0.24, level: 0.65, bend: 2.6, bendTime: 0.04, tone: 0.4, snap: 0.3 }),
      37: p({ type: 'rim', name: 'Cross Stick', tune: 500, decay: 0.02, level: 0.5 }),
      38: p({ type: 'noise', name: 'Brush Sweep', tune: 1800, decay: 0.3, level: 0.35 }),
      40: p({ type: 'snare', name: 'Brush Tap', tune: 200, decay: 0.08, level: 0.5, tone: 0.3, snap: 0.4 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.05, level: 0.32, tone: 0.2, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.4, level: 0.3, tone: 0.25, choke: 'hat' }),
      51: p({ type: 'cymbal', name: 'Ride', tune: 420, decay: 1.8, level: 0.4, tone: 0.5, pan: 0.25 }),
      53: p({ type: 'cymbal', name: 'Ride Bell', tune: 700, decay: 0.9, level: 0.35, tone: 0.8, pan: 0.25 }),
    }, 0.9),

  kit('kit-breakbeat', 'Breakbeat',
    'The sampled funk break that jungle, drum & bass and big beat were built on.',
    ['breakbeat', 'jungle', 'dnb', 'funk', 'sampled'], {
      36: p({ type: 'kick', name: 'Kick', tune: 56, decay: 0.26, level: 1, bend: 3.2, bendTime: 0.03, tone: 0.6, snap: 0.75, drive: 0.3 }),
      38: p({ type: 'snare', name: 'Snare', tune: 205, decay: 0.16, level: 0.95, tone: 0.55, snap: 0.9, drive: 0.25 }),
      40: p({ type: 'snare', name: 'Ghost Snare', tune: 205, decay: 0.07, level: 0.35, tone: 0.5, snap: 0.6 }),
      41: p({ type: 'tom', name: 'Floor Tom', tune: 92, decay: 0.42, level: 0.7, tone: 0.5, pan: -0.25 }),
      45: p({ type: 'tom', name: 'Mid Tom', tune: 145, decay: 0.36, level: 0.7, tone: 0.5 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.045, level: 0.42, tone: 0.3, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.34, level: 0.4, tone: 0.35, choke: 'hat' }),
      49: p({ type: 'cymbal', name: 'Crash', tune: 290, decay: 1.8, level: 0.35, tone: 0.5 }),
      51: p({ type: 'cymbal', name: 'Ride', tune: 400, decay: 1.4, level: 0.3, tone: 0.6, pan: 0.25 }),
    }, 0.94, 0.18),

  kit('kit-techno', 'Techno',
    'Hard, dry and mechanical. Berlin basements rather than festival fields.',
    ['techno', 'club', 'industrial', 'hard', 'minimal'], {
      36: p({ type: 'kick', name: 'Kick', tune: 50, decay: 0.34, level: 1, bend: 4.5, bendTime: 0.02, tone: 0.5, snap: 0.85, drive: 0.5 }),
      37: p({ type: 'rim', name: 'Rim', tune: 700, decay: 0.018, level: 0.55 }),
      38: p({ type: 'snare', name: 'Snare', tune: 230, decay: 0.1, level: 0.6, tone: 0.85, snap: 0.9 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1500, decay: 0.14, level: 0.7 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 440, decay: 0.03, level: 0.45, tone: 0.95, choke: 'hat' }),
      44: p({ type: 'hat', name: 'Pedal Hat', tune: 440, decay: 0.08, level: 0.4, tone: 0.9, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 440, decay: 0.42, level: 0.4, tone: 0.95, choke: 'hat' }),
      49: p({ type: 'cymbal', name: 'Crash', tune: 340, decay: 1.4, level: 0.32, tone: 0.8 }),
      51: p({ type: 'cymbal', name: 'Ride', tune: 500, decay: 1, level: 0.28, tone: 0.9, pan: 0.2 }),
      70: p({ type: 'noise', name: 'Noise Hit', tune: 3000, decay: 0.12, level: 0.35 }),
    }, 0.95, 0.25),

  kit('kit-disco', 'Disco',
    'Live-sounding kit with an open hat on every offbeat. Four on the floor, 1977 version.',
    ['disco', 'funk', '70s', 'dance', 'live'], {
      36: p({ type: 'kick', name: 'Kick', tune: 54, decay: 0.28, level: 0.95, bend: 3, bendTime: 0.035, tone: 0.55, snap: 0.6 }),
      38: p({ type: 'snare', name: 'Snare', tune: 195, decay: 0.19, level: 0.85, tone: 0.5, snap: 0.75 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1100, decay: 0.2, level: 0.6 }),
      41: p({ type: 'tom', name: 'Floor Tom', tune: 98, decay: 0.48, level: 0.7, tone: 0.5, pan: -0.3 }),
      45: p({ type: 'tom', name: 'Mid Tom', tune: 150, decay: 0.4, level: 0.7, tone: 0.5 }),
      48: p({ type: 'tom', name: 'Hi Tom', tune: 200, decay: 0.34, level: 0.7, tone: 0.5, pan: 0.3 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.05, level: 0.4, tone: 0.3, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.42, level: 0.42, tone: 0.35, choke: 'hat' }),
      49: p({ type: 'cymbal', name: 'Crash', tune: 290, decay: 2, level: 0.34, tone: 0.45, pan: -0.3 }),
      70: p({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.06, level: 0.35, tone: 0.6, pan: 0.25 }),
      72: p({ type: 'cowbell', name: 'Cowbell', tune: 540, decay: 0.26, level: 0.35 }),
    }, 0.92, 0.1),
]
