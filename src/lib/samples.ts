/**
 * Audio sample storage.
 *
 * Imported songs and separated stems are far too big for localStorage, so they
 * live in IndexedDB: the encoded bytes plus a small metadata record. Projects
 * only ever store a sample id, which keeps project JSON small and shareable.
 *
 * Decoded AudioBuffers are cached in memory for the session and re-decoded on
 * demand, so reopening a project doesn't have to hold every song in RAM.
 */

import { computePeaks, type AudioAnalysis } from '../audio/analysis/audio'
import { uid } from './id'
import { decodeWav, encodeWav } from './wav'

const DB_NAME = 'overtone-audio'
const DB_VERSION = 1
const META_STORE = 'samples'
const BLOB_STORE = 'blobs'

export interface SampleMeta {
  id: string
  name: string
  durationSec: number
  sampleRate: number
  channels: number
  byteSize: number
  mime: string
  createdAt: number
  /** Set when this sample was derived from another (a separated stem). */
  sourceId?: string
  stem?: string
  /**
   * Min/max pairs for drawing. Kept on the meta rather than only inside
   * `analysis`, because audio generated in-app (stems, mashup bounces,
   * recordings) needs a waveform immediately and may never be fully analysed.
   */
  peaks?: Float32Array
  analysis?: AudioAnalysis
}

/** Peaks for drawing, wherever they happen to live. */
export function samplePeaks(meta: SampleMeta | undefined): Float32Array | undefined {
  return meta?.peaks ?? meta?.analysis?.peaks
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.warn('[overtone] audio storage unavailable', request.error)
      resolve(null)
    }
  })
  return dbPromise
}

function transact<T>(
  stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then((db) => {
    if (!db) return null
    return new Promise<T | null>((resolve) => {
      const tx = db.transaction(stores, mode)
      const request = run(tx)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  })
}

// ---------------------------------------------------------------------------
// Runtime cache
// ---------------------------------------------------------------------------

const buffers = new Map<string, AudioBuffer>()
const metas = new Map<string, SampleMeta>()
const pending = new Map<string, Promise<AudioBuffer | null>>()

/** Buffers rendered by the warp engine, keyed by sample + warp parameters. */
const warped = new Map<string, AudioBuffer>()

export function warpKey(sampleId: string, speed: number, semitones: number): string {
  return `${sampleId}@${speed.toFixed(5)}#${semitones.toFixed(3)}`
}

export function getWarped(key: string): AudioBuffer | undefined {
  return warped.get(key)
}

export function putWarped(key: string, buffer: AudioBuffer) {
  // Bounded so a long session of tempo nudges can't grow without limit.
  if (warped.size > 24) {
    const oldest = warped.keys().next().value
    if (oldest) warped.delete(oldest)
  }
  warped.set(key, buffer)
}

export function clearWarpedFor(sampleId: string) {
  for (const key of [...warped.keys()]) {
    if (key.startsWith(`${sampleId}@`)) warped.delete(key)
  }
}

export function getSampleBuffer(id: string): AudioBuffer | undefined {
  return buffers.get(id)
}

export function getSampleMeta(id: string): SampleMeta | undefined {
  return metas.get(id)
}

export function knownSamples(): SampleMeta[] {
  return [...metas.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export function rememberSample(meta: SampleMeta, buffer?: AudioBuffer) {
  metas.set(meta.id, meta)
  if (buffer) buffers.set(meta.id, buffer)
}

// ---------------------------------------------------------------------------
// Import / create
// ---------------------------------------------------------------------------

export function bufferToChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
}

export function channelsToBuffer(
  ctx: BaseAudioContext, channels: Float32Array[], sampleRate: number,
): AudioBuffer {
  const buffer = ctx.createBuffer(
    Math.max(1, channels.length), channels[0]?.length ?? 1, sampleRate,
  )
  channels.forEach((data, c) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, c))
  return buffer
}

/** Decode a file the user dropped in, and remember it. */
export async function importAudioFile(
  ctx: BaseAudioContext, file: File | Blob, name?: string,
): Promise<{ meta: SampleMeta; buffer: AudioBuffer }> {
  const bytes = await file.arrayBuffer()
  // decodeAudioData detaches its input, so hand it a copy and keep the original
  // for storage.
  const buffer = await ctx.decodeAudioData(bytes.slice(0))

  const meta: SampleMeta = {
    id: uid('s'),
    name: name ?? ('name' in file && typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/, '') : 'Audio'),
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    byteSize: bytes.byteLength,
    mime: file.type || 'audio/wav',
    createdAt: Date.now(),
    // Draw something straight away; full analysis follows in a worker.
    peaks: computePeaks(buffer.getChannelData(0)),
  }

  rememberSample(meta, buffer)
  await persist(meta, new Blob([bytes], { type: meta.mime }))
  return { meta, buffer }
}

/** Store audio generated inside the app (a stem, a bounce, a recording). */
export async function createSample(
  ctx: BaseAudioContext, channels: Float32Array[], sampleRate: number,
  name: string, extra: Partial<SampleMeta> = {},
): Promise<{ meta: SampleMeta; buffer: AudioBuffer }> {
  const blob = encodeWav(channels, sampleRate)
  const buffer = channelsToBuffer(ctx, channels, sampleRate)
  const meta: SampleMeta = {
    id: uid('s'),
    name,
    durationSec: buffer.duration,
    sampleRate,
    channels: Math.min(2, channels.length),
    byteSize: blob.size,
    mime: 'audio/wav',
    createdAt: Date.now(),
    peaks: computePeaks(channels[0]),
    ...extra,
  }
  rememberSample(meta, buffer)
  await persist(meta, blob)
  return { meta, buffer }
}

/** Store a sample under an id chosen by the caller — used when opening a bundle. */
export async function putSample(meta: SampleMeta, blob: Blob): Promise<boolean> {
  rememberSample(meta)
  return persist(meta, blob)
}

async function persist(meta: SampleMeta, blob: Blob): Promise<boolean> {
  const db = await openDatabase()
  if (!db) return false
  return new Promise((resolve) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
    tx.objectStore(META_STORE).put(meta)
    tx.objectStore(BLOB_STORE).put(blob, meta.id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => {
      console.warn('[overtone] could not store audio', tx.error)
      resolve(false)
    }
  })
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Pull every stored sample's metadata into the runtime cache. */
export async function loadSampleIndex(): Promise<SampleMeta[]> {
  const all = await transact<SampleMeta[]>([META_STORE], 'readonly', (tx) =>
    tx.objectStore(META_STORE).getAll() as IDBRequest<SampleMeta[]>)
  for (const meta of all ?? []) metas.set(meta.id, meta)
  return all ?? []
}

/** Decode a stored sample, reusing the cached buffer when there is one. */
export function ensureSample(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(id)
  if (cached) return Promise.resolve(cached)
  const inFlight = pending.get(id)
  if (inFlight) return inFlight

  const load = (async () => {
    const blob = await transact<Blob>([BLOB_STORE], 'readonly', (tx) =>
      tx.objectStore(BLOB_STORE).get(id) as IDBRequest<Blob>)
    if (!blob) return null
    const bytes = await blob.arrayBuffer()
    try {
      const buffer = await ctx.decodeAudioData(bytes.slice(0))
      buffers.set(id, buffer)
      backfillPeaks(id, buffer)
      return buffer
    } catch {
      // Fall back to the built-in WAV reader for anything the platform
      // decoder refuses (it happens with some worker-written files).
      const pcm = decodeWav(bytes)
      if (!pcm) return null
      const buffer = channelsToBuffer(ctx, pcm.channels, pcm.sampleRate)
      buffers.set(id, buffer)
      backfillPeaks(id, buffer)
      return buffer
    } finally {
      pending.delete(id)
    }
  })()

  pending.set(id, load)
  return load
}

/**
 * Peaks are dropped when a sample travels (they don't survive JSON), so they
 * are rebuilt the first time the audio is decoded again.
 */
function backfillPeaks(id: string, buffer: AudioBuffer) {
  const meta = metas.get(id)
  if (!meta || (meta.peaks && meta.peaks.length > 0)) return
  meta.peaks = computePeaks(buffer.getChannelData(0))
  metas.set(id, meta)
}

/** Load every sample a project refers to. Returns the ids it couldn't find. */
export async function hydrateProjectSamples(
  ctx: BaseAudioContext, sampleIds: string[],
): Promise<string[]> {
  await loadSampleIndex()
  const missing: string[] = []
  await Promise.all(sampleIds.map(async (id) => {
    const buffer = await ensureSample(ctx, id)
    if (!buffer) missing.push(id)
  }))
  return missing
}

export async function deleteSample(id: string): Promise<void> {
  buffers.delete(id)
  metas.delete(id)
  clearWarpedFor(id)
  const db = await openDatabase()
  if (!db) return
  const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
  tx.objectStore(META_STORE).delete(id)
  tx.objectStore(BLOB_STORE).delete(id)
}

export async function getSampleBlob(id: string): Promise<Blob | null> {
  return (await transact<Blob>([BLOB_STORE], 'readonly', (tx) =>
    tx.objectStore(BLOB_STORE).get(id) as IDBRequest<Blob>)) ?? null
}

export async function updateSampleMeta(id: string, patch: Partial<SampleMeta>): Promise<void> {
  const existing = metas.get(id)
  if (!existing) return
  const merged = { ...existing, ...patch }
  metas.set(id, merged)
  const db = await openDatabase()
  if (!db) return
  const tx = db.transaction([META_STORE], 'readwrite')
  tx.objectStore(META_STORE).put(merged)
}

/** How much space the audio store is using, and what the browser allows. */
export async function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number }> {
  let usedBytes = 0
  for (const meta of metas.values()) usedBytes += meta.byteSize
  let quotaBytes = 0
  try {
    const estimate = await navigator.storage?.estimate?.()
    quotaBytes = estimate?.quota ?? 0
    if (estimate?.usage) usedBytes = Math.max(usedBytes, estimate.usage)
  } catch { /* not available everywhere */ }
  return { usedBytes, quotaBytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
