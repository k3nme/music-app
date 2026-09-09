/**
 * Overtone — raw PCM capture.
 *
 * MediaRecorder would hand back compressed audio, which is useless for pitch
 * analysis. This just forwards mono float blocks to the main thread, plus a
 * running peak so the UI can draw a live meter without a second analyser.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') this.recording = true
      else if (e.data.type === 'stop') this.recording = false
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const chan = input[0]
    if (!chan) return true

    let peak = 0
    for (let i = 0; i < chan.length; i++) {
      const v = chan[i] < 0 ? -chan[i] : chan[i]
      if (v > peak) peak = v
    }

    if (this.recording) {
      // Copy: the input buffer is reused by the host on the next quantum.
      this.port.postMessage({ type: 'block', data: new Float32Array(chan), peak }, [])
    } else {
      this.port.postMessage({ type: 'level', peak })
    }
    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
