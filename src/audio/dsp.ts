/**
 * Small DSP building blocks shared by the instruments and the mixer.
 * Everything here is procedural — Overtone ships no audio samples, so it
 * loads instantly, works offline and stays a few hundred kilobytes.
 */

import { clamp } from './types'

// --- Noise ------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

/** Two seconds of white noise, generated once per context and reused. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx)
  if (cached) return cached
  const len = Math.floor(ctx.sampleRate * 2)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseCache.set(ctx, buf)
  return buf
}

/** A noise source started at `when`, gated by its own gain envelope. */
export function noiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  src.loop = true
  src.playbackRate.value = 0.75 + Math.random() * 0.5
  return src
}

// --- Waveshaping ------------------------------------------------------------

const curveCache = new Map<string, Float32Array<ArrayBuffer>>()

/** Soft asymmetric saturation. `amount` 0..1, 0 being close to clean. */
export function driveCurve(amount: number, n = 2048): Float32Array<ArrayBuffer> {
  const key = `drive:${amount.toFixed(3)}:${n}`
  const hit = curveCache.get(key)
  if (hit) return hit
  const k = clamp(amount, 0, 1) * 60 + 0.001
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1
    // tanh-ish soft clip, with a touch of even harmonic for warmth
    const shaped = Math.tanh(k * x) / Math.tanh(k)
    curve[i] = shaped * 0.92 + Math.tanh(k * 0.5 * x * x) * 0.08 * Math.sign(x)
  }
  curveCache.set(key, curve)
  return curve
}

/** Hard-ish clipper used by the master limiter's character stage. */
export function limiterCurve(n = 1024): Float32Array<ArrayBuffer> {
  const key = `limit:${n}`
  const hit = curveCache.get(key)
  if (hit) return hit
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1
    curve[i] = Math.tanh(x * 1.6) * 0.88
  }
  curveCache.set(key, curve)
  return curve
}

// --- Reverb -----------------------------------------------------------------

export interface ReverbSpec {
  /** RT60-ish, seconds. */
  seconds: number
  /** 0 = bright plate, 1 = dark hall. */
  damping: number
  /** Pre-delay in seconds. */
  preDelay: number
}

/**
 * Procedural impulse response: exponentially decaying, progressively
 * low-passed noise with a sparse early-reflection pattern in front of it.
 * Cheap to build and convincingly roomy through a ConvolverNode.
 */
export function buildImpulseResponse(ctx: BaseAudioContext, spec: ReverbSpec): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.max(1, Math.floor(sr * (spec.seconds + spec.preDelay)))
  const buf = ctx.createBuffer(2, len, sr)
  const preDelaySamples = Math.floor(sr * spec.preDelay)
  const decay = spec.seconds * sr

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    // One-pole low-pass state, so the tail darkens as it decays.
    let lp = 0
    const damp = 0.18 + spec.damping * 0.7
    for (let i = preDelaySamples; i < len; i++) {
      const t = (i - preDelaySamples) / decay
      const env = Math.pow(1 - t, 2.2 + spec.damping * 1.5)
      const white = Math.random() * 2 - 1
      lp += (white - lp) * (1 - damp * t)
      data[i] = lp * env
    }
    // Early reflections: a handful of discrete taps gives the tail a size.
    const taps = [0.011, 0.019, 0.026, 0.037, 0.049, 0.063]
    for (const tapSec of taps) {
      const idx = preDelaySamples + Math.floor(tapSec * sr * (1 + ch * 0.11))
      if (idx < len) data[idx] += (Math.random() * 2 - 1) * 0.55
    }
  }
  return buf
}

// --- Modulation -------------------------------------------------------------

/**
 * Stereo chorus: two modulated delay lines panned apart. Used to widen pads,
 * string sections and electric pianos.
 */
export function createChorus(ctx: BaseAudioContext, depth = 0.004, rate = 0.6) {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  dry.gain.value = 0.72
  input.connect(dry).connect(output)

  const lfo = ctx.createOscillator()
  lfo.frequency.value = rate
  lfo.start()

  for (let i = 0; i < 2; i++) {
    const delay = ctx.createDelay(0.1)
    delay.delayTime.value = 0.014 + i * 0.008
    const depthGain = ctx.createGain()
    depthGain.gain.value = depth * (i === 0 ? 1 : -0.8)
    const phase = ctx.createGain()
    phase.gain.value = 1
    lfo.connect(depthGain).connect(delay.delayTime)
    const pan = ctx.createStereoPanner()
    pan.pan.value = i === 0 ? -0.7 : 0.7
    const wet = ctx.createGain()
    wet.gain.value = 0.42
    input.connect(delay).connect(pan).connect(wet).connect(output)
    void phase
  }
  return { input, output, lfo }
}

// --- Envelope helpers -------------------------------------------------------

/**
 * Exponential-ish ADSR on a gain param. Uses setTargetAtTime for decay/release
 * (smooth, no zipper noise) and linear ramps for the attack.
 */
export function applyADSR(
  param: AudioParam,
  when: number,
  peak: number,
  a: number,
  d: number,
  s: number,
  releaseAt: number | null,
  r: number,
) {
  const attack = Math.max(0.001, a)
  param.cancelScheduledValues(when)
  param.setValueAtTime(0.0001, when)
  param.linearRampToValueAtTime(peak, when + attack)
  const sustainLevel = Math.max(0.0001, peak * s)
  if (d > 0.001) {
    param.setTargetAtTime(sustainLevel, when + attack, Math.max(0.005, d / 3))
  } else {
    param.setValueAtTime(sustainLevel, when + attack)
  }
  if (releaseAt !== null) {
    const rel = Math.max(when + attack + 0.005, releaseAt)
    param.cancelScheduledValues(rel)
    // Hold whatever the envelope reached, then fall away.
    param.setTargetAtTime(0.0001, rel, Math.max(0.008, r / 3))
  }
}

/** When a setTargetAtTime release is effectively silent, so we can free nodes. */
export function releaseTail(r: number): number {
  return Math.max(0.05, r * 1.6 + 0.08)
}

export function velocityToGain(velocity: number): number {
  // Perceptual-ish: velocity 0..1 mapped with a slight curve.
  const v = clamp(velocity, 0, 1)
  return v * v * 0.85 + v * 0.15
}
