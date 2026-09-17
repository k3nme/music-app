/**
 * The curriculum, assembled.
 *
 * Ten modules, ordered so each builds on the last: what sound is, what notes
 * are, how they group into scales and chords, how rhythm works, how every
 * instrument family physically makes sound, what the rest of the world built
 * with those ideas, how parts fit together, how dance music is produced, and
 * where all of that lives in this app.
 */

import { electronicModule } from './modules/electronic'
import { FUNDAMENTAL_MODULES } from './modules/fundamentals'
import { instrumentsModule } from './modules/instruments'
import { arrangingModule, overtoneModule } from './modules/making'
import { worldModule } from './modules/world'
import type { Lesson, Module } from './types'

export const CURRICULUM: Module[] = [
  ...FUNDAMENTAL_MODULES,
  instrumentsModule,
  worldModule,
  arrangingModule,
  electronicModule,
  overtoneModule,
]

export const ALL_LESSONS: Lesson[] = CURRICULUM.flatMap((module) => module.lessons)

export function findLesson(id: string): { module: Module; lesson: Lesson } | null {
  for (const module of CURRICULUM) {
    const lesson = module.lessons.find((l) => l.id === id)
    if (lesson) return { module, lesson }
  }
  return null
}

/** The lesson after this one, across module boundaries. */
export function nextLesson(id: string): Lesson | null {
  const index = ALL_LESSONS.findIndex((lesson) => lesson.id === id)
  if (index < 0 || index === ALL_LESSONS.length - 1) return null
  return ALL_LESSONS[index + 1]
}

export function previousLesson(id: string): Lesson | null {
  const index = ALL_LESSONS.findIndex((lesson) => lesson.id === id)
  if (index <= 0) return null
  return ALL_LESSONS[index - 1]
}

/** Every term the curriculum defines, for the glossary. */
export function allTerms(): { term: string; meaning: string; lessonId: string }[] {
  const out: { term: string; meaning: string; lessonId: string }[] = []
  for (const lesson of ALL_LESSONS) {
    for (const block of lesson.blocks) {
      if (block.kind !== 'terms') continue
      for (const entry of block.terms) out.push({ ...entry, lessonId: lesson.id })
    }
  }
  return out
}

export function lessonTerms(lesson: Lesson): string[] {
  return lesson.blocks.flatMap((block) =>
    block.kind === 'terms' ? block.terms.map((t) => t.term) : [])
}
