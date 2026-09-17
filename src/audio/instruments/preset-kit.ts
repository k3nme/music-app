/**
 * Shared builders for the instrument library.
 *
 * These were private to `presets.ts` until the library outgrew a single file.
 * Every preset — acoustic, electronic, world — is declared through the same
 * handful of functions so a new instrument is a few lines of parameters rather
 * than any new code.
 */

import type { InstrumentFamily, PresetBase, SynthEngine } from '../types'
import type { DrumPiece } from './drums'

const FAMILY_HUE: Record<InstrumentFamily, number> = {
  keys: 42, plucked: 22, bowed: 344, winds: 188, brass: 28,
  mallets: 286, synth: 258, bass: 212, voice: 318, drums: 8, world: 150,
}

type Def = Partial<PresetBase> &
  Pick<PresetBase, 'id' | 'name' | 'family' | 'engine' | 'params'> & { blurb: string }

function def(d: Def): PresetBase {
  return {
    tags: [],
    centerMidi: 60,
    range: [36, 84],
    polyphony: 10,
    hue: FAMILY_HUE[d.family],
    ...d,
  }
}



export { def }
export const sub = (d: Omit<Def, 'engine'>) => def({ ...d, engine: 'subtractive' as SynthEngine })
export const fm = (d: Omit<Def, 'engine'>) => def({ ...d, engine: 'fm' as SynthEngine })
export const pluck = (d: Omit<Def, 'engine'>) => def({ ...d, engine: 'pluck' as SynthEngine })

/** Routing shorthand for the FM engine: this operator is heard directly. */
export const OUT = -1

export const piece = (p: DrumPiece): DrumPiece => p

export const kit = (
  id: string, name: string, blurb: string, tags: string[],
  pieces: Record<number, DrumPiece>, gain = 0.9, drive = 0,
): PresetBase =>
  def({
    id, name, family: 'drums', engine: 'drum', blurb, tags,
    centerMidi: 40, range: [30, 80], polyphony: 24, params: { pieces, gain, drive },
  })

export type { Def }
