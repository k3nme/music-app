/**
 * Connects the engine's audio-clip scheduling to the sample store.
 *
 * The engine asks "give me a buffer for this clip"; this decides whether the
 * raw sample will do, whether a pre-warped render exists, and — when one is
 * needed but missing — kicks off the render in a worker while handing back the
 * raw sample so playback never goes silent waiting for DSP.
 */

import { engine, type QueuedAudio } from '../audio/engine'
import { warpInWorker } from '../audio/workers'
import {
  bufferToChannels, channelsToBuffer, ensureSample, getSampleBuffer,
  getWarped, putWarped, warpKey,
} from '../lib/samples'

const rendering = new Set<string>()
const reversed = new Map<string, AudioBuffer>()

/** Warp renders currently running, for the UI to show progress. */
export const warpStatus = {
  active: 0,
  listeners: new Set<(active: number) => void>(),
  set(count: number) {
    this.active = count
    for (const listener of this.listeners) listener(count)
  },
}

function keyFor(request: QueuedAudio): string {
  const base = warpKey(request.sampleId, request.speed, request.pitchSemitones)
  return request.reverse ? `${base}!rev` : base
}

function reversedBuffer(ctx: BaseAudioContext, sampleId: string, source: AudioBuffer): AudioBuffer {
  const cached = reversed.get(sampleId)
  if (cached) return cached
  const channels = bufferToChannels(source).map((channel) => {
    const out = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i++) out[i] = channel[channel.length - 1 - i]
    return out
  })
  const buffer = channelsToBuffer(ctx, channels, source.sampleRate)
  reversed.set(sampleId, buffer)
  return buffer
}

/**
 * Whether this clip needs the phase vocoder. Pure tempo changes in 'repitch'
 * mode are handled by playback rate, which is free.
 */
function needsRender(request: QueuedAudio): boolean {
  if (Math.abs(request.pitchSemitones) > 0.001) return true
  return request.warpMode === 'stretch' && Math.abs(request.speed - 1) > 0.001
}

export function resolveAudioRequest(
  request: QueuedAudio,
): { buffer: AudioBuffer; prewarped: boolean } | null {
  const ctx = engine.ctx
  if (!ctx) return null

  const raw = getSampleBuffer(request.sampleId)
  if (!raw) {
    // Not decoded yet — load it and let the next pass pick it up.
    void ensureSample(ctx, request.sampleId).then((buffer) => {
      if (buffer) engine.refreshAudio()
    })
    return null
  }

  const source = request.reverse ? reversedBuffer(ctx, request.sampleId, raw) : raw
  if (!needsRender(request)) return { buffer: source, prewarped: false }

  const key = keyFor(request)
  const cached = getWarped(key)
  if (cached) return { buffer: cached, prewarped: true }

  startWarpRender(ctx, key, request, source)
  // Varispeed in the meantime: the wrong pitch, but audible and in time.
  return { buffer: source, prewarped: false }
}

function startWarpRender(
  ctx: BaseAudioContext, key: string, request: QueuedAudio, source: AudioBuffer,
) {
  if (rendering.has(key)) return
  rendering.add(key)
  warpStatus.set(rendering.size)

  // Stretch is the inverse of speed: playing 1.2x faster means the rendered
  // audio must be 1/1.2 as long.
  const stretch = 1 / Math.max(1e-6, request.speed)

  void warpInWorker(bufferToChannels(source), stretch, request.pitchSemitones)
    .then((channels) => {
      putWarped(key, channelsToBuffer(ctx, channels, source.sampleRate))
      engine.refreshAudio()
    })
    .catch((error) => {
      console.warn('[overtone] warp render failed', error)
    })
    .finally(() => {
      rendering.delete(key)
      warpStatus.set(rendering.size)
    })
}

/** Called by the engine when a clip's buffer isn't available at all. */
export function handleWarpNeeded(request: QueuedAudio) {
  const ctx = engine.ctx
  if (!ctx) return
  void ensureSample(ctx, request.sampleId).then((buffer) => {
    if (buffer) engine.refreshAudio()
  })
}

export function installAudioBridge() {
  engine.resolveAudio = resolveAudioRequest
  engine.onWarpNeeded = handleWarpNeeded
}
