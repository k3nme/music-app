import { describe, expect, it } from 'vitest'
import { localProvider } from '../local'
import { demoProject } from '../../music/demo'
import { collectNotes, emptyProject, type Project } from '../../music/project'
import { getPreset, kitPieces } from '../../audio/instruments'

const ctx = (project: Project, clipId?: string) => ({ project, clipId: clipId ?? project.clips[0]?.id })

describe('local provider', () => {
  it('advertises what it can actually do', () => {
    expect(localProvider.remote).toBe(false)
    expect(localProvider.capabilities).toContain('chords')
  })

  it('suggests chords that fit the written melody', async () => {
    const project = demoProject()
    const suggestions = await localProvider.suggest(ctx(project), 'chords')
    expect(suggestions.length).toBeGreaterThan(0)
    // The demo is in A minor, so the fitted progression should start on Am.
    expect(suggestions[0].title.startsWith('A')).toBe(true)
  })

  it('never mutates the project it is given', async () => {
    const project = demoProject()
    const before = JSON.stringify(project)
    const suggestions = await localProvider.suggest(ctx(project), 'drums')
    suggestions[0].apply(project)
    expect(JSON.stringify(project)).toBe(before)
  })

  it('produces a project that actually schedules notes', async () => {
    const project = emptyProject()
    const [drums] = await localProvider.suggest(ctx(project), 'drums')
    const withDrums = drums.apply(project)
    expect(withDrums.tracks).toHaveLength(1)
    const scheduled = collectNotes(withDrums, 0, 4)
    expect(scheduled.length).toBeGreaterThan(4)
    expect(scheduled.every((n) => n.velocity > 0 && n.durationBeats > 0)).toBe(true)
  })

  it('offers a groove for every kit it names, and only sounds that kit has', async () => {
    const project = emptyProject()
    const suggestions = await localProvider.suggest(ctx(project), 'drums')
    // A pattern pointing at a piece the kit doesn't have is silent, not an
    // error — exactly the kind of thing that survives a manual look.
    for (const suggestion of suggestions) {
      const applied = suggestion.apply(project)
      const track = applied.tracks[applied.tracks.length - 1]
      const available = new Set(kitPieces(getPreset(track.presetId)).map((p) => p.midi))
      const notes = collectNotes(applied, 0, applied.lengthBeats)
      expect(notes.length, suggestion.title).toBeGreaterThan(4)
      for (const note of notes) {
        expect(available.has(note.midi), `${suggestion.title}: no piece at ${note.midi}`).toBe(true)
      }
    }
  })

  it('keeps a harmony line inside the key', async () => {
    const project = demoProject()
    const melodyClip = project.clips.find((c) => c.name === 'Melody')!
    const suggestions = await localProvider.suggest(ctx(project, melodyClip.id), 'harmony')
    expect(suggestions.length).toBeGreaterThan(0)

    const harmonised = suggestions[0].apply(project)
    const added = harmonised.clips[harmonised.clips.length - 1]
    expect(added.notes).toHaveLength(melodyClip.notes.length)

    // A minor: every note should land on a pitch class of the scale.
    const allowed = new Set([9, 11, 0, 2, 4, 5, 7])
    expect(added.notes.every((n) => allowed.has(((n.midi % 12) + 12) % 12))).toBe(true)
  })

  it('returns nothing for harmony when no melodic clip is selected', async () => {
    const project = demoProject()
    const drumClip = project.clips.find((c) => c.name === 'Drums')!
    expect(await localProvider.suggest(ctx(project, drumClip.id), 'harmony')).toHaveLength(0)
  })

  it('bass suggestions sit in a real bass register', async () => {
    const project = demoProject()
    const suggestions = await localProvider.suggest(ctx(project), 'bass')
    for (const suggestion of suggestions) {
      const applied = suggestion.apply(project)
      const clip = applied.clips[applied.clips.length - 1]
      expect(clip.notes.length).toBeGreaterThan(0)
      for (const note of clip.notes) {
        expect(note.midi).toBeGreaterThanOrEqual(24)
        expect(note.midi).toBeLessThanOrEqual(52)
      }
    }
  })
})
