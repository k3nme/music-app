import { useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { getPreset } from '../../audio/instruments'
import { createNote, type Clip, type Note, type Track } from '../../music/project'
import { isBlackKey, isInScale, midiToName } from '../../music/theory'
import { useStore } from '../../state/store'
import { usePlayhead } from '../hooks'

const ROW_H = 15

export function PianoRoll({ clip, track }: { clip: Clip; track: Track }) {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const grid = useStore((s) => s.grid)
  const snap = useStore((s) => s.snap)
  const selectedNoteIds = useStore((s) => s.selectedNoteIds)
  const { addNote, updateNotes, removeNotes, setSelectedNotes, commit, updateClip } = useStore.getState()

  const [ppb, setPpb] = useState(44)
  const scrollRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const beat = usePlayhead(playing)

  const preset = getPreset(track.presetId)
  const low = Math.max(12, preset.range[0] - 2)
  const high = Math.min(120, preset.range[1] + 2)
  const rows = useMemo(
    () => Array.from({ length: high - low + 1 }, (_, i) => high - i),
    [low, high],
  )
  const height = rows.length * ROW_H
  const width = clip.contentBeats * ppb

  // Centre the view on the instrument's comfortable register the first time.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = Math.max(0, (high - preset.centerMidi - 6) * ROW_H)
  }, [clip.id, high, preset.centerMidi])

  const snapBeat = (v: number) => (snap && grid > 0 ? Math.round(v / grid) * grid : v)
  const yToMidi = (y: number) => high - Math.floor(y / ROW_H)
  const beatAt = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return (clientX - rect.left + el.scrollLeft) / ppb
  }

  const audition = (midi: number, duration = 0.35) => {
    engine.playNote(track.id, midi, duration, 0.85)
    setPreview(midi)
    window.setTimeout(() => setPreview((p) => (p === midi ? null : p)), 220)
  }

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.note')) return
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top + el.scrollTop
    const midi = yToMidi(y)
    const start = Math.max(0, snapBeat(beatAt(e.clientX)))
    if (start >= clip.contentBeats) return
    const duration = grid > 0 ? grid : 0.5
    const note = createNote(midi, start, Math.min(duration, clip.contentBeats - start), 0.8)
    addNote(clip.id, note)
    audition(midi, (duration * 60) / project.bpm)
  }

  const startNoteDrag = (note: Note, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const multi = e.shiftKey || selectedNoteIds.includes(note.id)
    const ids = multi && selectedNoteIds.length > 0 && selectedNoteIds.includes(note.id)
      ? selectedNoteIds
      : [note.id]
    if (!selectedNoteIds.includes(note.id)) setSelectedNotes(e.shiftKey ? [...selectedNoteIds, note.id] : [note.id])

    const originX = e.clientX
    const originY = e.clientY
    const velocityMode = e.altKey
    const snapshot = new Map(clip.notes.map((n) => [n.id, { ...n }]))
    let committed = false

    const move = (ev: PointerEvent) => {
      if (!committed && (Math.abs(ev.clientX - originX) > 2 || Math.abs(ev.clientY - originY) > 2)) {
        committed = true
        commit()
      }
      if (!committed) return

      if (velocityMode) {
        const delta = (originY - ev.clientY) / 120
        updateNotes(clip.id, ids, (n) => ({
          velocity: Math.max(0.05, Math.min(1, (snapshot.get(n.id)?.velocity ?? 0.8) + delta)),
        }))
        return
      }

      if (mode === 'resize') {
        const delta = (ev.clientX - originX) / ppb
        updateNotes(clip.id, ids, (n) => {
          const base = snapshot.get(n.id)!
          const raw = base.duration + delta
          const snapped = snap && grid > 0 ? Math.round(raw / grid) * grid : raw
          return { duration: Math.max(grid > 0 ? grid : 0.0625, Math.min(snapped, clip.contentBeats - base.start)) }
        })
        return
      }

      const deltaBeats = (ev.clientX - originX) / ppb
      const deltaRows = Math.round((ev.clientY - originY) / ROW_H)
      updateNotes(clip.id, ids, (n) => {
        const base = snapshot.get(n.id)!
        const start = Math.max(0, Math.min(clip.contentBeats - base.duration, snapBeat(base.start + deltaBeats)))
        const midi = Math.max(0, Math.min(127, base.midi - deltaRows))
        return { start, midi }
      })
    }

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!committed && Math.abs(ev.clientX - originX) < 3) {
        // A plain click selects and auditions rather than editing.
        setSelectedNotes(e.shiftKey ? [...new Set([...selectedNoteIds, note.id])] : [note.id])
        audition(note.midi, (note.duration * 60) / project.bpm)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const barWidth = project.beatsPerBar * ppb
  const gridWidth = (grid > 0 ? grid : 1) * ppb

  return (
    <div className="roll">
      <div className="roll-keys" ref={keysRef}>
        <div style={{ position: 'relative', height, transform: `translateY(${-(scrollRef.current?.scrollTop ?? 0)}px)` }}>
          {rows.map((midi, i) => (
            <div
              key={midi}
              className={[
                'roll-key',
                isBlackKey(midi) ? 'black' : 'white',
                midi % 12 === project.key.root ? 'root' : '',
                preview === midi ? 'playing' : '',
              ].join(' ')}
              style={{ top: i * ROW_H, height: ROW_H }}
              onPointerDown={() => audition(midi, 0.5)}
            >
              {midi % 12 === 0 || rows.length < 40 ? midiToName(midi) : ''}
            </div>
          ))}
        </div>
      </div>

      <div
        className="roll-scroll"
        ref={scrollRef}
        onScroll={() => {
          const inner = keysRef.current?.firstElementChild as HTMLElement | null
          if (inner) inner.style.transform = `translateY(${-(scrollRef.current?.scrollTop ?? 0)}px)`
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setPpb((p) => Math.max(12, Math.min(160, p * (e.deltaY > 0 ? 0.9 : 1.1))))
          }
        }}
      >
        <div
          className="roll-canvas"
          style={{
            width, height,
            backgroundImage: [
              `repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px ${barWidth}px)`,
              gridWidth > 6 ? `repeating-linear-gradient(90deg, var(--line-soft) 0 1px, transparent 1px ${gridWidth}px)` : '',
            ].filter(Boolean).join(','),
          }}
          onPointerDown={onCanvasPointerDown}
        >
          {rows.map((midi, i) => {
            const inScale = isInScale(midi, project.key.root, project.key.scale)
            return (
              <div
                key={midi}
                className={[
                  'roll-row',
                  isBlackKey(midi) ? 'black' : '',
                  inScale ? '' : 'offscale',
                  midi % 12 === project.key.root ? 'rootrow' : '',
                ].join(' ')}
                style={{ top: i * ROW_H }}
              />
            )
          })}

          {clip.notes.map((note) => (
            <div
              key={note.id}
              className={`note ${selectedNoteIds.includes(note.id) ? 'sel' : ''}`}
              style={{
                left: note.start * ppb,
                width: Math.max(4, note.duration * ppb - 1),
                top: (high - note.midi) * ROW_H + 1,
                ['--hue' as string]: track.color,
                opacity: 0.4 + note.velocity * 0.6,
              }}
              onPointerDown={startNoteDrag(note, 'move')}
              onContextMenu={(e) => { e.preventDefault(); removeNotes(clip.id, [note.id]) }}
              title={`${midiToName(note.midi)} · vel ${Math.round(note.velocity * 100)}  (alt-drag for velocity, right-click to delete)`}
            >
              <div className="note-resize" onPointerDown={startNoteDrag(note, 'resize')} />
            </div>
          ))}

          {playing && (
            <div
              className="playhead"
              style={{
                transform: `translateX(${((beat - clipStartOf(clip, beat)) % clip.contentBeats) * ppb}px)`,
                opacity: isClipActive(clip, beat) ? 1 : 0,
              }}
            />
          )}
        </div>
      </div>

      <div style={{
        position: 'absolute', right: 14, bottom: 10, display: 'flex', gap: 6, alignItems: 'center',
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 8px',
      }}>
        <span className="label">Bars</span>
        <select
          className="field"
          style={{ height: 22 }}
          value={clip.contentBeats}
          onChange={(e) => {
            const beats = Number(e.target.value)
            commit()
            updateClip(clip.id, {
              contentBeats: beats,
              lengthBeats: Math.max(beats, Math.round(clip.lengthBeats / beats) * beats),
            })
          }}
        >
          {[1, 2, 4, 8, 16].map((bars) => (
            <option key={bars} value={bars * project.beatsPerBar}>{bars}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Where the current loop pass of this clip began, in song beats. */
function clipStartOf(clip: Clip, beat: number): number {
  const passes = Math.floor((beat - clip.startBeat) / clip.contentBeats)
  return clip.startBeat + Math.max(0, passes) * clip.contentBeats
}

function isClipActive(clip: Clip, beat: number): boolean {
  return beat >= clip.startBeat && beat < clip.startBeat + clip.lengthBeats
}
