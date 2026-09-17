/**
 * Plays lesson demos through the real audio engine.
 *
 * Demos use their own hidden tracks so they never touch the user's project —
 * you can be halfway through an arrangement, open a lesson, hear a demo, and
 * come back to exactly what you left.
 */

import { DEFAULT_CHANNEL, engine } from '../audio/engine'
import { getPreset } from '../audio/instruments'
import type { Demo } from './types'

/** One hidden track per preset a demo needs, reused across lessons. */
const demoTracks = new Map<string, string>()
let playing: number[] = []

function trackFor(preset: string): string {
  const existing = demoTracks.get(preset)
  if (existing) return existing
  const id = `__learn_${preset}__`
  demoTracks.set(preset, id)
  return id
}

export function stopDemo() {
  for (const timer of playing) window.clearTimeout(timer)
  playing = []
  engine.panic()
}

/**
 * Schedule a demo and return how long it runs, in seconds, so the UI can show
 * a progress bar and re-enable its button at the right moment.
 */
export async function playDemo(demoSpec: Demo): Promise<number> {
  const ctx = await engine.resume()
  stopDemo()

  const bpm = demoSpec.bpm ?? 96
  const beatSec = 60 / bpm
  const startAt = ctx.currentTime + 0.12
  let latest = 0

  for (const voice of demoSpec.voices) {
    const trackId = trackFor(voice.preset)
    engine.ensureTrack(trackId, voice.preset, {
      ...DEFAULT_CHANNEL,
      volume: (voice.gain ?? 1) * 0.85,
      // A touch of room so single notes don't sound clinical.
      reverbSend: 0.16,
    })

    for (const [midi, startBeat, lengthBeats, velocity] of voice.notes) {
      const at = startAt + startBeat * beatSec
      const duration = Math.max(0.05, lengthBeats * beatSec)
      engine.playNoteAt(trackId, midi, at, duration, velocity ?? 0.85)
      latest = Math.max(latest, startBeat * beatSec + duration)
    }
  }

  // Let tails ring: a piano or a cymbal keeps sounding past its written length.
  const tail = 1.2
  const total = latest + tail
  playing.push(window.setTimeout(() => { playing = [] }, total * 1000))
  return total
}

/** Release the hidden demo tracks — called when Learn closes. */
export function disposeDemoTracks() {
  stopDemo()
  for (const id of demoTracks.values()) engine.removeTrack(id)
  demoTracks.clear()
}

/** Human-readable instrument name, for demo buttons that don't set their own. */
export function presetName(id: string): string {
  return getPreset(id).name
}
