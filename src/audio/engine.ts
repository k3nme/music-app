/**
 * The audio engine: context lifecycle, per-track channel strips, the master
 * bus, shared effect sends, and the transport/scheduler that turns beats into
 * sample-accurate note events.
 *
 * Scheduling follows the standard "tale of two clocks" pattern — a coarse
 * timer wakes us up, and every note inside the lookahead window is scheduled
 * against the AudioContext clock, which is the only clock accurate enough.
 */

import { buildImpulseResponse, driveCurve, limiterCurve } from './dsp'
import { createInstrument, getPreset, initPluck } from './instruments'
import type { InstrumentInstance, NoteHandle, PresetBase } from './types'
import { clamp } from './types'

export interface QueuedNote {
  trackId: string
  midi: number
  velocity: number
  /** Position in song beats. */
  startBeat: number
  durationBeats: number
}

/** The store supplies this; the scheduler asks for notes one window at a time. */
export type NoteSource = (fromBeat: number, toBeat: number) => QueuedNote[]

/** One audio clip the scheduler should start, with its derived timing. */
export interface QueuedAudio {
  clipId: string
  trackId: string
  sampleId: string
  startBeat: number
  lengthBeats: number
  /** Source seconds per timeline second. */
  speed: number
  offsetSec: number
  sourceDurationSec: number
  gain: number
  fadeInBeats: number
  fadeOutBeats: number
  pitchSemitones: number
  warpMode: 'stretch' | 'repitch'
  reverse: boolean
}

export type AudioSource = (fromBeat: number, toBeat: number) => QueuedAudio[]

export interface ChannelSettings {
  volume: number
  pan: number
  /** Already accounts for solo elsewhere in the app. */
  muted: boolean
  reverbSend: number
  delaySend: number
  /** 0..1 saturation on the channel. */
  drive: number
  /** Low-pass in Hz; 20000 is effectively off. */
  tone: number
}

export const DEFAULT_CHANNEL: ChannelSettings = {
  volume: 0.8, pan: 0, muted: false, reverbSend: 0.12, delaySend: 0, drive: 0, tone: 20000,
}

export interface MasterSettings {
  volume: number
  reverbAmount: number
  reverbSize: number
  delayTimeBeats: number
  delayFeedback: number
  delayTone: number
}

export const DEFAULT_MASTER: MasterSettings = {
  volume: 0.85, reverbAmount: 0.9, reverbSize: 2.4,
  delayTimeBeats: 0.75, delayFeedback: 0.34, delayTone: 3200,
}

/** One track's signal path: instrument -> drive -> tone -> pan -> fader -> master. */
export interface Channel {
  input: GainNode
  driveShaper: WaveShaperNode
  driveWet: GainNode
  driveDry: GainNode
  tone: BiquadFilterNode
  panner: StereoPannerNode
  fader: GainNode
  reverbSend: GainNode
  delaySend: GainNode
  analyser: AnalyserNode
  settings: ChannelSettings
}

export interface EffectBus {
  reverbIn: GainNode
  reverbConvolver: ConvolverNode
  reverbReturn: GainNode
  delayIn: GainNode
  delayNode: DelayNode
  delayFeedback: GainNode
  delayTone: BiquadFilterNode
  delayReturn: GainNode
}

export interface MasterChain {
  bus: GainNode
  compressor: DynamicsCompressorNode
  limiter: WaveShaperNode
  gain: GainNode
  analyser: AnalyserNode
  fx: EffectBus
}

// ---------------------------------------------------------------------------
// Graph builders — shared by the live engine and the offline WAV renderer.
// ---------------------------------------------------------------------------

export function buildMaster(ctx: BaseAudioContext, settings: MasterSettings, bpm: number): MasterChain {
  const bus = ctx.createGain()
  bus.gain.value = 1

  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -14
  compressor.knee.value = 12
  compressor.ratio.value = 3
  compressor.attack.value = 0.006
  compressor.release.value = 0.18

  const limiter = ctx.createWaveShaper()
  limiter.curve = limiterCurve()
  limiter.oversample = '2x'

  const gain = ctx.createGain()
  gain.gain.value = settings.volume

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.6

  // --- shared sends -------------------------------------------------------
  const reverbIn = ctx.createGain()
  const reverbConvolver = ctx.createConvolver()
  reverbConvolver.buffer = buildImpulseResponse(ctx, {
    seconds: settings.reverbSize, damping: 0.45, preDelay: 0.018,
  })
  const reverbReturn = ctx.createGain()
  reverbReturn.gain.value = settings.reverbAmount
  reverbIn.connect(reverbConvolver).connect(reverbReturn).connect(bus)

  const delayIn = ctx.createGain()
  const delayNode = ctx.createDelay(4)
  delayNode.delayTime.value = clamp((60 / bpm) * settings.delayTimeBeats, 0.01, 4)
  const delayFeedback = ctx.createGain()
  delayFeedback.gain.value = clamp(settings.delayFeedback, 0, 0.92)
  const delayTone = ctx.createBiquadFilter()
  delayTone.type = 'lowpass'
  delayTone.frequency.value = settings.delayTone
  const delayReturn = ctx.createGain()
  delayReturn.gain.value = 1
  delayIn.connect(delayNode)
  delayNode.connect(delayTone).connect(delayFeedback).connect(delayNode)
  delayTone.connect(delayReturn).connect(bus)

  bus.connect(compressor).connect(limiter).connect(gain).connect(analyser)
  analyser.connect(ctx.destination)

  return {
    bus, compressor, limiter, gain, analyser,
    fx: { reverbIn, reverbConvolver, reverbReturn, delayIn, delayNode, delayFeedback, delayTone, delayReturn },
  }
}

export function buildChannel(ctx: BaseAudioContext, master: MasterChain, settings: ChannelSettings): Channel {
  const input = ctx.createGain()

  // Parallel dry/saturated paths so `drive` is a blend, not a switch.
  const driveShaper = ctx.createWaveShaper()
  driveShaper.curve = driveCurve(Math.max(0.001, settings.drive))
  driveShaper.oversample = '2x'
  const driveWet = ctx.createGain()
  const driveDry = ctx.createGain()
  driveWet.gain.value = settings.drive
  driveDry.gain.value = 1 - settings.drive * 0.7

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = settings.tone
  tone.Q.value = 0.5

  const panner = ctx.createStereoPanner()
  panner.pan.value = settings.pan

  const fader = ctx.createGain()
  fader.gain.value = settings.muted ? 0 : settings.volume

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.75

  const reverbSend = ctx.createGain()
  reverbSend.gain.value = settings.reverbSend
  const delaySend = ctx.createGain()
  delaySend.gain.value = settings.delaySend

  input.connect(driveDry).connect(tone)
  input.connect(driveShaper).connect(driveWet).connect(tone)
  tone.connect(panner).connect(fader)
  fader.connect(analyser)
  fader.connect(master.bus)
  fader.connect(reverbSend).connect(master.fx.reverbIn)
  fader.connect(delaySend).connect(master.fx.delayIn)

  return { input, driveShaper, driveWet, driveDry, tone, panner, fader, reverbSend, delaySend, analyser, settings }
}

export function applyChannelSettings(ch: Channel, s: ChannelSettings, when: number) {
  const ramp = 0.02
  ch.fader.gain.setTargetAtTime(s.muted ? 0 : s.volume, when, ramp)
  ch.panner.pan.setTargetAtTime(s.pan, when, ramp)
  ch.reverbSend.gain.setTargetAtTime(s.reverbSend, when, ramp)
  ch.delaySend.gain.setTargetAtTime(s.delaySend, when, ramp)
  ch.tone.frequency.setTargetAtTime(clamp(s.tone, 60, 20000), when, ramp)
  if (Math.abs(s.drive - ch.settings.drive) > 0.001) {
    ch.driveShaper.curve = driveCurve(Math.max(0.001, s.drive))
  }
  ch.driveWet.gain.setTargetAtTime(s.drive, when, ramp)
  ch.driveDry.gain.setTargetAtTime(1 - s.drive * 0.7, when, ramp)
  ch.settings = { ...s }
}

export function disposeChannel(ch: Channel) {
  for (const n of [ch.input, ch.driveShaper, ch.driveWet, ch.driveDry, ch.tone,
    ch.panner, ch.fader, ch.reverbSend, ch.delaySend, ch.analyser]) {
    try { n.disconnect() } catch { /* noop */ }
  }
}

// ---------------------------------------------------------------------------
// Worker-backed tick source. setInterval in a page gets throttled hard when the
// tab is backgrounded; a worker keeps firing, so playback doesn't stutter.
// ---------------------------------------------------------------------------

const TICKER_SOURCE = `
let id = null
self.onmessage = (e) => {
  if (e.data.type === 'start') {
    clearInterval(id)
    id = setInterval(() => self.postMessage('tick'), e.data.interval)
  } else if (e.data.type === 'stop') {
    clearInterval(id); id = null
  }
}`

function createTicker(onTick: () => void): { start(ms: number): void; stop(): void; dispose(): void } {
  let worker: Worker | null = null
  let fallback: number | null = null
  try {
    const blob = new Blob([TICKER_SOURCE], { type: 'application/javascript' })
    worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = onTick
  } catch {
    worker = null
  }
  return {
    start(ms) {
      if (worker) worker.postMessage({ type: 'start', interval: ms })
      else {
        if (fallback !== null) clearInterval(fallback)
        fallback = setInterval(onTick, ms) as unknown as number
      }
    },
    stop() {
      if (worker) worker.postMessage({ type: 'stop' })
      else if (fallback !== null) { clearInterval(fallback); fallback = null }
    },
    dispose() {
      this.stop()
      worker?.terminate()
      worker = null
    },
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const LOOKAHEAD_SEC = 0.14
const TICK_MS = 25

export interface TransportState {
  playing: boolean
  /** Song position in beats, valid while playing. */
  positionBeats: number
}

export class AudioEngine {
  ctx: AudioContext | null = null
  master: MasterChain | null = null
  private channels = new Map<string, Channel>()
  private instruments = new Map<string, InstrumentInstance>()
  private presetOf = new Map<string, string>()

  private ticker = createTicker(() => this.tick())
  private noteSource: NoteSource = () => []
  private audioSource: AudioSource = () => []

  /** Resolves the buffer to play; the store owns warp rendering and caching. */
  resolveAudio: ((request: QueuedAudio) => { buffer: AudioBuffer; prewarped: boolean } | null) | null = null
  /** Fired when a clip wants a warped render that isn't ready yet. */
  onWarpNeeded: ((request: QueuedAudio) => void) | null = null

  private activeAudio = new Set<{ node: AudioBufferSourceNode; gain: GainNode }>()
  /** Clip instances already started for the current loop pass. */
  private startedAudio = new Set<string>()

  bpm = 120
  loopEnabled = true
  loopStart = 0
  loopEnd = 16
  /** Where playback stops when not looping. */
  songEndBeat = 64
  metronome = false
  private masterSettings: MasterSettings = { ...DEFAULT_MASTER }

  private playing = false
  private originTime = 0
  private originBeat = 0
  private cursorBeat = 0
  private lastMetronomeBeat = -1
  private pausedAt = 0

  /** Fires whenever playback stops on its own (reached the end). */
  onStop: (() => void) | null = null
  /** Notes actually dispatched, for UI highlighting. */
  onNotesScheduled: ((notes: { trackId: string; midi: number; time: number; duration: number }[]) => void) | null = null

  workletReady = false

  // --- lifecycle -----------------------------------------------------------

  /** Must be called from a user gesture the first time. */
  async resume(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor({ latencyHint: 'interactive' })
      this.master = buildMaster(this.ctx, this.masterSettings, this.bpm)
      this.workletReady = await initPluck(this.ctx)
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    return this.ctx
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0
  }

  setNoteSource(source: NoteSource) {
    this.noteSource = source
  }

  setAudioSource(source: AudioSource) {
    this.audioSource = source
  }

  // --- tracks --------------------------------------------------------------

  /** Build just the channel strip. Audio tracks need this and nothing else. */
  ensureChannel(trackId: string, settings: ChannelSettings): Channel | null {
    if (!this.ctx || !this.master) return null
    let channel = this.channels.get(trackId)
    if (!channel) {
      channel = buildChannel(this.ctx, this.master, settings)
      this.channels.set(trackId, channel)
    }
    return channel
  }

  ensureTrack(trackId: string, presetId: string, settings: ChannelSettings) {
    if (!this.ctx || !this.master) return
    const channel = this.ensureChannel(trackId, settings)
    if (!channel) return
    if (this.presetOf.get(trackId) !== presetId) {
      const old = this.instruments.get(trackId)
      if (old) {
        old.allNotesOff(this.ctx.currentTime)
        // Let the tail ring out before tearing the nodes down.
        setTimeout(() => old.dispose(), 2500)
      }
      const preset: PresetBase = getPreset(presetId)
      const inst = createInstrument(this.ctx, preset)
      inst.output.connect(channel.input)
      this.instruments.set(trackId, inst)
      this.presetOf.set(trackId, presetId)
    }
  }

  updateChannel(trackId: string, settings: ChannelSettings) {
    const ch = this.channels.get(trackId)
    if (!ch || !this.ctx) return
    applyChannelSettings(ch, settings, this.ctx.currentTime)
  }

  removeTrack(trackId: string) {
    const inst = this.instruments.get(trackId)
    if (inst) { inst.allNotesOff(this.currentTime); inst.dispose() }
    this.instruments.delete(trackId)
    this.presetOf.delete(trackId)
    const ch = this.channels.get(trackId)
    if (ch) disposeChannel(ch)
    this.channels.delete(trackId)
  }

  getChannel(trackId: string): Channel | undefined {
    return this.channels.get(trackId)
  }

  setMaster(settings: MasterSettings) {
    this.masterSettings = { ...settings }
    if (!this.master || !this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.gain.setTargetAtTime(settings.volume, t, 0.02)
    this.master.fx.reverbReturn.gain.setTargetAtTime(settings.reverbAmount, t, 0.02)
    this.master.fx.delayNode.delayTime.setTargetAtTime(
      clamp((60 / this.bpm) * settings.delayTimeBeats, 0.01, 4), t, 0.05,
    )
    this.master.fx.delayFeedback.gain.setTargetAtTime(clamp(settings.delayFeedback, 0, 0.92), t, 0.02)
    this.master.fx.delayTone.frequency.setTargetAtTime(settings.delayTone, t, 0.02)
  }

  /** Rebuilds the reverb impulse — only needed when the size changes. */
  setReverbSize(seconds: number) {
    if (!this.ctx || !this.master) return
    this.masterSettings.reverbSize = seconds
    this.master.fx.reverbConvolver.buffer = buildImpulseResponse(this.ctx, {
      seconds, damping: 0.45, preDelay: 0.018,
    })
  }

  setBpm(bpm: number) {
    const t = this.ctx?.currentTime ?? 0
    if (this.playing) {
      // Keep the current position continuous across a tempo change.
      const pos = this.positionBeats
      this.bpm = bpm
      this.originTime = t
      this.originBeat = pos
      this.cursorBeat = Math.max(this.cursorBeat, pos)
    } else {
      this.bpm = bpm
    }
    if (this.master) {
      this.master.fx.delayNode.delayTime.setTargetAtTime(
        clamp((60 / bpm) * this.masterSettings.delayTimeBeats, 0.01, 4), t, 0.05,
      )
    }
  }

  // --- transport -----------------------------------------------------------

  private beatAt(time: number): number {
    return this.originBeat + ((time - this.originTime) * this.bpm) / 60
  }

  private timeAt(beat: number): number {
    return this.originTime + ((beat - this.originBeat) * 60) / this.bpm
  }

  /** Maps an ever-increasing timeline beat onto the looped song position. */
  private songPos(timelineBeat: number): number {
    if (!this.loopEnabled) return timelineBeat
    const len = this.loopEnd - this.loopStart
    if (len <= 0 || timelineBeat < this.loopStart) return timelineBeat
    return this.loopStart + ((timelineBeat - this.loopStart) % len)
  }

  get positionBeats(): number {
    if (!this.playing || !this.ctx) return this.pausedAt
    return this.songPos(this.beatAt(this.ctx.currentTime))
  }

  get isPlaying(): boolean {
    return this.playing
  }

  async play(fromBeat?: number) {
    const ctx = await this.resume()
    if (this.playing) this.stop()
    const start = fromBeat ?? this.pausedAt
    this.originTime = ctx.currentTime + 0.06
    this.originBeat = start
    this.cursorBeat = start
    this.lastMetronomeBeat = Math.floor(start) - 1
    this.startedAudio.clear()
    this.playing = true
    this.ticker.start(TICK_MS)
    this.tick()
  }

  stop(atBeat?: number) {
    if (!this.playing && atBeat === undefined) return
    this.pausedAt = atBeat ?? (this.playing ? this.positionBeats : this.pausedAt)
    this.playing = false
    this.ticker.stop()
    const t = this.currentTime
    for (const inst of this.instruments.values()) inst.allNotesOff(t)
    this.stopAllAudio(t)
    this.startedAudio.clear()
  }

  /** Stop every playing audio clip, with a short ramp so it doesn't click. */
  private stopAllAudio(when: number) {
    for (const active of this.activeAudio) {
      try {
        active.gain.gain.cancelScheduledValues(when)
        active.gain.gain.setTargetAtTime(0.0001, when, 0.008)
        active.node.stop(when + 0.06)
      } catch { /* already stopped */ }
    }
    this.activeAudio.clear()
  }

  seek(beat: number) {
    const wasPlaying = this.playing
    this.pausedAt = Math.max(0, beat)
    if (wasPlaying) void this.play(this.pausedAt)
  }

  panic() {
    const t = this.currentTime
    for (const inst of this.instruments.values()) inst.allNotesOff(t)
    this.stopAllAudio(t)
  }

  /** Drop any playing instance of a clip, so an edit takes effect immediately. */
  refreshAudio() {
    if (!this.playing) return
    this.stopAllAudio(this.currentTime)
    this.startedAudio.clear()
  }

  // --- live playing --------------------------------------------------------

  noteOn(trackId: string, midi: number, velocity = 0.85): NoteHandle | null {
    const inst = this.instruments.get(trackId)
    if (!inst || !this.ctx) return null
    return inst.noteOn(midi, this.ctx.currentTime + 0.005, velocity)
  }

  playNote(trackId: string, midi: number, durationSec = 0.5, velocity = 0.85) {
    const inst = this.instruments.get(trackId)
    if (!inst || !this.ctx) return
    inst.play(midi, this.ctx.currentTime + 0.005, durationSec, velocity)
  }

  /** Schedule a note at an absolute AudioContext time — used by previews. */
  playNoteAt(trackId: string, midi: number, time: number, durationSec: number, velocity = 0.85) {
    const inst = this.instruments.get(trackId)
    if (!inst || !this.ctx) return
    inst.play(midi, Math.max(time, this.ctx.currentTime), durationSec, velocity)
  }

  /** A single metronome click, independent of the transport. */
  scheduleClick(time: number, accent = false) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = accent ? 1600 : 1050
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, time)
    g.gain.linearRampToValueAtTime(accent ? 0.16 : 0.09, time + 0.001)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045)
    osc.connect(g).connect(this.master.gain)
    osc.start(time)
    osc.stop(time + 0.06)
  }

  // --- scheduling ----------------------------------------------------------

  private tick() {
    if (!this.playing || !this.ctx) return
    const now = this.ctx.currentTime
    const horizon = this.beatAt(now + LOOKAHEAD_SEC)
    const dispatched: { trackId: string; midi: number; time: number; duration: number }[] = []
    let guard = 0

    while (this.cursorBeat < horizon && guard++ < 64) {
      const songStart = this.songPos(this.cursorBeat)

      // End of song, when not looping.
      if (!this.loopEnabled && songStart >= this.songEndBeat) {
        const stopAt = this.timeAt(this.cursorBeat)
        setTimeout(() => {
          if (this.playing) { this.stop(this.songEndBeat); this.onStop?.() }
        }, Math.max(0, (stopAt - now) * 1000))
        return
      }

      // Advance only as far as the next loop boundary.
      let chunkEnd = horizon
      if (this.loopEnabled) {
        const len = this.loopEnd - this.loopStart
        if (len > 0) {
          if (this.cursorBeat < this.loopStart) chunkEnd = Math.min(horizon, this.loopStart)
          else chunkEnd = Math.min(horizon, this.cursorBeat + (this.loopEnd - songStart))
        }
      }
      if (chunkEnd <= this.cursorBeat) { this.cursorBeat += 0.0001; continue }

      const songEnd = songStart + (chunkEnd - this.cursorBeat)
      const offset = this.cursorBeat - songStart

      for (const note of this.noteSource(songStart, songEnd)) {
        const timelineBeat = note.startBeat + offset
        const time = this.timeAt(timelineBeat)
        if (time < now - 0.02) continue
        const inst = this.instruments.get(note.trackId)
        if (!inst) continue
        const duration = (note.durationBeats * 60) / this.bpm
        inst.play(note.midi, time, duration, note.velocity)
        dispatched.push({ trackId: note.trackId, midi: note.midi, time, duration })
      }

      this.scheduleAudio(songStart, songEnd, offset, now)

      if (this.metronome) this.scheduleMetronome(songStart, songEnd, offset)
      this.cursorBeat = chunkEnd
    }

    if (dispatched.length) this.onNotesScheduled?.(dispatched)
  }

  /**
   * Start any audio clip overlapping this window that hasn't been started for
   * the current loop pass. Clips already in progress when playback begins (or
   * when the loop wraps into the middle of one) start part-way through, which
   * is why this tracks instances rather than just clip starts.
   */
  private scheduleAudio(fromBeat: number, toBeat: number, offset: number, now: number) {
    if (!this.ctx || !this.master) return
    const pass = this.loopEnabled && this.loopEnd > this.loopStart
      ? Math.floor((this.cursorBeat - this.loopStart) / (this.loopEnd - this.loopStart))
      : 0

    for (const request of this.audioSource(fromBeat, toBeat)) {
      const key = `${request.clipId}:${pass}`
      if (this.startedAudio.has(key)) continue

      const channel = this.channels.get(request.trackId)
      if (!channel) continue
      const resolved = this.resolveAudio?.(request)
      if (!resolved) {
        this.onWarpNeeded?.(request)
        continue
      }
      this.startedAudio.add(key)

      const beatSec = 60 / this.bpm
      const timelineStart = this.timeAt(request.startBeat + offset)
      // How far into the clip we already are, if it started before this window.
      const lateBy = Math.max(0, now + 0.01 - timelineStart)
      const startAt = Math.max(now + 0.01, timelineStart)
      const remaining = request.lengthBeats * beatSec - lateBy
      if (remaining <= 0.02) continue

      // A pre-warped buffer already carries the tempo and pitch change, so it
      // plays at rate 1. Otherwise fall back to varispeed, which is what a
      // turntable does — audibly different, but never silent while a render
      // is still in flight.
      const rate = resolved.prewarped
        ? 1
        : request.speed * Math.pow(2, request.pitchSemitones / 12)
      const sourceOffset = resolved.prewarped
        ? request.offsetSec / Math.max(1e-6, request.speed) + lateBy
        : request.offsetSec + lateBy * rate

      const node = this.ctx.createBufferSource()
      node.buffer = resolved.buffer
      node.playbackRate.value = rate

      const gain = this.ctx.createGain()
      const level = Math.max(0.0001, request.gain)
      const fadeIn = Math.max(0.004, request.fadeInBeats * beatSec)
      const fadeOut = Math.max(0.004, request.fadeOutBeats * beatSec)
      gain.gain.setValueAtTime(lateBy > 0 ? level : 0.0001, startAt)
      if (lateBy <= 0) gain.gain.linearRampToValueAtTime(level, startAt + fadeIn)
      const endAt = startAt + remaining
      gain.gain.setValueAtTime(level, Math.max(startAt + fadeIn, endAt - fadeOut))
      gain.gain.linearRampToValueAtTime(0.0001, endAt)

      node.connect(gain).connect(channel.input)
      const playFor = resolved.prewarped ? remaining : remaining * rate
      try {
        node.start(startAt, Math.max(0, sourceOffset), Math.max(0.01, playFor))
      } catch {
        continue
      }

      const active = { node, gain }
      this.activeAudio.add(active)
      node.onended = () => {
        this.activeAudio.delete(active)
        try { gain.disconnect() } catch { /* noop */ }
      }
    }
  }

  private scheduleMetronome(fromBeat: number, toBeat: number, offset: number) {
    if (!this.ctx || !this.master) return
    const first = Math.ceil(fromBeat - 1e-6)
    for (let b = first; b < toBeat; b++) {
      if (b <= this.lastMetronomeBeat) continue
      this.lastMetronomeBeat = b
      const time = this.timeAt(b + offset)
      const downbeat = ((b % 4) + 4) % 4 === 0
      const osc = this.ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = downbeat ? 1600 : 1050
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, time)
      g.gain.linearRampToValueAtTime(downbeat ? 0.16 : 0.09, time + 0.001)
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045)
      osc.connect(g).connect(this.master.gain)
      osc.start(time)
      osc.stop(time + 0.06)
    }
  }

  // --- metering ------------------------------------------------------------

  private meterBuffer = new Float32Array(512)

  /** Peak level 0..1 for a track (or the master when trackId is omitted). */
  level(trackId?: string): number {
    const analyser = trackId ? this.channels.get(trackId)?.analyser : this.master?.analyser
    if (!analyser) return 0
    const buf = this.meterBuffer.length >= analyser.fftSize
      ? this.meterBuffer
      : (this.meterBuffer = new Float32Array(analyser.fftSize))
    analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
    let peak = 0
    for (let i = 0; i < analyser.fftSize; i++) {
      const v = Math.abs(buf[i])
      if (v > peak) peak = v
    }
    return peak
  }

  dispose() {
    this.stop()
    this.ticker.dispose()
    for (const id of [...this.instruments.keys()]) this.removeTrack(id)
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}

/** One engine per page. */
export const engine = new AudioEngine()
