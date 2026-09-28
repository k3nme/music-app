/**
 * The seam for musical assistance.
 *
 * Everything the app asks for goes through `MusicProvider`. Today the only
 * implementation is local and heuristic — no network, no keys, works offline.
 * A cloud model implementing the same interface can be dropped in without the
 * UI or the project model changing, which is the point of stating it now.
 *
 * A suggestion is a *pure function over the project*: it never mutates, it
 * returns a new project. That keeps undo working, makes previewing trivial,
 * and means an untrusted remote suggestion can be inspected before it's
 * applied rather than executed blindly.
 */

import type { Project } from '../music/project'

export type Capability =
  /** Chords that fit what's already written. */
  | 'chords'
  /** A bass line following the harmony. */
  | 'bass'
  /** A drum pattern in a named style. */
  | 'drums'
  /** A second line harmonising the selected melody. */
  | 'harmony'
  /** Structural moves: double a part, add a counter-melody, build an intro. */
  | 'arrangement'
  /** A whole song, written from a plain-language prompt. */
  | 'song'

export interface MusicalContext {
  project: Project
  /** What the user is looking at, when it's relevant. */
  trackId?: string | null
  clipId?: string | null
  /** What the user asked for, in their own words. Used by 'song'. */
  prompt?: string
  /**
   * Makes generation repeatable. The same prompt and seed give the same song,
   * so "another version" is a new seed rather than a coin toss — and a test
   * can assert on the output at all.
   */
  seed?: number
  /**
   * Track ids to build around rather than replace. With these, 'song' becomes
   * a remix: the record on those tracks keeps its tempo, key and audio, and
   * new parts are written around whatever jobs it does not already do.
   */
  keep?: string[]
}

export interface Suggestion {
  id: string
  capability: Capability
  /** Short label, e.g. "Am – F – C – G". */
  title: string
  /** One line on what it does and why it fits. */
  detail: string
  /**
   * Why it chose this, in plain sentences. A guess you cannot see is worse
   * than no guess, so anything that makes a decision on the user's behalf
   * shows its working.
   */
  reasons?: string[]
  /**
   * True when applying this replaces the arrangement rather than adding to it.
   * The UI warns before doing that; undo still puts it back.
   */
  replacesProject?: boolean
  /** Returns a new project with the suggestion applied. Never mutates. */
  apply(project: Project): Project
}

export interface MusicProvider {
  readonly id: string
  readonly label: string
  /** Whether this provider needs a network round trip. */
  readonly remote: boolean
  readonly capabilities: readonly Capability[]
  suggest(context: MusicalContext, capability: Capability): Promise<Suggestion[]>
}
