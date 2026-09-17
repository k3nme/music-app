/**
 * Modules 7-8: how parts fit together, and how to do it here.
 *
 * The first half of the curriculum is about what music is made of. This half
 * is about assembling it, and then about which button in this app does which
 * of those things.
 */

import {
  aside, compare, layered, option, sequence, stack, terms, text, tryThis, type Module,
} from '../types'

export const arrangingModule: Module = {
  id: 'arranging',
  title: 'Putting a track together',
  summary: 'The four jobs every arrangement fills, how songs are shaped, and what mixing actually does.',
  icon: '🧩',
  hue: 255,
  lessons: [
    {
      id: 'arrange-jobs',
      title: 'The four jobs',
      summary: 'Nearly every arrangement is bass, rhythm, harmony and melody. Build them up one at a time.',
      blocks: [
        text(
          'Most produced music, in almost any genre, is four roles working together. Each is ' +
          'doing something the others are not.',
        ),
        compare(
          'One at a time',
          option('1. Drums — the time', 'kit-909',
            [[36, 0, 0.2, 1], [36, 1, 0.2, 1], [36, 2, 0.2, 1], [36, 3, 0.2, 1],
             [39, 1, 0.2, 0.8], [39, 3, 0.2, 0.8],
             [42, 0.5, 0.2, 0.4], [42, 1.5, 0.2, 0.4], [42, 2.5, 0.2, 0.4], [42, 3.5, 0.2, 0.4]],
            { bpm: 120 }),
          option('2. Bass — the bottom and the root', 'sub-bass',
            [[45, 0, 1.5, 0.9], [45, 2, 1.5, 0.9]], { bpm: 120 }),
          option('3. Chords — the harmony', 'warm-pad',
            stack([57, 60, 64], 0, 3.8), { bpm: 120 }),
          option('4. Melody — the tune', 'bansuri',
            sequence([69, 72, 71, 69], 1), { bpm: 120 }),
        ),
        layered('All four together', [
          { preset: 'kit-909', notes: [
            [36, 0, 0.2, 1], [36, 1, 0.2, 1], [36, 2, 0.2, 1], [36, 3, 0.2, 1],
            [36, 4, 0.2, 1], [36, 5, 0.2, 1], [36, 6, 0.2, 1], [36, 7, 0.2, 1],
            [39, 1, 0.2, 0.8], [39, 3, 0.2, 0.8], [39, 5, 0.2, 0.8], [39, 7, 0.2, 0.8],
            ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].map((b) => [42, b, 0.2, 0.4] as [number, number, number, number]),
          ], gain: 0.85 },
          { preset: 'sub-bass', notes: [
            [45, 0, 1.5, 0.9], [45, 2, 1.5, 0.9], [41, 4, 1.5, 0.9], [43, 6, 1.5, 0.9],
          ], gain: 0.9 },
          { preset: 'warm-pad', notes: [
            ...stack([57, 60, 64], 0, 3.8, 0.55), ...stack([53, 57, 60], 4, 1.9, 0.55),
            ...stack([55, 59, 62], 6, 1.9, 0.55),
          ], gain: 0.45 },
          { preset: 'bansuri', notes: [
            [69, 0, 1, 0.75], [72, 1, 1, 0.75], [71, 2, 1.5, 0.7], [69, 4, 1, 0.75],
            [67, 5, 3, 0.7],
          ], gain: 0.6 },
        ], { bpm: 120, note: 'The same four parts, stacked. Nothing new was added.' }),
        text(
          'Notice each part occupies a different register and a different rhythmic density. That ' +
          'is not decoration — it is what lets you hear all four at once.',
        ),
        tryThis(
          'This is exactly what Ideas does. Write or hum any melody, then ask it for chords, then ' +
          'a bass line, then drums. It fills the other three jobs around whatever you gave it.',
          { kind: 'open-ideas' },
        ),
      ],
    },
    {
      id: 'arrange-structure',
      title: 'Shaping a song',
      summary: 'Tension, release, and knowing when to take something away.',
      blocks: [
        text(
          'A four-bar loop is not a song. What turns one into the other is **change over time** — ' +
          'sections that add and remove parts so the listener feels movement.',
        ),
        text(
          'The standard pop shape is intro, verse, chorus, verse, chorus, bridge, chorus. Dance ' +
          'music uses intro, build, drop, breakdown, build, drop. They are the same idea: set ' +
          'expectations, withhold, deliver.',
        ),
        compare(
          'The single most useful arrangement trick',
          option('Full arrangement', 'warm-pad', stack([57, 60, 64, 69], 0, 3), { bpm: 120 }),
          option('Everything stripped away', 'grand-piano', stack([57, 69], 0, 3), { bpm: 120 }),
        ),
        text(
          'Taking things **out** creates more impact than putting things in. A chorus sounds huge ' +
          'largely because the verse before it was small. If everything is full the whole way ' +
          'through, nothing sounds big.',
        ),
        aside(
          'The build and the drop',
          'In the kind of progressive and melodic dance music you hear from producers like Lost ' +
          'Stories, a build usually removes the kick, adds a rising noise sweep and shortens the ' +
          'gaps between hits — raising tension — then cuts to near-silence for a beat before ' +
          'everything lands together. The silence is doing the work.',
        ),
        tryThis(
          'In the arrangement, drag the right edge of a clip to repeat it, then delete a couple ' +
          'of clips from the first four bars so the track starts sparse and fills out.',
        ),
        terms(
          ['Section', 'A chunk of a song with its own character — verse, chorus, drop.'],
          ['Build', 'A passage that raises tension before a release.'],
          ['Drop', 'The moment everything lands. Only works if something was withheld first.'],
        ),
      ],
    },
    {
      id: 'arrange-mixing',
      title: 'Mixing: making room',
      summary: 'Level, position, tone and space — four controls, and what each is really for.',
      blocks: [
        text(
          'Mixing is not "making it sound better". It is making each part audible without any of ' +
          'them fighting. There are four tools and they all do the same job differently.',
        ),
        text(
          '**Level** is how loud. Obvious, and still the most powerful control by a distance — ' +
          'most mix problems are a level problem.',
        ),
        text(
          '**Pan** places a sound left or right. Two instruments in the same register stop ' +
          'fighting if you move one to each side. Bass and lead vocal traditionally stay centre.',
        ),
        compare(
          'Two parts, same register',
          option('Both centre — they blur', 'rhodes', [...stack([60, 64, 67], 0, 3), ...stack([62, 65, 69], 0, 3)]),
          option('One alone — clear', 'rhodes', stack([60, 64, 67], 0, 3)),
        ),
        text(
          '**Tone** (the Tone control on each channel here, an EQ elsewhere) removes frequencies ' +
          'a part does not need. Rolling the low end off a pad instantly gives the bass room, ' +
          'even though you did not touch the bass.',
        ),
        text(
          '**Reverb** puts a sound in a room. A little makes things sit together; a lot pushes ' +
          'them far away. The classic mistake is drowning everything — the drier things are, the ' +
          'closer and more urgent they feel.',
        ),
        compare(
          'Dry vs drenched',
          option('Close and dry', 'nylon-guitar', sequence([60, 64, 67, 72], 0.4)),
          option('Distant, in a hall', 'glass-pad', stack([60, 64, 67, 72], 0, 4)),
        ),
        aside(
          'Why your mix sounds worse the longer you work',
          'Ears adapt fast, and everyone turns things up rather than down, so mixes creep louder ' +
          'and louder until nothing has space. Two defences: take breaks, and when you want ' +
          'something to stand out, turn everything else down instead.',
        ),
        terms(
          ['Pan', 'Placing a sound left or right.'],
          ['EQ / tone', 'Boosting or cutting frequency ranges.'],
          ['Reverb', 'Simulated room sound. Puts a part at a distance.'],
          ['Dry / wet', 'Without effect / with effect.'],
        ),
      ],
    },
  ],
}

export const overtoneModule: Module = {
  id: 'overtone',
  title: 'Doing all this in Overtone',
  summary: 'Which button does which of the things you just learned.',
  icon: '🎛️',
  hue: 265,
  lessons: [
    {
      id: 'ot-ways-in',
      title: 'Three ways to start',
      summary: 'You never have to begin with an empty grid.',
      blocks: [
        text(
          'The hardest part of making music is the blank page. There are three doors here and ' +
          'none of them require you to know what you are doing.',
        ),
        text(
          '**Hum it** — sing, hum, whistle, beatbox or play chords into your microphone. The app ' +
          'works out the notes, the rhythm and the key, and plays it back on any instrument. This ' +
          'is the one to use when you have a tune in your head.',
        ),
        tryThis('Hum eight seconds of anything and put it on a sitar.', { kind: 'open-hum' }),
        text(
          '**Mashup** — drop in two songs you already love. The app reads both tempos and keys ' +
          'and pulls them onto one grid, then you choose which parts to take from each. This is ' +
          'the one to use when you have taste but no tune.',
        ),
        tryThis('Take the vocal from one song and the drums from another.', { kind: 'open-mashup' }),
        text(
          '**Start with a groove** — a four-bar sketch is already playing and you change it. ' +
          'Often the fastest way to learn what a control does is to move it on something that ' +
          'already works.',
        ),
        tryThis('Load the starter groove and swap its instruments around.', { kind: 'load-demo-project' }),
      ],
    },
    {
      id: 'ot-screen',
      title: 'What is on screen',
      summary: 'A quick tour, in plain language.',
      blocks: [
        text(
          'The **top bar** is transport and song settings. Play and stop, the position counter, ' +
          'the loop and click toggles, tempo, and the key. Key and tempo are the two settings ' +
          'everything else follows.',
        ),
        text(
          'The **track list** on the left is one row per instrument or audio file. M mutes a ' +
          'track, S plays it alone — solo is the fastest way to hear what a part is actually ' +
          'doing.',
        ),
        text(
          'The **arrangement** is the timeline. Each block is a clip. Drag to move, drag the ' +
          'right edge to repeat, right-click to duplicate. The purple band at the top is the ' +
          'loop region.',
        ),
        text(
          'The **editor** underneath changes with what you have selected: a piano roll for ' +
          'melodic parts, a grid of squares for drums, a waveform for audio. The Play tab gives ' +
          'you a keyboard, and Mix gives you the faders.',
        ),
        aside(
          'The one setting worth understanding early',
          'The scale menu in the top bar does more than label things. With snapping on, the piano ' +
          'roll will not let you place a note outside the scale, and hummed takes get corrected ' +
          'into it. Set it to a pentatonic scale and it is very hard to place a wrong note.',
        ),
      ],
    },
    {
      id: 'ot-finishing',
      title: 'Finishing and keeping things',
      summary: 'Getting a track out of the browser.',
      blocks: [
        text(
          '**Export WAV** renders the song offline through the exact signal chain you hear. It is ' +
          'faster than real time and sounds identical to playback.',
        ),
        text(
          '**Export each track as its own WAV** gives you stems — useful if you want to take the ' +
          'parts into another program, or hand them to someone else.',
        ),
        text(
          '**Export MIDI** exports the notes but not the sounds, so you can rebuild the same ' +
          'arrangement with different instruments anywhere else.',
        ),
        text(
          '**Download bundle** is the one to use for safekeeping: a single file containing the ' +
          'arrangement *and* every audio file it uses. A share link carries the arrangement only ' +
          'and cannot carry audio.',
        ),
        aside(
          'Everything is local',
          'Projects live in this browser and nothing is uploaded anywhere. That is good for ' +
          'privacy and bad for backups — if you clear your browser data it is gone. Download a ' +
          'bundle for anything you care about.',
        ),
      ],
    },
    {
      id: 'ot-next',
      title: 'Where to go from here',
      summary: 'What is worth practising, and what this app will not teach you.',
      blocks: [
        text(
          'The fastest way to improve is not more theory. It is **finishing things**. A finished ' +
          'eight-bar loop teaches you more than a half-understood chapter on modal harmony.',
        ),
        text(
          'Three habits worth building: copy something you love and work out why it works; ' +
          'finish badly rather than not finishing; and listen to your own work the next day, ' +
          'when your ears are honest again.',
        ),
        text(
          'What this app cannot give you is taste and judgement — when a part is too busy, when a ' +
          'section is too long, when an idea is not worth pursuing. That comes from listening ' +
          'closely to music you already love, which by your own account you have been doing for ' +
          'years. That part is not the weak link.',
        ),
        aside(
          'If you want to go deeper',
          'The natural next steps are learning to play a real instrument, even badly — it teaches ' +
          'rhythm and pitch in your body rather than your head — and learning to read the shape ' +
          'of a song by ear: count the bars in a track you love and notice exactly where things ' +
          'enter and drop out.',
        ),
      ],
    },
  ],
}

export const MAKING_MODULES: Module[] = [arrangingModule, overtoneModule]
