/** Shared audio-layer types. Kept free of React and store imports on purpose. */

export type InstrumentFamily =
  | 'keys'
  | 'plucked'
  | 'bowed'
  | 'winds'
  | 'brass'
  | 'mallets'
  | 'synth'
  | 'bass'
  | 'voice'
  | 'drums'
  | 'world'
  /** Recorded rather than modelled — anything taken out of a song. */
  | 'sampled'

export type SynthEngine = 'subtractive' | 'fm' | 'pluck' | 'drum' | 'sampler'

/** A live, releasable note. Returned by `noteOn` for held/keyboard playing. */
export interface NoteHandle {
  /** Begin the release stage at `when` (AudioContext seconds). Idempotent. */
  release(when: number): void
  readonly midi: number
}

export interface InstrumentInstance {
  readonly presetId: string
  /** Instrument output; the engine wires this into a channel strip. */
  readonly output: GainNode
  /** Start a note that rings until released. */
  noteOn(midi: number, when: number, velocity: number): NoteHandle
  /** Fire-and-forget note of a known length — what the sequencer uses. */
  play(midi: number, when: number, durationSec: number, velocity: number): void
  /** Silence everything, e.g. on transport stop or panic. */
  allNotesOff(when: number): void
  /**
   * Offline rendering only: commit anything the instrument buffered while the
   * schedule was being built. Live instruments don't need it.
   */
  finalize?(): void
  /**
   * Some sounds are written in beats rather than seconds — a riser has to end
   * exactly on the drop — so they need to know the tempo.
   */
  setTempo?(bpm: number): void
  dispose(): void
}

export interface PresetBase {
  id: string
  name: string
  family: InstrumentFamily
  engine: SynthEngine
  /** Short line shown in the picker — what it is, and what it's good for. */
  blurb: string
  /** Free-text search keys: 'sitar', 'india', 'buzzy', 'raga'... */
  tags: string[]
  /** Suggested octave when this instrument is first opened in the piano roll. */
  centerMidi: number
  /** Sensible low/high playable range; the roll dims notes outside it. */
  range: [number, number]
  /** Max simultaneous voices. Drums ignore this. */
  polyphony: number
  /** Per-instrument colour used across the UI. */
  hue: number
  /** Engine-specific parameters; each engine narrows this to its own shape. */
  params: Record<string, unknown>
  /** Made by the user rather than shipped with the app. */
  userMade?: boolean
  /** For an extracted instrument: the song it came out of. */
  sourceName?: string
  createdAt?: number
}

/** One note as the scheduler hands it to an instrument. */
export interface ScheduledNote {
  trackId: string
  midi: number
  velocity: number
  /** AudioContext time to start. */
  time: number
  /** Seconds. */
  duration: number
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
