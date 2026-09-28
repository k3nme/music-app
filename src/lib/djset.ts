/**
 * Laying several records end to end as one continuous mix.
 *
 * A mashup stacks two songs on the same bars. A set is the other thing: one
 * record after another, overlapping just enough to get from one to the next
 * without the room noticing. That overlap is the whole craft, and until the
 * project could hold values that change over time there was no way to express
 * it at all — a transition *is* automation.
 *
 * Pure: it plans bars, speeds and curves. The caller turns that into tracks,
 * clips and lanes.
 */

import { rankPairs, scorePair, type Compatibility, type SongFacts } from './compatibility'

export interface SetEntry {
  song: SongFacts
  /** Bar this record comes in on. */
  startBar: number
  /** How long it plays in total, including both overlaps. */
  bars: number
  /** Bars of overlap with the record before it. 0 for the first. */
  blendInBars: number
  /** Bars of overlap with the record after it. 0 for the last. */
  blendOutBars: number
  /** Playback rate needed to sit at the set's tempo. */
  speed: number
  /** Semitones to move it, tuning included. */
  transpose: number
  /** Why it is here and what it had to do, in plain sentences. */
  notes: string[]
}

export interface SetPlan {
  bpm: number
  entries: SetEntry[]
  totalBars: number
  notes: string[]
}

export interface SetOptions {
  /** One tempo for the whole set. Defaults to the first record's. */
  bpm?: number
  /** How long each overlap runs. 16 bars is a comfortable club blend. */
  blendBars?: number
  /** How long each record plays, before overlaps. */
  playBars?: number
  /** Start from this song rather than the best opener. */
  startId?: string
  beatsPerBar?: number
}

/**
 * Put the records in an order where each one goes with the next.
 *
 * Greedy nearest-neighbour: take the current record, play whichever of the
 * remaining ones fits it best, repeat. It is not the optimal ordering — that
 * is a travelling-salesman problem — but it is the decision a DJ actually
 * makes, one record at a time, and it can explain every step.
 */
export function orderSet(songs: SongFacts[], startId?: string): { order: SongFacts[]; links: Compatibility[] } {
  if (songs.length <= 1) return { order: [...songs], links: [] }

  const remaining = new Map(songs.map((song) => [song.id, song]))
  // Open with the record that has the best onward options, unless told.
  let current = startId ? remaining.get(startId) : bestOpener(songs)
  if (!current) current = songs[0]
  remaining.delete(current.id)

  const order = [current]
  const links: Compatibility[] = []
  while (remaining.size > 0) {
    let best: Compatibility | null = null
    for (const candidate of remaining.values()) {
      const pair = scorePair(current, candidate)
      if (!best || pair.score > best.score) best = pair
    }
    if (!best) break
    links.push(best)
    current = best.b
    order.push(current)
    remaining.delete(current.id)
  }
  return { order, links }
}

/** The record whose best onward move is the strongest — a good opener. */
function bestOpener(songs: SongFacts[]): SongFacts {
  const ranked = rankPairs(songs)
  return ranked[0]?.a ?? songs[0]
}

/**
 * Turn an order into a timeline.
 *
 * Each record plays for `playBars` and overlaps the next by `blendBars`, so a
 * set of N records is N*(play) - (N-1)*(blend) bars long. Everything sits on
 * one tempo: a set that drifted would need every record re-warped continuously,
 * and the phase vocoder is only honest within about 15% anyway.
 */
export function planSet(songs: SongFacts[], options: SetOptions = {}): SetPlan {
  const blendBars = Math.max(1, options.blendBars ?? 16)
  const playBars = Math.max(blendBars * 2, options.playBars ?? 48)
  const beatsPerBar = options.beatsPerBar ?? 4
  const { order, links } = orderSet(songs, options.startId)
  if (order.length === 0) return { bpm: options.bpm ?? 120, entries: [], totalBars: 0, notes: [] }

  const bpm = Math.round(options.bpm ?? order[0].bpm)
  const notes: string[] = [
    `${order.length} records at ${bpm} BPM, ${blendBars} bars over each change`,
  ]

  const entries: SetEntry[] = []
  let bar = 0
  order.forEach((song, index) => {
    const link = index === 0 ? null : links[index - 1]
    // A record that has to be counted double- or half-time keeps the speed its
    // pairing worked out; everything else just meets the set tempo.
    const speed = link ? link.speed * (bpm / link.a.bpm) : bpm / song.bpm

    // A record cannot fill more of the set than it has music in it. Asking for
    // a 48-bar slot from a 16-bar edit leaves 32 bars of silence in the middle
    // of the mix — and since the next record comes in relative to where this
    // one *ends*, the hole lands exactly where the blend was supposed to be.
    const availableBars = Math.max(1, Math.floor(song.durationSec / ((60 / song.bpm) * beatsPerBar)))
    const bars = Math.min(playBars, availableBars)

    // Both overlaps have to fit inside what is actually there, with something
    // left playing on its own in between.
    const room = Math.max(0, Math.floor((bars - 1) / 2))
    const blendIn = index === 0 ? 0 : Math.min(blendBars, room)
    const blendOut = index === order.length - 1 ? 0 : Math.min(blendBars, room)

    if (bars < playBars) {
      notes.push(`${song.name} only runs ${bars} bars, so it takes a shorter turn`)
    }

    entries.push({
      song,
      startBar: bar,
      bars,
      blendInBars: blendIn,
      blendOutBars: blendOut,
      speed,
      transpose: link?.transpose ?? 0,
      notes: link
        ? [`${link.verdict} fit after ${link.a.name}`, ...link.notes]
        : ['opens the set'],
    })
    // The next record starts one blend before this one ends, so they overlap.
    bar += bars - blendOut
  })

  const totalBars = entries.length
    ? entries[entries.length - 1].startBar + entries[entries.length - 1].bars
    : 0
  return { bpm, entries, totalBars, notes }
}

// ---------------------------------------------------------------------------
// The transitions themselves
// ---------------------------------------------------------------------------

export interface LanePoints {
  param: 'volume' | 'tone'
  points: { beat: number; value: number }[]
}

/**
 * Equal power, not equal gain.
 *
 * Two uncorrelated records crossfading with straight lines are each at half
 * level in the middle, which sums to about 3 dB *down* — an audible dip right
 * at the moment the mix is meant to be seamless. Meeting at 0.707 instead of
 * 0.5 keeps the power constant across the blend.
 */
const EQUAL_POWER = Math.SQRT1_2

/** The curves that take one record out and bring the next one in. */
export function transitionLanes(
  entry: SetEntry, beatsPerBar: number, volume: number,
): { fadeIn: LanePoints[]; fadeOut: LanePoints[] } {
  const startBeat = entry.startBar * beatsPerBar
  const endBeat = (entry.startBar + entry.bars) * beatsPerBar
  const inBeats = entry.blendInBars * beatsPerBar
  const outBeats = entry.blendOutBars * beatsPerBar

  const fadeIn: LanePoints[] = []
  const fadeOut: LanePoints[] = []

  if (inBeats > 0) {
    fadeIn.push({
      param: 'volume',
      points: [
        { beat: startBeat, value: 0 },
        { beat: startBeat + inBeats / 2, value: volume * EQUAL_POWER },
        { beat: startBeat + inBeats, value: volume },
      ],
    })
    // Coming in filtered keeps the incoming record out of the way of the one
    // still playing, which is the move a DJ makes with the EQ.
    fadeIn.push({
      param: 'tone',
      points: [
        { beat: startBeat, value: 350 },
        { beat: startBeat + inBeats, value: 20000 },
      ],
    })
  }

  if (outBeats > 0) {
    fadeOut.push({
      param: 'volume',
      points: [
        { beat: endBeat - outBeats, value: volume },
        { beat: endBeat - outBeats / 2, value: volume * EQUAL_POWER },
        { beat: endBeat, value: 0 },
      ],
    })
    fadeOut.push({
      param: 'tone',
      points: [
        { beat: endBeat - outBeats, value: 20000 },
        { beat: endBeat, value: 400 },
      ],
    })
  }

  return { fadeIn, fadeOut }
}

/**
 * Every lane for one record: its way in and its way out, merged.
 *
 * Merged rather than kept apart because a track has one lane per parameter —
 * two lanes on the same parameter would be two answers to the same question.
 */
export function lanesFor(entry: SetEntry, beatsPerBar: number, volume = 0.85): LanePoints[] {
  const { fadeIn, fadeOut } = transitionLanes(entry, beatsPerBar, volume)
  const byParam = new Map<LanePoints['param'], { beat: number; value: number }[]>()
  for (const lane of [...fadeIn, ...fadeOut]) {
    const existing = byParam.get(lane.param) ?? []
    byParam.set(lane.param, [...existing, ...lane.points])
  }
  return [...byParam.entries()].map(([param, points]) => ({
    param,
    points: points.sort((a, b) => a.beat - b.beat),
  }))
}
