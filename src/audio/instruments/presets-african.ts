/**
 * African instruments and rhythms.
 *
 * The original library covered a continent with one "hand percussion" kit,
 * which is not a serious attempt. Africa is where a great deal of the rhythmic
 * language of popular music comes from — and amapiano, afrobeats and afro
 * house are among the most listened-to genres in the world right now.
 *
 * The amapiano log drum gets special treatment because it needs it: it is a
 * pitched drum that slides up into its note, and no ordinary kick or bass
 * preset produces it.
 */

import type { PresetBase } from '../types'
import type { DrumPiece } from './drums'
import { fm, kit, piece, pluck, sub } from './preset-kit'

// ---------------------------------------------------------------------------
// Melodic
// ---------------------------------------------------------------------------

export const AFRICAN_PRESETS: PresetBase[] = [
  pluck({
    id: 'kora', name: 'Kora', family: 'world',
    blurb: '21-string harp-lute from West Africa. Rippling, harp-like, with a gourd body behind it.',
    tags: ['africa', 'mali', 'senegal', 'griot', 'harp', 'world'],
    range: [45, 84], centerMidi: 62, polyphony: 12,
    params: {
      sustain: 3.2, damping: 0.26, decayKeyScale: 0.38, pluckPosition: 0.18,
      excitationTone: 0.62, inharmonicity: 0.006, buzz: 0.08, releaseDamp: 5,
      bodyMix: 0.85, gain: 0.6,
      body: [{ freq: 180, q: 1.2, gain: 7 }, { freq: 640, q: 1.7, gain: 4 }, { freq: 2200, q: 1.3, gain: 3 }],
    },
  }),
  pluck({
    id: 'ngoni', name: 'Ngoni', family: 'world',
    blurb: 'Small West African lute, ancestor of the banjo. Dry, buzzy and percussive.',
    tags: ['africa', 'mali', 'lute', 'griot', 'banjo', 'world'],
    range: [48, 79], centerMidi: 60, polyphony: 6,
    params: {
      sustain: 1.2, damping: 0.2, decayKeyScale: 0.45, pluckPosition: 0.09,
      excitationTone: 0.9, buzz: 0.28, buzzThreshold: 0.1, releaseDamp: 22,
      bodyMix: 0.75, gain: 0.55,
      body: [{ freq: 300, q: 1.7, gain: 6 }, { freq: 1600, q: 1.4, gain: 4 }],
    },
  }),
  fm({
    id: 'balafon', name: 'Balafon', family: 'world',
    blurb: 'West African wooden xylophone. Gourd resonators buzz under every note.',
    tags: ['africa', 'mali', 'xylophone', 'wood', 'buzz', 'world'],
    range: [48, 91], centerMidi: 64, polyphony: 10,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 0.75, s: 0, r: 0.18, velSens: 0.45 },
        { ratio: 3.9, level: 1.5, a: 0.001, d: 0.1, s: 0, r: 0.05, velSens: 0.85, keyScale: -0.35 },
        // The buzzing membrane over the gourd, as a fast high partial.
        { ratio: 11.4, level: 0.4, a: 0.001, d: 0.14, s: 0.04, r: 0.05, velSens: 0.9 },
      ],
      routes: [[1, 0], [2, 0], [0, -1]],
      drive: 0.18, gain: 0.62, pitchEnv: 0.2, pitchEnvTime: 0.02,
    },
  }),
  fm({
    id: 'mbira', name: 'Mbira', family: 'world',
    blurb: 'Zimbabwean thumb piano. Interlocking patterns, bottle-cap buzz, hypnotic.',
    tags: ['africa', 'zimbabwe', 'thumb piano', 'shona', 'buzz', 'world'],
    range: [52, 88], centerMidi: 64, polyphony: 10,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.002, d: 1.3, s: 0, r: 0.3, velSens: 0.45 },
        { ratio: 3.2, level: 0.95, a: 0.001, d: 0.22, s: 0, r: 0.07, velSens: 0.8 },
        { ratio: 8.7, level: 0.28, a: 0.001, d: 0.3, s: 0.05, r: 0.08, velSens: 0.9 },
      ],
      routes: [[1, 0], [2, 0], [0, -1]],
      drive: 0.12, gain: 0.6, pitchEnv: 0.12, pitchEnvTime: 0.02,
    },
  }),
  sub({
    id: 'logdrum-bass', name: 'Log Drum', family: 'bass',
    blurb: 'Amapiano\'s signature: a deep sine that slides up into the note. Play it slow and sparse.',
    tags: ['amapiano', 'afro house', 'south africa', 'bass', 'slide', 'log drum'],
    range: [24, 55], centerMidi: 36, polyphony: 2,
    params: {
      wave: 'sine', voices: 1,
      subLevel: 0.25, subOctave: 1,
      cutoff: 900, resonance: 1.2, filterEnv: 0.8, keyTrack: 0.25,
      a: 0.004, d: 0.85, s: 0.25, r: 0.3, fa: 0.004, fd: 0.5, fs: 0.3, fr: 0.25,
      // The slide is the whole point — it is what makes it a log drum and not a bass.
      glide: 0.075, drive: 0.35, gain: 0.85,
    },
  }),
  sub({
    id: 'afro-lead', name: 'Afro Pluck', family: 'synth',
    blurb: 'Short marimba-ish synth pluck. The melodic hook in afro house and amapiano.',
    tags: ['afro house', 'amapiano', 'pluck', 'melodic', 'africa'],
    range: [52, 92], centerMidi: 69, polyphony: 8,
    params: {
      wave: 'triangle', voices: 2, detune: 8, spread: 0.4,
      osc2Wave: 'sine', osc2Semi: 12, osc2Level: 0.3,
      cutoff: 2200, resonance: 2.4, filterEnv: 1.8, keyTrack: 0.5,
      a: 0.003, d: 0.3, s: 0.05, r: 0.2, fa: 0.003, fd: 0.28, fs: 0.1, fr: 0.18,
      chorus: 0.4, gain: 0.4,
    },
  }),
]

// ---------------------------------------------------------------------------
// Kits
// ---------------------------------------------------------------------------

const p = (spec: DrumPiece): DrumPiece => piece(spec)

export const AFRICAN_KITS: PresetBase[] = [
  kit('kit-amapiano', 'Amapiano',
    'Log drum, shaker and that airy, patient kit. South Africa, and now everywhere.',
    ['amapiano', 'south africa', 'afro house', 'log drum', 'modern'], {
      36: p({ type: 'kick', name: 'Kick', tune: 50, decay: 0.42, level: 0.95, bend: 3, bendTime: 0.04, tone: 0.35, snap: 0.4 }),
      37: p({ type: 'rim', name: 'Rim', tune: 520, decay: 0.025, level: 0.55 }),
      38: p({ type: 'snare', name: 'Snare', tune: 200, decay: 0.12, level: 0.55, tone: 0.5, snap: 0.5 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1100, decay: 0.19, level: 0.7 }),
      40: p({ type: 'logdrum', name: 'Log Drum Low', tune: 62, decay: 0.85, level: 1, bend: 0.5, bendTime: 0.1, tone: 0.5, snap: 0.2 }),
      41: p({ type: 'logdrum', name: 'Log Drum Mid', tune: 78, decay: 0.8, level: 1, bend: 0.55, bendTime: 0.09, tone: 0.5, snap: 0.2 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.04, level: 0.32, tone: 0.3, choke: 'hat' }),
      43: p({ type: 'logdrum', name: 'Log Drum High', tune: 98, decay: 0.7, level: 0.95, bend: 0.6, bendTime: 0.08, tone: 0.55, snap: 0.25 }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.34, level: 0.3, tone: 0.35, choke: 'hat' }),
      70: p({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.06, level: 0.4, tone: 0.55 }),
      72: p({ type: 'shaker', name: 'Shekere', tune: 0, decay: 0.12, level: 0.35, tone: 0.4, pan: 0.25 }),
    }, 0.92, 0.08),

  kit('kit-afrobeats', 'Afrobeats',
    'The Lagos pop rhythm — tight kick, rim, shakers and layered hand drums.',
    ['afrobeats', 'nigeria', 'ghana', 'pop', 'africa', 'modern'], {
      36: p({ type: 'kick', name: 'Kick', tune: 54, decay: 0.3, level: 1, bend: 3.4, bendTime: 0.03, tone: 0.55, snap: 0.6 }),
      37: p({ type: 'rim', name: 'Rim', tune: 600, decay: 0.022, level: 0.7 }),
      38: p({ type: 'snare', name: 'Snare', tune: 215, decay: 0.13, level: 0.7, tone: 0.65, snap: 0.7 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1250, decay: 0.17, level: 0.7 }),
      40: p({ type: 'talking', name: 'Talking Drum', tune: 190, decay: 0.34, level: 0.8, bend: 1.55, tone: 0.5, snap: 0.6 }),
      41: p({ type: 'membrane', name: 'Conga Low', tune: 140, decay: 0.34, level: 0.75, bend: 1.3, tone: 0.5, snap: 0.5, pan: -0.2 }),
      43: p({ type: 'membrane', name: 'Conga High', tune: 215, decay: 0.28, level: 0.75, bend: 1.25, tone: 0.55, snap: 0.6, pan: 0.2 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 0, decay: 0.035, level: 0.36, tone: 0.4, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 0, decay: 0.3, level: 0.32, tone: 0.45, choke: 'hat' }),
      47: p({ type: 'click', name: 'Woodblock', tune: 950, decay: 0.05, level: 0.5 }),
      70: p({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.42, tone: 0.6 }),
    }, 0.92),

  kit('kit-afrohouse', 'Afro House',
    'Four-to-the-floor under layered African percussion. Clubs from Johannesburg to Ibiza.',
    ['afro house', 'house', 'club', 'percussion', 'africa'], {
      36: p({ type: 'kick', name: 'Kick', tune: 52, decay: 0.36, level: 1, bend: 4, bendTime: 0.03, tone: 0.6, snap: 0.7, drive: 0.25 }),
      38: p({ type: 'snare', name: 'Snare', tune: 210, decay: 0.14, level: 0.6, tone: 0.7, snap: 0.7 }),
      39: p({ type: 'clap', name: 'Clap', tune: 1300, decay: 0.2, level: 0.75 }),
      40: p({ type: 'membrane', name: 'Djembe Slap', tune: 290, decay: 0.15, level: 0.8, bend: 1.15, tone: 0.85, snap: 1 }),
      41: p({ type: 'membrane', name: 'Djembe Bass', tune: 88, decay: 0.48, level: 0.85, bend: 1.6, tone: 0.35, snap: 0.35 }),
      43: p({ type: 'membrane', name: 'Djembe Tone', tune: 195, decay: 0.3, level: 0.8, bend: 1.25, tone: 0.6, snap: 0.6 }),
      42: p({ type: 'hat', name: 'Closed Hat', tune: 380, decay: 0.04, level: 0.4, tone: 0.8, choke: 'hat' }),
      46: p({ type: 'hat', name: 'Open Hat', tune: 380, decay: 0.38, level: 0.38, tone: 0.8, choke: 'hat' }),
      45: p({ type: 'talking', name: 'Talking Drum', tune: 210, decay: 0.3, level: 0.75, bend: 1.6, tone: 0.5, snap: 0.6 }),
      70: p({ type: 'shaker', name: 'Shaker', tune: 0, decay: 0.05, level: 0.4, tone: 0.6 }),
      72: p({ type: 'shaker', name: 'Cabasa', tune: 0, decay: 0.09, level: 0.34, tone: 0.75, pan: -0.25 }),
      49: p({ type: 'cowbell', name: 'Cowbell', tune: 560, decay: 0.28, level: 0.4 }),
    }, 0.92, 0.12),

  kit('kit-westafrican', 'West African Drums',
    'Djembe, dunun and talking drum. The ensemble much of this rhythm language comes from.',
    ['africa', 'djembe', 'dunun', 'traditional', 'acoustic', 'world'], {
      36: p({ type: 'membrane', name: 'Dunun Low', tune: 72, decay: 0.7, level: 0.95, bend: 1.5, tone: 0.3, snap: 0.3 }),
      38: p({ type: 'membrane', name: 'Dunun High', tune: 110, decay: 0.5, level: 0.85, bend: 1.4, tone: 0.4, snap: 0.4 }),
      40: p({ type: 'membrane', name: 'Djembe Bass', tune: 86, decay: 0.52, level: 0.9, bend: 1.6, tone: 0.35, snap: 0.35 }),
      41: p({ type: 'membrane', name: 'Djembe Tone', tune: 190, decay: 0.32, level: 0.85, bend: 1.25, tone: 0.6, snap: 0.6 }),
      43: p({ type: 'membrane', name: 'Djembe Slap', tune: 285, decay: 0.15, level: 0.85, bend: 1.15, tone: 0.85, snap: 1 }),
      45: p({ type: 'talking', name: 'Talking Drum Low', tune: 150, decay: 0.38, level: 0.8, bend: 1.7, tone: 0.5, snap: 0.55 }),
      47: p({ type: 'talking', name: 'Talking Drum High', tune: 240, decay: 0.3, level: 0.8, bend: 1.6, tone: 0.55, snap: 0.6 }),
      49: p({ type: 'cowbell', name: 'Gankogui Bell', tune: 620, decay: 0.24, level: 0.45 }),
      70: p({ type: 'shaker', name: 'Shekere', tune: 0, decay: 0.11, level: 0.4, tone: 0.45 }),
    }, 0.92),
]
