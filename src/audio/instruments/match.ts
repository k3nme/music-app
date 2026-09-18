/**
 * "Do I already have something that sounds like this?"
 *
 * When a song is taken apart, most of what comes out has a close cousin in the
 * built-in library — nearly every dance record's kick is recognisably one of a
 * handful of drum machines. Importing all of it would bury the user's own shelf
 * in near-duplicates. So each extracted sound is compared against the library
 * and the answer is shown before anything is added.
 *
 * Comparison needs the library to be *rendered*, which needs Web Audio, which
 * is why this is here and not in `analysis/`. Renders are cached for the
 * session: the first comparison pays for them, the rest are free.
 */

import { fingerprint, fingerprintDistance, isPercussive, type SoundKind } from '../analysis/sounds'
import { createInstrument } from './index'
import { kitPieces } from './drums'
import { allPresets } from './library'
import type { PresetBase } from '../types'

/** Rendering rate for comparisons. Timbre survives it; render time halves. */
const RATE = 22050
const RENDER_SEC = 1.2

export interface LibraryMatch {
  presetId: string
  presetName: string
  /** Set when the match is one piece of a kit rather than a whole instrument. */
  pieceMidi?: number
  pieceName?: string
  /** 0 is identical; the scale is the same one `fingerprintDistance` uses. */
  distance: number
}

export interface MatchVerdict {
  best: LibraryMatch | null
  /** Runners-up, closest first. Handy when the best match is not convincing. */
  alternatives: LibraryMatch[]
  /**
   * How to read it:
   * - `have-it`   something in the library is close enough to use instead
   * - `similar`   there is a relative, but this recording is its own sound
   * - `new`       nothing in the library is like this
   */
  verdict: 'have-it' | 'similar' | 'new'
}

/** Tuned against the library itself: see the unit test that measures it. */
const HAVE_IT = 0.055
const SIMILAR = 0.12

const prints = new Map<string, Float32Array>()
let warmed = false

function keyOf(presetId: string, midi?: number): string {
  return midi === undefined ? presetId : `${presetId}#${midi}`
}

/**
 * Render one preset (or one piece of a kit) and fingerprint it. Offline, at a
 * low rate, one note — a few milliseconds each.
 */
async function printOf(preset: PresetBase, midi: number, piece?: number): Promise<Float32Array | null> {
  const key = keyOf(preset.id, piece)
  const cached = prints.get(key)
  if (cached) return cached
  try {
    const ctx = new OfflineAudioContext({
      numberOfChannels: 1, length: Math.ceil(RENDER_SEC * RATE), sampleRate: RATE,
    })
    const instrument = createInstrument(ctx, preset)
    instrument.output.connect(ctx.destination)
    instrument.play(piece ?? midi, 0.01, RENDER_SEC * 0.6, 0.95)
    instrument.finalize?.()
    const rendered = await ctx.startRendering()
    const print = fingerprint(rendered.getChannelData(0), RATE)
    prints.set(key, print)
    return print
  } catch {
    return null
  }
}

/** Which library entries are worth comparing a sound of this kind against. */
function candidates(kind: SoundKind): { preset: PresetBase; midi: number; piece?: number }[] {
  const presets = allPresets().filter((p) => !p.userMade)
  const out: { preset: PresetBase; midi: number; piece?: number }[] = []

  if (isPercussive(kind)) {
    // Compare a kick against every kick, not against every sound ever made.
    const wanted: Partial<Record<SoundKind, RegExp>> = {
      kick: /kick|dunun|surdo|doum|daiko|bass/i,
      snare: /snare|caixa|tek|treble/i,
      clap: /clap/i,
      hat: /closed hat|hat|shaker|riq|ganz/i,
      openhat: /open hat|hat/i,
      cymbal: /crash|ride|cymbal|gong|chappa/i,
      tom: /tom|conga|djembe|tabla|dhol|log|talking|surdo/i,
      perc: /./,
    }
    const pattern = wanted[kind] ?? /./
    for (const preset of presets) {
      if (preset.family !== 'drums') continue
      for (const { midi, piece } of kitPieces(preset)) {
        if (!pattern.test(piece.name)) continue
        out.push({ preset, midi, piece: midi })
      }
    }
    return out
  }

  for (const preset of presets) {
    if (preset.family === 'drums') continue
    if (kind === 'bass' && preset.family !== 'bass') continue
    if (kind === 'vocal' && preset.family !== 'voice') continue
    out.push({ preset, midi: preset.centerMidi })
  }
  return out
}

/**
 * Compare one extracted sound against the library.
 *
 * `atMidi` matters for anything pitched: comparing a bass note to a preset's
 * centre note would say more about the interval than the instrument.
 */
export async function matchAgainstLibrary(
  signal: Float32Array, sampleRate: number, kind: SoundKind, atMidi?: number,
): Promise<MatchVerdict> {
  const print = fingerprint(signal, sampleRate)
  const matches: LibraryMatch[] = []

  for (const candidate of candidates(kind)) {
    const midi = atMidi !== undefined && !isPercussive(kind)
      ? Math.min(candidate.preset.range[1], Math.max(candidate.preset.range[0], atMidi))
      : candidate.midi
    const other = await printOf(candidate.preset, midi, candidate.piece)
    if (!other) continue
    const piece = candidate.piece !== undefined
      ? kitPieces(candidate.preset).find((p) => p.midi === candidate.piece)
      : undefined
    matches.push({
      presetId: candidate.preset.id,
      presetName: candidate.preset.name,
      pieceMidi: candidate.piece,
      pieceName: piece?.piece.name,
      distance: fingerprintDistance(print, other),
    })
  }

  matches.sort((a, b) => a.distance - b.distance)
  const best = matches[0] ?? null
  return {
    best,
    alternatives: matches.slice(1, 4),
    verdict: !best || best.distance > SIMILAR ? 'new'
      : best.distance <= HAVE_IT ? 'have-it' : 'similar',
  }
}

/** One line for the UI, in the words a person would use. */
export function describeMatch(verdict: MatchVerdict): string {
  const { best } = verdict
  if (!best || verdict.verdict === 'new') return 'Nothing in your library sounds like this'
  const name = best.pieceName ? `${best.presetName} — ${best.pieceName}` : best.presetName
  return verdict.verdict === 'have-it'
    ? `You already have this: ${name}`
    : `Close to ${name}, but not the same`
}

/** Drop the cached renders — only needed when the library itself changes. */
export function resetMatchCache() {
  prints.clear()
  warmed = false
}

/**
 * Render the comparison set up front. Optional: matching works without it, but
 * doing it while the user is still reading results keeps the first click fast.
 */
export async function warmMatchCache(kinds: SoundKind[]): Promise<void> {
  if (warmed) return
  for (const kind of kinds) {
    for (const candidate of candidates(kind)) {
      await printOf(candidate.preset, candidate.midi, candidate.piece)
    }
  }
  warmed = true
}

/** How many library sounds a kind would be compared against. For tests and UI. */
export function candidateCount(kind: SoundKind): number {
  return candidates(kind).length
}
