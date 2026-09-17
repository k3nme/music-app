/**
 * Electronic and dance instruments.
 *
 * The original library leaned acoustic: seven synths and five basses against
 * fifty-odd acoustic and world instruments. That is the wrong balance for
 * anyone working in house, progressive, trap, drum & bass or amapiano, where
 * the synth *is* the instrument and the production moves — the riser, the
 * drop, the sidechain pump — matter as much as the notes.
 */

import type { PresetBase } from '../types'
import type { DrumPiece } from './drums'
import { def, fm, sub, OUT } from './preset-kit'

// ---------------------------------------------------------------------------
// Leads and chords
// ---------------------------------------------------------------------------

export const EDM_SYNTHS: PresetBase[] = [
  sub({
    id: 'future-chords', name: 'Future Bass Chords', family: 'synth',
    blurb: 'Wide detuned saws with the pitch wobbling just enough. Hold a chord and it breathes.',
    tags: ['future bass', 'edm', 'chords', 'wide', 'modern'],
    range: [48, 92], centerMidi: 64, polyphony: 12,
    params: {
      wave: 'sawtooth', voices: 7, detune: 30, spread: 0.95,
      osc2Wave: 'square', osc2Semi: 12, osc2Level: 0.18,
      cutoff: 2800, resonance: 1.1, filterEnv: 1.2, keyTrack: 0.4,
      a: 0.04, d: 0.5, s: 0.8, r: 0.5, fa: 0.06, fd: 0.7, fs: 0.65, fr: 0.4,
      vibratoRate: 5.5, vibratoDepth: 14, vibratoDelay: 0.12,
      chorus: 0.8, drive: 0.2, gain: 0.26,
    },
  }),
  sub({
    id: 'bigroom-lead', name: 'Big Room Lead', family: 'synth',
    blurb: 'The main-stage festival lead. Loud, simple, built to be heard over a crowd.',
    tags: ['edm', 'festival', 'bigroom', 'lead', 'drop'],
    range: [48, 96], centerMidi: 72, polyphony: 6,
    params: {
      wave: 'sawtooth', voices: 7, detune: 22, spread: 0.8,
      subLevel: 0.28, subOctave: 1,
      cutoff: 4200, resonance: 1.5, filterEnv: 1.1, keyTrack: 0.45,
      a: 0.006, d: 0.25, s: 0.85, r: 0.2, fa: 0.01, fd: 0.35, fs: 0.75, fr: 0.2,
      chorus: 0.35, drive: 0.45, gain: 0.26,
    },
  }),
  sub({
    id: 'hoover', name: 'Hoover', family: 'synth',
    blurb: 'The rave klaxon. Detuned sawtooth through a sweeping filter — hardcore, gabber, jungle.',
    tags: ['rave', 'hardcore', 'jungle', '90s', 'aggressive'],
    range: [36, 84], centerMidi: 52, polyphony: 4,
    params: {
      wave: 'sawtooth', voices: 5, detune: 42, spread: 0.55,
      osc2Wave: 'square', osc2Semi: -12, osc2Level: 0.45,
      cutoff: 900, resonance: 5.5, filterEnv: 2.6, keyTrack: 0.35,
      a: 0.02, d: 0.6, s: 0.55, r: 0.25, fa: 0.08, fd: 0.9, fs: 0.35, fr: 0.3,
      vibratoRate: 5.8, vibratoDepth: 26, vibratoDelay: 0.05,
      drive: 0.5, gain: 0.26,
    },
  }),
  sub({
    id: 'trance-pluck', name: 'Trance Pluck', family: 'synth',
    blurb: 'Short, bright and relentless. The 16th-note arpeggio that drives progressive and trance.',
    tags: ['trance', 'progressive', 'arp', 'lost stories', 'uplifting'],
    range: [48, 96], centerMidi: 72, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 4, detune: 16, spread: 0.65,
      cutoff: 1500, resonance: 3.5, filterEnv: 2.2, keyTrack: 0.55,
      a: 0.002, d: 0.18, s: 0.0, r: 0.14, fa: 0.002, fd: 0.16, fs: 0.05, fr: 0.12,
      chorus: 0.45, drive: 0.18, gain: 0.38,
    },
  }),
  sub({
    id: 'gated-pad', name: 'Trance Gate', family: 'synth',
    blurb: 'A held pad chopped into a rhythm by a gate. Hold one chord and it plays a pattern.',
    tags: ['trance', 'gate', 'rhythmic', 'edm', 'pad'],
    range: [48, 88], centerMidi: 64, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 5, detune: 20, spread: 0.85,
      cutoff: 3000, resonance: 1.6, filterEnv: 0.6, keyTrack: 0.4,
      a: 0.03, d: 0.4, s: 0.85, r: 0.4, fa: 0.05, fd: 0.5, fs: 0.7, fr: 0.3,
      filterLfoRate: 8, filterLfoDepth: 3.4, filterLfoShape: 'square',
      tremoloRate: 8, tremoloDepth: 0.85,
      chorus: 0.6, gain: 0.3,
    },
  }),
  sub({
    id: 'house-stab', name: 'House Organ Stab', family: 'synth',
    blurb: 'The clipped organ chord that built Chicago and every house record since.',
    tags: ['house', 'chicago', 'stab', 'chords', 'classic'],
    range: [48, 88], centerMidi: 64, polyphony: 8,
    params: {
      wave: 'square', voices: 2, detune: 8, spread: 0.3,
      osc2Wave: 'sawtooth', osc2Semi: 12, osc2Level: 0.35,
      cutoff: 2400, resonance: 2.2, filterEnv: 1.6, keyTrack: 0.5,
      a: 0.004, d: 0.22, s: 0.15, r: 0.12, fa: 0.004, fd: 0.2, fs: 0.2, fr: 0.1,
      drive: 0.35, chorus: 0.25, gain: 0.34,
    },
  }),
  sub({
    id: 'tropical-lead', name: 'Tropical Lead', family: 'synth',
    blurb: 'Soft sine-ish whistle lead. Tropical house, summer, sunsets in adverts.',
    tags: ['tropical', 'house', 'soft', 'whistle', 'summer'],
    range: [55, 96], centerMidi: 76, polyphony: 4,
    params: {
      wave: 'sine', voices: 3, detune: 9, spread: 0.5,
      osc2Wave: 'triangle', osc2Semi: 12, osc2Level: 0.22,
      cutoff: 4500, resonance: 0.9, filterEnv: 0.7, keyTrack: 0.4,
      a: 0.02, d: 0.3, s: 0.75, r: 0.28, fa: 0.03, fd: 0.4, fs: 0.7, fr: 0.25,
      vibratoRate: 5.2, vibratoDepth: 12, vibratoDelay: 0.3,
      chorus: 0.5, gain: 0.34,
    },
  }),
  sub({
    id: 'pwm-lead', name: 'PWM Lead', family: 'synth',
    blurb: 'Hollow analogue lead that shifts as it sustains. 80s synthpop and synthwave.',
    tags: ['synthwave', '80s', 'retro', 'lead', 'analogue'],
    range: [48, 92], centerMidi: 67, polyphony: 6,
    params: {
      wave: 'square', voices: 3, detune: 13, spread: 0.6,
      osc2Wave: 'sawtooth', osc2Semi: 0, osc2Level: 0.3,
      cutoff: 2600, resonance: 2, filterEnv: 1, keyTrack: 0.45,
      a: 0.01, d: 0.35, s: 0.8, r: 0.25, fa: 0.02, fd: 0.5, fs: 0.7, fr: 0.2,
      filterLfoRate: 0.4, filterLfoDepth: 0.55, filterLfoShape: 'sine',
      chorus: 0.55, drive: 0.15, gain: 0.3,
    },
  }),
  sub({
    id: 'string-machine', name: 'String Machine', family: 'synth',
    blurb: 'A 70s ensemble keyboard pretending to be strings, and failing beautifully.',
    tags: ['retro', 'disco', 'strings', 'lush', 'analogue'],
    range: [40, 90], centerMidi: 62, polyphony: 10,
    params: {
      wave: 'sawtooth', voices: 6, detune: 22, spread: 0.9,
      cutoff: 2200, resonance: 0.8, filterEnv: 0.5, keyTrack: 0.4,
      a: 0.22, d: 0.6, s: 0.9, r: 0.7, fa: 0.3, fd: 0.8, fs: 0.8, fr: 0.6,
      chorus: 1, gain: 0.28,
    },
  }),
  fm({
    id: 'vocal-chop', name: 'Vocal Chop', family: 'voice',
    blurb: 'A synthetic vowel, pitched and chopped. The hook sound of modern dance pop.',
    tags: ['edm', 'future bass', 'vocal', 'chop', 'hook'],
    range: [55, 92], centerMidi: 69, polyphony: 6,
    params: {
      ops: [
        { ratio: 1, level: 1, a: 0.012, d: 0.5, s: 0.7, r: 0.12, velSens: 0.35 },
        { ratio: 2.4, level: 0.85, a: 0.02, d: 0.35, s: 0.4, r: 0.1, velSens: 0.6 },
        { ratio: 5.1, level: 0.3, a: 0.03, d: 0.25, s: 0.2, r: 0.08, velSens: 0.7 },
      ],
      routes: [[1, 0], [2, 0], [0, OUT]],
      chorus: 0.55, drive: 0.12, gain: 0.34,
    },
  }),
  sub({
    id: 'supersaw-stab', name: 'Saw Stab', family: 'synth',
    blurb: 'One hard, short chord hit. Drops, builds, and anything needing punctuation.',
    tags: ['edm', 'stab', 'drop', 'chords', 'hard'],
    range: [40, 88], centerMidi: 60, polyphony: 8,
    params: {
      wave: 'sawtooth', voices: 5, detune: 18, spread: 0.7,
      subLevel: 0.2, subOctave: 1,
      cutoff: 3000, resonance: 2, filterEnv: 2, keyTrack: 0.4,
      a: 0.002, d: 0.3, s: 0.0, r: 0.16, fa: 0.002, fd: 0.25, fs: 0.05, fr: 0.14,
      drive: 0.4, gain: 0.32,
    },
  }),
  sub({
    id: 'chip-arp', name: 'Chip Arp', family: 'synth',
    blurb: 'Tiny 8-bit pulse. Game soundtracks, chiptune, and anything that wants to feel pixelated.',
    tags: ['chiptune', '8bit', 'game', 'retro', 'arp'],
    range: [48, 100], centerMidi: 76, polyphony: 3,
    params: {
      wave: 'square', voices: 1,
      cutoff: 8000, resonance: 0.5, filterEnv: 0.2, keyTrack: 0.2,
      a: 0.001, d: 0.08, s: 0.6, r: 0.04, fa: 0.001, fd: 0.1, fs: 0.8, fr: 0.04,
      vibratoRate: 7.5, vibratoDepth: 18, vibratoDelay: 0.12, gain: 0.3,
    },
  }),
]

// ---------------------------------------------------------------------------
// Bass
// ---------------------------------------------------------------------------

export const EDM_BASSES: PresetBase[] = [
  sub({
    id: 'wobble-bass', name: 'Wobble Bass', family: 'bass',
    blurb: 'Filter swinging open and shut under the note. Dubstep, riddim, bass music.',
    tags: ['dubstep', 'wobble', 'bass music', 'lfo', 'aggressive'],
    range: [24, 55], centerMidi: 36, polyphony: 2,
    params: {
      wave: 'sawtooth', voices: 3, detune: 22, spread: 0.3,
      subLevel: 0.45, subOctave: 1,
      cutoff: 420, resonance: 7, filterEnv: 1.2, keyTrack: 0.25,
      a: 0.008, d: 0.4, s: 0.85, r: 0.15, fa: 0.01, fd: 0.5, fs: 0.7, fr: 0.15,
      filterLfoRate: 5.5, filterLfoDepth: 3.2, filterLfoShape: 'sine',
      drive: 0.55, gain: 0.5,
    },
  }),
  sub({
    id: 'neuro-bass', name: 'Neuro Bass', family: 'bass',
    blurb: 'Metallic, snarling and constantly moving. Neurofunk and heavy drum & bass.',
    tags: ['dnb', 'neuro', 'growl', 'metallic', 'heavy'],
    range: [24, 52], centerMidi: 34, polyphony: 1,
    params: {
      wave: 'sawtooth', voices: 4, detune: 34, spread: 0.4,
      osc2Wave: 'square', osc2Semi: -12, osc2Level: 0.4,
      subLevel: 0.3, subOctave: 1,
      cutoff: 500, resonance: 9, filterEnv: 2.4, keyTrack: 0.3,
      a: 0.004, d: 0.3, s: 0.6, r: 0.12, fa: 0.006, fd: 0.35, fs: 0.4, fr: 0.12,
      filterLfoRate: 11, filterLfoDepth: 2.2, filterLfoShape: 'sawtooth',
      drive: 0.7, gain: 0.42,
    },
  }),
  sub({
    id: 'donk-bass', name: 'Donk', family: 'bass',
    blurb: 'That hollow bouncing offbeat. Bounce, scouse house, and a lot of bad decisions.',
    tags: ['donk', 'bounce', 'house', 'offbeat', 'hard'],
    range: [28, 60], centerMidi: 40, polyphony: 2,
    params: {
      wave: 'square', voices: 1,
      cutoff: 1400, resonance: 11, filterEnv: 1.4, keyTrack: 0.4,
      a: 0.002, d: 0.12, s: 0.0, r: 0.06, fa: 0.002, fd: 0.1, fs: 0.05, fr: 0.06,
      drive: 0.45, gain: 0.42,
    },
  }),
  sub({
    id: 'moog-bass', name: 'Analogue Bass', family: 'bass',
    blurb: 'Fat, round, slightly unstable. Funk, disco, boogie and everything after.',
    tags: ['analogue', 'moog', 'funk', 'disco', 'warm'],
    range: [24, 55], centerMidi: 36, polyphony: 1,
    params: {
      wave: 'sawtooth', voices: 2, detune: 9, spread: 0.15,
      osc2Wave: 'square', osc2Semi: -12, osc2Level: 0.35,
      cutoff: 620, resonance: 3.4, filterEnv: 1.6, keyTrack: 0.35,
      a: 0.005, d: 0.32, s: 0.6, r: 0.14, fa: 0.006, fd: 0.3, fs: 0.45, fr: 0.14,
      glide: 0.035, drive: 0.35, gain: 0.5,
    },
  }),
  sub({
    id: 'future-bass', name: 'Growl Bass', family: 'bass',
    blurb: 'Mid-range snarl that sits above the sub. Future bass and trap drops.',
    tags: ['future bass', 'trap', 'growl', 'mid', 'edm'],
    range: [28, 60], centerMidi: 40, polyphony: 2,
    params: {
      wave: 'sawtooth', voices: 5, detune: 28, spread: 0.5,
      cutoff: 800, resonance: 5, filterEnv: 1.6, keyTrack: 0.35,
      a: 0.006, d: 0.35, s: 0.7, r: 0.16, fa: 0.01, fd: 0.4, fs: 0.55, fr: 0.16,
      filterLfoRate: 3.2, filterLfoDepth: 1.4, filterLfoShape: 'sine',
      drive: 0.6, chorus: 0.3, gain: 0.4,
    },
  }),
  pluckBass('slap-bass', 'Slap Bass', 'Thumb and pop. Funk, disco, and 80s everything.',
    ['funk', 'slap', 'disco', '80s', 'bright'], {
      sustain: 1.6, damping: 0.14, pluckPosition: 0.05, excitationTone: 0.98,
      pickup: 0.35, releaseDamp: 26, drive: 0.4, bodyMix: 0.35,
      body: [{ freq: 90, q: 1.1, gain: 5 }, { freq: 1800, q: 1.3, gain: 5 }, { freq: 3400, q: 1, gain: 3 }],
    }),
  pluckBass('fretless-bass', 'Fretless Bass', 'Singing and slippery, sliding between notes.',
    ['jazz', 'fretless', 'smooth', 'mwah'], {
      sustain: 3.6, damping: 0.5, pluckPosition: 0.26, excitationTone: 0.35,
      releaseDamp: 10, drive: 0.15, bodyMix: 0.6,
      body: [{ freq: 75, q: 1.1, gain: 7 }, { freq: 500, q: 1.6, gain: 4 }],
    }),
]

function pluckBass(
  id: string, name: string, blurb: string, tags: string[], params: Record<string, unknown>,
): PresetBase {
  return def({
    id, name, family: 'bass', engine: 'pluck', blurb, tags,
    range: [24, 60], centerMidi: 38, polyphony: 4,
    params: { decayKeyScale: 0.25, gain: 0.85, ...params },
  })
}

// ---------------------------------------------------------------------------
// Transition effects
// ---------------------------------------------------------------------------

const fx = (piece: DrumPiece): DrumPiece => piece

/**
 * Builds and drops were simply impossible before this: there was no way to make
 * a sound that rises over four bars. These are one-shots like drums, but their
 * length is written in beats so they always land on the downbeat.
 */
export const FX_KIT: PresetBase = def({
  id: 'kit-fx', name: 'Transitions & FX', family: 'drums', engine: 'drum',
  blurb: 'Risers, impacts, sweeps and rolls. What turns a loop into an arrangement.',
  tags: ['edm', 'riser', 'drop', 'build', 'transition', 'fx'],
  centerMidi: 48, range: [36, 72], polyphony: 12,
  params: {
    gain: 0.8,
    pieces: {
      36: fx({ type: 'riser', name: 'Riser 1 bar', tune: 200, decay: 2, beats: 4, level: 0.7, tone: 0.5, snap: 0.5 }),
      37: fx({ type: 'riser', name: 'Riser 2 bars', tune: 180, decay: 4, beats: 8, level: 0.7, tone: 0.5, snap: 0.6 }),
      38: fx({ type: 'riser', name: 'Riser 4 bars', tune: 160, decay: 8, beats: 16, level: 0.7, tone: 0.45, snap: 0.7 }),
      40: fx({ type: 'downlifter', name: 'Downlifter', tune: 4000, decay: 2, beats: 4, level: 0.7, tone: 0.4, snap: 0.4 }),
      41: fx({ type: 'impact', name: 'Impact', tune: 60, decay: 2.4, level: 0.95, tone: 0.5, snap: 0.8, drive: 0.2 }),
      43: fx({ type: 'impact', name: 'Deep Impact', tune: 42, decay: 3.6, level: 1, tone: 0.3, snap: 0.5, drive: 0.3 }),
      45: fx({ type: 'sweep', name: 'Sweep up-down', tune: 600, decay: 1.6, beats: 4, level: 0.55, tone: 0.5 }),
      47: fx({ type: 'reverse', name: 'Reverse cymbal', tune: 0, decay: 2, beats: 4, level: 0.6, tone: 0.5 }),
      48: fx({ type: 'roll', name: 'Snare roll 1 bar', tune: 0, decay: 2, beats: 4, level: 0.7, tone: 0.5, snap: 0.5 }),
      50: fx({ type: 'roll', name: 'Snare roll 2 bars', tune: 0, decay: 4, beats: 8, level: 0.7, tone: 0.5, snap: 0.75 }),
      52: fx({ type: 'noise', name: 'White noise', tune: 4000, decay: 1.2, level: 0.45, tone: 0.5 }),
      53: fx({ type: 'cymbal', name: 'Crash', tune: 320, decay: 2.4, level: 0.5, tone: 0.65 }),
    },
  },
})

export const ELECTRONIC_PRESETS: PresetBase[] = [...EDM_SYNTHS, ...EDM_BASSES]
