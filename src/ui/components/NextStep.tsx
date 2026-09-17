import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { Chevron, Close } from '../icons'

/**
 * A single line at the bottom of the screen suggesting what to do next.
 *
 * Only shown in guided mode. It reads the project rather than following a
 * script, so the suggestion is always about the state you are actually in —
 * empty, one part, or a few parts that could use a mix.
 */
export function NextStep({ onMashup, onIdeas }: { onMashup(): void; onIdeas(): void }) {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const { setUI, flash } = useStore.getState()

  const step = useMemo(() => {
    const tracks = project.tracks.length
    const hasNotes = project.clips.some((clip) => clip.notes.length > 0)
    const hasAudio = (project.audioClips ?? []).length > 0

    if (tracks === 0) {
      return {
        text: 'Nothing here yet. The quickest start is to hum something, or to mash up two songs you already have.',
        actions: [
          { label: 'Hum something', run: () => setUI({ humOpen: true }) },
          { label: 'Mash up two songs', run: onMashup },
        ],
      }
    }
    if (!playing) {
      return {
        text: 'Press play — or hit the spacebar — to hear what you have. It loops, so you can change things while it runs.',
        actions: [
          { label: 'Play', run: () => void useStore.getState().play() },
        ],
      }
    }
    if (tracks < 3 && (hasNotes || hasAudio)) {
      return {
        text: 'You have a part. Ideas can add chords, a bass line or drums that fit what is already there.',
        actions: [
          { label: 'Get ideas', run: onIdeas },
          { label: 'Add another instrument', run: () => setUI({ instrumentPickerFor: 'new' }) },
        ],
      }
    }
    return {
      text: 'That is a track. Export it, or switch to the full studio to start shaping it properly.',
      actions: [
        {
          label: 'Show the full studio',
          run: () => {
            localStorage.setItem('overtone.experience', 'full')
            setUI({ experience: 'full' })
            flash('Full studio — everything is visible now', 'good')
          },
        },
      ],
    }
  }, [project, playing, onMashup, onIdeas, setUI, flash])

  return (
    <div className="nextstep">
      <span className="nextstep-dot" />
      <span className="nextstep-text">{step.text}</span>
      {step.actions.map((action) => (
        <button key={action.label} className="btn" onClick={action.run}>
          {action.label} <Chevron width={11} height={11} />
        </button>
      ))}
      <div className="spacer" />
      <button
        className="btn ghost"
        onClick={() => useStore.getState().setUI({ learnOpen: true })}
        title="Short lessons, all of them playable"
      >
        Learn music
      </button>
      <button
        className="btn icon ghost"
        title="Hide these suggestions and show the full studio"
        onClick={() => {
          localStorage.setItem('overtone.experience', 'full')
          setUI({ experience: 'full' })
        }}
      >
        <Close width={13} height={13} />
      </button>
    </div>
  )
}
