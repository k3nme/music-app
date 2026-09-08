/**
 * Share links. The whole project rides in the URL fragment — no server, no
 * account, nothing stored anywhere: open the link and the song is there.
 *
 * Fragments never leave the browser (they aren't sent in HTTP requests), so a
 * link is only as public as the person who shares it makes it.
 */

import { migrate } from './persistence'
import type { Project } from '../music/project'

const PREFIX = '#s='

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deflate(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

/** Strips the parts of a project that don't need to travel. */
function forSharing(project: Project): Project {
  return { ...project, name: project.name || 'Shared song' }
}

export async function createShareLink(project: Project): Promise<string> {
  const json = JSON.stringify(forSharing(project))
  const compressed = await deflate(json)
  // 'z' = deflated, 'p' = plain, so old links keep working if this changes.
  const payload = compressed
    ? `z${toBase64Url(compressed)}`
    : `p${toBase64Url(new TextEncoder().encode(json))}`
  return `${location.origin}${location.pathname}${PREFIX}${payload}`
}

export async function readShareLink(hash = location.hash): Promise<Project | null> {
  if (!hash.startsWith(PREFIX)) return null
  const payload = hash.slice(PREFIX.length)
  if (payload.length < 2) return null
  try {
    const bytes = fromBase64Url(payload.slice(1))
    const json = payload[0] === 'z'
      ? await inflate(bytes)
      : new TextDecoder().decode(bytes)
    if (!json) return null
    return migrate(JSON.parse(json) as Project)
  } catch {
    return null
  }
}

/** Roughly how long a link would be — browsers get unhappy past ~32k. */
export async function estimateShareSize(project: Project): Promise<number> {
  const link = await createShareLink(project)
  return link.length
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context and permission; fall back to a
    // temporary selection, which works from a user gesture almost everywhere.
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }
}
