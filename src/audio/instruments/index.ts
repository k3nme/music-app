/** Instrument factory: maps a preset to its synthesis engine. */

import type { InstrumentInstance, PresetBase } from '../types'
import { createSubtractive } from './subtractive'
import { createFM } from './fm'
import { createPluck, pluckWorkletReady } from './pluck'
import { createDrums } from './drums'
import { createSampler } from './sampler'

export { initPluck } from './pluck'
export * from './presets'
export * from './library'
export { kitPieces } from './drums'
export {
  createSampler, provideSample, forgetSample, hasSample, samplerSampleIds, zoneFor, noteZones,
} from './sampler'
export type { SamplerParams, SamplerZone } from './sampler'
export type { DrumPiece } from './drums'

/**
 * Stand-in for plucked instruments when AudioWorklet is unavailable.
 * Not the real model, but recognisably the same instrument.
 */
function pluckFallback(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  const p = preset.params as Record<string, number>
  const sustain = typeof p.sustain === 'number' ? p.sustain : 2
  return createSubtractive(ctx, {
    ...preset,
    engine: 'subtractive',
    params: {
      wave: 'sawtooth', voices: 2, detune: 6, spread: 0.2,
      osc2Wave: 'triangle', osc2Semi: 12, osc2Level: 0.3,
      cutoff: 1200, resonance: 3, filterEnv: 2.6, keyTrack: 0.6,
      a: 0.002, d: Math.min(2.5, sustain * 0.5), s: 0.02, r: 0.25,
      fa: 0.002, fd: Math.min(1.2, sustain * 0.3), fs: 0.06, fr: 0.2,
      chorus: 0.2, gain: 0.5,
    },
  })
}

export function createInstrument(ctx: BaseAudioContext, preset: PresetBase): InstrumentInstance {
  switch (preset.engine) {
    case 'subtractive': return createSubtractive(ctx, preset)
    case 'fm': return createFM(ctx, preset)
    case 'drum': return createDrums(ctx, preset)
    case 'sampler': return createSampler(ctx, preset)
    case 'pluck':
      return pluckWorkletReady(ctx) ? createPluck(ctx, preset) : pluckFallback(ctx, preset)
    default: return createSubtractive(ctx, preset)
  }
}
