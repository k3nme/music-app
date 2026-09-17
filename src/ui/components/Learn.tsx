import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ALL_LESSONS, CURRICULUM, findLesson, lessonTerms, nextLesson, previousLesson,
} from '../../learn/curriculum'
import { disposeDemoTracks, playDemo, stopDemo } from '../../learn/player'
import { loadProgress, markComplete, resetProgress, type Progress } from '../../learn/progress'
import type { Block, Demo, Lesson, Module, TryAction } from '../../learn/types'
import { useStore } from '../../state/store'
import { Close, Play, Stop } from '../icons'

export function Learn({ onClose, startAt }: { onClose(): void; startAt?: string }) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  const [openLesson, setOpenLesson] = useState<string | null>(
    () => startAt ?? loadProgress().lastLesson,
  )

  useEffect(() => () => { disposeDemoTracks() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openLesson) setOpenLesson(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, openLesson])

  const current = openLesson ? findLesson(openLesson) : null
  const done = new Set(progress.completed)

  const complete = useCallback((lesson: Lesson) => {
    setProgress((p) => markComplete(p, lesson.id, lessonTerms(lesson)))
  }, [])

  return (
    <div className="overlay" onPointerDown={() => { stopDemo(); onClose() }}>
      <div className="sheet learn" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">
              {current ? current.lesson.title : 'Learn music'}
            </div>
            <div className="sheet-sub">
              {current
                ? current.lesson.summary
                : 'From what sound is, to every instrument, to finishing a track. Everything here can be played.'}
            </div>
          </div>
          <div className="spacer" />
          {!current && (
            <span className="chip">
              {done.size} of {ALL_LESSONS.length} read
            </span>
          )}
          {current && (
            <button className="btn" onClick={() => { stopDemo(); setOpenLesson(null) }}>
              All lessons
            </button>
          )}
          <button
            className="btn icon ghost"
            onClick={() => { stopDemo(); onClose() }}
            aria-label="Close"
          >
            <Close width={15} height={15} />
          </button>
        </div>

        <div className="sheet-body">
          {current
            ? <LessonView
                lesson={current.lesson}
                module={current.module}
                onDone={() => complete(current.lesson)}
                onOpen={(id) => { stopDemo(); setOpenLesson(id) }}
                onClose={onClose}
              />
            : <Browser
                done={done}
                lastLesson={progress.lastLesson}
                onOpen={(id) => setOpenLesson(id)}
                onReset={() => setProgress(resetProgress())}
              />}
        </div>

        {current && (
          <div className="sheet-foot">
            <PrevNext lessonId={current.lesson.id} onOpen={(id) => {
              stopDemo()
              complete(current.lesson)
              setOpenLesson(id)
            }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Browser({ done, lastLesson, onOpen, onReset }: {
  done: Set<string>
  lastLesson: string | null
  onOpen(id: string): void
  onReset(): void
}) {
  const resume = lastLesson ? findLesson(lastLesson) : null
  const nextUp = useMemo(() => ALL_LESSONS.find((lesson) => !done.has(lesson.id)), [done])

  return (
    <div className="learn-browser">
      {(resume || nextUp) && (
        <div className="learn-resume">
          <div>
            <div className="label">{done.size === 0 ? 'Start here' : 'Pick up where you left off'}</div>
            <div className="learn-resume-title">{(resume ?? { lesson: nextUp! }).lesson.title}</div>
            <div className="learn-resume-sub">{(resume ?? { lesson: nextUp! }).lesson.summary}</div>
          </div>
          <div className="spacer" />
          <button className="btn primary lg" onClick={() => onOpen((resume?.lesson ?? nextUp!).id)}>
            {done.size === 0 ? 'Begin' : 'Continue'}
          </button>
        </div>
      )}

      {CURRICULUM.map((module, index) => (
        <div className="learn-module" key={module.id} style={{ ['--hue' as string]: module.hue }}>
          <div className="learn-module-head">
            <span className="learn-icon">{module.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="learn-module-title">
                <span className="learn-number">{index + 1}</span> {module.title}
              </div>
              <div className="learn-module-sub">{module.summary}</div>
            </div>
          </div>
          <div className="learn-lessons">
            {module.lessons.map((lesson) => (
              <button
                key={lesson.id}
                className={`learn-lesson ${done.has(lesson.id) ? 'done' : ''}`}
                onClick={() => onOpen(lesson.id)}
              >
                <span className="learn-tick">{done.has(lesson.id) ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="learn-lesson-title">{lesson.title}</span>
                  <span className="learn-lesson-sub">{lesson.summary}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {done.size > 0 && (
        <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={onReset}>
          Reset progress
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function LessonView({ lesson, module, onDone, onOpen, onClose }: {
  lesson: Lesson
  module: Module
  onDone(): void
  onOpen(id: string): void
  onClose(): void
}) {
  // Opening a lesson counts as reading it; this is a reference, not an exam.
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1500)
    return () => window.clearTimeout(timer)
  }, [lesson.id, onDone])

  return (
    <article className="lesson" style={{ ['--hue' as string]: module.hue }}>
      <div className="lesson-crumb">
        <span className="learn-icon small">{module.icon}</span> {module.title}
      </div>
      {lesson.blocks.map((block, index) => (
        <BlockView key={index} block={block} onOpen={onOpen} onClose={onClose} />
      ))}
    </article>
  )
}

function BlockView({ block, onOpen, onClose }: {
  block: Block
  onOpen(id: string): void
  onClose(): void
}) {
  switch (block.kind) {
    case 'text':
      return <p className="lesson-text">{renderEmphasis(block.body)}</p>
    case 'aside':
      return (
        <div className="lesson-aside">
          <div className="lesson-aside-title">{block.title}</div>
          <p>{renderEmphasis(block.body)}</p>
        </div>
      )
    case 'demo':
      return <div className="lesson-demos"><DemoButton demo={block.demo} /></div>
    case 'compare':
      return (
        <div className="lesson-compare">
          <div className="label">{block.comparison.prompt}</div>
          <div className="lesson-demos">
            {block.comparison.options.map((option, i) => <DemoButton key={i} demo={option} />)}
          </div>
        </div>
      )
    case 'terms':
      return (
        <dl className="lesson-terms">
          {block.terms.map((entry) => (
            <div className="lesson-term" key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
        </dl>
      )
    case 'try':
      return (
        <div className="lesson-try">
          <div className="lesson-try-label">Try it</div>
          <p>{renderEmphasis(block.body)}</p>
          {block.action && <TryButton action={block.action} onClose={onClose} />}
        </div>
      )
    default:
      void onOpen
      return null
  }
}

/** Minimal **bold** support, so lesson copy can emphasise a term inline. */
function renderEmphasis(body: string): React.ReactNode[] {
  return body.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith('**') && chunk.endsWith('**')
      ? <strong key={i}>{chunk.slice(2, -2)}</strong>
      : <span key={i}>{chunk}</span>,
  )
}

// ---------------------------------------------------------------------------

function DemoButton({ demo }: { demo: Demo }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => () => { if (playing) stopDemo() }, [playing])

  const toggle = async () => {
    if (playing) { stopDemo(); setPlaying(false); return }
    setPlaying(true)
    try {
      const seconds = await playDemo(demo)
      window.setTimeout(() => setPlaying(false), seconds * 1000)
    } catch {
      setPlaying(false)
    }
  }

  return (
    <button className={`demo-btn ${playing ? 'on' : ''}`} onClick={() => void toggle()}>
      <span className="demo-icon">
        {playing ? <Stop width={11} height={11} /> : <Play width={11} height={11} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="demo-label">{demo.label}</span>
        {demo.note && <span className="demo-note">{demo.note}</span>}
      </span>
    </button>
  )
}

function TryButton({ action, onClose }: { action: TryAction; onClose(): void }) {
  const labels: Record<TryAction['kind'], string> = {
    'open-hum': 'Open Hum it',
    'open-mashup': 'Open the Mashup Lab',
    'open-ideas': 'Open Ideas',
    'open-instruments': 'Browse instruments',
    'load-demo-project': 'Load the starter groove',
  }

  const run = () => {
    stopDemo()
    const store = useStore.getState()
    switch (action.kind) {
      case 'open-hum': store.setUI({ humOpen: true }); break
      case 'open-instruments': store.setUI({ instrumentPickerFor: 'new' }); break
      case 'open-mashup': store.setUI({ pendingDialog: 'mashup' }); break
      case 'open-ideas': store.setUI({ pendingDialog: 'ideas' }); break
      case 'load-demo-project': store.setUI({ pendingDialog: 'demo-project' }); break
    }
    onClose()
  }

  return <button className="btn primary" onClick={run}>{labels[action.kind]}</button>
}

// ---------------------------------------------------------------------------

function PrevNext({ lessonId, onOpen }: { lessonId: string; onOpen(id: string): void }) {
  const previous = previousLesson(lessonId)
  const next = nextLesson(lessonId)
  return (
    <>
      {previous && (
        <button className="btn" onClick={() => onOpen(previous.id)}>← {previous.title}</button>
      )}
      <div className="spacer" />
      {next
        ? <button className="btn primary" onClick={() => onOpen(next.id)}>{next.title} →</button>
        : <span style={{ color: 'var(--faint)', fontSize: 12 }}>That is the end. Go and make something.</span>}
    </>
  )
}
