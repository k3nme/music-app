import { describe, expect, it } from 'vitest'
import { dissectStems, type StemName } from '../dissect'

const RATE = 22050

function noise(seed = 1) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2) - 1
  }
}

function kick(gain = 0.9): Float32Array {
  const out = new Float32Array(Math.round(0.3 * RATE))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    phase += (2 * Math.PI * (50 + 110 * Math.exp(-t * 55))) / RATE
    out[i] = Math.sin(phase) * gain * Math.exp(-t * 14)
  }
  return out
}

function hat(gain = 0.3, seed = 7): Float32Array {
  const out = new Float32Array(Math.round(0.05 * RATE))
  const rand = noise(seed)
  let previous = 0
  for (let i = 0; i < out.length; i++) {
    const white = rand()
    out[i] = (white - previous * 0.92) * gain * Math.exp(-(i / RATE) * 90)
    previous = white
  }
  return out
}

/** A plucked note at a given pitch — stands in for a bass or an instrument. */
function note(midi: number, seconds = 0.45, gain = 0.7): Float32Array {
  const hz = 440 * Math.pow(2, (midi - 69) / 12)
  const out = new Float32Array(Math.round(seconds * RATE))
  const fade = Math.round(0.02 * RATE)
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const release = Math.min(1, (out.length - i) / fade)
    out[i] = release * gain * Math.exp(-t * 4) *
      (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t)
        + 0.25 * Math.sin(6 * Math.PI * hz * t))
  }
  return out
}

function place(seconds: number, hits: { at: number; signal: Float32Array }[]): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE))
  for (const hit of hits) {
    const from = Math.round(hit.at * RATE)
    for (let i = 0; i < hit.signal.length && from + i < out.length; i++) out[from + i] += hit.signal[i]
  }
  return out
}

/** A stand-in for what separation hands over: four mono layers. */
function stems(parts: Partial<Record<StemName, Float32Array>>): Record<StemName, Float32Array[]> {
  const empty = new Float32Array(Math.round(4 * RATE))
  return {
    drums: [parts.drums ?? empty],
    bass: [parts.bass ?? empty],
    other: [parts.other ?? empty],
    vocals: [parts.vocals ?? empty],
  }
}

describe('taking a song apart', () => {
  it('finds the distinct sounds in a drum layer and counts how often each plays', () => {
    const hits: { at: number; signal: Float32Array }[] = []
    for (let beat = 0; beat < 8; beat++) {
      if (beat % 2 === 0) hits.push({ at: beat * 0.5, signal: kick() })
      hits.push({ at: beat * 0.5 + 0.25, signal: hat() })
    }
    const sounds = dissectStems(stems({ drums: place(4.5, hits) }), RATE)

    const kinds = sounds.map((s) => s.kind).sort()
    expect(kinds).toEqual(['hat', 'kick'])
    expect(sounds.find((s) => s.kind === 'kick')?.count).toBe(4)
    expect(sounds.find((s) => s.kind === 'hat')?.count).toBe(8)
    for (const sound of sounds) {
      expect(sound.stem).toBe('drums')
      expect(sound.best.audio.length).toBeGreaterThan(64)
      expect(sound.sampleRate).toBe(RATE)
    }
  })

  it('gives every sound a name a person would use', () => {
    const sounds = dissectStems(stems({ drums: place(2, [{ at: 0.1, signal: kick() }]) }), RATE)
    expect(sounds[0].label).toBe('Kick')
  })

  it('keeps several notes of a pitched sound, spread across its range', () => {
    const line = place(4.5, [58, 62, 65, 70, 74].map((midi, i) => ({
      at: i * 0.8, signal: note(midi),
    })))
    const [sound] = dissectStems(stems({ other: line }), RATE, { maxTakes: 4 })

    expect(sound.kind).toBe('tonal')
    expect(sound.takes.length).toBeGreaterThan(1)
    expect(sound.takes.length).toBeLessThanOrEqual(4)
    const notes = sound.takes.map((t) => t.midi).filter((m): m is number => m !== null)
    expect(notes.length).toBe(sound.takes.length)
    // The ends matter: they set how far it plays before it sounds stretched.
    expect(Math.min(...notes)).toBeLessThanOrEqual(60)
    expect(Math.max(...notes)).toBeGreaterThanOrEqual(70)
  })

  it('keeps exactly one example of anything struck', () => {
    const beat = place(4, [0, 1, 2, 3, 4, 5, 6, 7].map((b) => ({ at: b * 0.5, signal: kick() })))
    const [sound] = dissectStems(stems({ drums: beat }), RATE)
    expect(sound.takes).toHaveLength(1)
    expect(sound.count).toBe(8)
  })

  it('reports the exemplar as one of the takes it kept', () => {
    const line = place(4, [50, 55, 60].map((midi, i) => ({ at: i * 1.1, signal: note(midi) })))
    const [sound] = dissectStems(stems({ other: line }), RATE)
    expect(sound.takes).toContain(sound.best)
  })

  it('knows which layer each sound came out of', () => {
    const sounds = dissectStems(stems({
      drums: place(4, [{ at: 0.2, signal: kick() }, { at: 1.2, signal: kick() }]),
      bass: place(4, [{ at: 0.2, signal: note(36, 0.8) }, { at: 1.2, signal: note(36, 0.8) }]),
    }), RATE)
    expect(sounds.find((s) => s.kind === 'kick')?.stem).toBe('drums')
    expect(sounds.find((s) => s.kind === 'bass')?.stem).toBe('bass')
  })

  it('ignores a stem that separation found nothing in', () => {
    const sounds = dissectStems(stems({ drums: place(3, [{ at: 0.5, signal: kick() }]) }), RATE)
    expect(sounds.every((s) => s.stem === 'drums')).toBe(true)
  })

  it('ignores hits too quiet to be worth having', () => {
    const mixed = place(4, [
      { at: 0.0, signal: kick(0.9) }, { at: 1.0, signal: kick(0.9) },
      { at: 2.0, signal: kick(0.01) }, { at: 3.0, signal: kick(0.01) },
    ])
    const sounds = dissectStems(stems({ drums: mixed }), RATE, { floor: 0.1 })
    const total = sounds.reduce((sum, s) => sum + s.count, 0)
    expect(total).toBe(2)
  })

  it('returns the most-used sounds first, and no more than asked for', () => {
    const hits: { at: number; signal: Float32Array }[] = []
    for (let i = 0; i < 12; i++) hits.push({ at: i * 0.25 + 0.125, signal: hat() })
    hits.push({ at: 0, signal: kick() }, { at: 1.5, signal: kick() })
    const sounds = dissectStems(stems({ drums: place(4, hits) }), RATE, { maxSounds: 1 })
    expect(sounds).toHaveLength(1)
    expect(sounds[0].kind).toBe('hat')
  })

  it('finds nothing in silence rather than inventing something', () => {
    expect(dissectStems(stems({}), RATE)).toEqual([])
  })

  it('reports progress through named stages', () => {
    const stages: string[] = []
    dissectStems(stems({ drums: place(2, [{ at: 0.2, signal: kick() }]) }), RATE, {
      onProgress: (fraction, stage) => {
        expect(fraction).toBeGreaterThanOrEqual(0)
        expect(fraction).toBeLessThanOrEqual(1)
        stages.push(stage)
      },
    })
    expect(stages.length).toBeGreaterThan(1)
    expect(stages[stages.length - 1]).toBe('Done')
  })
})
