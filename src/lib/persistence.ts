/**
 * Local project storage. Projects are small JSON documents (a few tens of KB
 * even for a busy arrangement), so localStorage is a good fit and keeps
 * everything on the user's machine.
 */

import { DEFAULT_CHANNEL } from '../audio/engine'
import { emptyProject, PROJECT_VERSION, type Project } from '../music/project'

const INDEX_KEY = 'overtone.index'
const PROJECT_KEY = (id: string) => `overtone.project.${id}`
const LAST_KEY = 'overtone.last'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: number
  bpm: number
  trackCount: number
}

function readIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as ProjectSummary[]) : []
  } catch {
    return []
  }
}

function writeIndex(entries: ProjectSummary[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch {
    /* quota or private mode — saving is best-effort */
  }
}

export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem(PROJECT_KEY(project.id), JSON.stringify(project))
    localStorage.setItem(LAST_KEY, project.id)
    const index = readIndex().filter((e) => e.id !== project.id)
    index.push({
      id: project.id, name: project.name, updatedAt: project.updatedAt,
      bpm: project.bpm, trackCount: project.tracks.length,
    })
    writeIndex(index)
    return true
  } catch {
    return false
  }
}

export function loadProject(id: string): Project | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY(id))
    if (!raw) return null
    return migrate(JSON.parse(raw) as Project)
  } catch {
    return null
  }
}

export function deleteProject(id: string) {
  try {
    localStorage.removeItem(PROJECT_KEY(id))
    writeIndex(readIndex().filter((e) => e.id !== id))
  } catch { /* noop */ }
}

export function loadLastProject(): Project | null {
  try {
    const id = localStorage.getItem(LAST_KEY)
    return id ? loadProject(id) : null
  } catch {
    return null
  }
}

/**
 * Bring an older saved project up to the current shape. Version 1 is the
 * first release, so this only fills in defaults for now — but the seam matters
 * the moment the format moves.
 */
export function migrate(project: Project): Project {
  const base = emptyProject()
  const merged: Project = {
    ...base,
    ...project,
    version: PROJECT_VERSION,
    master: { ...base.master, ...project.master },
    tracks: (project.tracks ?? []).map((t) => ({
      ...t,
      channel: { ...DEFAULT_CHANNEL, ...t.channel },
    })),
    clips: (project.clips ?? []).map((c) => ({
      ...c,
      contentBeats: c.contentBeats || c.lengthBeats || 16,
      notes: c.notes ?? [],
    })),
  }
  return merged
}

/** JSON file download — the portable, no-lock-in escape hatch. */
export function downloadProject(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${safeName(project.name)}.overtone.json`)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'overtone'
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Project
  if (!parsed.tracks || !parsed.clips) throw new Error('That does not look like an Overtone project.')
  return migrate(parsed)
}
