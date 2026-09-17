import { useEffect, useRef, useState } from 'react'
import { explain } from '../../learn/glossary'
import { useStore } from '../../state/store'

/**
 * A word in the interface that explains itself.
 *
 * Renders with a dotted underline; hovering or focusing shows the plain-English
 * meaning, and if the curriculum covers it properly there's a link straight to
 * that lesson. Unknown terms render as plain text, so wrapping something that
 * has no definition is harmless.
 */
export function Term({ children, of, className }: {
  children: React.ReactNode
  /** The glossary key, when it differs from the visible text. */
  of?: string
  className?: string
}) {
  const label = of ?? (typeof children === 'string' ? children : '')
  const entry = explain(label)
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open || !ref.current) return
    // Flip the bubble above the word when there's no room below.
    const rect = ref.current.getBoundingClientRect()
    setAbove(window.innerHeight - rect.bottom < 180)
  }, [open])

  if (!entry) return <>{children}</>

  return (
    <span
      ref={ref}
      className={`term ${className ?? ''}`}
      tabIndex={0}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className={`term-bubble ${above ? 'above' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
          <span className="term-name">{entry.term}</span>
          <span className="term-meaning">{entry.meaning}</span>
          {entry.lessonId && (
            <button
              className="term-link"
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().setUI({ learnOpen: true, learnLesson: entry.lessonId! })
              }}
            >
              Learn this properly →
            </button>
          )}
        </span>
      )}
    </span>
  )
}
