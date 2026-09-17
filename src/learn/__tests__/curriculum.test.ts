import { describe, expect, it } from 'vitest'
import { ALL_LESSONS, CURRICULUM, allTerms, findLesson, lessonTerms, nextLesson, previousLesson } from '../curriculum'
import { getPreset, isDrumPreset, kitPieces } from '../../audio/instruments'
import type { Demo } from '../types'

/** Every demo in the curriculum, with where it came from. */
function allDemos(): { demo: Demo; lessonId: string }[] {
  const out: { demo: Demo; lessonId: string }[] = []
  for (const lesson of ALL_LESSONS) {
    for (const block of lesson.blocks) {
      if (block.kind === 'demo') out.push({ demo: block.demo, lessonId: lesson.id })
      if (block.kind === 'compare') {
        for (const option of block.comparison.options) out.push({ demo: option, lessonId: lesson.id })
      }
    }
  }
  return out
}

describe('curriculum shape', () => {
  it('has all eight modules in order', () => {
    expect(CURRICULUM.map((m) => m.id)).toEqual([
      'sound', 'notes', 'scales', 'chords', 'rhythm', 'instruments', 'arranging', 'overtone',
    ])
  })

  it('gives every lesson a unique id', () => {
    const ids = ALL_LESSONS.map((lesson) => lesson.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every lesson a title, a summary and some blocks', () => {
    for (const lesson of ALL_LESSONS) {
      expect(lesson.title.length, lesson.id).toBeGreaterThan(3)
      expect(lesson.summary.length, lesson.id).toBeGreaterThan(10)
      expect(lesson.blocks.length, lesson.id).toBeGreaterThan(1)
    }
  })

  it('pairs explanation with sound — every lesson that teaches a concept can be heard', () => {
    // The app modules are a tour, so they're allowed to be text only.
    const conceptLessons = ALL_LESSONS.filter(
      (lesson) => !lesson.id.startsWith('ot-') && lesson.id !== 'inst-choosing',
    )
    for (const lesson of conceptLessons) {
      const audible = lesson.blocks.some((b) => b.kind === 'demo' || b.kind === 'compare')
      expect(audible, `${lesson.id} has no playable demo`).toBe(true)
    }
  })

  it('walks forward and back across module boundaries', () => {
    expect(previousLesson(ALL_LESSONS[0].id)).toBeNull()
    expect(nextLesson(ALL_LESSONS[ALL_LESSONS.length - 1].id)).toBeNull()
    // Last lesson of module one leads into module two.
    const lastOfFirst = CURRICULUM[0].lessons[CURRICULUM[0].lessons.length - 1]
    expect(nextLesson(lastOfFirst.id)?.id).toBe(CURRICULUM[1].lessons[0].id)
  })

  it('finds a lesson and the module it belongs to', () => {
    const found = findLesson('inst-brass')
    expect(found?.module.id).toBe('instruments')
    expect(found?.lesson.title).toContain('Brass')
    expect(findLesson('no-such-lesson')).toBeNull()
  })
})

describe('every demo is playable', () => {
  const demos = allDemos()

  it('has demos to check', () => {
    expect(demos.length).toBeGreaterThan(60)
  })

  it('names instruments that actually exist', () => {
    for (const { demo, lessonId } of demos) {
      for (const voice of demo.voices) {
        const preset = getPreset(voice.preset)
        // getPreset falls back to the first preset for unknown ids, so compare.
        expect(preset.id, `${lessonId}: unknown preset "${voice.preset}"`).toBe(voice.preset)
      }
    }
  })

  it('plays notes inside each instrument’s range', () => {
    for (const { demo, lessonId } of demos) {
      for (const voice of demo.voices) {
        const preset = getPreset(voice.preset)
        if (isDrumPreset(voice.preset)) continue
        for (const [midi] of voice.notes) {
          expect(midi, `${lessonId}/${voice.preset}: ${midi} is outside ${preset.range}`)
            .toBeGreaterThanOrEqual(preset.range[0])
          expect(midi).toBeLessThanOrEqual(preset.range[1])
        }
      }
    }
  })

  it('only triggers drum sounds that exist in the kit', () => {
    for (const { demo, lessonId } of demos) {
      for (const voice of demo.voices) {
        if (!isDrumPreset(voice.preset)) continue
        const available = new Set(kitPieces(getPreset(voice.preset)).map((p) => p.midi))
        for (const [midi] of voice.notes) {
          expect(available.has(midi), `${lessonId}/${voice.preset}: no piece at ${midi}`).toBe(true)
        }
      }
    }
  })

  it('uses sane timings', () => {
    for (const { demo, lessonId } of demos) {
      expect(demo.bpm ?? 96, lessonId).toBeGreaterThan(30)
      expect(demo.bpm ?? 96, lessonId).toBeLessThan(220)
      for (const voice of demo.voices) {
        expect(voice.notes.length, `${lessonId} has an empty voice`).toBeGreaterThan(0)
        for (const [, start, length, velocity] of voice.notes) {
          expect(start, lessonId).toBeGreaterThanOrEqual(0)
          expect(length, lessonId).toBeGreaterThan(0)
          if (velocity !== undefined) {
            expect(velocity, lessonId).toBeGreaterThan(0)
            expect(velocity, lessonId).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('keeps demos short enough to sit through', () => {
    for (const { demo, lessonId } of demos) {
      const beats = Math.max(...demo.voices.flatMap((v) => v.notes.map(([, s, l]) => s + l)))
      const seconds = (beats * 60) / (demo.bpm ?? 96)
      expect(seconds, `${lessonId} runs ${seconds.toFixed(1)}s`).toBeLessThan(25)
    }
  })
})

describe('glossary', () => {
  it('collects terms from across the curriculum', () => {
    const terms = allTerms()
    expect(terms.length).toBeGreaterThan(30)
    for (const entry of terms) {
      expect(entry.term.length).toBeGreaterThan(1)
      expect(entry.meaning.length).toBeGreaterThan(10)
    }
  })

  it('defines each term only once', () => {
    const names = allTerms().map((t) => t.term.toLowerCase())
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i)
    expect(duplicates).toEqual([])
  })

  it('reports the terms a single lesson introduces', () => {
    const lesson = findLesson('notes-intervals')!.lesson
    expect(lessonTerms(lesson)).toContain('Tritone')
  })
})
