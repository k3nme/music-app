import { describe, expect, it } from 'vitest'
import { bundleFilename, isBundle, readBundle } from '../bundle'
import { emptyProject } from '../../music/project'

/**
 * Builds a bundle by hand, mirroring createBundle's layout, so the reader can
 * be tested without a browser's IndexedDB.
 */
function packBundle(header: unknown, blobs: Uint8Array[]): Blob {
  const MAGIC = 'OVTNBNDL'
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const prefix = new Uint8Array(MAGIC.length + 4)
  for (let i = 0; i < MAGIC.length; i++) prefix[i] = MAGIC.charCodeAt(i)
  new DataView(prefix.buffer).setUint32(MAGIC.length, headerBytes.byteLength, true)
  return new Blob([prefix, headerBytes, ...blobs.map((b) => b as BlobPart)])
}

describe('bundle format', () => {
  it('recognises its own magic', async () => {
    const bundle = packBundle({ version: 1, project: emptyProject(), samples: [] }, [])
    expect(isBundle(await bundle.arrayBuffer())).toBe(true)
    expect(isBundle(new TextEncoder().encode('{"not":"a bundle"}').buffer)).toBe(false)
  })

  it('round-trips a project and its audio', async () => {
    const project = emptyProject('Bundled')
    const audio = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const meta = {
      id: 's1', name: 'Take', durationSec: 1, sampleRate: 44100, channels: 2,
      byteSize: audio.byteLength, mime: 'audio/wav', createdAt: 1,
    }
    const bundle = packBundle(
      { version: 1, project, samples: [{ meta, byteLength: audio.byteLength }] },
      [audio],
    )

    const opened = await readBundle(bundle)
    expect(opened.project.name).toBe('Bundled')
    expect(opened.samples).toHaveLength(1)
    expect(opened.samples[0].meta.id).toBe('s1')
    expect(new Uint8Array(await opened.samples[0].blob.arrayBuffer())).toEqual(audio)
  })

  it('keeps several samples in order', async () => {
    const a = new Uint8Array([1, 1, 1])
    const b = new Uint8Array([2, 2])
    const meta = (id: string, size: number) => ({
      id, name: id, durationSec: 1, sampleRate: 44100, channels: 1,
      byteSize: size, mime: 'audio/wav', createdAt: 1,
    })
    const bundle = packBundle({
      version: 1, project: emptyProject(),
      samples: [{ meta: meta('a', 3), byteLength: 3 }, { meta: meta('b', 2), byteLength: 2 }],
    }, [a, b])

    const opened = await readBundle(bundle)
    expect(opened.samples.map((s) => s.meta.id)).toEqual(['a', 'b'])
    expect(new Uint8Array(await opened.samples[1].blob.arrayBuffer())).toEqual(b)
  })

  it('rejects a file that is not a bundle', async () => {
    await expect(readBundle(new Blob(['hello']))).rejects.toThrow(/not an Overtone bundle/)
  })

  it('rejects a truncated bundle rather than returning half a project', async () => {
    const audio = new Uint8Array([1, 2, 3, 4])
    const meta = {
      id: 's1', name: 'Take', durationSec: 1, sampleRate: 44100, channels: 1,
      byteSize: 4, mime: 'audio/wav', createdAt: 1,
    }
    const full = packBundle(
      { version: 1, project: emptyProject(), samples: [{ meta, byteLength: 4 }] },
      [audio],
    )
    const bytes = await full.arrayBuffer()
    const truncated = new Blob([bytes.slice(0, bytes.byteLength - 2)])
    await expect(readBundle(truncated)).rejects.toThrow(/missing some of its audio/)
  })

  it('refuses a bundle from a newer version', async () => {
    const bundle = packBundle({ version: 99, project: emptyProject(), samples: [] }, [])
    await expect(readBundle(bundle)).rejects.toThrow(/newer version/)
  })

  it('migrates an old project shape on the way in', async () => {
    const old = { ...emptyProject('Old'), audioClips: undefined, tracks: [
      { id: 't1', name: 'T', presetId: 'warm-pad', channel: {}, muted: false, soloed: false, isDrum: false, color: 0 },
    ] }
    const bundle = packBundle({ version: 1, project: old, samples: [] }, [])
    const opened = await readBundle(bundle)
    expect(opened.project.audioClips).toEqual([])
    expect(opened.project.tracks[0].kind).toBe('midi')
  })

  it('names the file after the project', () => {
    expect(bundleFilename(emptyProject('My Song!'))).toBe('My-Song.overtone')
    expect(bundleFilename(emptyProject('***'))).toBe('overtone.overtone')
  })
})

describe('bundle size', () => {
  it('does not serialise waveform peaks into the header', async () => {
    // A Float32Array JSON-encodes as an object with one key per sample, which
    // would add hundreds of kilobytes per file to every bundle.
    const { createBundle } = await import('../bundle')
    const { rememberSample } = await import('../samples')
    const project = emptyProject('Peaky')
    rememberSample({
      id: 's-peaks', name: 'Big', durationSec: 1, sampleRate: 44100, channels: 1,
      byteSize: 10, mime: 'audio/wav', createdAt: 1,
      peaks: new Float32Array(4000).fill(0.5),
    })
    // No audio clips reference it, so the bundle should be tiny regardless.
    const bundle = await createBundle(project)
    expect(bundle.size).toBeLessThan(4000)
  })
})
