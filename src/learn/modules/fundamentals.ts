/**
 * Modules 1-5: sound, notes, scales, chords, rhythm.
 *
 * Written for someone who has never played anything. No notation, no staves —
 * you learn by hearing two things next to each other and noticing the
 * difference. Terms are introduced only once there's a sound attached to them.
 */

import {
  aside, chordRun, compare, demo, option, sequence, stack, terms, text, tryThis,
  type DemoNote, type Module,
} from '../types'

// Middle C is 60. A4, the tuning note, is 69.
const C4 = 60

/** Drum hits are all the same tiny length; this keeps patterns readable. */
const hit = (midi: number, beat: number, velocity = 0.8): DemoNote => [midi, beat, 0.2, velocity]

export const soundModule: Module = {
  id: 'sound',
  title: 'What sound actually is',
  summary: 'The things you can change about any sound, and why a guitar and a flute playing the same note still sound nothing alike.',
  icon: '🔊',
  hue: 195,
  lessons: [
    {
      id: 'sound-pitch',
      title: 'High and low',
      summary: 'Pitch is how fast the air is wobbling. That is the whole idea.',
      blocks: [
        text(
          'Every sound you have ever heard is air pressure wobbling back and forth. When it ' +
          'wobbles fast, you hear a high sound. Slowly, and you hear a low one. That is all ' +
          'pitch is.',
        ),
        demo('Hear low, then high', 'grand-piano', sequence([36, 48, 60, 72, 84], 0.55), {
          note: 'The same instrument, five times, each one wobbling twice as fast as the last.',
        }),
        text(
          'Those five notes are all called C. Each wobbles exactly twice as fast as the one below ' +
          'it, and our ears treat that doubling as "the same note, higher up". That gap is an ' +
          'octave, and it is the one interval every musical culture on earth agrees on.',
        ),
        aside(
          'Why doubling?',
          'Nobody decided this. When something vibrates — a string, a column of air, your vocal ' +
          'cords — it vibrates at one main speed and simultaneously at 2x, 3x, 4x that speed. The ' +
          'doubling is already inside every note, so two notes an octave apart share most of ' +
          'their ingredients. They blend so completely it is hard to hear them as two things.',
        ),
        demo('Hear an octave, played together', 'grand-piano', stack([60, 72], 0, 3), {
          note: 'Two notes. It barely sounds like two.',
        }),
        terms(
          ['Pitch', 'How high or low a sound is.'],
          ['Octave', 'The distance between a note and the note vibrating twice as fast. They sound like the same note.'],
        ),
      ],
    },
    {
      id: 'sound-timbre',
      title: 'Why instruments sound different',
      summary: 'Same note, same loudness, completely different sound. The word for that is timbre.',
      blocks: [
        text(
          'Here is the same note — middle C — on six instruments. Nothing about the pitch changes.',
        ),
        compare(
          'Same note, six instruments',
          option('Piano', 'grand-piano', [[C4, 0, 3]]),
          option('Guitar', 'nylon-guitar', [[C4, 0, 3]]),
          option('Flute', 'flute', [[C4, 0, 3]]),
          option('Violin', 'violin', [[C4, 0, 3]]),
          option('Trumpet', 'trumpet', [[C4, 0, 3]]),
          option('Sitar', 'sitar', [[C4, 0, 3]]),
        ),
        text(
          'The difference has a name: timbre (say it "TAM-ber"). It comes from two things. First, ' +
          'the mixture of overtones — remember every note secretly contains 2x, 3x, 4x copies of ' +
          'itself, and every instrument emphasises a different mix. Second, the shape of the ' +
          'sound over time.',
        ),
        text(
          'That second one matters more than people expect. A piano starts instantly and dies ' +
          'away. A violin can swell slowly and hold forever. Strip a note of its beginning and ' +
          'even experts struggle to name the instrument.',
        ),
        compare(
          'Listen to how each note starts and ends',
          option('Struck — instant, then decays', 'marimba', [[C4, 0, 3]]),
          option('Plucked — sharp, then rings', 'harp', [[C4, 0, 3]]),
          option('Bowed — swells, holds', 'cello', [[C4 - 12, 0, 3]]),
          option('Blown — breathy, steady', 'shakuhachi', [[C4 + 12, 0, 3]]),
        ),
        aside(
          'The word "overtone"',
          'This app is named after it. Overtones are those quieter copies of a note hiding inside ' +
          'itself at 2x, 3x, 4x the speed. They are the entire reason a sitar sounds like a sitar ' +
          'and not a kazoo — and the reason every instrument in here can be built from ' +
          'mathematics rather than recordings.',
        ),
        terms(
          ['Timbre', 'The character of a sound — what makes a piano a piano. Also called tone colour.'],
          ['Overtone', 'A quieter, faster vibration riding on the main one. The mix of these is most of what timbre is.'],
        ),
      ],
    },
    {
      id: 'sound-loudness',
      title: 'Loud, soft, and the shape in between',
      summary: 'Dynamics are not just a volume knob. Playing harder changes the tone too.',
      blocks: [
        text(
          'Hitting a piano key harder does not only make it louder. It makes it brighter — a ' +
          'harder strike throws more energy into the high overtones. Every acoustic instrument ' +
          'does this, and it is a large part of why real playing sounds alive.',
        ),
        demo('Soft, medium, hard', 'grand-piano',
          [[C4, 0, 1, 0.25], [C4, 1, 1, 0.6], [C4, 2, 1.5, 1]],
          { note: 'Listen past the volume — the hard one is also brighter and harsher.' }),
        text(
          'In music software this is called velocity, because on an electronic keyboard it is ' +
          'measured by how fast the key travels down. In Overtone every note has one, and you can ' +
          'edit it: hold Alt and drag a note up or down in the piano roll.',
        ),
        demo('The same line, flat then shaped', 'rhodes',
          [[60, 0, 0.45, 0.7], [64, 0.5, 0.45, 0.7], [67, 1, 0.45, 0.7], [72, 1.5, 0.9, 0.7],
           [60, 3, 0.45, 0.35], [64, 3.5, 0.45, 0.6], [67, 4, 0.45, 0.45], [72, 4.5, 1.4, 0.95]],
          { note: 'Identical notes. The second pass has a shape.' }),
        terms(
          ['Dynamics', 'How loud or soft music is, and how that changes over time.'],
          ['Velocity', 'How hard a note is played. Controls loudness and usually brightness too.'],
        ),
      ],
    },
  ],
}

export const notesModule: Module = {
  id: 'notes',
  title: 'Notes and the keyboard',
  summary: 'Why there are twelve notes, why a piano has black keys, and what an interval is.',
  icon: '🎹',
  hue: 45,
  lessons: [
    {
      id: 'notes-twelve',
      title: 'The twelve notes',
      summary: 'Western music slices each octave into twelve equal steps.',
      blocks: [
        text(
          'Between a note and its octave, Western music puts eleven notes, making twelve steps in ' +
          'all. Each step is a semitone — the smallest step in most Western music.',
        ),
        demo('All twelve, climbing', 'grand-piano',
          sequence([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], 0.28), {
            note: 'A chromatic scale. It sounds directionless on purpose — no note is home.',
          }),
        text(
          'They are named with seven letters, A to G, plus sharps (one semitone up) and flats ' +
          '(one semitone down). On a keyboard the seven letters are the white keys and the five ' +
          'extras are the black keys.',
        ),
        aside(
          'Why not twelve identical keys?',
          'The layout is a historical accident that turned out useful. The white keys give you C ' +
          'major — the scale with no sharps or flats. The black keys are grouped in twos and ' +
          'threes so your hands can feel where they are without looking. Every other scale is ' +
          'the same shape shifted sideways.',
        ),
        text(
          'Twelve is not a law of nature. Indian classical music uses finer divisions called ' +
          'shrutis, Arabic maqam uses quarter tones, and Indonesian gamelan uses scales that do ' +
          'not map onto a keyboard at all. Twelve is one very widespread convention.',
        ),
        terms(
          ['Semitone', 'The smallest step — one key to the very next key, black or white.'],
          ['Chromatic', 'Using all twelve notes, in order.'],
          ['Sharp / flat', 'One semitone up, or one semitone down.'],
        ),
      ],
    },
    {
      id: 'notes-intervals',
      title: 'Intervals: the distance between two notes',
      summary: 'Distances have names and personalities. Four of them do most of the work.',
      blocks: [
        text(
          'The gap between two notes is an interval, and each has a recognisable flavour. You ' +
          'already know these from songs, even if you have never named them.',
        ),
        compare(
          'The four to know by ear',
          option('Octave', 'grand-piano', sequence([60, 72], 0.7)),
          option('Fifth — "Twinkle Twinkle"', 'grand-piano', sequence([60, 67], 0.7)),
          option('Major third — bright', 'grand-piano', sequence([60, 64], 0.7)),
          option('Minor third — sad', 'grand-piano', sequence([60, 63], 0.7)),
        ),
        text(
          'That last pair is worth sitting with. One semitone apart from each other, and the ' +
          'entire emotional weight of Western music hangs off the difference.',
        ),
        demo('Both thirds, played together', 'rhodes',
          [...stack([60, 64], 0, 1.6), ...stack([60, 63], 2, 2.4)],
          { note: 'Major third first, then minor. Same bottom note.' }),
        text(
          'And one interval sounds actively unstable — six semitones, exactly half an octave. It ' +
          'is called the tritone, and it is the sound of something being wrong, which composers ' +
          'use deliberately.',
        ),
        demo('The tritone', 'church-organ', stack([60, 66], 0, 3), {
          note: 'Medieval theorists nicknamed it "the devil in music". You can hear why.',
        }),
        terms(
          ['Interval', 'The distance between two pitches.'],
          ['Third', 'Four semitones (major) or three (minor). Decides happy or sad.'],
          ['Fifth', 'Seven semitones. Rock solid, no emotional lean. The backbone of chords.'],
          ['Tritone', 'Six semitones. Deliberately unstable.'],
        ),
      ],
    },
  ],
}

export const scalesModule: Module = {
  id: 'scales',
  title: 'Scales and keys',
  summary: 'Pick some of the twelve notes and you have a mood. This is where music from different parts of the world parts company.',
  icon: '🪜',
  hue: 275,
  lessons: [
    {
      id: 'scales-major-minor',
      title: 'Major and minor',
      summary: 'The two most common note selections in Western music, and the one note that separates them.',
      blocks: [
        text(
          'A scale is a selection of notes from the twelve — usually seven — that a piece sticks ' +
          'to. Sticking to a selection is what makes music sound intentional rather than random.',
        ),
        compare(
          'The same starting note, two scales',
          option('Major — bright', 'grand-piano', sequence([60, 62, 64, 65, 67, 69, 71, 72], 0.34)),
          option('Minor — dark', 'grand-piano', sequence([60, 62, 63, 65, 67, 68, 70, 72], 0.34)),
        ),
        text(
          'Only three notes differ, and the third note of the scale does most of the work — the ' +
          'same major/minor third from the last lesson. Lower it by one semitone and a bright ' +
          'melody turns melancholy.',
        ),
        demo('One melody, major then minor', 'nylon-guitar',
          [...sequence([67, 69, 71, 72, 71, 69, 67], 0.4),
           ...sequence([67, 68, 70, 72, 70, 68, 67], 0.4, 3.2)],
          { note: 'Identical rhythm and shape. Two notes moved.' }),
        aside(
          'Major is not "happy"',
          'It is a tendency, not a rule, and partly cultural. Plenty of major-key songs are ' +
          'devastating and plenty of minor-key ones are joyful — much Balkan, Klezmer and ' +
          'Bollywood dance music lives in minor and is anything but sad.',
        ),
        terms(
          ['Scale', 'The set of notes a piece draws from.'],
          ['Key', 'A scale plus the note it calls home. "A minor" means the minor scale starting on A.'],
          ['Tonic', 'Home. The note the music feels like it wants to land on.'],
        ),
      ],
    },
    {
      id: 'scales-pentatonic',
      title: 'The scale you cannot play wrong',
      summary: 'Five notes that sound good in any order. The fastest route to something listenable.',
      blocks: [
        text(
          'Take the major scale and remove the two notes that cause friction. What is left is the ' +
          'pentatonic scale — five notes. Its trick is that no two are a semitone apart, so ' +
          'nothing clashes. You can genuinely mash them in any order and it works.',
        ),
        demo('Five notes, deliberately jumbled', 'kalimba',
          sequence([60, 67, 62, 72, 64, 69, 67, 60, 69, 64], 0.3),
          { note: 'That order is arbitrary. It still sounds like music.' }),
        text(
          'This is not a beginner shortcut. Pentatonic scales are the backbone of blues, rock ' +
          'guitar solos, Chinese and Mongolian folk music, Scottish and Irish tunes, and huge ' +
          'swathes of West African music. They arrived independently all over the world.',
        ),
        compare(
          'The same idea, four traditions',
          option('Minor pentatonic — blues and rock', 'electric-clean', sequence([57, 60, 62, 64, 67, 69], 0.3)),
          option('Major pentatonic — folk', 'steel-guitar', sequence([60, 62, 64, 67, 69, 72], 0.3)),
          option('Hirajoshi — Japanese', 'koto', sequence([60, 62, 63, 67, 68, 72], 0.34)),
          option('Bhupali — Indian', 'bansuri', sequence([60, 62, 64, 67, 69, 72], 0.38)),
        ),
        tryThis(
          'Set the scale in the toolbar to "Minor pentatonic", then open the piano roll and click ' +
          'notes in at random. With snapping on, everything you place is in the scale. It is ' +
          'almost impossible to make it sound bad.',
        ),
        terms(['Pentatonic', 'A five-note scale. No semitone clashes, so it is very forgiving.']),
      ],
    },
    {
      id: 'scales-world',
      title: 'Scales beyond the Western seven',
      summary: 'Ragas, maqams and modes — where the other scales in this app come from.',
      blocks: [
        text(
          'Change which notes you select and you change the emotional world of a piece far more ' +
          'than any effect or instrument choice will. These are all in the scale menu.',
        ),
        compare(
          'Indian ragas',
          option('Bhairav — dawn, solemn', 'bansuri', sequence([60, 61, 64, 65, 67, 68, 71, 72], 0.4)),
          option('Yaman — evening, serene', 'sitar', sequence([60, 62, 64, 66, 67, 69, 71, 72], 0.4)),
          option('Kafi — earthy', 'sarangi', sequence([60, 62, 63, 65, 67, 69, 70, 72], 0.4)),
        ),
        text(
          'A raga is much more than a scale — it carries rules about which notes rise and fall, ' +
          'which are emphasised, which ornaments belong, and often a time of day it should be ' +
          'played. The note selection is only the part software can hold.',
        ),
        compare(
          'Middle East and Mediterranean',
          option('Hijaz — that big step', 'oud', sequence([60, 61, 64, 65, 67, 68, 70, 72], 0.4)),
          option('Phrygian — Spanish', 'nylon-guitar', sequence([60, 61, 63, 65, 67, 68, 70, 72], 0.34)),
          option('Hungarian minor', 'violin', sequence([60, 62, 63, 66, 67, 68, 71, 72], 0.34)),
        ),
        text(
          'Hear the gap between the second and third notes of Hijaz? Three semitones in one ' +
          'stride. That leap is most of what makes music from Turkey through North Africa ' +
          'instantly identifiable.',
        ),
        compare(
          'Modes — the major scale started from a different note',
          option('Dorian — minor but hopeful', 'rhodes', sequence([60, 62, 63, 65, 67, 69, 70, 72], 0.34)),
          option('Mixolydian — rock and folk', 'electric-clean', sequence([60, 62, 64, 65, 67, 69, 70, 72], 0.34)),
          option('Lydian — floating, filmic', 'glass-pad', sequence([60, 62, 64, 66, 67, 69, 71, 72], 0.4)),
        ),
        aside(
          'Modes are simpler than they sound',
          'Play only the white keys but treat D as home instead of C and you get Dorian. Same ' +
          'seven notes, different centre of gravity, completely different feel. That is all a ' +
          'mode is.',
        ),
      ],
    },
  ],
}

export const chordsModule: Module = {
  id: 'chords',
  title: 'Chords and harmony',
  summary: 'Stack notes and you get a chord. Move chords around and you get the feeling of a song going somewhere.',
  icon: '🎼',
  hue: 330,
  lessons: [
    {
      id: 'chords-triads',
      title: 'Building a chord',
      summary: 'Take a note, skip one, take the next. That is a chord.',
      blocks: [
        text(
          'A chord is three or more notes sounding together. The standard recipe is simple: start ' +
          'on a note, skip the next one in the scale, take the one after — twice. You get a triad.',
        ),
        demo('Built up one note at a time', 'grand-piano',
          [[60, 0, 4], [64, 1, 3], [67, 2, 2]],
          { note: 'Root, then the third, then the fifth. Listen to it thicken.' }),
        compare(
          'The four basic triads',
          option('Major — bright, settled', 'rhodes', stack([60, 64, 67], 0, 2.5)),
          option('Minor — sad, settled', 'rhodes', stack([60, 63, 67], 0, 2.5)),
          option('Diminished — tense, unstable', 'rhodes', stack([60, 63, 66], 0, 2.5)),
          option('Augmented — eerie, suspended', 'rhodes', stack([60, 64, 68], 0, 2.5)),
        ),
        text(
          'Again the third decides. Major and minor differ by exactly one semitone in the middle. ' +
          'The other two are what happens when the fifth moves as well.',
        ),
        text(
          'Add a fourth note and chords get more colour. A seventh chord is the same stack with ' +
          'one more skip on top — the sound of jazz, soul and most lo-fi.',
        ),
        compare(
          'Three notes vs four',
          option('C major', 'rhodes', stack([60, 64, 67], 0, 2.5)),
          option('C major 7th — dreamy', 'rhodes', stack([60, 64, 67, 71], 0, 2.5)),
          option('C dominant 7th — bluesy, wants to move', 'rhodes', stack([60, 64, 67, 70], 0, 2.5)),
          option('C minor 7th — smooth', 'rhodes', stack([60, 63, 67, 70], 0, 2.5)),
        ),
        terms(
          ['Chord', 'Three or more notes at once.'],
          ['Triad', 'A three-note chord — the basic building block.'],
          ['Root', 'The note a chord is named after and built from.'],
          ['Seventh chord', 'A triad plus one more stacked note. Richer, jazzier.'],
        ),
      ],
    },
    {
      id: 'chords-progressions',
      title: 'Progressions: why songs feel like they are going somewhere',
      summary: 'Four chords underpin a startling proportion of popular music. Here is why they work.',
      blocks: [
        text(
          'Chords built on each note of a scale get numbered with Roman numerals. In C major, I ' +
          'is C, IV is F, V is G and vi is A minor. Capitals are major chords, lower case minor. ' +
          'Musicians talk in numbers because it lets you move a song to any key.',
        ),
        demo('The four chords', 'rhodes',
          chordRun([[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], 2),
          { note: 'I – V – vi – IV. You have heard this thousands of times.', bpm: 100 }),
        text(
          'The magic is tension and release. Chord V — G here — contains notes sitting one ' +
          'semitone away from chord I. Your ear hears the near-miss and wants it resolved.',
        ),
        compare(
          'Resolved vs left hanging',
          option('Ends on I — settled', 'grand-piano',
            chordRun([[55, 59, 62], [60, 64, 67]], 2), { bpm: 90 }),
          option('Ends on V — unresolved', 'grand-piano',
            chordRun([[60, 64, 67], [55, 59, 62]], 2), { bpm: 90 }),
        ),
        text('That second one feels like a question. Songs use it constantly to pull you into the next section.'),
        compare(
          'Four progressions that built genres',
          option('I–V–vi–IV — pop', 'warm-pad',
            chordRun([[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], 1.8), { bpm: 110 }),
          option('vi–IV–I–V — the anthem', 'supersaw',
            chordRun([[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], 1.8), { bpm: 124 }),
          option('ii–V–I — jazz', 'rhodes',
            chordRun([[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71]], 2), { bpm: 96 }),
          option('i–VII–VI–V — flamenco', 'nylon-guitar',
            chordRun([[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], 1.8), { bpm: 104 }),
        ),
        tryThis(
          'Open Ideas and pick Chords. It looks at whatever notes you have written and suggests ' +
          'progressions that fit them — including these, in your key.',
          { kind: 'open-ideas' },
        ),
        terms(
          ['Progression', 'A sequence of chords.'],
          ['I, IV, V, vi', 'Chords numbered by which scale note they are built on. Lets you talk about a song in any key.'],
          ['Resolution', 'Arriving somewhere stable — usually chord I.'],
        ),
      ],
    },
  ],
}

export const rhythmModule: Module = {
  id: 'rhythm',
  title: 'Rhythm and time',
  summary: 'Beats, bars, tempo, and the grooves that define whole genres.',
  icon: '🥁',
  hue: 20,
  lessons: [
    {
      id: 'rhythm-beat',
      title: 'Beat, tempo and bars',
      summary: 'The pulse you tap your foot to, how fast it goes, and how it gets grouped.',
      blocks: [
        text(
          'The beat is the steady pulse underneath music — what you tap your foot to. How fast it ' +
          'goes is the tempo, counted in beats per minute, or BPM.',
        ),
        compare(
          'The same pulse at three tempos',
          option('70 BPM — a ballad', 'kit-acoustic',
            [hit(36, 0), hit(38, 1), hit(36, 2), hit(38, 3)], { bpm: 70 }),
          option('120 BPM — most pop', 'kit-909',
            [hit(36, 0), hit(38, 1), hit(36, 2), hit(38, 3)], { bpm: 120 }),
          option('174 BPM — drum & bass', 'kit-909',
            [hit(36, 0), hit(38, 1), hit(36, 2), hit(38, 3)], { bpm: 174 }),
        ),
        text(
          'Beats get grouped, almost always in fours. One group is a bar. Count "1 2 3 4" along ' +
          'with almost any song and you are counting bars. Beat 1 feels heaviest — the downbeat.',
        ),
        demo('Two bars, with beat 1 accented', 'kit-acoustic',
          [hit(36, 0, 1), hit(42, 1, 0.5), hit(38, 2, 0.7), hit(42, 3, 0.5),
           hit(36, 4, 1), hit(42, 5, 0.5), hit(38, 6, 0.7), hit(42, 7, 0.5)],
          { bpm: 100, note: 'Kick on 1 and 3, snare on 2 and 4, hat on every beat.' }),
        aside(
          'Not everything is in four',
          'Waltzes are in three. Much Balkan music is in 7 or 11. The Indian teental cycle is 16 ' +
          'beats grouped 4+4+4+4, and other talas run to 7, 10 or 14. Four is a convention, not a ' +
          'law — though it is the convention this app assumes.',
        ),
        terms(
          ['Beat', 'The steady pulse.'],
          ['Tempo / BPM', 'Speed, in beats per minute.'],
          ['Bar', 'A group of beats, usually four.'],
          ['Downbeat', 'Beat 1 — the heavy one.'],
        ),
      ],
    },
    {
      id: 'rhythm-grooves',
      title: 'Grooves that define genres',
      summary: 'Where you put the kick and snare is most of what makes a genre recognisable.',
      blocks: [
        text(
          'A drum pattern is mostly three jobs: the kick holds the bottom and the pulse, the ' +
          'snare marks the answer, and the hats fill the gaps and set the energy. Move those ' +
          'around and you move between genres.',
        ),
        compare(
          'Four grooves',
          option('Four on the floor — house', 'kit-909',
            [hit(36, 0, 1), hit(36, 1, 1), hit(36, 2, 1), hit(36, 3, 1),
             hit(39, 1, 0.85), hit(39, 3, 0.85),
             hit(46, 0.5, 0.5), hit(46, 1.5, 0.5), hit(46, 2.5, 0.5), hit(46, 3.5, 0.5)],
            { bpm: 124, note: 'Kick on every beat, open hat between them. Relentless, danceable.' }),
          option('Backbeat — rock', 'kit-acoustic',
            [hit(36, 0, 1), hit(38, 1, 0.95), hit(36, 2, 0.9), hit(36, 2.5, 0.7), hit(38, 3, 0.95),
             ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => hit(42, b, 0.45))],
            { bpm: 124, note: 'Snare on 2 and 4 — the backbeat. The heart of rock and soul.' }),
          option('Boom bap — hip-hop', 'kit-lofi',
            [hit(36, 0, 1), hit(36, 1.5, 0.85), hit(38, 1, 0.9), hit(38, 3, 0.9), hit(36, 2.5, 0.7),
             ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => hit(42, b, 0.4))],
            { bpm: 92, note: 'Kick pushed off the beat. Lazy, heavy, behind the pulse.' }),
          option('Teental — tabla', 'kit-tabla',
            [hit(45, 0, 1), hit(41, 0.5, 0.7), hit(41, 1, 0.7), hit(45, 1.5, 0.9),
             hit(45, 2, 0.85), hit(41, 2.5, 0.7), hit(40, 3, 0.8), hit(36, 3.5, 0.7)],
            { bpm: 100, note: 'Part of a 16-beat North Indian cycle. Different logic entirely.' }),
        ),
        text(
          'Notice the boom bap kick lands just after where you expect. Playing slightly off the ' +
          'grid is syncopation, and it is what makes rhythm feel human rather than mechanical.',
        ),
        compare(
          'Dead on the grid vs pushed',
          option('Straight', 'kit-909',
            [hit(36, 0, 1), hit(36, 1, 1), hit(36, 2, 1), hit(36, 3, 1)], { bpm: 100 }),
          option('Syncopated', 'kit-909',
            [hit(36, 0, 1), hit(36, 0.75, 0.8), hit(36, 2, 1), hit(36, 2.5, 0.8), hit(36, 3.25, 0.7)],
            { bpm: 100 }),
        ),
        tryThis(
          'This is the best argument for beatbox mode. Tap or beatbox a rhythm into Hum it — low ' +
          'sounds become kicks, sharp ones become hats — and you get your own groove without ' +
          'placing a single note.',
          { kind: 'open-hum' },
        ),
        terms(
          ['Backbeat', 'Snare on beats 2 and 4.'],
          ['Syncopation', 'Accents landing off the main beats. Where groove comes from.'],
          ['Four on the floor', 'Kick on every beat. House, techno, disco.'],
        ),
      ],
    },
  ],
}

export const FUNDAMENTAL_MODULES: Module[] = [
  soundModule, notesModule, scalesModule, chordsModule, rhythmModule,
]
