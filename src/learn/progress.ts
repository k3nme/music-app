/**
 * Which lessons have been read. Stored locally, like everything else here.
 *
 * Progress is deliberately forgiving: a lesson counts as done when you have
 * opened it and moved on. This is not a course with a grade, it is a reference
 * you work through at your own pace.
 */

const KEY = 'overtone.learn.progress'

export interface Progress {
  completed: string[]
  /** The lesson to offer when someone says "continue". */
  lastLesson: string | null
  /** Terms the learner has met, for the glossary. */
  seenTerms: string[]
}

const EMPTY: Progress = { completed: [], lastLesson: null, seenTerms: [] }

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<Progress>
    return {
      completed: parsed.completed ?? [],
      lastLesson: parsed.lastLesson ?? null,
      seenTerms: parsed.seenTerms ?? [],
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    /* private mode — progress just won't persist */
  }
}

export function markComplete(progress: Progress, lessonId: string, newTerms: string[] = []): Progress {
  const next: Progress = {
    completed: progress.completed.includes(lessonId)
      ? progress.completed
      : [...progress.completed, lessonId],
    lastLesson: lessonId,
    seenTerms: [...new Set([...progress.seenTerms, ...newTerms])],
  }
  saveProgress(next)
  return next
}

export function resetProgress(): Progress {
  saveProgress({ ...EMPTY })
  return { ...EMPTY }
}
