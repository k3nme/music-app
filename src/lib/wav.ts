/** WAV encoding and decoding. Kept dependency-free so workers can use it too. */

export interface PcmData {
  channels: Float32Array[]
  sampleRate: number
}

/** 16-bit PCM WAV. Universally readable, and lossless. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const channelCount = Math.max(1, Math.min(2, channels.length))
  const frames = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = frames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  text(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function encodeWavFromBuffer(buffer: AudioBuffer): Blob {
  const channels = Array.from(
    { length: Math.min(2, buffer.numberOfChannels) },
    (_, c) => buffer.getChannelData(c),
  )
  return encodeWav(channels, buffer.sampleRate)
}

/**
 * Minimal WAV reader for the formats we write ourselves (16/24/32-bit PCM and
 * 32-bit float). Anything else — MP3, AAC, Opus — goes through the browser's
 * own decoder instead; this exists so workers can read stored samples without
 * an AudioContext.
 */
export function decodeWav(bytes: ArrayBuffer): PcmData | null {
  const view = new DataView(bytes)
  const tag = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3))

  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null

  let offset = 12
  let format = 1
  let channelCount = 2
  let sampleRate = 44100
  let bitsPerSample = 16
  let dataOffset = -1
  let dataSize = 0

  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      channelCount = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      dataOffset = body
      dataSize = Math.min(size, bytes.byteLength - body)
    }
    offset = body + size + (size % 2)
  }
  if (dataOffset < 0 || channelCount < 1) return null

  const bytesPerSample = bitsPerSample / 8
  const frames = Math.floor(dataSize / (bytesPerSample * channelCount))
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames))

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++) {
      const at = dataOffset + (i * channelCount + c) * bytesPerSample
      let value = 0
      if (format === 3 && bitsPerSample === 32) value = view.getFloat32(at, true)
      else if (bitsPerSample === 16) value = view.getInt16(at, true) / 0x8000
      else if (bitsPerSample === 24) {
        const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)
        value = raw / 0x800000
      } else if (bitsPerSample === 32) value = view.getInt32(at, true) / 0x80000000
      else if (bitsPerSample === 8) value = view.getUint8(at) / 128 - 1
      channels[c][i] = value
    }
  }
  return { channels, sampleRate }
}
