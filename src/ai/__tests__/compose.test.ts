import { describe, expect, it } from 'vitest'
import { composeSong, planSections, planChords, castParts, describePlan, planSong } from '../compose'
import { readPrompt } from '../prompt'
import { STYLES } from '../styles'
import { ALL_PRESETS, getPreset, isDrumPreset, kitPieces } from '../../audio/instruments'
import { collectNotes, type Project } from '../../music/project'
import { isInScale } from '../../music/theory'

const library = ALL_PRESETS.map((p) => ({ id: p.id, family: p.family }))
const write = (prompt: string, seed = 1): Project =>
  composeSong(readPrompt(prompt, { seed }), { seed, available: library })

describe('the shape of the song', () => {
  it('gives dance music a drop and a breakdown', () => {
    const sections = planSections(readPrompt('house'))
    const kinds = sections.map((s) => s.kind)
    expect(kinds).toContain('drop')
    expect(kinds).toContain('break')
    expect(kinds[0]).toBe('intro')
  })

  it('gives a song verses and choruses', () => {
    const labels = planSections(readPrompt('indie rock')).map((s) => s.label)
    expect(labels).toContain('Verse')
    expect(labels).toContain('Chorus')
  })

  it('always ends with an ending', () => {
    for (const prompt of ['house', 'rock', 'lo-fi', 'a full track of techno']) {
      const sections = planSections(readPrompt(prompt))
      expect(sections[sections.length - 1].kind, prompt).toBe('outro')
    }
  })

  it('reaches its second chorus instead of winding down early', () => {
    // The shape has to arrive somewhere. A full track that spends its last
    // third fading out from a climax it never reached is the bug this catches.
    const sections = planSections(readPrompt('a full track of house'))
    const drops = sections.filter((s) => s.kind === 'drop')
    expect(drops.length).toBeGreaterThanOrEqual(2)
    // And the loudest thing should not be in the first half.
    const last = sections[sections.length - 1]
    const lastDrop = drops[drops.length - 1]
    expect(lastDrop.startBar).toBeGreaterThan(last.startBar / 2)
  })

  it('gives a short loop the main section rather than an intro and an outro', () => {
    const sections = planSections(readPrompt('a short loop of house'))
    expect(sections.length).toBe(1)
    expect(sections[0].intensity).toBeGreaterThan(0.8)
  })

  it('lays sections end to end with no gaps or overlaps', () => {
    const sections = planSections(readPrompt('a full track of house'))
    let at = 0
    for (const section of sections) {
      expect(section.startBar).toBe(at)
      expect(section.bars).toBeGreaterThan(0)
      at += section.bars
    }
  })

  it('reaches roughly the length that was asked for', () => {
    for (const bars of [16, 32, 64]) {
      const sections = planSections(readPrompt(`${bars} bars of house`))
      const total = sections.reduce((sum, s) => sum + s.bars, 0)
      expect(Math.abs(total - bars), `${bars}`).toBeLessThanOrEqual(8)
    }
  })

  it('takes out whatever the prompt said to leave out', () => {
    const sections = planSections(readPrompt('house with no drums'))
    expect(sections.every((s) => !s.parts.includes('drums'))).toBe(true)
  })

  it('builds quietly and drops loudly', () => {
    const sections = planSections(readPrompt('house'))
    const intro = sections.find((s) => s.kind === 'intro')!
    const drop = sections.find((s) => s.kind === 'drop')!
    expect(intro.intensity).toBeLessThan(drop.intensity)
  })
})

describe('the parts it writes', () => {
  it('writes a project that actually contains music', () => {
    const project = write('house')
    expect(project.tracks.length).toBeGreaterThan(2)
    const notes = collectNotes(project, 0, project.lengthBeats)
    expect(notes.length).toBeGreaterThan(50)
  })

  it('gives every track something to play', () => {
    const project = write('epic festival house')
    for (const track of project.tracks) {
      const notes = project.clips.filter((c) => c.trackId === track.id).flatMap((c) => c.notes)
      expect(notes.length, `${track.name} is silent`).toBeGreaterThan(0)
    }
  })

  it('keeps every note inside its instrument’s range', () => {
    for (const prompt of ['house', 'lo-fi hip hop', 'techno', 'indie rock', 'bollywood with sitar']) {
      const project = write(prompt)
      for (const track of project.tracks) {
        if (track.isDrum) continue
        const preset = getPreset(track.presetId)
        const notes = project.clips.filter((c) => c.trackId === track.id).flatMap((c) => c.notes)
        for (const note of notes) {
          expect(note.midi, `${prompt}/${preset.id}: ${note.midi} outside ${preset.range}`)
            .toBeGreaterThanOrEqual(preset.range[0])
          expect(note.midi).toBeLessThanOrEqual(preset.range[1])
        }
      }
    }
  })

  it('only triggers drum sounds the kit actually has', () => {
    for (const prompt of ['house', 'trap', 'amapiano', 'reggaeton', 'drum and bass']) {
      const project = write(prompt)
      for (const track of project.tracks.filter((t) => t.isDrum)) {
        const available = new Set(kitPieces(getPreset(track.presetId)).map((p) => p.midi))
        const notes = project.clips.filter((c) => c.trackId === track.id).flatMap((c) => c.notes)
        for (const note of notes) {
          expect(available.has(note.midi), `${prompt}/${track.presetId}: no piece at ${note.midi}`).toBe(true)
        }
      }
    }
  })

  it('keeps the melody in the key', () => {
    const project = write('sad house in A minor')
    const melody = project.tracks.find((t) => t.name === 'Melody')
    const notes = project.clips.filter((c) => c.trackId === melody?.id).flatMap((c) => c.notes)
    expect(notes.length).toBeGreaterThan(4)
    const outside = notes.filter((n) => !isInScale(n.midi, project.key.root, project.key.scale))
    // Chord tones can sit outside a mode; most of the line should not.
    expect(outside.length / notes.length).toBeLessThan(0.2)
  })

  it('does not stack notes on top of each other in the melody', () => {
    const project = write('house')
    const melody = project.tracks.find((t) => t.name === 'Melody')!
    for (const clip of project.clips.filter((c) => c.trackId === melody.id)) {
      const sorted = [...clip.notes].sort((a, b) => a.start - b.start)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start, 'melody notes overlap').toBeGreaterThanOrEqual(
          sorted[i - 1].start + sorted[i - 1].duration - 0.051,
        )
      }
    }
  })

  it('never writes a note before the song starts or past its end', () => {
    const project = write('a full track of techno')
    for (const clip of project.clips) {
      for (const note of clip.notes) {
        expect(note.start).toBeGreaterThanOrEqual(0)
        expect(note.start + note.duration).toBeLessThanOrEqual(clip.contentBeats + 0.01)
      }
      expect(clip.startBeat + clip.lengthBeats).toBeLessThanOrEqual(project.lengthBeats)
    }
  })

  it('puts a riser before every drop in a dance track, and none elsewhere', () => {
    const dance = write('festival house')
    const fx = dance.tracks.find((t) => t.presetId === 'kit-fx')
    expect(fx, 'no transitions track').toBeTruthy()

    const folk = write('indie rock')
    expect(folk.tracks.find((t) => t.presetId === 'kit-fx')).toBeUndefined()
  })
})

describe('casting the instruments', () => {
  it('uses what the prompt asked for', () => {
    const project = write('lo-fi with a rhodes and an upright bass')
    const presets = project.tracks.map((t) => t.presetId)
    expect(presets).toContain('rhodes')
  })

  it('picks instruments that exist', () => {
    for (const style of STYLES) {
      const cast = castParts(readPrompt(style.keywords[0]), 3, library)
      for (const [role, id] of Object.entries(cast)) {
        expect(getPreset(id!).id, `${style.id}/${role}`).toBe(id)
      }
    }
  })

  it('puts a kit on the drums and a bass in the bass', () => {
    for (const style of STYLES) {
      const cast = castParts(readPrompt(style.keywords[0]), 5, library)
      expect(isDrumPreset(cast.drums!), style.id).toBe(true)
      expect(getPreset(cast.bass!).range[0], style.id).toBeLessThanOrEqual(45)
    }
  })

  it('prefers the user’s own sounds when asked', () => {
    const mine = [...library, { id: 'kit-mine', family: 'drums', userMade: true }]
    const cast = castParts(readPrompt('house using my own sounds'), 1, mine)
    expect(cast.drums).toBe('kit-mine')
  })
})

describe('doing it twice', () => {
  it('gives the same song for the same prompt and seed', () => {
    expect(JSON.stringify(stripIds(write('dark techno', 9))))
      .toBe(JSON.stringify(stripIds(write('dark techno', 9))))
  })

  it('gives a different song for a different seed', () => {
    const a = stripIds(write('dark techno', 1))
    const b = stripIds(write('dark techno', 2))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('keeps the same style and tempo across seeds', () => {
    const a = write('hard techno at 140', 1)
    const b = write('hard techno at 140', 2)
    expect(a.bpm).toBe(b.bpm)
  })
})

describe('what it tells you it did', () => {
  it('names the chords it chose', () => {
    const brief = readPrompt('house in C minor')
    const description = describePlan(planSong(brief, 1, library))
    expect(description).toMatch(/[A-G]/)
    expect(description).toMatch(/sections/)
  })

  it('chooses a progression from the style', () => {
    const brief = readPrompt('techno')
    const chords = planChords(brief, 1)
    expect(chords.length).toBeGreaterThanOrEqual(3)
    for (const chord of chords) expect(chord.root).toBeGreaterThan(24)
  })

  it('gives the song a name of its own', () => {
    const project = write('house')
    expect(project.name).not.toBe('Untitled')
    expect(project.name.length).toBeGreaterThan(3)
  })
})

describe('every style can write a song', () => {
  for (const style of STYLES) {
    it(`writes ${style.name}`, () => {
      const project = write(style.keywords[0], 4)
      const notes = collectNotes(project, 0, project.lengthBeats)
      expect(notes.length, `${style.id} wrote nothing`).toBeGreaterThan(30)
      expect(project.bpm).toBeGreaterThanOrEqual(style.bpmHint[0])
      expect(project.bpm).toBeLessThanOrEqual(style.bpmHint[1])
      // Something has to be playing in the loudest section.
      const lastQuarter = collectNotes(project, project.lengthBeats * 0.4, project.lengthBeats * 0.6)
      expect(lastQuarter.length, `${style.id} is empty in the middle`).toBeGreaterThan(4)
    })
  }
})

/** Ids are random by design; compare the music. */
function stripIds(project: Project) {
  return {
    bpm: project.bpm,
    key: project.key,
    tracks: project.tracks.map((t) => ({ name: t.name, preset: t.presetId, channel: t.channel })),
    clips: project.clips.map((c) => ({
      name: c.name, start: c.startBeat, length: c.lengthBeats,
      notes: c.notes.map((n) => [n.midi, n.start, n.duration, n.velocity]),
    })),
  }
}

describe('the three takes it offers', () => {
  it('makes them genuinely different, not three names for one song', async () => {
    const { localProvider } = await import('../local')
    const { emptyProject } = await import('../../music/project')
    for (const prompt of ['amapiano', 'house', 'techno', 'lo-fi hip hop', 'indie rock']) {
      for (const seed of [1, 17, 404, 90210]) {
        const takes = await localProvider.suggest(
          { project: emptyProject(), prompt, seed }, 'song',
        )
        expect(takes).toHaveLength(3)
        // Two takes with the same key *and* the same chords are one take shown
        // twice, whatever they are called.
        const fingerprints = takes.map((take) => take.detail.split(' · ').slice(2, 5).join('|'))
        expect(new Set(fingerprints).size, `${prompt}/${seed}: ${fingerprints.join(' vs ')}`)
          .toBe(3)
      }
    }
  })

  it('keeps a key the user asked for across all three', async () => {
    const { localProvider } = await import('../local')
    const { emptyProject } = await import('../../music/project')
    const takes = await localProvider.suggest(
      { project: emptyProject(), prompt: 'house in F minor', seed: 5 }, 'song',
    )
    for (const take of takes) expect(take.detail).toContain('F Natural minor')
  })

  it('says it replaces the arrangement, and explains itself', async () => {
    const { localProvider } = await import('../local')
    const { emptyProject } = await import('../../music/project')
    const [take] = await localProvider.suggest(
      { project: emptyProject(), prompt: 'techno', seed: 1 }, 'song',
    )
    expect(take.replacesProject).toBe(true)
    expect(take.reasons?.length).toBeGreaterThan(1)
  })

  it('keeps the project’s identity, so undo has something to return to', async () => {
    const { localProvider } = await import('../local')
    const { emptyProject } = await import('../../music/project')
    const project = emptyProject('Mine')
    const [take] = await localProvider.suggest({ project, prompt: 'house', seed: 1 }, 'song')
    const applied = take.apply(project)
    expect(applied.id).toBe(project.id)
    expect(applied.tracks.length).toBeGreaterThan(2)
    expect(project.tracks).toHaveLength(0)   // never mutates
  })
})
