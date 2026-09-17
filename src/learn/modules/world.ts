/**
 * Module 7: instruments and rhythms from outside the Western orchestra.
 *
 * The instruments module covers how sound is physically made — strings, air,
 * membranes, electricity. This one is about what people actually built with
 * those ideas elsewhere, and the rhythmic thinking that came with them. It
 * follows the instruments module because it is the same physics, differently
 * organised.
 */

import {
  aside, compare, layered, option, sequence, stack, terms, text, tryThis,
  type DemoNote, type Module,
} from '../types'

/** The seven-stroke bell that most West African rhythm is measured against. */
const BELL_PULSES = [0, 2, 3, 5, 7, 8, 10]
const bell = (midi: number, cycles = 2, velocity = 0.75): DemoNote[] =>
  Array.from({ length: cycles }, (_, c) =>
    BELL_PULSES.map((pulse) => [midi, c * 6 + pulse * 0.5, 0.2, velocity] as DemoNote),
  ).flat()

export const worldModule: Module = {
  id: 'world',
  title: 'Around the world',
  summary: 'Instruments and rhythms from West Africa, the Middle East, India, East Asia and Latin America — and what they do that Western instruments cannot.',
  icon: '🌍',
  hue: 35,
  lessons: [
    {
      id: 'world-bell',
      title: 'The bell and the cross-rhythm',
      summary: 'West African rhythm is measured against a repeating bell, with everything else deliberately not lining up with it.',
      blocks: [
        text(
          'Western rhythm is usually counted in fours, with the strong beats on 1 and 3. Much of ' +
          'West African music is counted in **twelve pulses**, and instead of a beat to count it ' +
          'has a bell playing a fixed, uneven pattern that repeats forever. Everyone plays against ' +
          'the bell, not against a count.',
        ),
        compare(
          'Built up against the bell',
          option('1. The bell alone — seven strokes in twelve', 'kit-westafrican', bell(49, 2), { bpm: 130 }),
          option('2. Add the dunun — the low pulse', 'kit-westafrican',
            [...bell(49, 2), ...[0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5].map((b) => [36, b, 0.3, 0.9] as DemoNote)],
            { bpm: 130 }),
          option('3. Add djembe hands on top', 'kit-westafrican',
            [...bell(49, 2),
             ...[0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5].map((b) => [36, b, 0.3, 0.9] as DemoNote),
             ...[0.5, 1, 2, 2.5, 3.5, 4, 5, 5.5, 6.5, 7, 8, 8.5, 9.5, 10, 11, 11.5]
               .map((b, i) => [i % 3 === 0 ? 43 : 41, b, 0.2, i % 3 === 0 ? 0.8 : 0.55] as DemoNote)],
            { bpm: 130 }),
        ),
        text(
          'Two different pulses are running at once — the bell in threes, the dunun in twos — and ' +
          'neither is wrong. That is a **cross-rhythm**, and it is the engine of the whole style. ' +
          'Your ear can follow either one, and which one you pick changes what the music feels like.',
        ),
        layered('The full ensemble, with the talking drum answering', [
          { preset: 'kit-westafrican', notes: [
            ...bell(49, 2),
            ...[0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5].map((b) => [36, b, 0.3, 0.9] as DemoNote),
            ...[0.5, 2, 2.5, 4, 5, 6.5, 8, 8.5, 10, 11].map((b, i) => [i % 2 === 0 ? 43 : 41, b, 0.2, 0.7] as DemoNote),
            ...[45, 47, 45, 47].map((m, i) => [m, 3 + i * 0.5, 0.25, 0.8] as DemoNote),
            ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((b) => [70, b, 0.15, 0.4] as DemoNote),
          ] },
        ], { bpm: 130, note: 'Djembe, dunun, talking drum, bell and shekere — an ensemble, not a kit.' }),
        aside(
          'The talking drum really does talk',
          'Squeeze the cords running down a talking drum and the skin tightens, so the pitch bends ' +
          'as you play. In tonal languages — Yoruba, Twi, Dagbani — meaning depends on pitch, so a ' +
          'skilled player can reproduce the melody of a sentence and be understood.',
        ),
        terms(
          ['Cross-rhythm', 'Two pulses running at once — commonly three against two. Both are correct; which you hear is up to you.'],
          ['Bell pattern', 'A fixed repeating pattern that an ensemble measures itself against, instead of counting beats.'],
        ),
        tryThis(
          'Load the West African Drums kit and play just the bell for a while. Then try to clap a ' +
          'steady four against it. The moment it stops feeling awkward, you have got it.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'world-afro',
      title: 'Afrobeats, Amapiano and Afro house',
      summary: 'How those rhythms became the most-streamed pop music on earth — and what a log drum is.',
      blocks: [
        text(
          'The three biggest African exports in pop right now share ancestry and split on rhythm ' +
          'and tempo. Afrobeats is around 100-110 BPM with a rolling, uneven kick. Amapiano sits ' +
          'near 112 and is built around a sliding bass drum called a **log drum**. Afro house puts ' +
          'four to the floor underneath the same percussion.',
        ),
        compare(
          'The same key, three grooves',
          option('Afrobeats — Lagos', 'kit-afrobeats',
            [[36, 0, 0.3, 1], [36, 1.5, 0.3, 0.95], [36, 2.5, 0.3, 0.9], [36, 4, 0.3, 1], [36, 5.5, 0.3, 0.95], [36, 6.5, 0.3, 0.9],
             [37, 1, 0.2, 0.7], [37, 3, 0.2, 0.7], [37, 5, 0.2, 0.7], [37, 7, 0.2, 0.7],
             [40, 3.5, 0.25, 0.75], [40, 7.25, 0.25, 0.75],
             ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5].map((b) => [70, b, 0.15, 0.45] as DemoNote)],
            { bpm: 104 }),
          option('Amapiano — Johannesburg', 'kit-amapiano',
            [[36, 0, 0.3, 1], [36, 1.5, 0.3, 0.9], [36, 3, 0.3, 0.95], [36, 4, 0.3, 1], [36, 5.5, 0.3, 0.9], [36, 7, 0.3, 0.95],
             [40, 2, 0.4, 0.95], [43, 2.5, 0.35, 0.8], [41, 3.5, 0.4, 0.9],
             [40, 6, 0.4, 0.95], [43, 6.5, 0.35, 0.8], [41, 7.5, 0.4, 0.9],
             ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((b) => [70, b, 0.15, 0.5] as DemoNote)],
            { bpm: 112 }),
          option('Afro house — the club version', 'kit-afrohouse',
            [...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => [36, b, 0.25, 1] as DemoNote),
             [39, 1, 0.2, 0.8], [39, 3, 0.2, 0.8], [39, 5, 0.2, 0.8], [39, 7, 0.2, 0.8],
             [41, 0.75, 0.3, 0.7], [43, 1.75, 0.25, 0.7], [40, 2.75, 0.2, 0.75], [43, 3.75, 0.25, 0.7],
             [41, 4.75, 0.3, 0.7], [43, 5.75, 0.25, 0.7], [40, 6.75, 0.2, 0.75], [45, 7.5, 0.3, 0.75],
             ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((b) => [46, b, 0.2, 0.55] as DemoNote)],
            { bpm: 124 }),
        ),
        text(
          'The log drum is worth hearing on its own. It is a bass drum that **slides** from one ' +
          'pitch to another, so it works as percussion and as a bass line at the same time — which ' +
          'is why amapiano tracks often have no other bass at all.',
        ),
        layered('A log drum line, with pads over it', [
          { preset: 'logdrum-bass', notes: [
            [40, 0, 0.5, 1], [45, 0.75, 0.4, 0.9], [43, 1.5, 0.5, 0.95], [38, 2.5, 0.6, 0.9],
            [40, 4, 0.5, 1], [45, 4.75, 0.4, 0.9], [48, 5.5, 0.5, 0.95], [43, 6.5, 0.6, 0.9],
          ], gain: 0.95 },
          { preset: 'kit-amapiano', notes: [
            ...[0, 1.5, 3, 4, 5.5, 7].map((b) => [36, b, 0.25, 0.9] as DemoNote),
            ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((b) => [70, b, 0.15, 0.45] as DemoNote),
            [39, 2, 0.2, 0.6], [39, 6, 0.2, 0.6],
          ], gain: 0.8 },
          { preset: 'gated-pad', notes: [
            ...stack([64, 67, 71], 0, 3.8, 0.6), ...stack([62, 65, 69], 4, 3.8, 0.6),
          ], gain: 0.4, pump: 0.55 },
        ], { bpm: 112, note: 'The log drum is the bass line. Nothing else is playing down there.' }),
        terms(
          ['Log drum', 'A bass drum whose pitch slides while it sounds, so one part is both the kick and the bass. The sound amapiano is built on.'],
        ),
        tryThis(
          'Load the Amapiano kit, put log drums on beats where there is no kick, and let them slide ' +
          'between three or four pitches. That is the genre, more or less.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'world-strings',
      title: 'Strings, plucked and struck',
      summary: 'Kora, ngoni, guzheng, pipa, balafon, mbira — the same physics, very different instruments.',
      blocks: [
        text(
          'Every one of these is a string or a bar being set vibrating. What differs is how many, ' +
          'how they are tuned, and what the resonating body does to the sound — and those choices ' +
          'shape what music gets written for them.',
        ),
        compare(
          'West Africa',
          option('Kora — 21 strings over a gourd harp', 'kora',
            sequence([57, 60, 64, 67, 69, 72, 69, 67, 64, 60], 0.3, 0, 0.8), { bpm: 100 }),
          option('Ngoni — the ancestor of the banjo', 'ngoni',
            sequence([57, 60, 62, 64, 62, 60, 57, 55], 0.3, 0, 0.85), { bpm: 100 }),
          option('Balafon — wooden bars, gourd resonators', 'balafon',
            sequence([60, 64, 67, 72, 69, 67, 64, 60], 0.3, 0, 0.8), { bpm: 100 }),
          option('Mbira — thumb-plucked metal tines', 'mbira',
            [...sequence([60, 64, 67], 0.4, 0, 0.75), ...sequence([72, 67, 64], 0.4, 0.2, 0.55),
             ...sequence([59, 62, 67], 0.4, 1.2, 0.75)], { bpm: 100 }),
        ),
        aside(
          'The kora is a harp pretending to be a lute',
          'Twenty-one strings run over a tall bridge on a half-gourd covered in cowhide. The ' +
          'player holds it upright by two posts and plays with both thumbs and both index fingers ' +
          '— the other fingers never leave the posts. Bass, rhythm and melody at once, by one ' +
          'person.',
        ),
        compare(
          'East Asia',
          option('Guzheng — 21 strings, heavy bends', 'guzheng',
            sequence([60, 62, 64, 67, 69, 72, 69, 67], 0.3, 0, 0.8), { bpm: 96 }),
          option('Pipa — the lute that tremolos', 'pipa',
            [...sequence([64, 64, 64, 64], 0.15, 0, 0.7), ...sequence([67, 69, 72], 0.4, 0.6, 0.85)], { bpm: 96 }),
          option('Koto — Japan, thirteen strings', 'koto',
            sequence([60, 61, 65, 67, 68, 72], 0.35, 0, 0.8), { bpm: 96 }),
          option('Gamelan — tuned bronze, Indonesia', 'gamelan-saron',
            sequence([60, 62, 65, 67, 70, 67, 65, 62], 0.4, 0, 0.8), { bpm: 96 }),
        ),
        compare(
          'South and Central Asia',
          option('Sarod — fretless, sliding', 'sarod',
            [[57, 0, 0.6, 0.85], [60, 0.6, 0.4, 0.85], [62, 1, 0.9, 0.85], [60, 2, 0.5, 0.8], [57, 2.6, 1.2, 0.8]], { bpm: 80 }),
          option('Santoor — struck with light hammers', 'santoor',
            sequence([60, 62, 64, 67, 69, 67, 64, 62], 0.25, 0, 0.8), { bpm: 96 }),
          option('Tanpura — the drone everything sits on', 'tanpura',
            [[48, 0, 3, 0.7], [55, 0.6, 3, 0.6], [55, 1.2, 3, 0.55], [48, 1.8, 3, 0.6]], { bpm: 70 }),
          option('Sitar — sympathetic strings ringing', 'sitar',
            sequence([57, 59, 60, 62, 64, 62, 60, 59], 0.3, 0, 0.85), { bpm: 90 }),
        ),
        tryThis(
          'Hum a simple melody into the Hum tab and play it back on the kora, then the guzheng, ' +
          'then the balafon. The tune does not change; everything else does.',
          { kind: 'open-hum' },
        ),
      ],
    },
    {
      id: 'world-reeds',
      title: 'Pipes, reeds and drones',
      summary: 'Duduk, shehnai, dizi, bagpipes, didgeridoo — wind instruments built on completely different ideas of beauty.',
      blocks: [
        text(
          'A Western orchestra prizes an even, blended wind tone. Plenty of traditions want the ' +
          'opposite: a reed that buzzes, a pipe that never stops, a tone with obvious breath in it. ' +
          'None of these are approximations of a clarinet — they are answers to a different question.',
        ),
        compare(
          'Reeds',
          option('Duduk — apricot wood, Armenia, mournful', 'duduk',
            [[60, 0, 1.2, 0.8], [62, 1.2, 0.6, 0.8], [63, 1.8, 1.8, 0.85], [60, 3.6, 1.4, 0.75]], { bpm: 72 }),
          option('Shehnai — piercing, for weddings', 'shehnai',
            [[67, 0, 0.8, 0.85], [69, 0.8, 0.4, 0.85], [70, 1.2, 1.2, 0.9], [67, 2.4, 1.6, 0.8]], { bpm: 80 }),
          option('Harmonium — hand-pumped reeds, India', 'harmonium',
            [...stack([57, 60, 64], 0, 1.9, 0.75), ...stack([55, 59, 62], 2, 1.9, 0.75)], { bpm: 80 }),
          option('Bagpipes — the drone never stops', 'bagpipes',
            sequence([69, 71, 72, 74, 72, 71, 69, 67], 0.4, 0, 0.85), { bpm: 90 }),
        ),
        compare(
          'Pipes and air',
          option('Dizi — bamboo with a buzzing membrane', 'dizi',
            sequence([72, 74, 76, 79, 81, 79, 76, 74], 0.35, 0, 0.8), { bpm: 96 }),
          option('Bansuri — India, all breath', 'bansuri',
            [[72, 0, 1, 0.8], [74, 1, 0.5, 0.8], [76, 1.5, 1.5, 0.85], [72, 3, 1.4, 0.75]], { bpm: 80 }),
          option('Shakuhachi — Japan, deliberately airy', 'shakuhachi',
            [[67, 0, 1.4, 0.8], [70, 1.5, 0.8, 0.8], [72, 2.4, 1.8, 0.85]], { bpm: 70 }),
          option('Didgeridoo — one pitch, endless overtones', 'didgeridoo',
            [[36, 0, 4, 0.85]], { bpm: 70 }),
        ),
        aside(
          'Circular breathing',
          'Didgeridoo, duduk and shehnai players all use it: you push air out of your cheeks while ' +
          'breathing in through your nose, so the note never stops. A didgeridoo drone can run for ' +
          'as long as the player wants to keep going.',
        ),
        terms(
          ['Drone', 'A note that never stops, holding still while a melody moves against it. The foundation of Indian classical music and of bagpipe music.'],
        ),
        tryThis(
          'Put a tanpura or a didgeridoo drone on one track and play any melody over it on another. ' +
          'The drone tells your ear what "home" is, and every note is heard against it.',
          { kind: 'open-instruments' },
        ),
      ],
    },
    {
      id: 'world-drums',
      title: 'Hands, sticks and skins',
      summary: 'Darbuka, tabla, dhol, samba batucada, taiko, reggaeton — six rhythmic languages, played on skin.',
      blocks: [
        text(
          'A drum kit is one person playing several drums with four limbs. Most percussion ' +
          'traditions are the opposite: several people, one drum each, interlocking. That changes ' +
          'what the patterns can be.',
        ),
        compare(
          'Six traditions, one bar each',
          option('Darbuka — doum, tek, ka', 'kit-darbuka',
            [[36, 0, 0.3, 1], [38, 0.75, 0.2, 0.8], [38, 1, 0.2, 0.7], [36, 1.5, 0.3, 0.95],
             [40, 2, 0.15, 0.6], [38, 2.5, 0.2, 0.8], [36, 3, 0.3, 0.9], [38, 3.5, 0.2, 0.75],
             [43, 0.5, 0.15, 0.5], [43, 1.5, 0.15, 0.5], [43, 2.5, 0.15, 0.5], [43, 3.5, 0.15, 0.5]],
            { bpm: 110 }),
          option('Dhol — Punjab, two heads, two sticks', 'kit-dhol',
            [[36, 0, 0.3, 1], [38, 0.5, 0.2, 0.8], [38, 0.75, 0.2, 0.7], [36, 1.5, 0.3, 0.95],
             [38, 2, 0.2, 0.8], [36, 2.5, 0.3, 0.9], [38, 3, 0.2, 0.8], [38, 3.5, 0.2, 0.75],
             [43, 1, 0.2, 0.5], [43, 3, 0.2, 0.5]],
            { bpm: 130 }),
          option('Tabla — na, ge, and fingers', 'kit-tabla',
            [[40, 0, 0.2, 0.9], [38, 0.5, 0.2, 0.7], [36, 1, 0.3, 0.95], [40, 1.5, 0.2, 0.8],
             [41, 2, 0.25, 0.85], [40, 2.5, 0.2, 0.7], [38, 3, 0.2, 0.8], [40, 3.5, 0.2, 0.75]],
            { bpm: 110 }),
          option('Samba — a whole street of players', 'kit-samba',
            [[36, 1, 0.4, 1], [36, 3, 0.4, 1], [38, 0, 0.3, 0.7], [38, 2, 0.3, 0.7],
             ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => [40, b, 0.15, b % 1 === 0 ? 0.6 : 0.4] as DemoNote),
             [43, 0, 0.2, 0.7], [45, 0.75, 0.2, 0.6], [43, 1.5, 0.2, 0.6], [45, 2.75, 0.2, 0.65],
             ...[0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75].map((b) => [47, b, 0.15, 0.4] as DemoNote)],
            { bpm: 100 }),
          option('Taiko — enormous, and mostly silence', 'kit-taiko',
            [[36, 0, 0.6, 1], [38, 1, 0.4, 0.8], [38, 1.5, 0.4, 0.7], [36, 2, 0.6, 1],
             [40, 3, 0.3, 0.8], [40, 3.25, 0.3, 0.7], [40, 3.5, 0.3, 0.85], [45, 3.75, 0.5, 0.6]],
            { bpm: 90 }),
          option('Reggaeton — the dembow', 'kit-reggaeton',
            [[36, 0, 0.3, 1], [36, 1, 0.3, 0.9], [36, 2, 0.3, 1], [36, 3, 0.3, 0.9],
             [38, 0.75, 0.2, 0.85], [38, 1.5, 0.2, 0.8], [38, 2.75, 0.2, 0.85], [38, 3.5, 0.2, 0.8],
             ...[0.5, 1.5, 2.5, 3.5].map((b) => [42, b, 0.15, 0.5] as DemoNote)],
            { bpm: 96 }),
        ),
        text(
          'Listen for what carries the groove in each. In samba it is the constant sixteenth-note ' +
          'shaker with accents pulling against it; in reggaeton it is one syncopated snare figure ' +
          'repeated without variation; in taiko it is the space between hits.',
        ),
        aside(
          'Drums that speak in syllables',
          'Tabla players learn patterns as spoken words — dha, ge, na, tin — and a composition can ' +
          'be recited before it is played. So can Ghanaian drum language and Korean janggu ' +
          'patterns. Notation came much later, and in many places never replaced the speaking.',
        ),
        tryThis(
          'Take one of these grooves and swap the kit underneath it without changing a note — a ' +
          'dembow on taiko drums, a samba on a darbuka. Some of those swaps are whole genres that ' +
          'already exist.',
          { kind: 'open-instruments' },
        ),
      ],
    },
  ],
}
