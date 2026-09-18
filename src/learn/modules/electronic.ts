/**
 * Module 9: making dance music.
 *
 * Everything here is a production technique rather than a piece of music
 * theory — the grid, the duck, the build, and the handful of synth sounds a
 * whole genre is built on. It sits after arranging because all of it assumes
 * you already know what a section is.
 */

import {
  aside, compare, layered, option, sequence, stack, terms, text, tryThis,
  type Demo, type DemoNote, type Module,
} from '../types'

/** Four-to-the-floor kick, one per beat. */
const four = (bars = 2): DemoNote[] =>
  Array.from({ length: bars * 4 }, (_, i) => [36, i, 0.2, 1] as DemoNote)

/** Open hat on every offbeat — the other half of the house pulse. */
const offbeats = (bars = 2, midi = 46, velocity = 0.7): DemoNote[] =>
  Array.from({ length: bars * 4 }, (_, i) => [midi, i + 0.5, 0.2, velocity] as DemoNote)

const clapsOn24 = (bars = 2): DemoNote[] =>
  Array.from({ length: bars * 2 }, (_, i) => [39, i * 2 + 1, 0.2, 0.85] as DemoNote)

export const electronicModule: Module = {
  id: 'electronic',
  title: 'Making dance music',
  summary: 'The grid, the duck, the build and the sounds — how house, techno, trance and bass music are actually put together.',
  icon: '🔊',
  hue: 300,
  lessons: [
    {
      id: 'electronic-floor',
      title: 'Four on the floor',
      summary: 'One kick per beat, a clap on 2 and 4, a hat on every offbeat. Nearly all dance music starts here.',
      blocks: [
        text(
          'Dance music is built on a pulse a body can lock onto without thinking. The simplest ' +
          'version puts a **kick on every beat** — four to the floor — and then adds parts that ' +
          'land *between* those kicks, so the groove pushes forward instead of sitting still.',
        ),
        compare(
          'Built up one layer at a time',
          option('1. Kick on every beat', 'kit-909', four(2), { bpm: 124 }),
          option('2. Clap on 2 and 4', 'kit-909', [...four(2), ...clapsOn24(2)], { bpm: 124 }),
          option('3. Open hat on every offbeat', 'kit-909',
            [...four(2), ...clapsOn24(2), ...offbeats(2)], { bpm: 124 }),
        ),
        text(
          'That third step is the whole trick. The hat sits exactly halfway between two kicks, so ' +
          'you feel a pulse at twice the speed without anything playing twice as fast. Take the ' +
          'hat away and the same beat suddenly feels heavy.',
        ),
        layered('The same groove with a bass and a chord stab', [
          { preset: 'kit-909', notes: [...four(2), ...clapsOn24(2), ...offbeats(2),
            ...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => [42, b + 0.25, 0.1, 0.35] as DemoNote)] },
          { preset: 'sub-bass', notes: [
            [33, 0.5, 0.4, 0.9], [33, 1.5, 0.4, 0.9], [33, 2.5, 0.4, 0.9], [33, 3.5, 0.4, 0.9],
            [36, 4.5, 0.4, 0.9], [36, 5.5, 0.4, 0.9], [36, 6.5, 0.4, 0.9], [36, 7.5, 0.4, 0.9],
          ], gain: 0.9 },
          { preset: 'house-stab', notes: [
            ...stack([60, 63, 67], 1.5, 0.4, 0.7), ...stack([60, 63, 67], 3.5, 0.4, 0.7),
            ...stack([58, 62, 65], 5.5, 0.4, 0.7), ...stack([58, 62, 65], 7.5, 0.4, 0.7),
          ], gain: 0.55 },
        ], { bpm: 124, note: 'Bass and chords on the offbeats too. Nothing here lands on a kick.' }),
        aside(
          'Genres are mostly tempo',
          'The same pattern is a different genre at a different speed. House lives around 120-128 ' +
          'BPM, techno 130-140, trance 138, drum & bass 174, and that is most of what separates ' +
          'them. Change the tempo in the toolbar and hear a house loop become techno.',
        ),
        compare(
          'One beat, three tempos',
          option('House — 124', 'kit-909', [...four(2), ...clapsOn24(2), ...offbeats(2)], { bpm: 124 }),
          option('Techno — 138, drier kit', 'kit-techno', [...four(2), ...clapsOn24(2), ...offbeats(2)], { bpm: 138 }),
          option('Disco — 118, live kit', 'kit-disco', [...four(2), ...clapsOn24(2), ...offbeats(2)], { bpm: 118 }),
        ),
        terms(
          ['Offbeat', 'The halfway point between two beats. Dance music puts hats, basses and chords there to keep the groove moving.'],
        ),
        tryThis(
          'Open the instrument picker, choose the Techno or Disco kit, and write kicks on all four ' +
          'beats. Then add open hats halfway between them.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'electronic-sidechain',
      title: 'The pump',
      summary: 'Why dance records breathe: everything gets pushed out of the way each time the kick lands.',
      blocks: [
        text(
          'Put a big sustained chord under a kick drum and they fight — the chord covers the kick, ' +
          'and the whole thing turns to mud. The fix is older than dance music and defines its ' +
          'sound: **duck everything else, briefly, every time the kick hits**.',
        ),
        compare(
          'The same chord, the same kick',
          {
            label: 'Without the duck',
            note: 'The kick is buried. The chord just sits there.',
            bpm: 126,
            voices: [
              { preset: 'kit-909', notes: four(2) },
              { preset: 'supersaw', notes: stack([60, 64, 67, 72], 0, 7.8, 0.75), gain: 0.55 },
            ],
          } as Demo,
          {
            label: 'With the duck',
            note: 'Same notes. The chord now breathes around the kick.',
            bpm: 126,
            voices: [
              { preset: 'kit-909', notes: four(2) },
              { preset: 'supersaw', notes: stack([60, 64, 67, 72], 0, 7.8, 0.75), gain: 0.55, pump: 0.85 },
            ],
          } as Demo,
        ),
        text(
          'Nothing about the notes changed. The chord is simply turned down for a fraction of a ' +
          'second on each beat and let back up — and that rise and fall is the thing people mean ' +
          'when they say a track pumps.',
        ),
        aside(
          'Why it is called sidechaining',
          'On a mixing desk you feed the kick into a compressor that is squashing the chords, so ' +
          'the kick controls how hard the chords are turned down. The kick is wired into the side ' +
          'of the chain rather than through it. Here the grid does the same job directly: the app ' +
          'already knows where the beats are, so the duck lands perfectly whatever the drums play.',
        ),
        compare(
          'How often it ducks changes the feel',
          {
            label: 'Every beat — house',
            bpm: 126,
            voices: [
              { preset: 'kit-909', notes: four(2) },
              { preset: 'future-chords', notes: stack([60, 63, 67], 0, 7.8, 0.7), gain: 0.6, pump: 0.8, pumpBeats: 1 },
            ],
          } as Demo,
          {
            label: 'Every two beats — slower, wider',
            bpm: 126,
            voices: [
              { preset: 'kit-909', notes: four(2) },
              { preset: 'future-chords', notes: stack([60, 63, 67], 0, 7.8, 0.7), gain: 0.6, pump: 0.8, pumpBeats: 2 },
            ],
          } as Demo,
        ),
        terms(
          ['Sidechain', 'Ducking one sound every time another one hits — almost always everything else ducking under the kick.'],
        ),
        tryThis(
          'In the Mixer, find the Pump knob on any track that is not the drums and turn it up while ' +
          'the loop plays. Start around 60. Leave it off on the kick itself.',
        ),
      ],
    },
    {
      id: 'electronic-build',
      title: 'Builds and drops',
      summary: 'Risers, snare rolls and impacts — the sounds whose entire job is to point at the next section.',
      blocks: [
        text(
          'A drop only lands if something set it up. The transition sounds are not music exactly — ' +
          'they are **signposts**, telling a room what is about to happen so it can react in time.',
        ),
        compare(
          'The same drop, with and without the build',
          {
            label: 'Straight cut',
            note: 'It arrives, but nothing announced it.',
            bpm: 128,
            voices: [
              { preset: 'kit-909', notes: [...four(2).map(([m, b, l, v]) => [m, b + 4, l, v] as DemoNote)] },
              { preset: 'supersaw', notes: stack([60, 64, 67], 4, 3.8, 0.75), gain: 0.5, pump: 0.8 },
            ],
          } as Demo,
          {
            label: 'Riser, roll, impact, drop',
            note: 'Four bars of tension, then everything at once.',
            bpm: 128,
            voices: [
              { preset: 'kit-fx', notes: [[36, 0, 0.2, 0.8], [48, 0, 0.2, 0.7], [41, 4, 0.2, 0.9], [53, 4, 0.2, 0.7]] },
              { preset: 'kit-909', notes: [...four(2).map(([m, b, l, v]) => [m, b + 4, l, v] as DemoNote)] },
              { preset: 'supersaw', notes: stack([60, 64, 67], 4, 3.8, 0.75), gain: 0.5, pump: 0.8 },
            ],
          } as Demo,
        ),
        text(
          'Three ingredients do nearly all of it. A **riser** climbs in pitch or brightness across ' +
          'the bars before a change. A **snare roll** speeds up until it stops being a rhythm. An ' +
          '**impact** — a low, short boom — marks the exact moment of arrival.',
        ),
        compare(
          'The transition kit, piece by piece',
          option('Riser, one bar', 'kit-fx', [[36, 0, 0.2, 0.85]], { bpm: 128 }),
          option('Riser, two bars', 'kit-fx', [[37, 0, 0.2, 0.85]], { bpm: 128 }),
          option('Snare roll', 'kit-fx', [[48, 0, 0.2, 0.85]], { bpm: 128 }),
          option('Impact', 'kit-fx', [[41, 0, 0.2, 0.95]], { bpm: 128 }),
          option('Downlifter — after the drop', 'kit-fx', [[40, 0, 0.2, 0.85]], { bpm: 128 }),
          option('Reverse cymbal', 'kit-fx', [[47, 0, 0.2, 0.8]], { bpm: 128 }),
        ),
        aside(
          'Risers are written in beats, not seconds',
          'A riser has to finish exactly on the downbeat of the next section, so these sounds are ' +
          'measured in bars and stretch themselves to whatever tempo the song is at. Change the ' +
          'BPM and they still land.',
        ),
        tryThis(
          'Put the Transitions & FX kit on a track, drop a two-bar riser two bars before your ' +
          'chorus, and an impact on the downbeat of it.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'electronic-bass',
      title: 'Bass is the instrument',
      summary: 'Sub, Reese, wobble, neuro, 808 — in electronic music the bass is often the lead part.',
      blocks: [
        text(
          'In a band the bass holds the bottom while something else sings. In most electronic music ' +
          'the bass **is** the interesting part, and entire genres are named after the kind of bass ' +
          'they use.',
        ),
        compare(
          'The same two-bar line, five ways',
          option('Sub — felt more than heard', 'sub-bass',
            [[33, 0, 0.9, 0.95], [33, 1.5, 0.4, 0.9], [36, 2, 0.9, 0.95], [31, 3.5, 0.4, 0.9]], { bpm: 128 }),
          option('Reese — two detuned saws grinding', 'reese-bass',
            [[33, 0, 0.9, 0.95], [33, 1.5, 0.4, 0.9], [36, 2, 0.9, 0.95], [31, 3.5, 0.4, 0.9]], { bpm: 128 }),
          option('Wobble — the filter moves in time', 'wobble-bass',
            [[33, 0, 1.4, 0.95], [36, 2, 1.4, 0.95]], { bpm: 128 }),
          option('Neuro — metallic and aggressive', 'neuro-bass',
            [[33, 0, 0.9, 0.95], [33, 1.5, 0.4, 0.9], [36, 2, 0.9, 0.95], [31, 3.5, 0.4, 0.9]], { bpm: 174 }),
          option('808 — a kick you can play tunes on', '808-bass',
            [[33, 0, 1.4, 0.95], [33, 1.75, 0.6, 0.9], [36, 2.5, 1.4, 0.95]], { bpm: 140 }),
        ),
        text(
          'Notice how little the notes matter compared with the sound. The sub and the Reese play ' +
          'exactly the same line; one holds a room up and the other threatens it.',
        ),
        compare(
          'Three more, from three more scenes',
          option('Donk — hard, bouncy, offbeat', 'donk-bass',
            [[45, 0.5, 0.3, 0.95], [45, 1.5, 0.3, 0.95], [45, 2.5, 0.3, 0.95], [48, 3.5, 0.3, 0.95]], { bpm: 140 }),
          option('Future bass — bright and vocal', 'future-bass',
            [[45, 0, 1.4, 0.9], [43, 2, 1.4, 0.9]], { bpm: 150 }),
          option('Acid — one filter, endlessly tweaked', 'acid-bass',
            sequence([33, 33, 45, 33, 36, 33, 40, 33], 0.5, 0, 0.9), { bpm: 130 }),
        ),
        aside(
          'Why the low end needs room',
          'Two bass sounds at once almost never works — they occupy the same frequencies and the ' +
          'result is a mess with no definition. If you want both a sub and a growl, give the sub ' +
          'the bottom and filter the growl so it starts higher up. The Tone knob in the Mixer is ' +
          'enough to do it.',
        ),
        tryThis(
          'Write a bass line once, then swap the instrument between Sub, Reese and 808 without ' +
          'changing a note. That swap is most of what genre means down here.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'electronic-sounds',
      title: 'The sounds themselves',
      summary: 'Supersaws, hoovers, stabs, plucks and chops — where the familiar dance-music noises come from.',
      blocks: [
        text(
          'A handful of synth sounds turn up again and again, each tied to a scene and an era. They ' +
          'are all made the same way — oscillators, a filter, an envelope — but the recipes have ' +
          'names, and knowing them is a shortcut to the sound in your head.',
        ),
        compare(
          'Leads and chords',
          option('Supersaw — many detuned saws, huge', 'supersaw', stack([60, 64, 67, 72], 0, 2.4, 0.7), { bpm: 128 }),
          option('Hoover — the rave sound', 'hoover', [[48, 0, 1.6, 0.9], [51, 1.8, 1.6, 0.9]], { bpm: 128 }),
          option('Big room lead — festival main stage', 'bigroom-lead',
            sequence([72, 72, 74, 76], 0.5, 0, 0.85), { bpm: 128 }),
          option('House stab — one chord, short and funky', 'house-stab',
            [...stack([60, 63, 67], 0.5, 0.3, 0.8), ...stack([60, 63, 67], 1.5, 0.3, 0.8),
             ...stack([58, 62, 65], 2.5, 0.3, 0.8), ...stack([58, 62, 65], 3.5, 0.3, 0.8)], { bpm: 124 }),
          option('Future chords — detuned and wobbling', 'future-chords',
            [...stack([60, 63, 67, 70], 0, 1.9, 0.7), ...stack([58, 62, 65, 69], 2, 1.9, 0.7)], { bpm: 150 }),
        ),
        compare(
          'Plucks, arps and voices',
          option('Trance pluck — short, delayed, endless', 'trance-pluck',
            sequence([69, 72, 76, 72, 74, 69, 72, 67], 0.25, 0, 0.8), { bpm: 138 }),
          option('Chip arp — 8-bit, square and fast', 'chip-arp',
            sequence([60, 64, 67, 72, 76, 72, 67, 64], 0.2, 0, 0.8), { bpm: 140 }),
          option('Gated pad — chopped into the rhythm', 'gated-pad', stack([57, 60, 64], 0, 3.8, 0.75), { bpm: 128 }),
          option('Vocal chop — a voice used as a synth', 'vocal-chop',
            sequence([72, 69, 74, 72], 0.5, 0, 0.8), { bpm: 128 }),
          option('Tropical lead — soft and steel-drum-ish', 'tropical-lead',
            sequence([72, 74, 76, 79], 0.5, 0, 0.8), { bpm: 110 }),
        ),
        aside(
          'The hoover, specifically',
          'It comes from one preset on a Roland Alpha Juno called "What Pad", used on a 1991 Dutch ' +
          'rave record, and it has been in dance music ever since. Most of these sounds have a ' +
          'story like that: one machine, one record, thirty years of echoes.',
        ),
        tryThis(
          'Search the instrument picker for "edm", "rave" or "festival" and play through what comes ' +
          'back. Every one of these is a preset you can start from and change.',
          { kind: 'open-instruments' },
        ),
        text(
          'And when you want a sound that is not a preset at all — the exact kick off a record you ' +
          'love, or a voice — take the song apart and keep it. It becomes an instrument you can ' +
          'play like any other.',
        ),
        tryThis(
          'Drop a song into Take a song apart. It separates the layers, finds the individual sounds ' +
          'inside them, and tells you which ones your library does not already cover.',
          { kind: 'open-sounds' },
        ),
      ],
    },
  ],
}
