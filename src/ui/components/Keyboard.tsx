import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { getPreset } from '../../audio/instruments'
import { createNote, type Clip, type Track } from '../../music/project'
import { isBlackKey, isInScale, midiToName } from '../../music/theory'
import { useStore } from '../../state/store'
import type { NoteHandle } from '../../audio/types'

/**
 * Two rows of computer keys laid out like a piano — the same mapping most
 * DAWs use, so it's already in people's fingers.
 */
const KEY_MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
}

const LABELS: Record<number, string> = {
  0: 'A', 1: 'W', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T', 7: 'G',
  8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K', 13: 'O', 14: 'L', 15: 'P',
}

export function Keyboard({ track, clip }: { track: Track; clip: Clip | null }) {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const octave = useStore((s) => s.keyboardOctave)
  const { setUI, addNote, flash } = useStore.getState()

  const [held, setHeld] = useState<number[]>([])
  const [recording, setRecording] = useState(false)
  const handles = useRef(new Map<number, NoteHandle>())
  const pending = useRef(new Map<number, number>())

  const preset = getPreset(track.presetId)
  const base = octave * 12
  const keyCount = 24

  const noteOn = useCallback((midi: number, velocity = 0.85) => {
    if (handles.current.has(midi)) return
    const handle = engine.noteOn(track.id, midi, velocity)
    if (handle) handles.current.set(midi, handle)
    setHeld((h) => (h.includes(midi) ? h : [...h, midi]))
    if (recording && playing && clip) {
      pending.current.set(midi, engine.positionBeats)
    }
  }, [track.id, recording, playing, clip])

  const noteOff = useCallback((midi: number) => {
    const handle = handles.current.get(midi)
    if (handle) {
      handle.release(engine.currentTime)
      handles.current.delete(midi)
    }
    setHeld((h) => h.filter((m) => m !== midi))

    const startedAt = pending.current.get(midi)
    if (startedAt !== undefined && clip) {
      pending.current.delete(midi)
      const grid = useStore.getState().grid
      const snapTo = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : v)
      // Positions are song beats; store them relative to the clip's content.
      const relative = ((startedAt - clip.startBeat) % clip.contentBeats + clip.contentBeats) % clip.contentBeats
      const length = Math.max(grid > 0 ? grid : 0.25, snapTo(engine.positionBeats - startedAt))
      addNote(clip.id, createNote(midi, Math.max(0, snapTo(relative)), length, 0.85))
    }
  }, [clip, addNote])

  // Computer keyboard. Skipped whenever a text field has focus.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    }
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || isTyping()) return
      if (e.code === 'KeyZ' && !e.shiftKey) { setUI({ keyboardOctave: Math.max(0, octave - 1) }); return }
      if (e.code === 'KeyX') { setUI({ keyboardOctave: Math.min(8, octave + 1) }); return }
      const offset = KEY_MAP[e.code]
      if (offset === undefined) return
      e.preventDefault()
      noteOn(base + offset)
    }
    const up = (e: KeyboardEvent) => {
      const offset = KEY_MAP[e.code]
      if (offset === undefined) return
      noteOff(base + offset)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [base, noteOn, noteOff, octave, setUI])

  // Release everything if the pane unmounts mid-chord.
  useEffect(() => () => {
    for (const handle of handles.current.values()) handle.release(engine.currentTime)
    handles.current.clear()
  }, [])

  const whiteKeys: number[] = []
  const blackKeys: { midi: number; left: number }[] = []
  for (let i = 0; i < keyCount; i++) {
    const midi = base + i
    if (isBlackKey(midi)) blackKeys.push({ midi, left: whiteKeys.length })
    else whiteKeys.push(midi)
  }

  return (
    <div className="keyboard-pane">
      <div className="kbd-hint">
        <span>Playing <b style={{ color: 'var(--text)' }}>{preset.name}</b></span>
        <span className="sep" />
        <span><span className="kbd">A</span>…<span className="kbd">J</span> white · <span className="kbd">W</span><span className="kbd">E</span><span className="kbd">T</span><span className="kbd">Y</span><span className="kbd">U</span> black</span>
        <span className="sep" />
        <button className="btn" onClick={() => setUI({ keyboardOctave: Math.max(0, octave - 1) })}>
          <span className="kbd">Z</span> −
        </button>
        <span className="mono" style={{ minWidth: 30, textAlign: 'center' }}>C{octave}</span>
        <button className="btn" onClick={() => setUI({ keyboardOctave: Math.min(8, octave + 1) })}>
          + <span className="kbd">X</span>
        </button>
        <div className="spacer" />
        <button
          className={`btn ${recording ? 'rec' : ''}`}
          onClick={() => {
            if (!clip) { flash('Select a clip to record into first.', 'warn'); return }
            setRecording((r) => !r)
          }}
          title="Capture what you play into the selected clip while the transport runs"
        >
          {recording ? 'Recording into clip' : 'Record into clip'}
        </button>
      </div>

      <div className="piano">
        {whiteKeys.map((midi) => (
          <button
            key={midi}
            className={[
              'pkey',
              held.includes(midi) ? 'down' : '',
              isInScale(midi, project.key.root, project.key.scale) ? 'inkey' : '',
            ].join(' ')}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(midi) }}
            onPointerUp={() => noteOff(midi)}
            onPointerLeave={() => noteOff(midi)}
          >
            {LABELS[midi - base] ?? (midi % 12 === 0 ? midiToName(midi) : '')}
          </button>
        ))}
        {blackKeys.map(({ midi, left }) => (
          <button
            key={midi}
            className={`pkey black ${held.includes(midi) ? 'down' : ''}`}
            style={{ left: `calc(${(left / whiteKeys.length) * 100}% - 13px)` }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); noteOn(midi) }}
            onPointerUp={() => noteOff(midi)}
            onPointerLeave={() => noteOff(midi)}
          >
            {LABELS[midi - base] ?? ''}
          </button>
        ))}
      </div>

      {recording && !playing && (
        <div style={{ color: 'var(--warn)', fontSize: 12 }}>
          Press play — notes are captured against the transport.
        </div>
      )}
    </div>
  )
}
