/**
 * Reading a plain-language prompt into a musical brief.
 *
 * "a dark amapiano track at 112 with a sad piano melody" has to become a
 * tempo, a key, a scale, a style, a set of instruments and a shape. This does
 * that with keywords and a handful of rules rather than a model — which means
 * it runs offline, instantly, and can tell you exactly why it chose what it
 * chose. Everything it decides is shown back to the user and can be overridden,
 * because a guess you cannot see or change is worse than no guess.
 *
 * Pure: no audio, no DOM, no network.
 */

import { NOTE_NAMES, SCALES, type ScaleId } from '../music/theory'
import { STYLES, type Style } from './styles'

export interface SongBrief {
  /** The words this came from, kept so the UI can show what was understood. */
  prompt: string
  style: Style
  bpm: number
  /** Pitch class, 0-11. */
  root: number
  scale: ScaleId
  /** 0..1 — how much is playing and how hard it hits. */
  energy: number
  /** 0..1 — dark and low, or bright and high. */
  brightness: number
  /** Bars in the whole arrangement. */
  bars: number
  /** Instruments the prompt asked for by name, as preset ids. */
  wanted: string[]
  /** Parts the prompt asked to leave out. */
  without: PartName[]
  /** Prefer the user's own sampled instruments where they fit. */
  useMySounds: boolean
  /** What was actually understood, for showing back. Plain sentences. */
  reasons: string[]
}

export type PartName = 'drums' | 'bass' | 'chords' | 'lead' | 'pad'

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

/** Mood words, and what they do to energy and brightness. */
const MOODS: { words: string[]; energy?: number; brightness?: number; minor?: boolean; label: string }[] = [
  { words: ['sad', 'melancholy', 'melancholic', 'sorrowful', 'mournful', 'heartbroken'], energy: 0.3, brightness: 0.25, minor: true, label: 'sad' },
  { words: ['dark', 'moody', 'brooding', 'sinister', 'ominous', 'menacing'], energy: 0.5, brightness: 0.15, minor: true, label: 'dark' },
  { words: ['happy', 'joyful', 'sunny', 'cheerful', 'uplifting', 'feelgood', 'feel-good'], energy: 0.7, brightness: 0.85, minor: false, label: 'happy' },
  { words: ['epic', 'huge', 'massive', 'anthemic', 'cinematic', 'triumphant'], energy: 0.9, brightness: 0.7, label: 'epic' },
  { words: ['chill', 'chilled', 'relaxed', 'laid back', 'laid-back', 'mellow', 'calm', 'lazy'], energy: 0.25, brightness: 0.45, label: 'chilled' },
  { words: ['energetic', 'hype', 'banging', 'hard', 'aggressive', 'driving', 'intense'], energy: 0.95, brightness: 0.6, label: 'high energy' },
  { words: ['dreamy', 'ethereal', 'floaty', 'ambient', 'atmospheric', 'lush'], energy: 0.25, brightness: 0.7, label: 'dreamy' },
  { words: ['romantic', 'tender', 'warm', 'gentle', 'soft', 'sweet'], energy: 0.35, brightness: 0.6, label: 'tender' },
  { words: ['nostalgic', 'wistful', 'bittersweet', 'hazy'], energy: 0.35, brightness: 0.4, minor: true, label: 'nostalgic' },
  { words: ['funky', 'groovy', 'bouncy', 'swaggering'], energy: 0.75, brightness: 0.6, label: 'funky' },
]

/**
 * Instrument words a person would actually type, mapped to preset ids.
 *
 * Deliberately short and common. The full library is searchable in the picker;
 * this is only for the handful anyone names in a sentence.
 */
const INSTRUMENT_WORDS: { words: string[]; preset: string }[] = [
  { words: ['piano', 'grand piano'], preset: 'grand-piano' },
  { words: ['rhodes', 'electric piano', 'ep'], preset: 'rhodes' },
  { words: ['organ'], preset: 'drawbar-organ' },
  { words: ['guitar', 'acoustic guitar'], preset: 'steel-guitar' },
  { words: ['electric guitar'], preset: 'electric-crunch' },
  { words: ['nylon guitar', 'spanish guitar', 'classical guitar'], preset: 'nylon-guitar' },
  { words: ['violin', 'fiddle'], preset: 'violin' },
  { words: ['cello'], preset: 'cello' },
  { words: ['strings', 'string section', 'orchestra'], preset: 'string-ensemble' },
  { words: ['flute'], preset: 'flute' },
  { words: ['bansuri'], preset: 'bansuri' },
  { words: ['sax', 'saxophone'], preset: 'tenor-sax' },
  { words: ['trumpet'], preset: 'trumpet' },
  { words: ['brass', 'horns'], preset: 'brass-section' },
  { words: ['sitar'], preset: 'sitar' },
  { words: ['tabla'], preset: 'kit-tabla' },
  { words: ['koto'], preset: 'koto' },
  { words: ['kora'], preset: 'kora' },
  { words: ['kalimba', 'thumb piano'], preset: 'kalimba' },
  { words: ['marimba'], preset: 'marimba' },
  { words: ['vibraphone', 'vibes'], preset: 'vibraphone' },
  { words: ['music box'], preset: 'music-box' },
  { words: ['choir', 'voices'], preset: 'choir-pad' },
  { words: ['supersaw', 'saw lead'], preset: 'supersaw' },
  { words: ['808', '808s'], preset: '808-bass' },
  { words: ['sub bass', 'sub'], preset: 'sub-bass' },
  { words: ['reese'], preset: 'reese-bass' },
  { words: ['acid', 'acid bass', '303'], preset: 'acid-bass' },
  { words: ['wobble'], preset: 'wobble-bass' },
  { words: ['log drum', 'logdrum'], preset: 'logdrum-bass' },
  { words: ['harmonium'], preset: 'harmonium' },
  { words: ['accordion'], preset: 'accordion' },
  { words: ['banjo'], preset: 'banjo' },
  { words: ['harp'], preset: 'harp' },
  { words: ['pad', 'pads'], preset: 'warm-pad' },
  { words: ['bells', 'glockenspiel'], preset: 'glockenspiel' },
  { words: ['duduk'], preset: 'duduk' },
  { words: ['didgeridoo'], preset: 'didgeridoo' },
]

const PART_WORDS: { words: string[]; part: PartName }[] = [
  { words: ['drums', 'drum', 'beat', 'percussion'], part: 'drums' },
  { words: ['bass', 'bassline', 'bass line'], part: 'bass' },
  { words: ['chords', 'chord', 'harmony'], part: 'chords' },
  { words: ['melody', 'lead', 'tune', 'topline'], part: 'lead' },
  { words: ['pad', 'pads', 'strings'], part: 'pad' },
]

const LENGTH_WORDS: { words: string[]; bars: number }[] = [
  { words: ['loop', 'short', 'sketch', 'idea', 'one bar', 'quick'], bars: 16 },
  { words: ['full track', 'full song', 'whole song', 'complete', 'long', 'proper song'], bars: 64 },
]

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function has(text: string, phrase: string): boolean {
  // Whole words only: "sub" should not match "subtle", and "sad" not "saddle".
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

/** The style whose keywords the prompt matches best. */
export function matchStyle(text: string): { style: Style; matched: string | null } {
  let best: { style: Style; word: string } | null = null
  for (const style of STYLES) {
    for (const keyword of style.keywords) {
      if (!has(text, keyword)) continue
      // Prefer the most specific match: "afro house" beats "house".
      if (!best || keyword.length > best.word.length) best = { style, word: keyword }
    }
  }
  return best
    ? { style: best.style, matched: best.word }
    : { style: STYLES[0], matched: null }
}

/** A tempo stated in the prompt, if there is one. */
export function readTempo(text: string): number | null {
  const explicit = text.match(/(\d{2,3})\s*(?:bpm|beats per minute)/i)
  if (explicit) {
    const bpm = Number(explicit[1])
    if (bpm >= 40 && bpm <= 220) return bpm
  }
  const at = text.match(/(?:^|\s)at\s+(\d{2,3})(?:\s|$)/i)
  if (at) {
    const bpm = Number(at[1])
    if (bpm >= 40 && bpm <= 220) return bpm
  }
  return null
}

/**
 * A key stated in the prompt: "in F minor", "C# major", "key of Bb".
 *
 * A bare letter is never a key. "a sad song" starts with an A and means
 * nothing of the sort, and an earlier version of this read the first letter it
 * saw and stopped — so "a happy track in F minor" came out in G. A letter
 * counts only when it carries an accidental or a quality, and the whole string
 * is searched rather than just its opening.
 */
export function readKey(text: string): { root: number; minor: boolean | null } | null {
  const letters: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const build = (letter: string, accidental: string, quality: string) => {
    let root = letters[letter.toLowerCase()]
    const mark = accidental.toLowerCase()
    if (mark === '#' || mark === 'sharp') root += 1
    if (mark === 'b' || mark === 'flat') root -= 1
    const named = quality.toLowerCase()
    return {
      root: ((root % 12) + 12) % 12,
      minor: named.startsWith('min') ? true : named.startsWith('maj') ? false : null,
    }
  }

  // "F minor", "C# major" — a quality makes it unambiguous wherever it sits.
  for (const match of text.matchAll(/\b([a-g])\s*(#|b|sharp|flat)?\s*(minor|major|min|maj)\b/gi)) {
    return build(match[1], match[2] ?? '', match[3])
  }
  // "key of Bb", "in F#" — an accidental is enough, after a word that means key.
  for (const match of text.matchAll(/\b(?:in|key of)\s+([a-g])\s*(#|sharp|flat|b)\b/gi)) {
    return build(match[1], match[2], '')
  }
  return null
}

/** Everything the prompt says about feel, averaged. */
function readMood(text: string): { energy: number | null; brightness: number | null; minor: boolean | null; labels: string[] } {
  const energies: number[] = []
  const brightnesses: number[] = []
  const labels: string[] = []
  let minor: boolean | null = null
  for (const mood of MOODS) {
    if (!mood.words.some((word) => has(text, word))) continue
    labels.push(mood.label)
    if (mood.energy !== undefined) energies.push(mood.energy)
    if (mood.brightness !== undefined) brightnesses.push(mood.brightness)
    if (mood.minor !== undefined && minor === null) minor = mood.minor
  }
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return { energy: mean(energies), brightness: mean(brightnesses), minor, labels }
}

function readInstruments(text: string): string[] {
  const found: string[] = []
  for (const entry of INSTRUMENT_WORDS) {
    if (entry.words.some((word) => has(text, word))) found.push(entry.preset)
  }
  return [...new Set(found)]
}

/** Parts the prompt asks to leave out: "no drums", "without a bass". */
function readOmissions(text: string): PartName[] {
  const out: PartName[] = []
  for (const { words, part } of PART_WORDS) {
    for (const word of words) {
      if (new RegExp(`\\b(no|without|minus|skip)\\s+(a\\s+|any\\s+|the\\s+)?${word}\\b`, 'i').test(text)) {
        out.push(part)
        break
      }
    }
  }
  return [...new Set(out)]
}

function readBars(text: string, style: Style): number {
  const explicit = text.match(/(\d{1,3})\s*bars?\b/i)
  if (explicit) {
    const bars = Number(explicit[1])
    if (bars >= 4 && bars <= 128) return Math.round(bars / 4) * 4
  }
  for (const entry of LENGTH_WORDS) {
    if (entry.words.some((word) => has(text, word))) return entry.bars
  }
  // Long enough to reach the second drop. Shorter than this and a dance track
  // spends its last third winding down from a climax it never got to.
  return (style.sectionBars ?? 4) >= 8 ? 56 : 40
}

/**
 * Read a prompt into a brief.
 *
 * Nothing here throws or refuses: an empty prompt is a valid request for a
 * song, and an unrecognised one still has to produce music. Whatever is not
 * stated is chosen, and every choice is recorded in `reasons` so the UI can
 * show its working.
 */
export function readPrompt(
  prompt: string, options: { seed?: number; variation?: number } = {},
): SongBrief {
  const text = ` ${prompt.toLowerCase().trim()} `
  const reasons: string[] = []
  const random = mulberry(options.seed ?? 1)

  const { style, matched } = matchStyle(text)
  reasons.push(matched
    ? `"${matched}" → ${style.name.toLowerCase()}`
    : `no style named, so: ${style.name.toLowerCase()}`)

  const mood = readMood(text)
  if (mood.labels.length) reasons.push(`mood: ${mood.labels.join(', ')}`)

  const statedTempo = readTempo(text)
  const [lo, hi] = style.bpmHint
  const energy = mood.energy ?? 0.6
  // Within the style's range, faster when the words are more energetic.
  const bpm = statedTempo ?? Math.round(lo + (hi - lo) * energy)
  reasons.push(statedTempo ? `${bpm} BPM, as asked` : `${bpm} BPM, which suits ${style.name.toLowerCase()}`)

  const statedKey = readKey(text)
  const styleScale = style.scale ?? 'minor'
  const styleIsMinor = !SCALES[styleScale].steps.includes(4)
  const minor = statedKey?.minor ?? mood.minor ?? styleIsMinor
  // Keep the named scale when it agrees with the mood; otherwise fall back to
  // plain major or minor rather than forcing a mode that fights the words.
  const scale: ScaleId = minor === styleIsMinor ? styleScale : (minor ? 'minor' : 'major')
  // `variation` rotates the choice so several goes at one prompt genuinely
  // differ. Leaving it to the seed alone means two of three takes land in the
  // same key often enough to look broken.
  const roots = [0, 2, 5, 7, 9]
  const root = statedKey?.root
    ?? roots[(Math.floor(random() * roots.length) + (options.variation ?? 0)) % roots.length]
  reasons.push(statedKey
    ? `key of ${NOTE_NAMES[root]} ${SCALES[scale].label.toLowerCase()}, as asked`
    : `key of ${NOTE_NAMES[root]} ${SCALES[scale].label.toLowerCase()}`)

  const wanted = readInstruments(text)
  if (wanted.length) reasons.push(`asked for: ${wanted.join(', ')}`)

  const without = readOmissions(text)
  if (without.length) reasons.push(`leaving out: ${without.join(', ')}`)

  const bars = readBars(text, style)
  const useMySounds = /\b(my|mine|my own)\s+(sounds?|samples?|kit|instruments?|drums?)\b/i.test(text)
  if (useMySounds) reasons.push('using your own sounds where they fit')

  return {
    prompt,
    style,
    bpm,
    root,
    scale,
    energy,
    brightness: mood.brightness ?? 0.55,
    bars,
    wanted,
    without,
    useMySounds,
    reasons,
  }
}

/** A one-line summary of a brief, for showing back. */
export function describeBrief(brief: SongBrief): string {
  return `${brief.style.name} · ${brief.bpm} BPM · ${NOTE_NAMES[brief.root]} ${SCALES[brief.scale].label} · ${brief.bars} bars`
}

/** Prompts worth offering when someone has no idea what to type. */
export const EXAMPLE_PROMPTS = [
  'a dark amapiano track at 112 with a sad piano',
  'chilled lo-fi hip hop to study to, no lead',
  'epic festival house in F minor',
  'a bollywood song with sitar and tabla',
  'hard techno, 140 bpm, industrial',
  'dreamy drum and bass with a rhodes',
  'sunny afrobeats with a kora melody',
  'sad indie rock with electric guitar',
]

/** Deterministic PRNG, so the same prompt and seed give the same song. */
export function mulberry(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296)
  }
}
