import { useMemo } from 'react'
import { engine } from '../../audio/engine'
import { getPreset, kitPieces } from '../../audio/instruments'
import { createNote, type Clip, type Track } from '../../music/project'
import { useStore } from '../../state/store'
import { usePlayhead } from '../hooks'

const ACCENT = 1
const NORMAL = 0.72
const GHOST = 0.42

export function DrumGrid({ clip, track }: { clip: Clip; track: Track }) {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const grid = useStore((s) => s.grid)
  const { addNote, removeNotes, updateNote, commit } = useStore.getState()
  const beat = usePlayhead(playing)

  const preset = getPreset(track.presetId)
  const pieces = useMemo(() => kitPieces(preset), [preset])
  const step = grid > 0 ? grid : 0.25
  const steps = Math.max(1, Math.round(clip.contentBeats / step))
  const stepWidth = 30

  // Which notes sit on which step, keyed for O(1) lookup while rendering.
  const byCell = useMemo(() => {
    const map = new Map<string, { id: string; velocity: number }>()
    for (const note of clip.notes) {
      const index = Math.round(note.start / step)
      map.set(`${note.midi}:${index}`, { id: note.id, velocity: note.velocity })
    }
    return map
  }, [clip.notes, step])

  const activeStep = playing && beat >= clip.startBeat && beat < clip.startBeat + clip.lengthBeats
    ? Math.floor((((beat - clip.startBeat) % clip.contentBeats) / step))
    : -1

  const toggle = (midi: number, index: number, e: React.MouseEvent) => {
    const key = `${midi}:${index}`
    const existing = byCell.get(key)
    if (existing) {
      if (e.shiftKey) {
        // Shift-click cycles the accent instead of erasing.
        const next = existing.velocity >= ACCENT - 0.01 ? GHOST
          : existing.velocity <= GHOST + 0.01 ? NORMAL : ACCENT
        commit()
        updateNote(clip.id, existing.id, { velocity: next })
        engine.playNote(track.id, midi, 0.3, next)
      } else {
        removeNotes(clip.id, [existing.id])
      }
      return
    }
    const velocity = e.shiftKey ? ACCENT : NORMAL
    addNote(clip.id, createNote(midi, index * step, Math.min(step, 0.25), velocity))
    engine.playNote(track.id, midi, 0.3, velocity)
  }

  const stepsPerBeat = Math.round(1 / step)

  return (
    <div className="drums">
      <div className="drum-names">
        <div style={{ height: 22, borderBottom: '1px solid var(--line)' }} />
        {pieces.map(({ midi, piece }) => (
          <div
            key={midi}
            className="drum-name"
            onPointerDown={() => engine.playNote(track.id, midi, 0.4, 0.9)}
            title="Click to audition"
          >
            <span style={{
              width: 6, height: 6, borderRadius: 3,
              background: `hsl(${track.color} 70% 58%)`, flex: 'none',
            }} />
            {piece.name}
          </div>
        ))}
      </div>

      <div className="drum-scroll">
        <div className="drum-rows" style={{ width: steps * stepWidth }}>
          <div style={{ display: 'flex', height: 22, borderBottom: '1px solid var(--line)' }}>
            {Array.from({ length: steps }, (_, i) => (
              <div
                key={i}
                style={{
                  width: stepWidth, flex: 'none', fontSize: 9,
                  color: i % (stepsPerBeat * project.beatsPerBar) === 0 ? 'var(--dim)' : 'var(--faint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRight: '1px solid var(--line-soft)',
                  background: activeStep === i ? 'rgba(255,255,255,0.06)' : undefined,
                }}
              >
                {i % stepsPerBeat === 0 ? Math.floor(i / stepsPerBeat) + 1 : ''}
              </div>
            ))}
          </div>

          {pieces.map(({ midi }) => (
            <div className="drum-row" key={midi}>
              {Array.from({ length: steps }, (_, i) => {
                const cell = byCell.get(`${midi}:${i}`)
                const onBeat = i % stepsPerBeat === 0
                const onBar = i % (stepsPerBeat * project.beatsPerBar) === 0
                return (
                  <div
                    key={i}
                    className={[
                      'step',
                      cell ? 'on' : '',
                      cell && cell.velocity >= ACCENT - 0.01 ? 'accent' : '',
                      onBar ? 'bar' : onBeat ? 'beat' : '',
                      activeStep === i ? 'playing' : '',
                    ].join(' ')}
                    style={{
                      width: stepWidth, flex: 'none',
                      ['--hue' as string]: track.color,
                      opacity: cell ? 0.45 + cell.velocity * 0.55 : 1,
                    }}
                    onClick={(e) => toggle(midi, i, e)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const existing = byCell.get(`${midi}:${i}`)
                      if (existing) removeNotes(clip.id, [existing.id])
                    }}
                    title={onBeat ? `Beat ${Math.floor(i / stepsPerBeat) + 1} — shift-click for accent` : 'Shift-click for accent'}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
