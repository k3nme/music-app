/**
 * Overtone — extended Karplus-Strong string processor.
 *
 * One AudioWorkletNode renders every voice of a plucked instrument. A native
 * DelayNode feedback loop can't do this: Web Audio forces a one-render-quantum
 * (128 sample) minimum delay inside a cycle, which caps the pitch at ~344 Hz.
 * Here the delay line is a plain circular buffer with a fractional read, so any
 * pitch works and the loop filter is exactly the one we want.
 *
 * Extras beyond textbook KS:
 *  - pluck position comb on the excitation (where you pick changes the timbre)
 *  - a pickup comb on the output
 *  - an allpass stage for inharmonicity (stiff strings: piano-ish, steel)
 *  - a nonlinear "jawari" bridge stage that gives the sitar its buzz
 *  - per-note release damping so note-offs mute the string instead of cutting it
 */

const MIN_FREQ = 20

class PluckProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    /** @type {Array<object>} */
    this.voices = []
    /** @type {Array<object>} */
    this.pending = []
    this.maxVoices = 24
    this.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'note') {
        this.pending.push(msg)
      } else if (msg.type === 'release') {
        for (const v of this.voices) {
          if (v.id === msg.id && v.releaseAt === Infinity) v.releaseAt = msg.when
        }
      } else if (msg.type === 'allOff') {
        for (const v of this.voices) if (v.releaseAt === Infinity) v.releaseAt = msg.when
        this.pending.length = 0
      } else if (msg.type === 'config') {
        this.maxVoices = msg.maxVoices || 24
      }
    }
  }

  makeVoice(msg) {
    const sr = sampleRate
    const freq = Math.max(MIN_FREQ, msg.freq)
    const p = msg.params || {}
    const len = Math.ceil(sr / MIN_FREQ) + 8
    const delaySamples = sr / freq

    const buf = new Float32Array(len)
    // --- excitation -------------------------------------------------------
    const n = Math.min(len - 1, Math.ceil(delaySamples))
    const pluckPos = Math.max(0.02, Math.min(0.5, p.pluckPosition ?? 0.22))
    const posOffset = Math.floor(n * pluckPos)
    const noise = new Float32Array(n)
    const tone = p.excitationTone ?? 0.5 // 0 = pure noise (soft), 1 = pick-like edge
    let lp = 0
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1
      lp += (white - lp) * (0.15 + tone * 0.8)
      noise[i] = lp
    }
    // Comb the excitation: plucking near the bridge cancels low partials.
    for (let i = 0; i < n; i++) {
      const j = i - posOffset
      buf[i] = noise[i] - (j >= 0 ? noise[j] : 0)
    }
    // A gentle window stops the burst clicking at its tail.
    for (let i = 0; i < n; i++) buf[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.15

    const vel = Math.max(0.02, Math.min(1, msg.velocity ?? 0.8))
    const amp = vel * vel * 0.8 + vel * 0.2
    for (let i = 0; i < n; i++) buf[i] *= amp

    // Decay: `sustain` sets seconds to -60dB, scaled so low notes ring longer.
    const sustainSec = (p.sustain ?? 2.2) * Math.pow(freq / 220, -(p.decayKeyScale ?? 0.35))
    const decay = Math.pow(0.001, delaySamples / (sustainSec * sr))

    return {
      id: msg.id,
      buf,
      len,
      writeIdx: n % len,
      delaySamples,
      // one-pole loop damping: higher = darker, faster high-frequency loss
      damping: Math.max(0.02, Math.min(0.96, p.damping ?? 0.35)),
      decay: Math.min(0.99995, decay),
      lpState: 0,
      apState: 0,
      apCoef: p.inharmonicity ?? 0,
      buzz: p.buzz ?? 0,
      buzzThresh: p.buzzThreshold ?? 0.12,
      pickup: Math.max(0, Math.min(0.5, p.pickup ?? 0)),
      pickupBuf: new Float32Array(Math.max(2, Math.ceil(delaySamples * 0.5))),
      pickupIdx: 0,
      gain: p.level ?? 1,
      startSample: msg.startSample,
      releaseAt: msg.releaseAt ?? Infinity,
      releaseDamp: p.releaseDamp ?? 12,
      env: 1,
      dead: false,
      energy: 1,
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const chan = out[0]
    const frames = chan.length
    const sr = sampleRate
    const blockStart = currentTime

    // Promote any pending notes whose start falls inside (or before) this block.
    if (this.pending.length) {
      const blockEnd = blockStart + frames / sr
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const msg = this.pending[i]
        if (msg.when < blockEnd) {
          const offset = Math.max(0, Math.round((msg.when - blockStart) * sr))
          if (offset < frames) {
            const v = this.makeVoice({ ...msg, startSample: offset })
            this.voices.push(v)
            this.pending.splice(i, 1)
          }
        }
      }
      if (this.voices.length > this.maxVoices) {
        const excess = this.voices.length - this.maxVoices
        for (let i = 0; i < excess; i++) {
          if (this.voices[i].releaseAt === Infinity) this.voices[i].releaseAt = blockStart
        }
      }
    }

    chan.fill(0)

    for (let vi = this.voices.length - 1; vi >= 0; vi--) {
      const v = this.voices[vi]
      const start = v.startSample || 0
      v.startSample = 0
      let peak = 0

      for (let i = start; i < frames; i++) {
        const t = blockStart + i / sr
        // Note-off damps the string rather than gating it — physical and clickless.
        if (t >= v.releaseAt) {
          v.env *= Math.exp(-v.releaseDamp / sr)
          if (v.env < 0.0005) { v.dead = true; break }
        }

        // Fractional-delay read from the circular buffer.
        const readPos = v.writeIdx - v.delaySamples
        const rp = readPos < 0 ? readPos + v.len : readPos
        const i0 = Math.floor(rp)
        const frac = rp - i0
        const s0 = v.buf[i0 % v.len]
        const s1 = v.buf[(i0 + 1) % v.len]
        let s = s0 + (s1 - s0) * frac

        // Loop damping (one-pole low-pass): the string loses highs first.
        v.lpState = s * (1 - v.damping) + v.lpState * v.damping
        s = v.lpState

        // Allpass dispersion — stiff strings stretch their partials sharp.
        if (v.apCoef > 0.0001) {
          const y = -v.apCoef * s + v.apState
          v.apState = s + v.apCoef * y
          s = y
        }

        // Jawari bridge: the string grazes a curved bridge and buzzes.
        if (v.buzz > 0.0001) {
          const a = Math.abs(s)
          if (a > v.buzzThresh) {
            const over = a - v.buzzThresh
            s = Math.sign(s) * (v.buzzThresh + Math.tanh(over * (2 + v.buzz * 14)) / (1 + v.buzz * 3))
          }
          s += Math.tanh(s * (1 + v.buzz * 6)) * v.buzz * 0.18
        }

        s *= v.decay
        v.buf[v.writeIdx] = s
        v.writeIdx = (v.writeIdx + 1) % v.len

        let o = s
        // Pickup position comb on the output.
        if (v.pickup > 0.001) {
          const pl = v.pickupBuf.length
          const pIdx = (v.pickupIdx + pl - Math.max(1, Math.floor(pl * v.pickup * 2))) % pl
          o = s - v.pickupBuf[pIdx] * 0.7
          v.pickupBuf[v.pickupIdx] = s
          v.pickupIdx = (v.pickupIdx + 1) % pl
        }

        o *= v.env * v.gain
        chan[i] += o
        const ao = o < 0 ? -o : o
        if (ao > peak) peak = ao
      }

      // Track decay so exhausted strings free their buffers.
      v.energy = v.energy * 0.85 + peak * 0.15
      if (v.dead || (v.energy < 0.00008 && blockStart > 0)) this.voices.splice(vi, 1)
    }

    // Copy mono to any remaining channels.
    for (let c = 1; c < out.length; c++) out[c].set(chan)
    return true
  }
}

registerProcessor('pluck-processor', PluckProcessor)
