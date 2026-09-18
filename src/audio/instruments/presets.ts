/**
 * The instrument library.
 *
 * Every instrument here is synthesised, not sampled: Overtone loads in
 * milliseconds, works offline, and each instrument stays editable rather than
 * being a frozen recording. The trade is honest — a modelled violin is a
 * modelled violin, not the Berlin Phil — but it means a sitar, a Rhodes and an
 * 808 all live in the same few hundred kilobytes and can be reshaped live.
 */

import type { InstrumentFamily, PresetBase } from '../types'
import { fm, kit, OUT, piece, pluck, sub } from './preset-kit'
import { ELECTRONIC_PRESETS, FX_KIT } from './presets-electronic'
import { AFRICAN_KITS, AFRICAN_PRESETS } from './presets-african'
import { WORLD_PRESETS, WORLD_KITS } from './presets-world'
import { ORCHESTRAL_PRESETS, ORCHESTRAL_KITS } from './presets-orchestral'

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const KEYS: PresetBase[] = [
  pluck({
    id: 'grand-piano', name: 'Grand Piano', family: 'keys',
    blurb: 'Struck-string model with real inharmonicity and a wooden body.',
    tags: ['piano', 'acoustic', 'classical', 'ballad'],
    range: [21, 108], centerMidi: 60, polyphony: 16,
    params: {
      sustain: 7, damping: 0.16, decayKeyScale: 0.5, pluckPosition: 0.12,
      excitationTone: 0.72, inharmonicity: 0.09, releaseDamp: 9, pickup: 0,
      bodyMix: 0.55, gain: 0.62,
      body: [{ freq: 120, q: 1.1, gain: 5 }, { freq: 420, q: 1.6, gain: 3 }, { freq: 1600, q: 1.2, gain: 2 }],
    },
  }),
  pluck({
    id: 'upright-piano', name: 'Upright Piano', family: 'keys',
    blurb: 'Boxier and closer-miked than the grand. Good for lo-fi and demos.',
    tags: ['piano', 'lofi', 'warm', 'bedroom'],
    range: [24, 100], polyphony: 14,
    params: {
      sustain: 4.5, damping: 0.3, decayKeyScale: 0.45, pluckPosition: 0.16,
      excitationTone: 0.6, inharmonicity: 0.13, releaseDamp: 12,
      bodyMix: 0.8, gain: 0.6,
      body: [{ freq: 160, q: 0.9, gain: 6 }, { freq: 700, q: 2.2, gain: 4 }, { freq: 2400, q: 1.4, gain: -3 }],
    },
  }),
  fm({
    id: 'rhodes', name: 'Electric Piano', family: 'keys',
    blurb: 'The tine classic. Soft when you play soft, barks when you dig in.',
    tags: ['rhodes', 'ep', 'soul', 'jazz', 'lofi', 'neosoul'],
    range: [28, 96], polyphony: 12,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 2.6, s: 0.0, r: 0.5, velSens: 0.35 },
        { ratio: 14, level: 1.05, a: 0.001, d: 0.22, s: 0.0, r: 0.1, velSens: 0.95, keyScale: -0.35 },
        { ratio: 1, level: 0.32, a: 0.004, d: 4.5, s: 0.0, r: 0.6, detune: 6, velSens: 0.3 },
      ],
      routes: [[1, 0], [0, OUT], [2, OUT]],
      chorus: 0.55, drive: 0.12, gain: 0.75,
    },
  }),
  fm({
    id: 'wurli', name: 'Wurli', family: 'keys',
    blurb: 'Reedier, grittier electric piano. Loves a bit of drive.',
    tags: ['wurlitzer', 'ep', 'vintage', 'indie', 'soul'],
    range: [28, 93], polyphony: 12,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.9, s: 0.0, r: 0.35, velSens: 0.4 },
        { ratio: 2, level: 1.6, a: 0.001, d: 0.5, s: 0.05, r: 0.15, velSens: 0.9, feedback: 0.18 },
      ],
      routes: [[1, 0], [0, OUT]],
      chorus: 0.3, drive: 0.35, gain: 0.7,
    },
  }),
  pluck({
    id: 'clavinet', name: 'Clavinet', family: 'keys',
    blurb: 'Percussive, funky, all attack. Stabs and skanks.',
    tags: ['clav', 'funk', 'stevie', 'rhythm'],
    range: [36, 88], polyphony: 10,
    params: {
      sustain: 0.9, damping: 0.24, decayKeyScale: 0.3, pluckPosition: 0.06,
      excitationTone: 0.9, inharmonicity: 0.02, pickup: 0.3, releaseDamp: 45,
      drive: 0.25, bodyMix: 0.4, gain: 0.7,
      body: [{ freq: 900, q: 1.4, gain: 4 }, { freq: 2600, q: 1.1, gain: 3 }],
    },
  }),
  pluck({
    id: 'harpsichord', name: 'Harpsichord', family: 'keys',
    blurb: 'Quilled and bright, no dynamics to speak of — baroque by design.',
    tags: ['baroque', 'classical', 'bright'],
    range: [29, 89], polyphony: 12,
    params: {
      sustain: 2.2, damping: 0.12, decayKeyScale: 0.4, pluckPosition: 0.08,
      excitationTone: 0.95, inharmonicity: 0.03, releaseDamp: 30, bodyMix: 0.6, gain: 0.5,
      body: [{ freq: 260, q: 1.2, gain: 4 }, { freq: 1400, q: 1.5, gain: 3 }],
    },
  }),
  fm({
    id: 'drawbar-organ', name: 'Drawbar Organ', family: 'keys',
    blurb: 'Additive drawbars with a lazy rotary wobble. Gospel to garage rock.',
    tags: ['hammond', 'organ', 'rock', 'gospel', 'jazz'],
    range: [36, 96], polyphony: 12,
    params: {
      ops: [
        { ratio: 0.5, level: 0.45, a: 0.012, d: 0.05, s: 1, r: 0.06, velSens: 0.2 },
        { ratio: 1, level: 1, a: 0.01, d: 0.05, s: 1, r: 0.06, velSens: 0.2 },
        { ratio: 2, level: 0.55, a: 0.012, d: 0.05, s: 1, r: 0.06, velSens: 0.2 },
        { ratio: 3, level: 0.3, a: 0.014, d: 0.05, s: 1, r: 0.06, velSens: 0.25 },
        { ratio: 4, level: 0.22, a: 0.014, d: 0.05, s: 1, r: 0.06, velSens: 0.25 },
        { ratio: 8, level: 0.12, a: 0.016, d: 0.05, s: 1, r: 0.06, velSens: 0.3 },
      ],
      routes: [[0, OUT], [1, OUT], [2, OUT], [3, OUT], [4, OUT], [5, OUT]],
      chorus: 0.45, drive: 0.2, gain: 0.5,
    },
  }),
  fm({
    id: 'church-organ', name: 'Church Organ', family: 'keys',
    blurb: 'Pipe ranks with a slow swell. Enormous in the low register.',
    tags: ['pipe', 'cathedral', 'cinematic', 'sacred'],
    range: [24, 96], polyphony: 12,
    params: {
      ops: [
        { ratio: 0.5, level: 0.5, a: 0.09, d: 0.1, s: 1, r: 0.3, velSens: 0.2 },
        { ratio: 1, level: 1, a: 0.07, d: 0.1, s: 1, r: 0.3, velSens: 0.2 },
        { ratio: 2, level: 0.45, a: 0.08, d: 0.1, s: 1, r: 0.3, velSens: 0.2 },
        { ratio: 3, level: 0.28, a: 0.1, d: 0.1, s: 1, r: 0.3, velSens: 0.2 },
        { ratio: 5.04, level: 0.14, a: 0.12, d: 0.1, s: 1, r: 0.3, velSens: 0.2 },
      ],
      routes: [[0, OUT], [1, OUT], [2, OUT], [3, OUT], [4, OUT]],
      chorus: 0.35, gain: 0.45,
    },
  }),
  sub({
    id: 'accordion', name: 'Accordion', family: 'keys',
    blurb: 'Reedy double-voiced squeezebox. Folk, chanson, cumbia.',
    tags: ['folk', 'french', 'reed', 'world'],
    range: [41, 89], polyphony: 10,
    params: {
      wave: 'sawtooth', voices: 2, detune: 14, spread: 0.3,
      osc2Wave: 'square', osc2Semi: 0, osc2Level: 0.4,
      filterType: 'lowpass', cutoff: 2600, resonance: 1.1, filterEnv: 0.3, keyTrack: 0.4,
      a: 0.06, d: 0.1, s: 0.9, r: 0.12, fa: 0.05, fd: 0.2, fs: 0.7, fr: 0.1,
      vibratoRate: 4.6, vibratoDepth: 9, vibratoDelay: 0.4, chorus: 0.5, gain: 0.5,
    },
  }),
  fm({
    id: 'celesta', name: 'Celesta', family: 'keys',
    blurb: 'Tiny struck bells. Sugar-plum sparkle over anything.',
    tags: ['bells', 'cinematic', 'delicate', 'christmas'],
    range: [60, 108], centerMidi: 72, polyphony: 10,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.6, s: 0, r: 0.4, velSens: 0.4 },
        { ratio: 4.02, level: 1.1, a: 0.001, d: 0.35, s: 0, r: 0.1, velSens: 0.8, keyScale: -0.4 },
      ],
      routes: [[1, 0], [0, OUT]],
      chorus: 0.3, gain: 0.55,
    },
  }),
]

// ---------------------------------------------------------------------------
// Plucked strings
// ---------------------------------------------------------------------------

const PLUCKED: PresetBase[] = [
  pluck({
    id: 'steel-guitar', name: 'Steel-String Guitar', family: 'plucked',
    blurb: 'Dreadnought strum-and-fingerpick acoustic with a big spruce body.',
    tags: ['acoustic', 'folk', 'indie', 'singer-songwriter'],
    range: [40, 88], centerMidi: 55, polyphony: 8,
    params: {
      sustain: 3.4, damping: 0.22, decayKeyScale: 0.4, pluckPosition: 0.22,
      excitationTone: 0.7, inharmonicity: 0.015, releaseDamp: 10, bodyMix: 0.85, gain: 0.7,
      body: [{ freq: 100, q: 1.3, gain: 7 }, { freq: 205, q: 2, gain: 4 }, { freq: 2700, q: 1, gain: 3 }],
    },
  }),
  pluck({
    id: 'nylon-guitar', name: 'Nylon Guitar', family: 'plucked',
    blurb: 'Warm classical fingerstyle. Softer attack, rounder tone.',
    tags: ['classical', 'spanish', 'bossa', 'gentle'],
    range: [40, 84], centerMidi: 55, polyphony: 8,
    params: {
      sustain: 2.6, damping: 0.36, decayKeyScale: 0.4, pluckPosition: 0.3,
      excitationTone: 0.35, inharmonicity: 0.005, releaseDamp: 11, bodyMix: 0.85, gain: 0.75,
      body: [{ freq: 96, q: 1.2, gain: 7 }, { freq: 220, q: 1.8, gain: 4 }, { freq: 1300, q: 1.1, gain: 2 }],
    },
  }),
  pluck({
    id: 'electric-clean', name: 'Clean Electric', family: 'plucked',
    blurb: 'Single-coil, amp off the edge of breakup. Arpeggios and funk.',
    tags: ['electric', 'guitar', 'indie', 'funk', 'clean'],
    range: [40, 88], centerMidi: 55, polyphony: 8,
    params: {
      sustain: 3.6, damping: 0.25, decayKeyScale: 0.32, pluckPosition: 0.14,
      excitationTone: 0.8, inharmonicity: 0.02, pickup: 0.22, releaseDamp: 16,
      drive: 0.15, bodyMix: 0.35, gain: 0.65,
      body: [{ freq: 480, q: 1.4, gain: 3 }, { freq: 2200, q: 1.2, gain: 4 }],
    },
  }),
  pluck({
    id: 'electric-crunch', name: 'Crunch Guitar', family: 'plucked',
    blurb: 'Driven amp for power chords and riffs. Keep the voicings low and wide.',
    tags: ['rock', 'distortion', 'riff', 'band'],
    range: [40, 84], centerMidi: 52, polyphony: 6,
    params: {
      sustain: 4.5, damping: 0.2, decayKeyScale: 0.25, pluckPosition: 0.1,
      excitationTone: 0.85, inharmonicity: 0.02, pickup: 0.3, releaseDamp: 20,
      drive: 0.72, bodyMix: 0.3, gain: 0.4,
      body: [{ freq: 700, q: 1.1, gain: 5 }, { freq: 2600, q: 1.5, gain: 3 }, { freq: 5200, q: 1, gain: -6 }],
    },
  }),
  pluck({
    id: 'bass-guitar', name: 'Electric Bass', family: 'bass',
    blurb: 'Fingered electric bass. The anchor under almost everything.',
    tags: ['bass', 'band', 'funk', 'pop'],
    range: [28, 60], centerMidi: 40, polyphony: 4,
    params: {
      sustain: 3.2, damping: 0.4, decayKeyScale: 0.25, pluckPosition: 0.18,
      excitationTone: 0.6, inharmonicity: 0.01, pickup: 0.18, releaseDamp: 18,
      drive: 0.2, bodyMix: 0.4, gain: 0.85,
      body: [{ freq: 80, q: 1.1, gain: 6 }, { freq: 700, q: 1.3, gain: 2 }],
    },
  }),
  pluck({
    id: 'upright-bass', name: 'Upright Bass', family: 'bass',
    blurb: 'Woody, thumpy double bass. Jazz walks and lo-fi loops.',
    tags: ['jazz', 'acoustic', 'lofi', 'swing'],
    range: [28, 60], centerMidi: 40, polyphony: 4,
    params: {
      sustain: 1.8, damping: 0.62, decayKeyScale: 0.3, pluckPosition: 0.34,
      excitationTone: 0.3, inharmonicity: 0.004, releaseDamp: 14, bodyMix: 0.95, gain: 0.9,
      body: [{ freq: 62, q: 1.2, gain: 8 }, { freq: 180, q: 1.6, gain: 4 }, { freq: 400, q: 1.2, gain: -3 }],
    },
  }),
  pluck({
    id: 'sitar', name: 'Sitar', family: 'world',
    blurb: 'Jawari bridge buzz and long sympathetic ring. Try it in Bhairav or Yaman.',
    tags: ['india', 'raga', 'psychedelic', 'buzz', 'world'],
    range: [45, 84], centerMidi: 57, polyphony: 8,
    params: {
      sustain: 5.5, damping: 0.14, decayKeyScale: 0.28, pluckPosition: 0.1,
      excitationTone: 0.85, inharmonicity: 0.01, buzz: 0.75, buzzThreshold: 0.07,
      releaseDamp: 4, bodyMix: 0.8, gain: 0.5,
      body: [{ freq: 240, q: 1.4, gain: 6 }, { freq: 1100, q: 1.8, gain: 5 }, { freq: 3200, q: 1.2, gain: 4 }],
    },
  }),
  pluck({
    id: 'koto', name: 'Koto', family: 'world',
    blurb: 'Japanese zither — try Hirajoshi or In sen for instant atmosphere.',
    tags: ['japan', 'zither', 'world', 'pentatonic'],
    range: [48, 84], centerMidi: 60, polyphony: 8,
    params: {
      sustain: 3.2, damping: 0.2, decayKeyScale: 0.35, pluckPosition: 0.16,
      excitationTone: 0.75, inharmonicity: 0.02, buzz: 0.12, releaseDamp: 6,
      bodyMix: 0.75, gain: 0.6,
      body: [{ freq: 320, q: 1.5, gain: 5 }, { freq: 1500, q: 1.3, gain: 4 }],
    },
  }),
  pluck({
    id: 'oud', name: 'Oud', family: 'world',
    blurb: 'Fretless Arabic lute, deep and vocal. Pairs with Hijaz.',
    tags: ['arabic', 'turkish', 'lute', 'world', 'maqam'],
    range: [40, 76], centerMidi: 52, polyphony: 8,
    params: {
      sustain: 2.2, damping: 0.42, decayKeyScale: 0.35, pluckPosition: 0.26,
      excitationTone: 0.55, inharmonicity: 0.006, releaseDamp: 12, bodyMix: 0.9, gain: 0.7,
      body: [{ freq: 110, q: 1.1, gain: 7 }, { freq: 380, q: 1.7, gain: 4 }, { freq: 1900, q: 1.2, gain: 2 }],
    },
  }),
  pluck({
    id: 'banjo', name: 'Banjo', family: 'plucked',
    blurb: 'Snappy skin-head twang. Rolls and bluegrass patterns.',
    tags: ['bluegrass', 'folk', 'country', 'bright'],
    range: [48, 84], centerMidi: 60, polyphony: 8,
    params: {
      sustain: 1.1, damping: 0.16, decayKeyScale: 0.5, pluckPosition: 0.08,
      excitationTone: 0.95, inharmonicity: 0.03, releaseDamp: 25, bodyMix: 0.7, gain: 0.55,
      body: [{ freq: 350, q: 1.8, gain: 6 }, { freq: 1800, q: 1.4, gain: 5 }],
    },
  }),
  pluck({
    id: 'harp', name: 'Concert Harp', family: 'plucked',
    blurb: 'Long, sweet decay. Glissandi sound magical in any pentatonic scale.',
    tags: ['orchestral', 'cinematic', 'gliss', 'gentle'],
    range: [24, 103], centerMidi: 60, polyphony: 16,
    params: {
      sustain: 5, damping: 0.3, decayKeyScale: 0.45, pluckPosition: 0.28,
      excitationTone: 0.45, inharmonicity: 0.004, releaseDamp: 3.5, bodyMix: 0.75, gain: 0.65,
      body: [{ freq: 140, q: 1.2, gain: 6 }, { freq: 600, q: 1.5, gain: 3 }],
    },
  }),
  pluck({
    id: 'ukulele', name: 'Ukulele', family: 'plucked',
    blurb: 'Small box, short decay, permanently cheerful.',
    tags: ['hawaii', 'happy', 'folk', 'small'],
    range: [55, 88], centerMidi: 67, polyphony: 6,
    params: {
      sustain: 1.4, damping: 0.35, decayKeyScale: 0.45, pluckPosition: 0.24,
      excitationTone: 0.55, releaseDamp: 14, bodyMix: 0.9, gain: 0.7,
      body: [{ freq: 380, q: 1.6, gain: 7 }, { freq: 1200, q: 1.3, gain: 3 }],
    },
  }),
  pluck({
    id: 'santoor', name: 'Santoor', family: 'world',
    blurb: 'Hammered zither shimmer. Fast repeated notes turn into a wash.',
    tags: ['india', 'persian', 'hammered', 'world', 'shimmer'],
    range: [48, 88], centerMidi: 64, polyphony: 12,
    params: {
      sustain: 3.8, damping: 0.18, decayKeyScale: 0.4, pluckPosition: 0.2,
      excitationTone: 0.8, inharmonicity: 0.03, releaseDamp: 3, bodyMix: 0.7, gain: 0.5,
      body: [{ freq: 420, q: 1.6, gain: 5 }, { freq: 2100, q: 1.4, gain: 4 }],
    },
  }),
]

// ---------------------------------------------------------------------------
// Bowed strings
// ---------------------------------------------------------------------------

const bowed = (
  id: string, name: string, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { cutoff: number; a: number; vib: number; chorus: number; voices: number; gain: number },
) =>
  sub({
    id, name, family: 'bowed', blurb, tags, range, centerMidi, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: o.voices, detune: 11, spread: 0.45,
      osc2Wave: 'sawtooth', osc2Semi: 0, osc2Level: 0.25,
      noiseLevel: 0.05, chiff: 0.07,
      filterType: 'lowpass', cutoff: o.cutoff, resonance: 1.4, filterEnv: 0.9, keyTrack: 0.55,
      a: o.a, d: 0.35, s: 0.85, r: 0.28, fa: o.a * 1.4, fd: 0.4, fs: 0.6, fr: 0.25,
      vibratoRate: 5.4, vibratoDepth: o.vib, vibratoDelay: 0.32,
      chorus: o.chorus, gain: o.gain,
    },
  })

const BOWED: PresetBase[] = [
  bowed('violin', 'Violin', 'Solo violin with a natural vibrato swell.',
    ['orchestral', 'classical', 'lead', 'strings'], [55, 96], 72,
    { cutoff: 3200, a: 0.07, vib: 16, chorus: 0.15, voices: 2, gain: 0.42 }),
  bowed('viola', 'Viola', 'Darker, throatier middle voice.',
    ['orchestral', 'classical', 'strings', 'warm'], [48, 88], 64,
    { cutoff: 2400, a: 0.08, vib: 14, chorus: 0.18, voices: 2, gain: 0.44 }),
  bowed('cello', 'Cello', 'Rich and singing. The one that carries the emotion.',
    ['orchestral', 'classical', 'strings', 'cinematic'], [36, 76], 52,
    { cutoff: 1800, a: 0.09, vib: 13, chorus: 0.18, voices: 2, gain: 0.5 }),
  bowed('string-ensemble', 'String Ensemble', 'A whole section. Wide, lush, instant film score.',
    ['orchestral', 'pad', 'cinematic', 'lush'], [36, 96], 60,
    { cutoff: 2600, a: 0.16, vib: 9, chorus: 0.9, voices: 5, gain: 0.34 }),
  bowed('erhu', 'Erhu', 'Two-string Chinese fiddle — vocal, keening, very expressive.',
    ['china', 'world', 'lead', 'vocal'], [55, 88], 67,
    { cutoff: 2800, a: 0.06, vib: 24, chorus: 0.1, voices: 1, gain: 0.42 }),
  bowed('sarangi', 'Sarangi', 'Bowed North Indian fiddle with heavy ornament-friendly vibrato.',
    ['india', 'world', 'raga', 'vocal'], [48, 84], 60,
    { cutoff: 2400, a: 0.07, vib: 22, chorus: 0.25, voices: 2, gain: 0.42 }),
]

// ---------------------------------------------------------------------------
// Winds
// ---------------------------------------------------------------------------

const wind = (
  id: string, name: string, family: InstrumentFamily, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { wave: OscillatorType; noise: number; chiff: number; cutoff: number; q: number
       a: number; vib: number; filterType?: BiquadFilterType; gain: number; drive?: number },
) =>
  sub({
    id, name, family, blurb, tags, range, centerMidi, polyphony: 4,
    params: {
      wave: o.wave, voices: 1, detune: 0,
      noiseLevel: o.noise, chiff: o.chiff,
      filterType: o.filterType ?? 'lowpass', cutoff: o.cutoff, resonance: o.q,
      filterEnv: 0.7, keyTrack: 0.6,
      a: o.a, d: 0.2, s: 0.88, r: 0.16, fa: o.a, fd: 0.25, fs: 0.7, fr: 0.14,
      vibratoRate: 5.1, vibratoDepth: o.vib, vibratoDelay: 0.4,
      drive: o.drive ?? 0, gain: o.gain,
    },
  })

const WINDS: PresetBase[] = [
  wind('flute', 'Flute', 'winds', 'Breathy and pure. Sits above everything.',
    ['orchestral', 'airy', 'melody'], [60, 96], 74,
    { wave: 'sine', noise: 0.22, chiff: 0.35, cutoff: 4200, q: 1.2, a: 0.05, vib: 12, gain: 0.5 }),
  wind('bansuri', 'Bansuri', 'world', 'Indian bamboo flute — breathy, with a wide expressive vibrato.',
    ['india', 'bamboo', 'world', 'raga', 'meditative'], [60, 93], 72,
    { wave: 'sine', noise: 0.3, chiff: 0.45, cutoff: 3400, q: 1.6, a: 0.07, vib: 22, gain: 0.5 }),
  wind('shakuhachi', 'Shakuhachi', 'world', 'Japanese end-blown flute. Half the sound is air.',
    ['japan', 'bamboo', 'world', 'meditative', 'breathy'], [58, 88], 70,
    { wave: 'triangle', noise: 0.5, chiff: 0.6, cutoff: 2800, q: 2.2, a: 0.09, vib: 18, gain: 0.45 }),
  wind('pan-flute', 'Pan Flute', 'winds', 'Hollow and wide, with a strong breath transient.',
    ['folk', 'andean', 'airy', 'world'], [60, 91], 72,
    { wave: 'sine', noise: 0.35, chiff: 0.55, cutoff: 3000, q: 1.8, a: 0.04, vib: 10, gain: 0.5 }),
  wind('clarinet', 'Clarinet', 'winds', 'Hollow, woody, odd-harmonic. Klezmer to concert hall.',
    ['orchestral', 'jazz', 'woodwind', 'reed'], [50, 89], 64,
    { wave: 'square', noise: 0.1, chiff: 0.2, cutoff: 2200, q: 1.4, a: 0.045, vib: 8, gain: 0.4 }),
  wind('oboe', 'Oboe', 'winds', 'Nasal double reed that cuts through any arrangement.',
    ['orchestral', 'reed', 'plaintive'], [58, 91], 70,
    { wave: 'sawtooth', noise: 0.08, chiff: 0.22, cutoff: 2600, q: 3.4, a: 0.04, vib: 14,
      filterType: 'bandpass', gain: 0.36 }),
  wind('alto-sax', 'Alto Sax', 'winds', 'Reedy and gutsy. Push velocity for the growl.',
    ['jazz', 'soul', 'lead', 'reed'], [49, 84], 62,
    { wave: 'sawtooth', noise: 0.14, chiff: 0.3, cutoff: 2400, q: 2.6, a: 0.035, vib: 16,
      filterType: 'bandpass', gain: 0.34, drive: 0.3 }),
  wind('tenor-sax', 'Tenor Sax', 'winds', 'Bigger, breathier sax for ballads and hooks.',
    ['jazz', 'soul', 'lead', 'reed', 'warm'], [44, 79], 57,
    { wave: 'sawtooth', noise: 0.18, chiff: 0.35, cutoff: 1900, q: 2.4, a: 0.04, vib: 15,
      filterType: 'bandpass', gain: 0.36, drive: 0.32 }),
  wind('ney', 'Ney', 'world', 'Middle Eastern reed flute, almost entirely breath.',
    ['arabic', 'turkish', 'world', 'breathy', 'meditative'], [57, 86], 69,
    { wave: 'sine', noise: 0.55, chiff: 0.5, cutoff: 2600, q: 2, a: 0.08, vib: 17, gain: 0.42 }),
  wind('whistle', 'Tin Whistle', 'world', 'Irish whistle — piercing, joyful, full of air.',
    ['celtic', 'folk', 'world', 'bright'], [67, 96], 79,
    { wave: 'sine', noise: 0.28, chiff: 0.5, cutoff: 5200, q: 1.4, a: 0.02, vib: 11, gain: 0.42 }),
]

// ---------------------------------------------------------------------------
// Brass
// ---------------------------------------------------------------------------

const brass = (
  id: string, name: string, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { index: number; a: number; bright: number; voices?: number; gain: number; drive: number },
) =>
  fm({
    id, name, family: 'brass', blurb, tags, range, centerMidi, polyphony: 6,
    params: {
      ops: [
        { ratio: 1, level: 1, a: o.a, d: 0.3, s: 0.85, r: 0.16, wave: 'sawtooth', velSens: 0.3 },
        // The rising modulation index is what makes brass sound like it's blown.
        { ratio: 1, level: o.index, a: o.a * 2.4, d: 0.5, s: o.bright, r: 0.12, velSens: 0.85 },
        { ratio: 2, level: 0.25, a: o.a * 1.6, d: 0.4, s: 0.5, r: 0.12, velSens: 0.7 },
      ],
      routes: [[1, 0], [2, 0], [0, OUT]],
      chorus: o.voices ? 0.6 : 0.12, drive: o.drive, gain: o.gain,
      pitchEnv: 0.12, pitchEnvTime: 0.05,
    },
  })

const BRASS: PresetBase[] = [
  brass('trumpet', 'Trumpet', 'Bright and forward. Fanfares, ska stabs, hooks.',
    ['orchestral', 'jazz', 'ska', 'bright', 'lead'], [54, 84], 67,
    { index: 2.6, a: 0.035, bright: 0.45, gain: 0.3, drive: 0.28 }),
  brass('trombone', 'Trombone', 'Fat mid-range slide brass.',
    ['orchestral', 'jazz', 'funk', 'warm'], [40, 72], 53,
    { index: 2.1, a: 0.05, bright: 0.4, gain: 0.34, drive: 0.25 }),
  brass('french-horn', 'French Horn', 'Round and noble, the softest of the brass.',
    ['orchestral', 'cinematic', 'warm', 'soft'], [41, 77], 58,
    { index: 1.3, a: 0.08, bright: 0.3, gain: 0.36, drive: 0.14 }),
  brass('tuba', 'Tuba', 'Bottom-end brass. Oompah, marching, low anchors.',
    ['orchestral', 'marching', 'low'], [28, 58], 40,
    { index: 1.5, a: 0.07, bright: 0.3, gain: 0.42, drive: 0.2 }),
  brass('brass-section', 'Brass Section', 'A whole horn section hitting together.',
    ['funk', 'soul', 'stabs', 'big'], [45, 84], 62,
    { index: 2.4, a: 0.04, bright: 0.45, voices: 1, gain: 0.26, drive: 0.35 }),
]

// ---------------------------------------------------------------------------
// Mallets & bells
// ---------------------------------------------------------------------------

const MALLETS: PresetBase[] = [
  fm({
    id: 'marimba', name: 'Marimba', family: 'mallets',
    blurb: 'Woody bars with a hollow resonator thump.',
    tags: ['percussion', 'wood', 'warm', 'melodic'],
    range: [45, 96], centerMidi: 64, polyphony: 10,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 0.9, s: 0, r: 0.2, velSens: 0.4 },
        { ratio: 4, level: 1.4, a: 0.001, d: 0.12, s: 0, r: 0.06, velSens: 0.8, keyScale: -0.4 },
        { ratio: 9.2, level: 0.35, a: 0.001, d: 0.05, s: 0, r: 0.04, velSens: 0.9 },
      ],
      routes: [[1, 0], [2, 0], [0, OUT]], gain: 0.7, pitchEnv: 0.25, pitchEnvTime: 0.02,
    },
  }),
  fm({
    id: 'xylophone', name: 'Xylophone', family: 'mallets',
    blurb: 'Hard, dry and bright. Cuts through a dense mix.',
    tags: ['percussion', 'bright', 'toy', 'melodic'],
    range: [60, 100], centerMidi: 72, polyphony: 10,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.001, d: 0.35, s: 0, r: 0.1, velSens: 0.4 },
        { ratio: 3, level: 1.8, a: 0.001, d: 0.07, s: 0, r: 0.04, velSens: 0.85 },
      ],
      routes: [[1, 0], [0, OUT]], gain: 0.6, pitchEnv: 0.3, pitchEnvTime: 0.015,
    },
  }),
  fm({
    id: 'vibraphone', name: 'Vibraphone', family: 'mallets',
    blurb: 'Metal bars with a slow shimmer. Jazz ballads and lo-fi.',
    tags: ['jazz', 'lofi', 'metal', 'dreamy'],
    range: [53, 89], centerMidi: 65, polyphony: 12,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.003, d: 3.2, s: 0, r: 0.7, velSens: 0.35 },
        { ratio: 4, level: 0.9, a: 0.002, d: 0.4, s: 0, r: 0.15, velSens: 0.7, keyScale: -0.3 },
      ],
      routes: [[1, 0], [0, OUT]], chorus: 0.65, gain: 0.62,
    },
  }),
  fm({
    id: 'glockenspiel', name: 'Glockenspiel', family: 'mallets',
    blurb: 'Tiny steel bars. Sparkle on top of a chorus.',
    tags: ['bells', 'bright', 'indie', 'sparkle'],
    range: [72, 108], centerMidi: 84, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.001, d: 1.4, s: 0, r: 0.3, velSens: 0.4 },
        { ratio: 5.4, level: 1.2, a: 0.001, d: 0.25, s: 0, r: 0.08, velSens: 0.85 },
      ],
      routes: [[1, 0], [0, OUT]], gain: 0.42,
    },
  }),
  fm({
    id: 'kalimba', name: 'Kalimba', family: 'world',
    blurb: 'Thumb piano. Plucky, metallic and gentle.',
    tags: ['africa', 'world', 'lofi', 'gentle', 'melodic'],
    range: [55, 91], centerMidi: 67, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.1, s: 0, r: 0.25, velSens: 0.45 },
        { ratio: 3.4, level: 0.85, a: 0.001, d: 0.18, s: 0, r: 0.06, velSens: 0.8 },
      ],
      routes: [[1, 0], [0, OUT]], gain: 0.66, pitchEnv: 0.15, pitchEnvTime: 0.02,
    },
  }),
  fm({
    id: 'steel-drum', name: 'Steel Pan', family: 'world',
    blurb: 'Caribbean pan with its characteristic metallic bloom.',
    tags: ['caribbean', 'world', 'tropical', 'melodic'],
    range: [55, 88], centerMidi: 67, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.004, d: 1.3, s: 0, r: 0.3, velSens: 0.4 },
        { ratio: 2.7, level: 1.1, a: 0.002, d: 0.5, s: 0.05, r: 0.12, velSens: 0.8 },
      ],
      routes: [[1, 0], [0, OUT]], chorus: 0.3, gain: 0.6,
    },
  }),
  fm({
    id: 'hang', name: 'Hang Drum', family: 'world',
    blurb: 'Handpan — soft, round, endlessly loopable.',
    tags: ['handpan', 'meditative', 'world', 'ambient'],
    range: [53, 84], centerMidi: 62, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.004, d: 2.4, s: 0, r: 0.5, velSens: 0.4 },
        { ratio: 2.01, level: 0.5, a: 0.003, d: 0.9, s: 0, r: 0.2, velSens: 0.7 },
        { ratio: 3.02, level: 0.22, a: 0.002, d: 0.4, s: 0, r: 0.1, velSens: 0.8 },
      ],
      routes: [[1, 0], [2, 0], [0, OUT]], chorus: 0.25, gain: 0.62,
    },
  }),
  fm({
    id: 'music-box', name: 'Music Box', family: 'mallets',
    blurb: 'Wind-up nostalgia. Lovely two octaves up.',
    tags: ['toy', 'nostalgic', 'delicate', 'lullaby'],
    range: [67, 103], centerMidi: 79, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.001, d: 1.1, s: 0, r: 0.25, velSens: 0.4 },
        { ratio: 6.1, level: 0.9, a: 0.001, d: 0.14, s: 0, r: 0.05, velSens: 0.8 },
      ],
      routes: [[1, 0], [0, OUT]], gain: 0.45,
    },
  }),
  fm({
    id: 'tubular-bells', name: 'Tubular Bells', family: 'mallets',
    blurb: 'Long inharmonic church bells. Enormous tails.',
    tags: ['bells', 'cinematic', 'dark', 'ritual'],
    range: [48, 84], centerMidi: 60, polyphony: 6,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.004, d: 5, s: 0, r: 1.2, velSens: 0.4 },
        { ratio: 2.76, level: 1.3, a: 0.002, d: 1.6, s: 0, r: 0.5, velSens: 0.8 },
        { ratio: 5.4, level: 0.4, a: 0.002, d: 0.7, s: 0, r: 0.3, velSens: 0.9 },
      ],
      routes: [[1, 0], [2, 0], [0, OUT]], gain: 0.4,
    },
  }),
]

// ---------------------------------------------------------------------------
// Synths & bass
// ---------------------------------------------------------------------------

const SYNTHS: PresetBase[] = [
  sub({
    id: 'supersaw', name: 'Supersaw Lead', family: 'synth',
    blurb: 'Seven detuned saws. The festival-drop sound — Lost Stories territory.',
    tags: ['edm', 'trance', 'lead', 'big', 'progressive'],
    range: [48, 96], centerMidi: 72, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 7, detune: 24, spread: 0.85,
      subLevel: 0.18, subOctave: 1,
      cutoff: 3200, resonance: 1.2, filterEnv: 1.4, keyTrack: 0.4,
      a: 0.01, d: 0.4, s: 0.75, r: 0.35, fa: 0.02, fd: 0.5, fs: 0.6, fr: 0.3,
      chorus: 0.5, drive: 0.25, gain: 0.3,
    },
  }),
  sub({
    id: 'warm-pad', name: 'Warm Pad', family: 'synth',
    blurb: 'Slow, wide and forgiving. Hold a chord and everything sounds intentional.',
    tags: ['ambient', 'pad', 'chill', 'lush', 'background'],
    range: [36, 88], centerMidi: 60, polyphony: 10,
    params: {
      wave: 'sawtooth', voices: 4, detune: 16, spread: 0.7,
      osc2Wave: 'triangle', osc2Semi: 12, osc2Level: 0.3,
      cutoff: 1500, resonance: 0.9, filterEnv: 1.1, keyTrack: 0.35,
      a: 0.7, d: 1.2, s: 0.85, r: 1.4, fa: 1.2, fd: 1.5, fs: 0.7, fr: 1.2,
      vibratoRate: 3.2, vibratoDepth: 5, vibratoDelay: 0.9,
      chorus: 0.85, gain: 0.34,
    },
  }),
  sub({
    id: 'glass-pad', name: 'Glass Pad', family: 'synth',
    blurb: 'Airy and crystalline. Sits high without getting in the way.',
    tags: ['ambient', 'pad', 'bright', 'cinematic', 'dreamy'],
    range: [48, 100], centerMidi: 72, polyphony: 10,
    params: {
      wave: 'triangle', voices: 5, detune: 20, spread: 0.9,
      osc2Wave: 'sine', osc2Semi: 19, osc2Level: 0.25, noiseLevel: 0.03,
      cutoff: 4200, resonance: 1.6, filterEnv: 0.8, keyTrack: 0.5,
      a: 1.1, d: 1.6, s: 0.8, r: 2, fa: 1.4, fd: 2, fs: 0.7, fr: 1.6,
      chorus: 0.95, gain: 0.3,
    },
  }),
  sub({
    id: 'pluck-synth', name: 'Synth Pluck', family: 'synth',
    blurb: 'Short filtered stab. The backbone of house and progressive.',
    tags: ['house', 'edm', 'progressive', 'arp', 'rhythmic'],
    range: [48, 96], centerMidi: 72, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 3, detune: 12, spread: 0.5,
      cutoff: 900, resonance: 4.5, filterEnv: 2.6, keyTrack: 0.5,
      a: 0.002, d: 0.28, s: 0.0, r: 0.18, fa: 0.002, fd: 0.22, fs: 0.05, fr: 0.15,
      chorus: 0.3, drive: 0.2, gain: 0.42,
    },
  }),
  sub({
    id: 'square-lead', name: 'Square Lead', family: 'synth',
    blurb: 'Hollow chiptune-adjacent lead. Monophonic energy.',
    tags: ['chiptune', 'retro', 'game', 'lead', '8bit'],
    range: [48, 96], centerMidi: 72, polyphony: 2,
    params: {
      wave: 'square', voices: 1, cutoff: 5000, resonance: 0.7, filterEnv: 0.4, keyTrack: 0.3,
      a: 0.004, d: 0.1, s: 0.85, r: 0.1, fa: 0.004, fd: 0.15, fs: 0.8, fr: 0.1,
      vibratoRate: 6, vibratoDepth: 14, vibratoDelay: 0.25, glide: 0.05, gain: 0.34,
    },
  }),
  sub({
    id: 'dark-drone', name: 'Dark Drone', family: 'synth',
    blurb: 'Slow, filtered and ominous. Hold one note under everything.',
    tags: ['ambient', 'dark', 'cinematic', 'drone', 'tension'],
    range: [24, 72], centerMidi: 40, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: 4, detune: 26, spread: 0.8,
      subLevel: 0.5, subOctave: 1, noiseLevel: 0.06,
      cutoff: 420, resonance: 2.4, filterEnv: 1.2, keyTrack: 0.2,
      a: 1.6, d: 2.4, s: 0.9, r: 2.6, fa: 3, fd: 3, fs: 0.6, fr: 2.4,
      chorus: 0.6, drive: 0.3, gain: 0.36,
    },
  }),
  fm({
    id: 'fm-bell-pad', name: 'Bell Pad', family: 'synth',
    blurb: 'FM bells stretched into a pad. Metallic and evolving.',
    tags: ['ambient', 'fm', 'metallic', 'evolving', 'dreamy'],
    range: [42, 92], centerMidi: 64, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.5, d: 3, s: 0.6, r: 1.6, velSens: 0.3 },
        { ratio: 3.51, level: 0.9, a: 1.2, d: 2.4, s: 0.35, r: 1.2, velSens: 0.6 },
        { ratio: 1.01, level: 0.4, a: 0.8, d: 3, s: 0.5, r: 1.8, detune: 8, velSens: 0.3 },
      ],
      routes: [[1, 0], [0, OUT], [2, OUT]], chorus: 0.8, gain: 0.3,
    },
  }),
  sub({
    id: 'choir-pad', name: 'Choir', family: 'voice',
    blurb: 'Vowel-filtered voices. Not a real choir, but it sells the cinematic swell.',
    tags: ['vocal', 'cinematic', 'ambient', 'aah', 'lush'],
    range: [43, 88], centerMidi: 62, polyphony: 10,
    params: {
      wave: 'sawtooth', voices: 5, detune: 18, spread: 0.75,
      noiseLevel: 0.05, chiff: 0.1,
      filterType: 'bandpass', cutoff: 900, resonance: 3.2, filterEnv: 0.5, keyTrack: 0.75,
      osc2Wave: 'triangle', osc2Semi: 0, osc2Level: 0.4,
      a: 0.35, d: 0.8, s: 0.85, r: 0.9, fa: 0.4, fd: 1, fs: 0.75, fr: 0.8,
      vibratoRate: 4.6, vibratoDepth: 11, vibratoDelay: 0.5,
      chorus: 0.9, gain: 0.34,
    },
  }),
  sub({
    id: 'vox-synth', name: 'Vox Synth', family: 'voice',
    blurb: 'Formant-ish synthetic vowel. Somewhere between a voice and a lead.',
    tags: ['vocal', 'lead', 'synth', 'formant'],
    range: [48, 88], centerMidi: 64, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: 2, detune: 10, spread: 0.4,
      filterType: 'bandpass', cutoff: 1200, resonance: 5, filterEnv: 0.9, keyTrack: 0.8,
      a: 0.06, d: 0.3, s: 0.8, r: 0.3, fa: 0.08, fd: 0.4, fs: 0.7, fr: 0.25,
      vibratoRate: 5.5, vibratoDepth: 15, vibratoDelay: 0.3,
      chorus: 0.4, drive: 0.15, gain: 0.34,
    },
  }),
]

const BASSES: PresetBase[] = [
  sub({
    id: 'sub-bass', name: 'Sub Bass', family: 'bass',
    blurb: 'Pure low sine. Felt more than heard — check it on speakers.',
    tags: ['808', 'trap', 'edm', 'low', 'clean'],
    range: [24, 55], centerMidi: 36, polyphony: 2,
    params: {
      wave: 'sine', voices: 1, cutoff: 800, resonance: 0.5, filterEnv: 0.2, keyTrack: 0.2,
      a: 0.006, d: 0.2, s: 0.9, r: 0.14, gain: 0.9,
    },
  }),
  sub({
    id: '808-bass', name: '808 Bass', family: 'bass',
    blurb: 'Long booming sine with a pitch drop. Trap and hip-hop foundation.',
    tags: ['trap', 'hiphop', '808', 'boom', 'glide'],
    range: [24, 55], centerMidi: 33, polyphony: 1,
    params: {
      wave: 'sine', voices: 1, subLevel: 0.3, subOctave: 1,
      cutoff: 1400, resonance: 0.8, filterEnv: 0.6, keyTrack: 0.2,
      a: 0.004, d: 1.6, s: 0.55, r: 0.5, fa: 0.004, fd: 0.6, fs: 0.4, fr: 0.4,
      glide: 0.08, drive: 0.45, gain: 0.85,
    },
  }),
  sub({
    id: 'reese-bass', name: 'Reese Bass', family: 'bass',
    blurb: 'Detuned, growling and wide. Drum & bass, neuro, dark techno.',
    tags: ['dnb', 'neuro', 'growl', 'dark', 'wide'],
    range: [24, 55], centerMidi: 36, polyphony: 2,
    params: {
      wave: 'sawtooth', voices: 3, detune: 30, spread: 0.5,
      subLevel: 0.4, subOctave: 1,
      cutoff: 700, resonance: 3, filterEnv: 1.1, keyTrack: 0.3,
      a: 0.01, d: 0.5, s: 0.8, r: 0.2, fa: 0.02, fd: 0.6, fs: 0.6, fr: 0.2,
      drive: 0.5, gain: 0.55,
    },
  }),
  sub({
    id: 'acid-bass', name: 'Acid Bass', family: 'bass',
    blurb: 'Squelchy resonant 303. Slide between notes and open the filter.',
    tags: ['acid', 'techno', '303', 'squelch', 'rave'],
    range: [24, 60], centerMidi: 38, polyphony: 1,
    params: {
      wave: 'sawtooth', voices: 1,
      cutoff: 300, resonance: 12, filterEnv: 3.2, keyTrack: 0.3,
      a: 0.003, d: 0.18, s: 0.25, r: 0.1, fa: 0.003, fd: 0.24, fs: 0.15, fr: 0.1,
      glide: 0.06, drive: 0.42, gain: 0.5,
    },
  }),
  fm({
    id: 'fm-bass', name: 'FM Bass', family: 'bass',
    blurb: 'Punchy metallic bass with a hard attack. Sits great in a busy mix.',
    tags: ['fm', 'punchy', 'funk', 'electro'],
    range: [24, 60], centerMidi: 38, polyphony: 2,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 0.6, s: 0.6, r: 0.15, velSens: 0.3 },
        { ratio: 2, level: 1.5, a: 0.001, d: 0.12, s: 0.15, r: 0.08, velSens: 0.9, feedback: 0.1 },
      ],
      routes: [[1, 0], [0, OUT]], drive: 0.3, gain: 0.7,
    },
  }),
]

export const MELODIC_PRESETS: PresetBase[] = [
  ...KEYS, ...PLUCKED, ...BOWED, ...WINDS, ...BRASS, ...MALLETS, ...SYNTHS, ...BASSES,
  ...ELECTRONIC_PRESETS, ...AFRICAN_PRESETS, ...WORLD_PRESETS, ...ORCHESTRAL_PRESETS,
]

// ---------------------------------------------------------------------------
// Drum kits
// ---------------------------------------------------------------------------

const DRUM_KITS: PresetBase[] = [
  kit('kit-808', 'TR-808', 'The boom, the tick, the sizzle. Hip-hop and trap.',
    ['808', 'trap', 'hiphop', 'electronic', 'classic'], {
      36: piece({ type: 'kick', name: 'Kick', tune: 48, decay: 0.85, level: 1, bend: 3.4, bendTime: 0.05, tone: 0.3, snap: 0.25, drive: 0.25 }),
      37: piece({ type: 'rim', name: 'Rim', tune: 480, decay: 0.03, level: 0.6 }),
      38: piece({ type: 'snare', name: 'Snare', tune: 200, decay: 0.16, level: 0.85, tone: 0.55, snap: 0.5 }),
      39: piece({ type: 'clap', name: 'Clap', tune: 1100, decay: 0.16, level: 0.7 }),
      41: piece({ type: 'tom', name: 'Low Tom', tune: 90, decay: 0.42, level: 0.7, tone: 0.2, pan: -0.25 }),
      45: piece({ type: 'tom', name: 'Mid Tom', tune: 140, decay: 0.35, level: 0.7, tone: 0.2 }),
      48: piece({ type: 'tom', name: 'Hi Tom', tune: 200, decay: 0.3, level: 0.7, tone: 0.2, pan: 0.25 }),
      42: piece({ type: 'hat', name: 'Closed Hat', tune: 320, decay: 0.05, level: 0.45, tone: 0.85, choke: 'hat' }),
      44: piece({ type: 'hat', name: 'Pedal Hat', tune: 320, decay: 0.09, level: 0.4, tone: 0.8, choke: 'hat' }),
      46: piece({ type: 'hat', name: 'Open Hat', tune: 320, decay: 0.5, level: 0.42, tone: 0.85, choke: 'hat' }),
      49: piece({ type: 'cymbal', name: 'Crash', tune: 300, decay: 1.6, level: 0.35, tone: 0.6, pan: -0.2 }),
      51: piece({ type: 'cymbal', name: 'Ride', tune: 420, decay: 1.1, level: 0.3, tone: 0.75, pan: 0.25 }),
      56: piece({ type: 'cowbell', name: 'Cowbell', tune: 540, decay: 0.28, level: 0.4 }),
      70: piece({ type: 'shaker', name: 'Maraca', tune: 0, decay: 0.05, level: 0.35, tone: 0.7 }),
    }, 0.95, 0.12),
  kit('kit-909', 'TR-909', 'Punchier and dirtier than the 808. House and techno.',
    ['909', 'house', 'techno', 'rave', 'club'], {
      36: piece({ type: 'kick', name: 'Kick', tune: 58, decay: 0.34, level: 1, bend: 5, bendTime: 0.028, tone: 0.6, snap: 0.7, drive: 0.4 }),
      37: piece({ type: 'rim', name: 'Rim', tune: 620, decay: 0.02, level: 0.55 }),
      38: piece({ type: 'snare', name: 'Snare', tune: 235, decay: 0.19, level: 0.85, tone: 0.75, snap: 0.8, drive: 0.2 }),
      39: piece({ type: 'clap', name: 'Clap', tune: 1400, decay: 0.22, level: 0.75 }),
      41: piece({ type: 'tom', name: 'Low Tom', tune: 100, decay: 0.34, level: 0.7, tone: 0.35, pan: -0.25 }),
      45: piece({ type: 'tom', name: 'Mid Tom', tune: 155, decay: 0.29, level: 0.7, tone: 0.35 }),
      48: piece({ type: 'tom', name: 'Hi Tom', tune: 225, decay: 0.24, level: 0.7, tone: 0.35, pan: 0.25 }),
      42: piece({ type: 'hat', name: 'Closed Hat', tune: 400, decay: 0.045, level: 0.5, tone: 0.9, choke: 'hat' }),
      46: piece({ type: 'hat', name: 'Open Hat', tune: 400, decay: 0.42, level: 0.45, tone: 0.9, choke: 'hat' }),
      49: piece({ type: 'cymbal', name: 'Crash', tune: 340, decay: 1.5, level: 0.36, tone: 0.7, pan: -0.2 }),
      51: piece({ type: 'cymbal', name: 'Ride', tune: 480, decay: 1.2, level: 0.32, tone: 0.85, pan: 0.25 }),
      70: piece({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.06, level: 0.3, tone: 0.8 }),
    }, 0.95, 0.15),
  kit('kit-acoustic', 'Acoustic Kit', 'Room-mic drum kit for band arrangements.',
    ['live', 'rock', 'indie', 'band', 'natural'], {
      36: piece({ type: 'kick', name: 'Kick', tune: 55, decay: 0.28, level: 1, bend: 3.2, bendTime: 0.035, tone: 0.65, snap: 0.8 }),
      37: piece({ type: 'rim', name: 'Cross Stick', tune: 520, decay: 0.02, level: 0.5 }),
      38: piece({ type: 'snare', name: 'Snare', tune: 190, decay: 0.22, level: 0.85, tone: 0.5, snap: 0.75 }),
      40: piece({ type: 'snare', name: 'Rimshot', tune: 240, decay: 0.16, level: 0.8, tone: 0.8, snap: 1 }),
      41: piece({ type: 'tom', name: 'Floor Tom', tune: 95, decay: 0.5, level: 0.75, tone: 0.5, pan: -0.3 }),
      45: piece({ type: 'tom', name: 'Mid Tom', tune: 145, decay: 0.42, level: 0.75, tone: 0.5 }),
      48: piece({ type: 'tom', name: 'Hi Tom', tune: 195, decay: 0.36, level: 0.75, tone: 0.5, pan: 0.3 }),
      42: piece({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.06, level: 0.4, tone: 0.25, choke: 'hat' }),
      46: piece({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.5, level: 0.38, tone: 0.3, choke: 'hat' }),
      49: piece({ type: 'cymbal', name: 'Crash', tune: 280, decay: 2, level: 0.32, tone: 0.45, pan: -0.35 }),
      51: piece({ type: 'cymbal', name: 'Ride', tune: 400, decay: 1.6, level: 0.3, tone: 0.6, pan: 0.35 }),
    }, 0.92, 0.08),
  kit('kit-lofi', 'Lo-fi Kit', 'Soft, dusty and slightly out of tune. Bedroom beats.',
    ['lofi', 'chill', 'hiphop', 'dusty', 'soft'], {
      36: piece({ type: 'kick', name: 'Kick', tune: 52, decay: 0.32, level: 0.95, bend: 2.6, bendTime: 0.05, tone: 0.2, snap: 0.25, drive: 0.3 }),
      37: piece({ type: 'rim', name: 'Rim', tune: 430, decay: 0.025, level: 0.45 }),
      38: piece({ type: 'snare', name: 'Snare', tune: 175, decay: 0.14, level: 0.6, tone: 0.25, snap: 0.3, drive: 0.25 }),
      39: piece({ type: 'clap', name: 'Clap', tune: 900, decay: 0.13, level: 0.45 }),
      42: piece({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.04, level: 0.28, tone: 0.15, choke: 'hat' }),
      46: piece({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.3, level: 0.26, tone: 0.2, choke: 'hat' }),
      45: piece({ type: 'tom', name: 'Tom', tune: 130, decay: 0.34, level: 0.55, tone: 0.2 }),
      51: piece({ type: 'cymbal', name: 'Ride', tune: 340, decay: 0.9, level: 0.22, tone: 0.35, pan: 0.2 }),
      70: piece({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.22, tone: 0.5 }),
    }, 0.85, 0.25),
  kit('kit-trap', 'Trap Kit', 'Hard 808 kick, tight snare, and hats built for rolls.',
    ['trap', 'hiphop', 'modern', 'hard'], {
      36: piece({ type: 'kick', name: '808 Kick', tune: 44, decay: 1.1, level: 1, bend: 3.8, bendTime: 0.06, tone: 0.25, snap: 0.3, drive: 0.35 }),
      38: piece({ type: 'snare', name: 'Snare', tune: 220, decay: 0.13, level: 0.8, tone: 0.8, snap: 0.9 }),
      39: piece({ type: 'clap', name: 'Clap', tune: 1300, decay: 0.18, level: 0.75 }),
      42: piece({ type: 'hat', name: 'Closed Hat', tune: 440, decay: 0.028, level: 0.42, tone: 0.95, choke: 'hat' }),
      46: piece({ type: 'hat', name: 'Open Hat', tune: 440, decay: 0.34, level: 0.4, tone: 0.95, choke: 'hat' }),
      37: piece({ type: 'rim', name: 'Rim', tune: 700, decay: 0.02, level: 0.5 }),
      49: piece({ type: 'cymbal', name: 'Crash', tune: 320, decay: 1.4, level: 0.3, tone: 0.75 }),
      70: piece({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.04, level: 0.3, tone: 0.85 }),
    }, 0.95, 0.2),
  kit('kit-tabla', 'Tabla', 'Bayan and dayan strokes — Na, Tin, Ge, Dha.',
    ['india', 'world', 'hand', 'classical', 'raga'], {
      36: piece({ type: 'membrane', name: 'Ge (bass)', tune: 78, decay: 0.75, level: 0.9, bend: 1.9, bendTime: 0.09, tone: 0.3, snap: 0.2 }),
      38: piece({ type: 'membrane', name: 'Ke', tune: 92, decay: 0.12, level: 0.7, bend: 1.2, tone: 0.2, snap: 0.5 }),
      40: piece({ type: 'membrane', name: 'Na', tune: 320, decay: 0.5, level: 0.8, bend: 1.05, tone: 0.85, snap: 0.75 }),
      41: piece({ type: 'membrane', name: 'Tin', tune: 400, decay: 0.42, level: 0.75, bend: 1.05, tone: 0.8, snap: 0.6 }),
      43: piece({ type: 'membrane', name: 'Te', tune: 380, decay: 0.07, level: 0.65, bend: 1.1, tone: 0.6, snap: 0.9 }),
      45: piece({ type: 'membrane', name: 'Dha', tune: 300, decay: 0.6, level: 0.9, bend: 1.4, bendTime: 0.05, tone: 0.7, snap: 0.7 }),
      47: piece({ type: 'membrane', name: 'Tun', tune: 260, decay: 0.7, level: 0.8, bend: 1.1, tone: 0.75, snap: 0.4 }),
    }, 0.9, 0.05),
  kit('kit-latin', 'Latin Percussion', 'Congas, bongos, timbales, clave and shakers.',
    ['latin', 'world', 'hand', 'cuban', 'groove'], {
      36: piece({ type: 'membrane', name: 'Low Conga', tune: 130, decay: 0.4, level: 0.85, bend: 1.3, tone: 0.5, snap: 0.5, pan: -0.2 }),
      38: piece({ type: 'membrane', name: 'Hi Conga', tune: 200, decay: 0.32, level: 0.8, bend: 1.25, tone: 0.55, snap: 0.6, pan: 0.15 }),
      40: piece({ type: 'membrane', name: 'Conga Slap', tune: 260, decay: 0.16, level: 0.8, bend: 1.15, tone: 0.8, snap: 1 }),
      41: piece({ type: 'membrane', name: 'Low Bongo', tune: 300, decay: 0.2, level: 0.7, bend: 1.2, tone: 0.7, snap: 0.7, pan: -0.3 }),
      43: piece({ type: 'membrane', name: 'Hi Bongo', tune: 420, decay: 0.16, level: 0.7, bend: 1.2, tone: 0.75, snap: 0.8, pan: 0.3 }),
      45: piece({ type: 'tom', name: 'Timbale', tune: 340, decay: 0.22, level: 0.7, tone: 0.8 }),
      47: piece({ type: 'click', name: 'Clave', tune: 1200, decay: 0.05, level: 0.55 }),
      49: piece({ type: 'cowbell', name: 'Cowbell', tune: 560, decay: 0.3, level: 0.4 }),
      70: piece({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.35, tone: 0.6, pan: 0.25 }),
      72: piece({ type: 'shaker', name: 'Cabasa', tune: 0, decay: 0.08, level: 0.3, tone: 0.75, pan: -0.25 }),
    }, 0.9),
  kit('kit-hand', 'Hand Percussion', 'Djembe, frame drum, claps and stomps for organic grooves.',
    ['africa', 'folk', 'acoustic', 'world', 'organic'], {
      36: piece({ type: 'membrane', name: 'Djembe Bass', tune: 85, decay: 0.5, level: 0.9, bend: 1.6, tone: 0.35, snap: 0.35 }),
      38: piece({ type: 'membrane', name: 'Djembe Tone', tune: 190, decay: 0.3, level: 0.8, bend: 1.25, tone: 0.6, snap: 0.6 }),
      40: piece({ type: 'membrane', name: 'Djembe Slap', tune: 280, decay: 0.14, level: 0.8, bend: 1.15, tone: 0.85, snap: 1 }),
      41: piece({ type: 'membrane', name: 'Frame Drum', tune: 120, decay: 0.45, level: 0.75, bend: 1.4, tone: 0.4, snap: 0.4 }),
      39: piece({ type: 'clap', name: 'Clap', tune: 1000, decay: 0.2, level: 0.6 }),
      42: piece({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.35, tone: 0.55, choke: 'shk' }),
      44: piece({ type: 'noise', name: 'Stomp', tune: 90, decay: 0.14, level: 0.7 }),
      47: piece({ type: 'click', name: 'Woodblock', tune: 900, decay: 0.06, level: 0.5 }),
    }, 0.9),
]

export const DRUM_PRESETS: PresetBase[] = [
  ...DRUM_KITS, FX_KIT, ...AFRICAN_KITS, ...WORLD_KITS, ...ORCHESTRAL_KITS,
]

export const ALL_PRESETS: PresetBase[] = [...MELODIC_PRESETS, ...DRUM_PRESETS]

/** Fallback for a preset id that no longer exists anywhere. */
export const FALLBACK_PRESET: PresetBase = MELODIC_PRESETS[0]

export const FAMILY_LABELS: Record<InstrumentFamily, string> = {
  keys: 'Keys', plucked: 'Guitars & strings', bowed: 'Bowed strings', winds: 'Winds',
  brass: 'Brass', mallets: 'Mallets & bells', synth: 'Synths', bass: 'Bass',
  voice: 'Voices', drums: 'Drums & percussion', world: 'World',
  sampled: 'Your sounds',
}

/** Family display order in the instrument picker. */
export const FAMILY_ORDER: InstrumentFamily[] = [
  'sampled', 'keys', 'plucked', 'bowed', 'winds', 'brass', 'mallets', 'world',
  'synth', 'bass', 'voice', 'drums',
]


