/**
 * World instruments beyond the ones the first pass covered.
 *
 * The original library had a sitar, a koto and an oud and called it done. This
 * fills in the obvious absences — China, Persia, Armenia, the Andes, Greece,
 * Australia, Indonesia — along with the rhythm traditions that go with them.
 */

import type { PresetBase } from '../types'
import type { DrumPiece } from './drums'
import { fm, kit, piece, pluck, sub } from './preset-kit'

/** Blown instruments: a narrow filtered tone with a lot of breath in it. */
const wind = (
  id: string, name: string, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { wave: OscillatorType; noise: number; chiff: number; cutoff: number; q: number
       a: number; vib: number; filterType?: BiquadFilterType; gain: number; drive?: number },
) =>
  sub({
    id, name, family: 'world', blurb, tags, range, centerMidi, polyphony: 4,
    params: {
      wave: o.wave, voices: 1, noiseLevel: o.noise, chiff: o.chiff,
      filterType: o.filterType ?? 'lowpass', cutoff: o.cutoff, resonance: o.q,
      filterEnv: 0.7, keyTrack: 0.6,
      a: o.a, d: 0.2, s: 0.88, r: 0.18, fa: o.a, fd: 0.25, fs: 0.7, fr: 0.15,
      vibratoRate: 5.1, vibratoDepth: o.vib, vibratoDelay: 0.4,
      drive: o.drive ?? 0, gain: o.gain,
    },
  })

const bowedWorld = (
  id: string, name: string, blurb: string, tags: string[],
  range: [number, number], centerMidi: number,
  o: { cutoff: number; vib: number; gain: number; voices?: number },
) =>
  sub({
    id, name, family: 'world', blurb, tags, range, centerMidi, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: o.voices ?? 1, detune: 10, spread: 0.3,
      noiseLevel: 0.06, chiff: 0.09,
      filterType: 'lowpass', cutoff: o.cutoff, resonance: 1.6, filterEnv: 0.9, keyTrack: 0.55,
      a: 0.07, d: 0.35, s: 0.85, r: 0.26, fa: 0.09, fd: 0.4, fs: 0.6, fr: 0.24,
      vibratoRate: 5.4, vibratoDepth: o.vib, vibratoDelay: 0.3,
      chorus: 0.16, gain: o.gain,
    },
  })

export const WORLD_PRESETS: PresetBase[] = [
  // --- East Asia ----------------------------------------------------------
  pluck({
    id: 'guzheng', name: 'Guzheng', family: 'world',
    blurb: 'Chinese zither. Long ringing notes and heavy pitch bends on the left hand.',
    tags: ['china', 'zither', 'world', 'pentatonic', 'cinematic'],
    range: [48, 88], centerMidi: 64, polyphony: 12,
    params: {
      sustain: 4.2, damping: 0.22, decayKeyScale: 0.36, pluckPosition: 0.15,
      excitationTone: 0.7, inharmonicity: 0.012, releaseDamp: 4, bodyMix: 0.72, gain: 0.58,
      body: [{ freq: 260, q: 1.4, gain: 6 }, { freq: 1300, q: 1.4, gain: 4 }],
    },
  }),
  pluck({
    id: 'pipa', name: 'Pipa', family: 'world',
    blurb: 'Chinese lute, played with all five fingers. Rapid tremolo is its signature.',
    tags: ['china', 'lute', 'world', 'tremolo', 'bright'],
    range: [45, 84], centerMidi: 60, polyphony: 8,
    params: {
      sustain: 1.5, damping: 0.18, decayKeyScale: 0.45, pluckPosition: 0.1,
      excitationTone: 0.92, inharmonicity: 0.02, buzz: 0.1, releaseDamp: 20,
      bodyMix: 0.7, gain: 0.55,
      body: [{ freq: 340, q: 1.7, gain: 5 }, { freq: 1900, q: 1.3, gain: 4 }],
    },
  }),
  wind('dizi', 'Dizi', 'Chinese bamboo flute with a buzzing membrane over a side hole.',
    ['china', 'bamboo', 'flute', 'world', 'buzz'], [67, 96], 79,
    { wave: 'sine', noise: 0.26, chiff: 0.45, cutoff: 4200, q: 1.8, a: 0.035, vib: 16, gain: 0.46 }),

  // --- South and Central Asia --------------------------------------------
  pluck({
    id: 'sarod', name: 'Sarod', family: 'world',
    blurb: 'Fretless Indian lute with a metal fingerboard. Slides between every note.',
    tags: ['india', 'raga', 'lute', 'fretless', 'world'],
    range: [45, 79], centerMidi: 57, polyphony: 8,
    params: {
      sustain: 3.4, damping: 0.2, decayKeyScale: 0.3, pluckPosition: 0.12,
      excitationTone: 0.88, inharmonicity: 0.008, buzz: 0.3, buzzThreshold: 0.1,
      releaseDamp: 6, bodyMix: 0.8, gain: 0.55,
      body: [{ freq: 210, q: 1.3, gain: 6 }, { freq: 980, q: 1.6, gain: 4 }, { freq: 2800, q: 1.2, gain: 3 }],
    },
  }),
  pluck({
    id: 'tanpura', name: 'Tanpura', family: 'world',
    blurb: 'The drone under all Indian classical music. Hold two or three notes and leave them.',
    tags: ['india', 'drone', 'raga', 'world', 'meditative'],
    range: [36, 64], centerMidi: 48, polyphony: 6,
    params: {
      sustain: 9, damping: 0.1, decayKeyScale: 0.15, pluckPosition: 0.2,
      excitationTone: 0.6, buzz: 0.6, buzzThreshold: 0.06, releaseDamp: 1.5,
      bodyMix: 0.85, gain: 0.45,
      body: [{ freq: 130, q: 1.2, gain: 6 }, { freq: 520, q: 1.6, gain: 5 }, { freq: 1700, q: 1.3, gain: 4 }],
    },
  }),
  sub({
    id: 'harmonium', name: 'Harmonium', family: 'world',
    blurb: 'Hand-pumped reed organ. Bhajan, qawwali, kirtan — and a bed under any Indian vocal.',
    tags: ['india', 'reed', 'organ', 'devotional', 'qawwali', 'world'],
    range: [41, 84], centerMidi: 60, polyphony: 10,
    params: {
      wave: 'sawtooth', voices: 2, detune: 11, spread: 0.2,
      osc2Wave: 'square', osc2Semi: 12, osc2Level: 0.3, noiseLevel: 0.04,
      filterType: 'lowpass', cutoff: 2300, resonance: 1.3, filterEnv: 0.3, keyTrack: 0.45,
      a: 0.07, d: 0.12, s: 0.92, r: 0.14, fa: 0.06, fd: 0.2, fs: 0.8, fr: 0.12,
      chorus: 0.35, gain: 0.44,
    },
  }),
  wind('shehnai', 'Shehnai', 'Indian double reed. Piercing, celebratory — weddings and processions.',
    ['india', 'reed', 'wedding', 'world', 'nasal'], [60, 88], 69,
    { wave: 'sawtooth', noise: 0.1, chiff: 0.24, cutoff: 2600, q: 3.6, a: 0.04, vib: 20,
      filterType: 'bandpass', gain: 0.32, drive: 0.25 }),

  // --- Middle East and Caucasus ------------------------------------------
  wind('duduk', 'Duduk', 'Armenian apricot-wood reed. Mournful and human — the cinematic grief sound.',
    ['armenia', 'reed', 'cinematic', 'mournful', 'world'], [55, 79], 64,
    { wave: 'sawtooth', noise: 0.18, chiff: 0.2, cutoff: 1500, q: 2.4, a: 0.07, vib: 17,
      filterType: 'lowpass', gain: 0.4 }),
  bowedWorld('kamancheh', 'Kamancheh', 'Persian spike fiddle, played upright on a spike.',
    ['persia', 'iran', 'fiddle', 'world', 'maqam'], [55, 88], 67,
    { cutoff: 2700, vib: 21, gain: 0.4 }),
  bowedWorld('morin-khuur', 'Morin Khuur', 'Mongolian horsehead fiddle. Broad, open and windswept.',
    ['mongolia', 'fiddle', 'world', 'steppe', 'cinematic'], [48, 84], 60,
    { cutoff: 2200, vib: 14, gain: 0.44, voices: 2 }),

  // --- Europe -------------------------------------------------------------
  pluck({
    id: 'mandolin', name: 'Mandolin', family: 'plucked',
    blurb: 'Paired strings, bright and quick. Bluegrass, Italian folk, and tremolo everywhere.',
    tags: ['folk', 'bluegrass', 'italy', 'bright', 'tremolo'],
    range: [55, 91], centerMidi: 69, polyphony: 8,
    params: {
      sustain: 1.3, damping: 0.16, decayKeyScale: 0.45, pluckPosition: 0.12,
      excitationTone: 0.95, inharmonicity: 0.02, releaseDamp: 20, bodyMix: 0.75, gain: 0.5,
      body: [{ freq: 400, q: 1.7, gain: 6 }, { freq: 2400, q: 1.3, gain: 4 }],
    },
  }),
  pluck({
    id: 'twelve-string', name: '12-String Guitar', family: 'plucked',
    blurb: 'Doubled strings, slightly out of tune with each other. Shimmering and huge.',
    tags: ['folk', 'acoustic', 'shimmer', 'chorus', 'rock'],
    range: [40, 84], centerMidi: 55, polyphony: 10,
    params: {
      sustain: 3.2, damping: 0.2, decayKeyScale: 0.4, pluckPosition: 0.2,
      excitationTone: 0.78, inharmonicity: 0.018, releaseDamp: 10,
      chorus: 0.7, bodyMix: 0.85, gain: 0.6,
      body: [{ freq: 102, q: 1.3, gain: 7 }, { freq: 215, q: 2, gain: 4 }, { freq: 3000, q: 1.1, gain: 4 }],
    },
  }),
  pluck({
    id: 'bouzouki', name: 'Bouzouki', family: 'world',
    blurb: 'Greek long-necked lute. Metallic, ringing, and built for fast runs.',
    tags: ['greece', 'lute', 'folk', 'bright', 'world'],
    range: [50, 84], centerMidi: 62, polyphony: 8,
    params: {
      sustain: 2.2, damping: 0.16, decayKeyScale: 0.4, pluckPosition: 0.11,
      excitationTone: 0.92, inharmonicity: 0.022, releaseDamp: 14, bodyMix: 0.72, gain: 0.52,
      body: [{ freq: 280, q: 1.6, gain: 6 }, { freq: 1700, q: 1.3, gain: 4 }],
    },
  }),
  pluck({
    id: 'charango', name: 'Charango', family: 'world',
    blurb: 'Tiny Andean lute, originally with an armadillo shell back. Very high and bright.',
    tags: ['andes', 'bolivia', 'peru', 'folk', 'world', 'small'],
    range: [60, 96], centerMidi: 74, polyphony: 8,
    params: {
      sustain: 1.4, damping: 0.2, decayKeyScale: 0.45, pluckPosition: 0.16,
      excitationTone: 0.85, releaseDamp: 16, bodyMix: 0.8, gain: 0.48,
      body: [{ freq: 620, q: 1.8, gain: 7 }, { freq: 2100, q: 1.3, gain: 4 }],
    },
  }),
  sub({
    id: 'bagpipes', name: 'Bagpipes', family: 'world',
    blurb: 'Reed chanter over a constant drone. Never stops for breath, because it cannot.',
    tags: ['scotland', 'celtic', 'reed', 'drone', 'world'],
    range: [62, 86], centerMidi: 72, polyphony: 3,
    params: {
      wave: 'sawtooth', voices: 2, detune: 14, spread: 0.2,
      osc2Wave: 'sawtooth', osc2Semi: -12, osc2Level: 0.4, noiseLevel: 0.07,
      filterType: 'bandpass', cutoff: 1600, resonance: 3.2, filterEnv: 0.4, keyTrack: 0.5,
      a: 0.03, d: 0.1, s: 0.95, r: 0.08, fa: 0.03, fd: 0.15, fs: 0.85, fr: 0.08,
      drive: 0.3, gain: 0.3,
    },
  }),

  // --- Australia and Indonesia -------------------------------------------
  sub({
    id: 'didgeridoo', name: 'Didgeridoo', family: 'world',
    blurb: 'A single droning pitch with the mouth shaping wild overtones above it.',
    tags: ['australia', 'drone', 'overtone', 'world', 'low'],
    range: [24, 48], centerMidi: 33, polyphony: 2,
    params: {
      wave: 'sawtooth', voices: 2, detune: 7, spread: 0.2,
      subLevel: 0.4, subOctave: 1, noiseLevel: 0.16, chiff: 0.15,
      filterType: 'bandpass', cutoff: 320, resonance: 6, filterEnv: 0.8, keyTrack: 0.3,
      a: 0.06, d: 0.3, s: 0.9, r: 0.2, fa: 0.08, fd: 0.4, fs: 0.75, fr: 0.2,
      filterLfoRate: 3.4, filterLfoDepth: 1.6, filterLfoShape: 'sine',
      drive: 0.4, gain: 0.5,
    },
  }),
  fm({
    id: 'gamelan-saron', name: 'Gamelan Saron', family: 'world',
    blurb: 'Bronze bars from a Javanese gamelan. Tuned to its own scale, not a piano.',
    tags: ['indonesia', 'java', 'bali', 'bronze', 'gamelan', 'world'],
    range: [55, 91], centerMidi: 67, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.7, s: 0, r: 0.4, velSens: 0.4 },
        { ratio: 2.71, level: 1.25, a: 0.001, d: 0.5, s: 0, r: 0.14, velSens: 0.8 },
        { ratio: 5.43, level: 0.35, a: 0.001, d: 0.24, s: 0, r: 0.08, velSens: 0.9 },
      ],
      routes: [[1, 0], [2, 0], [0, -1]],
      gain: 0.5,
    },
  }),
  fm({
    id: 'gamelan-bonang', name: 'Gamelan Bonang', family: 'world',
    blurb: 'Tuned bronze kettles. Shorter and more bell-like than the saron.',
    tags: ['indonesia', 'java', 'bronze', 'gamelan', 'world', 'bells'],
    range: [60, 96], centerMidi: 72, polyphony: 8,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.1, s: 0, r: 0.28, velSens: 0.4 },
        { ratio: 3.46, level: 1.1, a: 0.001, d: 0.34, s: 0, r: 0.1, velSens: 0.8 },
      ],
      routes: [[1, 0], [0, -1]],
      gain: 0.46,
    },
  }),
]

// ---------------------------------------------------------------------------
// Rhythm traditions
// ---------------------------------------------------------------------------

const p = (spec: DrumPiece): DrumPiece => piece(spec)

export const WORLD_KITS: PresetBase[] = [
  kit('kit-darbuka', 'Darbuka & Riq',
    'Middle Eastern hand drums. Doum, tek and the frame drum jingles over the top.',
    ['arabic', 'turkish', 'middle east', 'hand', 'world'], {
      36: p({ type: 'membrane', name: 'Doum', tune: 95, decay: 0.44, level: 0.95, bend: 1.7, tone: 0.35, snap: 0.45 }),
      38: p({ type: 'membrane', name: 'Tek', tune: 340, decay: 0.12, level: 0.8, bend: 1.15, tone: 0.8, snap: 0.95 }),
      40: p({ type: 'membrane', name: 'Ka', tune: 300, decay: 0.09, level: 0.7, bend: 1.1, tone: 0.75, snap: 0.9, pan: 0.2 }),
      41: p({ type: 'membrane', name: 'Frame Drum', tune: 130, decay: 0.4, level: 0.8, bend: 1.4, tone: 0.4, snap: 0.4 }),
      43: p({ type: 'shaker', name: 'Riq Jingles', tune: 0, decay: 0.16, level: 0.4, tone: 0.9 }),
      45: p({ type: 'clap', name: 'Clap', tune: 1100, decay: 0.15, level: 0.5 }),
      47: p({ type: 'click', name: 'Finger Cymbal', tune: 2400, decay: 0.2, level: 0.35 }),
    }, 0.92),

  kit('kit-dhol', 'Dhol & Tabla',
    'The double-headed dhol that drives bhangra, with tabla and a tambourine.',
    ['india', 'punjab', 'bhangra', 'bollywood', 'world'], {
      36: p({ type: 'membrane', name: 'Dhol Bass', tune: 68, decay: 0.55, level: 1, bend: 1.8, tone: 0.3, snap: 0.4, drive: 0.15 }),
      38: p({ type: 'membrane', name: 'Dhol Treble', tune: 300, decay: 0.16, level: 0.85, bend: 1.2, tone: 0.8, snap: 0.95 }),
      40: p({ type: 'membrane', name: 'Tabla Na', tune: 320, decay: 0.5, level: 0.75, bend: 1.05, tone: 0.85, snap: 0.75 }),
      41: p({ type: 'membrane', name: 'Tabla Ge', tune: 78, decay: 0.7, level: 0.8, bend: 1.9, tone: 0.3, snap: 0.2 }),
      43: p({ type: 'shaker', name: 'Tambourine', tune: 0, decay: 0.18, level: 0.4, tone: 0.85 }),
      45: p({ type: 'clap', name: 'Clap', tune: 1200, decay: 0.16, level: 0.6 }),
      47: p({ type: 'cowbell', name: 'Chimta', tune: 900, decay: 0.2, level: 0.32 }),
    }, 0.92, 0.08),

  kit('kit-samba', 'Samba Batucada',
    'Surdo, caixa, tamborim and agogô. A Rio street ensemble in one kit.',
    ['brazil', 'samba', 'carnival', 'latin', 'world'], {
      36: p({ type: 'membrane', name: 'Surdo Low', tune: 62, decay: 0.75, level: 1, bend: 1.5, tone: 0.25, snap: 0.25 }),
      38: p({ type: 'membrane', name: 'Surdo High', tune: 88, decay: 0.55, level: 0.9, bend: 1.4, tone: 0.35, snap: 0.3 }),
      40: p({ type: 'snare', name: 'Caixa', tune: 250, decay: 0.09, level: 0.7, tone: 0.85, snap: 0.9 }),
      41: p({ type: 'membrane', name: 'Tamborim', tune: 420, decay: 0.08, level: 0.7, bend: 1.1, tone: 0.85, snap: 1, pan: 0.2 }),
      43: p({ type: 'cowbell', name: 'Agogô Low', tune: 520, decay: 0.22, level: 0.45, pan: -0.2 }),
      45: p({ type: 'cowbell', name: 'Agogô High', tune: 780, decay: 0.2, level: 0.45, pan: 0.2 }),
      47: p({ type: 'shaker', name: 'Ganzá', tune: 0, decay: 0.07, level: 0.4, tone: 0.6 }),
      49: p({ type: 'click', name: 'Clave', tune: 1200, decay: 0.05, level: 0.5 }),
    }, 0.92),

  kit('kit-reggaeton', 'Reggaeton',
    'The dembow: kick on the beat, snare swinging against it. Latin pop everywhere.',
    ['reggaeton', 'dembow', 'latin', 'pop', 'club'], {
      36: p({ type: 'kick', name: 'Kick', tune: 52, decay: 0.36, level: 1, bend: 3.6, bendTime: 0.035, tone: 0.5, snap: 0.6, drive: 0.2 }),
      38: p({ type: 'snare', name: 'Snare', tune: 220, decay: 0.13, level: 0.85, tone: 0.7, snap: 0.8 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1250, decay: 0.18, level: 0.7 }),
      40: p({ type: 'rim', name: 'Rim', tune: 620, decay: 0.022, level: 0.6 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 400, decay: 0.035, level: 0.4, tone: 0.85, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 400, decay: 0.3, level: 0.36, tone: 0.85, choke: 'hat' }),
      41: p({ type: 'membrane', name: 'Conga', tune: 200, decay: 0.28, level: 0.65, bend: 1.25, tone: 0.55, snap: 0.6 }),
      70: p({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.35, tone: 0.65 }),
    }, 0.94, 0.12),

  kit('kit-taiko', 'Taiko',
    'Japanese ensemble drums. Enormous, and built for one hit to fill a room.',
    ['japan', 'taiko', 'cinematic', 'epic', 'world'], {
      36: p({ type: 'membrane', name: 'Ō-daiko', tune: 52, decay: 1.1, level: 1, bend: 1.9, bendTime: 0.08, tone: 0.25, snap: 0.4, drive: 0.2 }),
      38: p({ type: 'membrane', name: 'Chu-daiko', tune: 90, decay: 0.65, level: 0.95, bend: 1.7, tone: 0.35, snap: 0.55 }),
      40: p({ type: 'membrane', name: 'Shime-daiko', tune: 230, decay: 0.22, level: 0.85, bend: 1.3, tone: 0.7, snap: 0.9 }),
      41: p({ type: 'click', name: 'Rim Stick', tune: 1100, decay: 0.05, level: 0.55 }),
      43: p({ type: 'cymbal', name: 'Chappa', tune: 480, decay: 0.9, level: 0.35, tone: 0.8 }),
      45: p({ type: 'cymbal', name: 'Gong', tune: 120, decay: 3.4, level: 0.6, tone: 0.3 }),
    }, 0.95, 0.1),
]
