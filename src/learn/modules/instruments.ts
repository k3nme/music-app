/**
 * Module 6: how instruments actually make sound.
 *
 * Organised by physics rather than by orchestra section, because the physics
 * is what explains the sound. A sitar and a guitar are the same problem solved
 * differently; a flute and a clarinet look similar and work nothing alike.
 *
 * Each lesson also says how Overtone models the family, which is not trivia:
 * the four synthesis engines in this app exist precisely because these four
 * kinds of physics need different maths.
 */

import { aside, compare, demo, option, sequence, stack, terms, text, tryThis, type Module } from '../types'

export const instrumentsModule: Module = {
  id: 'instruments',
  title: 'Every instrument, and how it works',
  summary: 'Strings, winds, brass, percussion, voices and synthesis — what is physically happening, and what to listen for.',
  icon: '🎻',
  hue: 150,
  lessons: [
    {
      id: 'inst-overview',
      title: 'Four ways to make a sound',
      summary: 'Almost every instrument ever built is one of four ideas.',
      blocks: [
        text(
          'There are thousands of instruments in the world and only a handful of ways to start ' +
          'air vibrating. Nearly everything is one of these four.',
        ),
        compare(
          'The four families, one note each',
          option('A vibrating string', 'steel-guitar', [[52, 0, 3]],
            { note: 'Guitar, violin, piano, sitar, harp, koto.' }),
          option('A vibrating column of air', 'flute', [[72, 0, 3]],
            { note: 'Flute, clarinet, trumpet, organ pipe.' }),
          option('A vibrating solid object', 'marimba', [[60, 0, 3]],
            { note: 'Drums, xylophone, bells, cymbals.' }),
          option('An electrical circuit', 'supersaw', [[60, 0, 3]],
            { note: 'Synthesisers. No moving parts at all.' }),
        ),
        text(
          'Instrument builders have spent millennia on the same two problems: how do you make ' +
          'the vibration last long enough to be useful, and how do you make it loud enough to ' +
          'hear? Most of what distinguishes one instrument from another is the answer to those.',
        ),
        aside(
          'How this app does it',
          'Overtone has four synthesis engines matching roughly that split. Plucked and struck ' +
          'strings use a physical model that simulates an actual vibrating string. Bells, ' +
          'electric pianos and brass use FM, which is good at metallic and buzzy tones. Pads, ' +
          'winds and bowed strings use subtractive synthesis — start with a bright tone and carve ' +
          'it away. Drums are built one hit at a time. Nothing here is a recording.',
        ),
      ],
    },
    {
      id: 'inst-plucked',
      title: 'Plucked strings',
      summary: 'Guitar, harp, sitar, koto, oud, banjo — pull a string and let go.',
      blocks: [
        text(
          'Pull a string sideways and release it. It snaps back, overshoots, and keeps going — ' +
          'and because it is fixed at both ends, only certain vibration patterns fit. The slowest ' +
          'one sets the pitch; the faster ones stacked on top are the overtones that give it ' +
          'character. The sound dies away because the energy leaks into the body and the air.',
        ),
        text(
          'Two things you can control matter enormously. **Where** you pluck changes the mix of ' +
          'overtones: near the bridge is thin and nasal, over the soundhole is round and warm. ' +
          '**What** you pluck with matters too — a fingertip is soft, a plectrum is sharp.',
        ),
        compare(
          'Same note, different bodies',
          option('Nylon guitar — round, soft', 'nylon-guitar', [[52, 0, 3]]),
          option('Steel guitar — bright, ringing', 'steel-guitar', [[52, 0, 3]]),
          option('Banjo — snappy, short', 'banjo', [[52, 0, 3]]),
          option('Harp — sweet, very long', 'harp', [[52, 0, 4]]),
          option('Ukulele — small box, quick decay', 'ukulele', [[64, 0, 3]]),
        ),
        text(
          'The body is doing as much work as the string. A string on its own is almost silent — ' +
          'too thin to move much air. The body amplifies it and stamps its own resonances on the ' +
          'sound. A big spruce dreadnought and a small ukulele box are why those two are ' +
          'unmistakable.',
        ),
        compare(
          'The same idea, around the world',
          option('Sitar — India', 'sitar', sequence([57, 59, 60, 62, 64], 0.45),
            { note: 'Sympathetic strings ring untouched, and a curved bridge makes it buzz.' }),
          option('Koto — Japan', 'koto', sequence([60, 62, 63, 67, 68], 0.45),
            { note: 'Thirteen silk strings over movable bridges.' }),
          option('Oud — Arab world', 'oud', sequence([52, 53, 56, 57, 59], 0.45),
            { note: 'No frets at all, so it can slide between the notes of a piano.' }),
          option('Santoor — Kashmir/Persia', 'santoor', sequence([64, 67, 69, 72, 76], 0.28),
            { note: 'Struck with light hammers rather than plucked.' }),
        ),
        text(
          'That sitar buzz is worth understanding. The bridge is deliberately curved, so the ' +
          'string grazes along it as it vibrates rather than sitting on one point. Each graze ' +
          'adds high overtones. Indian instrument makers call this jawari, and shaping it is a ' +
          'specialist craft.',
        ),
        aside(
          'The model in this app',
          'Plucked instruments here use Karplus-Strong: a digital delay line with a filter in the ' +
          'loop, which is genuinely a simulation of a wave running up and down a string and ' +
          'losing its highs each round trip. Pluck position, string stiffness and the jawari ' +
          'buzz are all real parameters in the code.',
        ),
        tryThis(
          'Load a sitar and play in the Bhairav or Yaman scale. The instrument and the scale ' +
          'evolved together — they sound right in a way a sitar in C major does not.',
          { kind: 'open-instruments' },
        ),
        terms(
          ['Bridge', 'The piece that transmits string vibration into the body.'],
          ['Sympathetic strings', 'Extra strings nobody plays. They ring on their own when a related note sounds.'],
        ),
      ],
    },
    {
      id: 'inst-bowed',
      title: 'Bowed strings',
      summary: 'Violin, cello, erhu, sarangi — the trick that lets a note last forever.',
      blocks: [
        text(
          'A plucked string always dies away. A bow solves that by continuously feeding energy ' +
          'in. What actually happens is stranger than "rubbing": the rosined hair **grips** the ' +
          'string and drags it sideways, the string snaps back, the bow grips again. Hundreds of ' +
          'times a second. It is called stick-slip motion, and it is closer to a squeaking door ' +
          'than to friction.',
        ),
        text(
          'Because the player controls the energy continuously, bowed instruments can do things ' +
          'plucked ones cannot: swell from nothing, hold indefinitely, change loudness mid-note, ' +
          'and slide smoothly between pitches.',
        ),
        compare(
          'The bowed family, high to low',
          option('Violin', 'violin', [[76, 0, 3.5]]),
          option('Viola — darker', 'viola', [[64, 0, 3.5]]),
          option('Cello — the singing one', 'cello', [[52, 0, 3.5]]),
          option('A whole section together', 'string-ensemble', stack([52, 59, 64, 67], 0, 4)),
        ),
        text(
          'That last one is not just "more violins". Twenty players are never perfectly in tune ' +
          'or perfectly in time with each other, and those tiny differences are what make a ' +
          'string section sound lush rather than merely loud. Synth designers copy the effect ' +
          'deliberately by detuning several copies of a sound — it is called chorus.',
        ),
        text(
          'Vibrato — that slight wobble in pitch — is the other signature. It is not decoration: ' +
          'without it a sustained bowed note sounds dead and electronic.',
        ),
        compare(
          'Bowed, around the world',
          option('Erhu — China, two strings', 'erhu', sequence([69, 71, 72, 74, 72], 0.5)),
          option('Sarangi — North India', 'sarangi', sequence([60, 62, 63, 65, 63], 0.5)),
          option('Violin, for comparison', 'violin', sequence([69, 71, 72, 74, 72], 0.5)),
        ),
        aside(
          'Why the erhu sounds like a voice',
          'It has no fingerboard. The player presses the string in mid-air, so there is nothing ' +
          'to stop a note bending continuously into the next. That is also why it can imitate ' +
          'crying, horses and birdsong — the repertoire is full of it.',
        ),
        terms(
          ['Vibrato', 'A small, fast wobble in pitch that makes a held note sound alive.'],
          ['Legato', 'Notes joined smoothly with no gap between them.'],
        ),
      ],
    },
    {
      id: 'inst-struck',
      title: 'Struck strings: the piano',
      summary: 'A piano is a percussion instrument with 230 strings, and its tuning is deliberately wrong.',
      blocks: [
        text(
          'Press a piano key and a felt hammer throws itself at the string and immediately falls ' +
          'away, leaving it free to ring. Release the key and a damper stops it. That is the ' +
          'whole mechanism, repeated 88 times, and it took about a century to perfect.',
        ),
        demo('One note, held and then damped', 'grand-piano',
          [[60, 0, 4], [60, 4.5, 0.4]],
          { note: 'First held, then short. Same hammer, different damper timing.' }),
        text(
          'Real piano strings are stiff, not ideal, and stiffness makes their overtones sit ' +
          'slightly **sharp** of where the maths says they should. This is called inharmonicity, ' +
          'and it is a large part of why a piano sounds like a piano.',
        ),
        aside(
          'Your piano is out of tune on purpose',
          'Because the overtones are sharp, tuners stretch the tuning to match — the top octave ' +
          'is tuned deliberately sharp and the bottom deliberately flat. A piano tuned ' +
          'mathematically perfectly sounds wrong to everyone who has heard a real one.',
        ),
        compare(
          'Struck strings, near relatives',
          option('Grand piano', 'grand-piano', stack([48, 55, 60, 64], 0, 3.5)),
          option('Upright — boxier, closer', 'upright-piano', stack([48, 55, 60, 64], 0, 3.5)),
          option('Harpsichord — plucked, not struck', 'harpsichord', stack([48, 55, 60, 64], 0, 3.5)),
          option('Clavinet — plucked and funky', 'clavinet', sequence([48, 55, 51, 58], 0.28)),
        ),
        text(
          'The harpsichord is the giveaway for why the piano mattered. A harpsichord plucks, so ' +
          'every note is the same loudness no matter how you press. The piano\'s hammer lets you ' +
          'play soft and loud — which is why it was originally called the *pianoforte*, ' +
          'literally "soft-loud".',
        ),
        terms(
          ['Inharmonicity', 'Overtones sitting slightly off their ideal pitches, because real objects are stiff.'],
          ['Damper', 'The felt that stops a string when you let go of the key.'],
        ),
      ],
    },
    {
      id: 'inst-flutes',
      title: 'Flutes and edge-blown instruments',
      summary: 'Blow across a hole and the air itself starts flapping.',
      blocks: [
        text(
          'There is no reed and nothing solid vibrating in a flute. You blow a thin sheet of air ' +
          'across a sharp edge, it wobbles above and below that edge, and the wobble locks to ' +
          'whatever pitch the tube inside wants to resonate at. Cover a hole and you make the ' +
          'tube longer, which lowers the pitch.',
        ),
        text(
          'Because the air jet is doing the work, a lot of the sound is literally breath. That ' +
          'noise is not a flaw — it is most of the character, and the amount of it is the main ' +
          'difference between flutes from different traditions.',
        ),
        compare(
          'Edge-blown, least to most breathy',
          option('Concert flute — pure', 'flute', sequence([72, 74, 76, 77, 79], 0.4)),
          option('Pan flute — hollow', 'pan-flute', sequence([72, 74, 76, 77, 79], 0.4)),
          option('Bansuri — India, bamboo', 'bansuri', sequence([72, 74, 76, 77, 79], 0.45)),
          option('Shakuhachi — Japan, half air', 'shakuhachi', sequence([70, 72, 75, 77], 0.55)),
          option('Ney — Middle East', 'ney', sequence([69, 71, 72, 74], 0.55)),
        ),
        text(
          'The shakuhachi is the extreme case. Its repertoire treats breath noise, pitch bends ' +
          'and deliberately unstable tone as the expressive material, not as imperfections. ' +
          'Played "cleanly" it would lose the point.',
        ),
        aside(
          'Overblowing',
          'Blow harder and a flute does not get louder — it jumps up an octave, or a fifth above ' +
          'that. The tube supports several vibration patterns at once and you are choosing ' +
          'between them with air speed. Every wind player learns to control this.',
        ),
        terms(['Embouchure', 'The shape of your mouth and lips. On flutes it is most of your tone control.']),
      ],
    },
    {
      id: 'inst-reeds',
      title: 'Reeds: clarinet, oboe, saxophone',
      summary: 'A flapping bit of cane, and a tube that decides which flaps count.',
      blocks: [
        text(
          'A reed instrument has a thin piece of cane over an opening. Your breath makes it slam ' +
          'shut and spring open hundreds of times a second — a valve chopping the air into ' +
          'pulses. The tube then decides which of those pulse rates survive.',
        ),
        text(
          'The shape of the tube changes everything. A clarinet is a cylinder closed at one end, ' +
          'which physically **cannot** produce even-numbered overtones. That missing half of the ' +
          'spectrum is exactly why it sounds hollow and woody. A saxophone is a cone, which can ' +
          'produce all of them, which is why it sounds fat and brassy despite also being a reed.',
        ),
        compare(
          'Same note, different tube shapes',
          option('Clarinet — cylinder, hollow', 'clarinet', [[62, 0, 3]]),
          option('Oboe — narrow cone, nasal', 'oboe', [[72, 0, 3]]),
          option('Alto sax — wide cone, fat', 'alto-sax', [[62, 0, 3]]),
          option('Tenor sax — bigger, warmer', 'tenor-sax', [[55, 0, 3]]),
        ),
        text(
          'The oboe is a double reed — two pieces of cane vibrating against each other through a ' +
          'very narrow opening. It takes enormous air pressure through a tiny gap, which is why ' +
          'oboists are famous for being slightly short of breath and slightly irritable.',
        ),
        aside(
          'Why the orchestra tunes to the oboe',
          'Its pitch is the hardest to adjust on the fly, so everyone else moves to it. It also ' +
          'cuts through a hundred other instruments, which is the other half of the reason.',
        ),
        demo('A sax line, played with some push', 'tenor-sax',
          [[55, 0, 0.5, 0.6], [58, 0.5, 0.5, 0.7], [60, 1, 0.5, 0.8], [62, 1.5, 1.2, 1], [60, 3, 1.5, 0.75]],
          { bpm: 88, note: 'Harder blowing does not just add volume — it adds grit.' }),
      ],
    },
    {
      id: 'inst-brass',
      title: 'Brass, and the harmonic series',
      summary: 'Your lips are the reed. And a bugle can only play the notes physics allows.',
      blocks: [
        text(
          'On a brass instrument there is no reed and no edge — **your lips** are the vibrating ' +
          'valve, buzzing into a mouthpiece. The tube amplifies and shapes it, and the flared ' +
          'bell at the end helps the sound escape into the room instead of reflecting back.',
        ),
        text(
          'Here is the thing that makes brass special as a teaching tool. A tube of fixed length ' +
          'resonates at a fixed series of pitches: the fundamental, then 2x, 3x, 4x, 5x that ' +
          'frequency. A bugle has no valves at all, so those are the *only* notes it can play — ' +
          'which is why every bugle call in history uses the same handful of notes.',
        ),
        demo('The harmonic series, from a low A', 'brass-section',
          sequence([45, 57, 64, 69, 73, 76, 79, 81], 0.5),
          { note: '1x, 2x, 3x, 4x, 5x, 6x, 7x and 8x the base frequency.' }),
        text(
          'Listen to notes 4, 5 and 6 of that: A, C♯, E. **A major chord, appearing out of pure ' +
          'arithmetic.** Nobody invented the major chord. It is sitting inside every note ever ' +
          'played, and Western harmony is largely the discovery of that fact.',
        ),
        aside(
          'The seventh one sounds odd on purpose',
          'The 7th harmonic sits noticeably flat of any note on a piano — about a third of a ' +
          'semitone below G here. It is not a mistake in the demo. It is a real pitch our ' +
          'twelve-note system has no room for, and you can hear singers lean into it in ' +
          'barbershop and blues.',
        ),
        text(
          'Valves and slides exist to escape that series: they add tube length so you can reach ' +
          'the notes in between.',
        ),
        compare(
          'The brass family',
          option('Trumpet — bright, cutting', 'trumpet', sequence([67, 72, 76], 0.5)),
          option('Trombone — slides between notes', 'trombone', sequence([48, 53, 55], 0.6)),
          option('French horn — round, distant', 'french-horn', stack([53, 57, 60], 0, 3)),
          option('Tuba — the floor', 'tuba', sequence([36, 40, 43], 0.7)),
          option('A section hitting together', 'brass-section', stack([55, 60, 64, 67], 0, 2)),
        ),
        text(
          'Brass has one more signature: it gets **brighter** as it gets louder, much more ' +
          'dramatically than other instruments. A quiet trumpet is almost flute-like; a loud one ' +
          'is a blaze. That is why film composers reach for brass when something needs to feel ' +
          'enormous.',
        ),
        terms(
          ['Harmonic series', 'The fixed ladder of pitches any tube or string naturally produces.'],
          ['Fundamental', 'The lowest and loudest of them — the pitch you actually hear.'],
        ),
      ],
    },
    {
      id: 'inst-drums',
      title: 'Drums and membranes',
      summary: 'Why most drums have no pitch, and why tabla do.',
      blocks: [
        text(
          'Stretch a skin over a shell and hit it. Unlike a string, a circular membrane vibrates ' +
          'in complicated two-dimensional patterns, and those patterns are **not** in a neat ' +
          'harmonic ladder. There is no clear fundamental, so there is no clear pitch — you hear ' +
          'a thud, not a note.',
        ),
        compare(
          'A drum kit, part by part',
          option('Kick — chest', 'kit-acoustic', [[36, 0, 0.3, 1]]),
          option('Snare — crack', 'kit-acoustic', [[38, 0, 0.3, 1]]),
          option('Closed hat — tick', 'kit-acoustic', [[42, 0, 0.2, 0.8]]),
          option('Open hat — sizzle', 'kit-acoustic', [[46, 0, 0.6, 0.8]]),
          option('Crash — wash', 'kit-acoustic', [[49, 0, 2, 0.9]]),
        ),
        text(
          'A snare gets its crack from wire springs stretched against the underside, which rattle ' +
          'every time the skin moves. Cymbals are metal plates with such a dense forest of ' +
          'vibration modes that they read as pure noise with a tone hiding inside.',
        ),
        text(
          'But tuned drums do exist, and the tabla is the finest example. The black patch on the ' +
          'head is not decoration — it is layered iron filings and paste, applied to make the ' +
          'drum\'s vibration patterns line up into something close to a harmonic series. The ' +
          'result is a drum that plays actual pitches.',
        ),
        compare(
          'Hand drums with real pitch',
          option('Tabla — Na, Tin, Dha', 'kit-tabla',
            [[40, 0, 0.4, 0.9], [41, 0.6, 0.4, 0.85], [45, 1.2, 0.6, 1]]),
          option('Djembe — bass, tone, slap', 'kit-hand',
            [[36, 0, 0.4, 1], [38, 0.6, 0.4, 0.85], [40, 1.2, 0.4, 0.95]]),
          option('Congas', 'kit-latin',
            [[36, 0, 0.4, 0.9], [38, 0.5, 0.4, 0.8], [40, 1, 0.4, 0.95]]),
        ),
        aside(
          'Electronic drums are a different thing entirely',
          'A TR-808 kick is not a recording of a drum — it is a sine wave whose pitch drops fast, ' +
          'and that is why it goes so much lower and cleaner than any real kick. The 808 and 909 ' +
          'in this app are built exactly that way, from oscillators and noise.',
        ),
        compare(
          'Acoustic vs electronic',
          option('Acoustic kick', 'kit-acoustic', [[36, 0, 0.5, 1]]),
          option('808 kick — a falling sine', 'kit-808', [[36, 0, 1.2, 1]]),
          option('909 kick — punchier', 'kit-909', [[36, 0, 0.5, 1]]),
          option('Lo-fi kick — soft and dusty', 'kit-lofi', [[36, 0, 0.5, 1]]),
        ),
      ],
    },
    {
      id: 'inst-tuned-percussion',
      title: 'Bars, bells and metal',
      summary: 'Hit something solid and you get pitch — but a strange one.',
      blocks: [
        text(
          'A wooden bar or a metal tube has a definite pitch, but its overtones are wildly ' +
          'unrelated to the fundamental — nothing like a string. That is why bells sound ' +
          'shimmering and slightly otherworldly: your ear cannot resolve them into a tidy note.',
        ),
        compare(
          'Wood vs metal',
          option('Marimba — wood, warm', 'marimba', sequence([60, 64, 67, 72], 0.3)),
          option('Xylophone — wood, hard', 'xylophone', sequence([72, 76, 79, 84], 0.3)),
          option('Vibraphone — metal, shimmering', 'vibraphone', stack([60, 64, 67], 0, 4)),
          option('Glockenspiel — metal, tiny', 'glockenspiel', sequence([84, 88, 91], 0.3)),
          option('Tubular bells — enormous', 'tubular-bells', [[60, 0, 6]]),
        ),
        text(
          'Instrument makers fight the strangeness. Marimba bars are carved with an arch ' +
          'underneath specifically to pull the overtones into tune with the fundamental. The ' +
          'tubes hanging below are tuned air columns that amplify only the right frequency.',
        ),
        compare(
          'Struck metal, around the world',
          option('Steel pan — Trinidad', 'steel-drum', sequence([60, 64, 67, 72], 0.4),
            { note: 'Hammered out of an oil drum. Each dent is a separate tuned note.' }),
          option('Kalimba — Africa', 'kalimba', sequence([60, 64, 67, 72], 0.35),
            { note: 'Plucked metal tines on a board.' }),
          option('Hang drum — modern', 'hang', sequence([62, 65, 69, 74], 0.45)),
          option('Celesta — struck metal, keyboard', 'celesta', sequence([72, 76, 79, 84], 0.3)),
        ),
        aside(
          'FM synthesis and bells',
          'Bell-like sounds are hard for subtractive synthesis and trivially easy for FM, where ' +
          'you use one wave to modulate the frequency of another. That is why 1980s digital ' +
          'keyboards were suddenly full of bells and electric pianos: the maths happened to suit ' +
          'them. Every mallet instrument in this app is FM for exactly that reason.',
        ),
      ],
    },
    {
      id: 'inst-keys-organs',
      title: 'Keyboards, organs and reeds you squeeze',
      summary: 'One interface, many completely unrelated machines behind it.',
      blocks: [
        text(
          'A keyboard is not an instrument — it is a control surface. Behind it there might be ' +
          'hammers hitting strings, air going through pipes, metal tines being plucked, or ' +
          'nothing physical at all.',
        ),
        compare(
          'Same keys, different machines',
          option('Piano — hammers on strings', 'grand-piano', stack([48, 55, 60, 64], 0, 3)),
          option('Pipe organ — air through pipes', 'church-organ', stack([48, 55, 60, 64], 0, 3.5)),
          option('Drawbar organ — spinning wheels', 'drawbar-organ', stack([48, 55, 60, 64], 0, 3)),
          option('Electric piano — struck metal tines', 'rhodes', stack([48, 55, 60, 64], 0, 3)),
          option('Accordion — squeezed reeds', 'accordion', stack([48, 55, 60, 64], 0, 3)),
        ),
        text(
          'The organ deserves a moment. A pipe organ has one pipe per note per sound, so a large ' +
          'one has thousands. Pulling out a "stop" brings in a whole extra rank of pipes — often ' +
          'tuned to an octave or a fifth above — so the organist is literally building a timbre ' +
          'by adding harmonics. That is additive synthesis, several centuries before anyone had ' +
          'electricity to do it with.',
        ),
        demo('Adding ranks one at a time', 'church-organ',
          [[48, 0, 8], [60, 2, 6], [67, 4, 4], [72, 6, 2]],
          { note: 'Fundamental, octave, fifth, octave. The tone thickens without changing pitch.' }),
        aside(
          'The Hammond and its accidental sound',
          'The electric drawbar organ works the same way with spinning metal wheels instead of ' +
          'pipes. It was built as a cheap church substitute and was a commercial disappointment ' +
          'there — then gospel, jazz and rock musicians found it, and its slight imperfections ' +
          '(leakage between wheels, key click) became the whole point.',
        ),
      ],
    },
    {
      id: 'inst-voice',
      title: 'The voice',
      summary: 'The instrument everybody owns, and why vowels are just filters.',
      blocks: [
        text(
          'Your vocal folds are a reed: air from the lungs makes them open and close, chopping ' +
          'the flow into pulses. That buzz on its own is unpleasant and almost featureless. ' +
          'Everything expressive happens above it.',
        ),
        text(
          'The throat, mouth and nose form a tube you can reshape with your tongue, jaw and lips. ' +
          'That tube emphasises certain frequency bands — called **formants** — and the position ' +
          'of those bands is what your ear reads as a vowel. "Ah", "ee" and "oo" are the same ' +
          'buzz through three different filters.',
        ),
        compare(
          'Vowel-ish filtering, same pitch',
          option('Open, choir-like', 'choir-pad', stack([57, 60, 64], 0, 4)),
          option('Narrower, more vocal', 'vox-synth', [[60, 0, 3.5]]),
          option('The raw buzz, unfiltered', 'supersaw', [[60, 0, 3]]),
        ),
        text(
          'This is why singing is hard to synthesise convincingly and why a real singer is still ' +
          'the most expressive instrument going: pitch, loudness, vowel, consonant and breath all ' +
          'move independently and continuously.',
        ),
        aside(
          'Why the vocal usually sits dead centre in a mix',
          'It is the thing listeners lock onto, so engineers put it in the middle where both ears ' +
          'get it equally. The Mashup Lab exploits this: it finds what is equal in both channels ' +
          'and calls that the vocal. It works because of a mixing convention, not because it ' +
          'recognises singing.',
        ),
        tryThis(
          'Your voice is the easiest way into this app. Hum anything — badly is fine — and hear ' +
          'it come back as a sitar or a string section.',
          { kind: 'open-hum' },
        ),
        terms(['Formant', 'A frequency band your vocal tract emphasises. Different positions make different vowels.']),
      ],
    },
    {
      id: 'inst-synths',
      title: 'Synthesisers: making sound from nothing',
      summary: 'No strings, no air. Just a waveform and a plan for carving it up.',
      blocks: [
        text(
          'A synthesiser starts with an electrical waveform and shapes it. The raw waveforms have ' +
          'distinct characters because of what overtones they contain.',
        ),
        compare(
          'The raw shapes',
          option('Sine — one pure frequency, no overtones', 'sub-bass', [[48, 0, 3]]),
          option('Square — hollow, odd overtones only', 'square-lead', [[60, 0, 3]]),
          option('Sawtooth — bright, all overtones', 'supersaw', [[60, 0, 3]]),
        ),
        text(
          'Then you **subtract**. A filter removes frequencies above or below a point you choose, ' +
          'and moving that point while a note sounds is the single most recognisable gesture in ' +
          'electronic music.',
        ),
        demo('A filter opening up', 'acid-bass',
          sequence([38, 38, 45, 38, 43, 38, 41, 38], 0.25, 0, 0.9),
          { bpm: 128, note: 'Each note opens the filter further. This is the acid sound.' }),
        text(
          'The other big method is FM: use one waveform to wobble the frequency of another, very ' +
          'fast. Small amounts add warmth; large amounts produce metallic, bell-like and ' +
          'aggressive tones that subtractive synthesis struggles to reach.',
        ),
        compare(
          'Families of synth sound',
          option('Supersaw lead — many detuned saws', 'supersaw', stack([64, 67, 71], 0, 3)),
          option('Warm pad — slow and wide', 'warm-pad', stack([55, 59, 62, 67], 0, 4)),
          option('FM bell pad — metallic', 'fm-bell-pad', stack([60, 64, 67], 0, 4)),
          option('Reese bass — detuned growl', 'reese-bass', [[36, 0, 3]]),
          option('808 bass — sine with a pitch drop', '808-bass', [[33, 0, 3]]),
        ),
        aside(
          'Why a supersaw sounds like a festival',
          'It is seven sawtooth waves slightly out of tune with each other. Exactly the same trick ' +
          'as twenty violinists never quite agreeing — the tiny pitch differences beat against ' +
          'each other and make the sound enormous and moving. Detuning is the oldest trick there ' +
          'is, borrowed by synth designers from the orchestra.',
        ),
        terms(
          ['Oscillator', 'The circuit or code making the raw waveform.'],
          ['Filter / cutoff', 'Removes frequencies above or below a point. Moving it is the classic synth sweep.'],
          ['Envelope', 'How a sound changes over its lifetime — attack, decay, sustain, release.'],
          ['FM', 'Using one wave to modulate another. Good at metallic and bell tones.'],
        ),
      ],
    },
    {
      id: 'inst-choosing',
      title: 'Choosing an instrument for a part',
      summary: 'Arrangement is mostly about keeping things out of each other\'s way.',
      blocks: [
        text(
          'Once you know what instruments *are*, the practical question is which to use. The ' +
          'useful way to think about it is **register** — which part of the frequency range a ' +
          'sound occupies — and **texture** — whether it sustains or decays.',
        ),
        text(
          'Two instruments in the same register competing for the same space is the most common ' +
          'reason an arrangement sounds muddy. A bass guitar and a low piano part will fight. ' +
          'Move one of them and both suddenly become audible.',
        ),
        compare(
          'The same chord, three registers',
          option('Low — muddy if overloaded', 'grand-piano', stack([36, 40, 43], 0, 3)),
          option('Middle — where most things live', 'grand-piano', stack([60, 64, 67], 0, 3)),
          option('High — sparkle', 'glockenspiel', stack([84, 88, 91], 0, 3)),
        ),
        text(
          'A simple starting recipe that works for almost any genre: something low holding the ' +
          'root, something rhythmic keeping time, something sustained filling the middle, and one ' +
          'clear voice on top carrying the tune. Four jobs, four sounds, and they stay out of ' +
          'each other\'s way.',
        ),
        tryThis(
          'Open the instrument picker and use the search box with words rather than names — try ' +
          '"warm", "buzz", "lofi", "raga", "cinematic". Every instrument is tagged by feel, not ' +
          'just family.',
          { kind: 'open-instruments' },
        ),
        terms(
          ['Register', 'Which part of the pitch range a sound sits in.'],
          ['Arrangement', 'Deciding who plays what, when — and crucially, who stays quiet.'],
        ),
      ],
    },
  ],
}
