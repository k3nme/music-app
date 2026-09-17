/**
 * Sidechain pump — the duck that makes house, progressive and most modern
 * dance music breathe.
 *
 * On a real desk you feed the kick into a compressor's sidechain and everything
 * else gets pushed out of the way each time it hits. We don't need the kick to
 * do it: the grid already knows where the beat is, so the duck is scheduled
 * rather than detected. That is also what every producer actually wants — a
 * shape that lands exactly on the beat, every beat, with no dependence on what
 * the drum track happens to be playing.
 *
 * Pure on purpose: it emits breakpoints in beats, so it can be unit-tested and
 * reused by the offline renderer without touching Web Audio.
 */

export interface PumpPoint {
  /** Song position, in beats. */
  beat: number
  /** Gain multiplier at that point, 0..1. */
  value: number
  /** `set` pins the value; `linear` ramps to it from the previous point. */
  kind: 'set' | 'linear'
}

/** Fraction of the cycle the gain takes to climb back. Below 1 so the value
 *  has reached unity before the next duck pins it — otherwise the `set` at the
 *  next cycle start would be an audible step. */
const RELEASE_FRACTION = 0.82
/** How fast the duck itself is, in beats at 120bpm. Short, but not a click. */
const ATTACK_BEATS = 0.012

/**
 * Breakpoints covering every pump cycle that starts in `[fromBeat, toBeat)`.
 *
 * The grid is absolute: cycle boundaries sit on multiples of `periodBeats` from
 * beat 0, so the duck lines up with the downbeat wherever playback started.
 */
export function pumpPoints(
  amount: number,
  periodBeats: number,
  fromBeat: number,
  toBeat: number,
): PumpPoint[] {
  if (!Number.isFinite(amount) || !Number.isFinite(periodBeats)) return []
  const depth = Math.max(0, Math.min(1, amount))
  const period = Math.max(0.0625, periodBeats)
  if (depth <= 0.001 || toBeat <= fromBeat) return []

  // Leave a sliver of signal at full depth — a hard zero sounds like a dropout.
  const floor = 1 - depth * 0.92
  const attack = Math.min(ATTACK_BEATS, period * 0.05)
  const release = period * RELEASE_FRACTION - attack

  const points: PumpPoint[] = []
  // `|| 0` folds the -0 that ceil produces at the origin into a plain 0.
  const first = Math.ceil(fromBeat / period - 1e-9) * period || 0
  for (let start = first; start < toBeat; start += period) {
    points.push({ beat: start, value: 1, kind: 'set' })
    points.push({ beat: start + attack, value: floor, kind: 'linear' })
    // Two segments approximate a compressor's release curve: most of the
    // recovery happens early, then it eases into unity.
    points.push({ beat: start + attack + release * 0.4, value: floor + (1 - floor) * 0.68, kind: 'linear' })
    points.push({ beat: start + attack + release, value: 1, kind: 'linear' })
  }
  return points
}
