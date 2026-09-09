/**
 * Microphone capture. Raw float PCM via an AudioWorklet, because compressed
 * MediaRecorder output is no use for pitch analysis.
 */

export interface RecorderState {
  status: 'idle' | 'ready' | 'recording' | 'denied' | 'unsupported'
  level: number
}

export class MicRecorder {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private blocks: Float32Array[] = []
  private frames = 0

  sampleRate = 44100
  level = 0
  recording = false

  /** Called on every audio block while armed, for the live meter. */
  onLevel: ((peak: number) => void) | null = null

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  /** Asks for mic permission and wires up the capture graph. */
  async open(ctx: AudioContext): Promise<void> {
    if (this.node) return
    if (!this.supported) throw new Error('Microphone capture is not supported in this browser.')

    const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')
    await ctx.audioWorklet.addModule(`${base}/worklets/recorder-processor.js`)

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Processing that helps a phone call actively hurts pitch tracking.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    this.sampleRate = ctx.sampleRate
    this.source = ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(ctx, 'recorder-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    })
    this.node.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'block') {
        this.blocks.push(msg.data)
        this.frames += msg.data.length
      }
      this.level = msg.peak ?? 0
      this.onLevel?.(this.level)
    }
    this.source.connect(this.node)
    // The worklet has no audible output, but it must be pulled to run; a muted
    // gain node keeps the graph alive without feeding the mic back to speakers.
    const sink = ctx.createGain()
    sink.gain.value = 0
    this.node.connect(sink).connect(ctx.destination)
  }

  start() {
    if (!this.node) throw new Error('Microphone is not open')
    this.blocks = []
    this.frames = 0
    this.recording = true
    this.node.port.postMessage({ type: 'start' })
  }

  /** Stops and returns the take as one contiguous mono buffer. */
  stop(): Float32Array {
    this.recording = false
    this.node?.port.postMessage({ type: 'stop' })
    const out = new Float32Array(this.frames)
    let offset = 0
    for (const block of this.blocks) { out.set(block, offset); offset += block.length }
    this.blocks = []
    this.frames = 0
    return out
  }

  /** Seconds captured so far. */
  get elapsed(): number {
    return this.frames / this.sampleRate
  }

  close() {
    try { this.node?.disconnect() } catch { /* noop */ }
    try { this.source?.disconnect() } catch { /* noop */ }
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.node = null
    this.source = null
    this.stream = null
    this.blocks = []
    this.frames = 0
  }
}

export const recorder = new MicRecorder()
