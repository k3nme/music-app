/**
 * Project bundles: one file containing the arrangement *and* its audio.
 *
 * A project JSON only references samples by id, which is right for storage and
 * for share links but means the JSON alone is useless on another machine. A
 * bundle packs everything into a single portable file, so a project can be
 * backed up, emailed, or moved to another browser without losing its audio.
 *
 * The container is deliberately trivial — a magic string, a JSON header, then
 * the audio blobs end to end. No zip dependency, and the format is readable
 * enough that anything could unpack it.
 */

import { migrate } from './persistence'
import type { Project } from '../music/project'
import { projectSampleIds } from '../music/project'
import { getPreset, samplerSampleIds } from '../audio/instruments'
import type { PresetBase } from '../audio/types'
import {
  getSampleBlob, getSampleMeta, rememberSample, type SampleMeta,
} from './samples'

const MAGIC = 'OVTNBNDL'
const VERSION = 2

interface BundleHeader {
  version: number
  project: Project
  samples: { meta: SampleMeta; byteLength: number }[]
  /**
   * Sampled instruments the project plays. Without these a bundle opened
   * elsewhere would have tracks pointing at instruments that machine has never
   * heard of — which is exactly the silent substitution this app refuses to do
   * anywhere else.
   */
  instruments?: PresetBase[]
}

/** The user-made instruments a project's tracks actually use. */
export function projectInstruments(project: Project): PresetBase[] {
  const seen = new Set<string>()
  const out: PresetBase[] = []
  for (const track of project.tracks) {
    if (seen.has(track.presetId)) continue
    seen.add(track.presetId)
    const preset = getPreset(track.presetId)
    if (preset.id === track.presetId && preset.userMade) out.push(preset)
  }
  return out
}

/**
 * Waveform peaks are Float32Arrays. JSON turns those into objects with one
 * numbered key per sample — thousands of them, per file — so they are stripped
 * on the way out and recomputed when the audio is next decoded.
 */
function stripDrawingData(meta: SampleMeta): SampleMeta {
  const { peaks: _peaks, analysis, ...rest } = meta
  return analysis
    ? { ...rest, analysis: { ...analysis, peaks: new Float32Array(0) } }
    : rest
}

/** Pack a project, every sample it uses, and its own instruments into one blob. */
export async function createBundle(project: Project): Promise<Blob> {
  const instruments = projectInstruments(project)
  // A sampled instrument's audio is not referenced by any clip, so it has to
  // be gathered separately or the instrument would arrive silent.
  const ids = [...new Set([
    ...projectSampleIds(project),
    ...instruments.flatMap((preset) => samplerSampleIds(preset)),
  ])]
  const parts: BlobPart[] = []
  const samples: BundleHeader['samples'] = []

  for (const id of ids) {
    const blob = await getSampleBlob(id)
    const meta = getSampleMeta(id)
    if (!blob || !meta) continue
    samples.push({ meta: stripDrawingData(meta), byteLength: blob.size })
    parts.push(blob)
  }

  const header: BundleHeader = { version: VERSION, project, samples, instruments }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))

  const prefix = new Uint8Array(MAGIC.length + 4)
  for (let i = 0; i < MAGIC.length; i++) prefix[i] = MAGIC.charCodeAt(i)
  new DataView(prefix.buffer).setUint32(MAGIC.length, headerBytes.byteLength, true)

  return new Blob([prefix, headerBytes, ...parts], { type: 'application/octet-stream' })
}

export interface OpenedBundle {
  project: Project
  samples: { meta: SampleMeta; blob: Blob }[]
  instruments: PresetBase[]
}

export function isBundle(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < MAGIC.length + 4) return false
  const view = new Uint8Array(bytes, 0, MAGIC.length)
  return String.fromCharCode(...view) === MAGIC
}

/** Unpack a bundle. Throws with a readable message if it isn't one. */
export async function readBundle(file: Blob): Promise<OpenedBundle> {
  const bytes = await file.arrayBuffer()
  if (!isBundle(bytes)) throw new Error('That file is not an Overtone bundle.')

  const view = new DataView(bytes)
  const headerLength = view.getUint32(MAGIC.length, true)
  const headerStart = MAGIC.length + 4
  const headerEnd = headerStart + headerLength
  if (headerEnd > bytes.byteLength) throw new Error('This bundle looks truncated.')

  const header = JSON.parse(new TextDecoder().decode(bytes.slice(headerStart, headerEnd))) as BundleHeader
  if (header.version > VERSION) {
    throw new Error('This bundle was made by a newer version of Overtone.')
  }

  const samples: OpenedBundle['samples'] = []
  let offset = headerEnd
  for (const entry of header.samples ?? []) {
    const end = offset + entry.byteLength
    if (end > bytes.byteLength) throw new Error('This bundle is missing some of its audio.')
    samples.push({
      meta: entry.meta,
      blob: new Blob([bytes.slice(offset, end)], { type: entry.meta.mime || 'audio/wav' }),
    })
    offset = end
  }

  return { project: migrate(header.project), samples, instruments: header.instruments ?? [] }
}

/**
 * Put a bundle's audio into storage under its original ids, so the project's
 * clips resolve without rewriting anything.
 */
export async function installBundleSamples(
  bundle: OpenedBundle, put: (meta: SampleMeta, blob: Blob) => Promise<boolean>,
): Promise<void> {
  for (const { meta, blob } of bundle.samples) {
    rememberSample(meta)
    await put(meta, blob)
  }
}

export function bundleFilename(project: Project): string {
  const safe = project.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return `${safe || 'overtone'}.overtone`
}
