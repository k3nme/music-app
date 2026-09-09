import { useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { getPreset } from '../../audio/instruments'
import {
  audioClipLengthBeats, audioClipsForTrack, clipsForTrack,
  type AudioClip, type Clip, type Track,
} from '../../music/project'
import { getSampleMeta } from '../../lib/samples'
import { importAudioIntoProject, looksLikeAudio } from '../../lib/importAudio'
import { Waveform } from './Waveform'
import { useStore } from '../../state/store'
import { useLevel, usePlayhead } from '../hooks'
import { Copy, Plus, Trash } from '../icons'

const MIN_PPB = 6
const MAX_PPB = 64

export function Arrangement() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const selectedClipId = useStore((s) => s.selectedClipId)
  const selectedAudioClipId = useStore((s) => s.selectedAudioClipId)
  const snap = useStore((s) => s.snap)
  const grid = useStore((s) => s.grid)

  const [ppb, setPpb] = useState(18)
  const [dropping, setDropping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const headsRef = useRef<HTMLDivElement>(null)
  const beat = usePlayhead(playing)

  const bars = Math.max(8, Math.ceil(project.lengthBeats / project.beatsPerBar) + 2)
  const totalBeats = bars * project.beatsPerBar
  const width = totalBeats * ppb

  // Keep the playhead in view while playing.
  useEffect(() => {
    if (!playing) return
    const el = scrollRef.current
    if (!el) return
    const x = beat * ppb
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3)
    }
  }, [beat, ppb, playing])

  const snapBeat = (value: number) => {
    if (!snap || grid <= 0) return Math.max(0, value)
    return Math.max(0, Math.round(value / grid) * grid)
  }

  const beatAtClientX = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return (clientX - rect.left + el.scrollLeft) / ppb
  }

  return (
    <div className="arrange-pane">
      <div className="track-col">
        <div className="track-col-head">
          <span className="label">Tracks</span>
          <div className="spacer" />
          <button
            className="btn ghost icon"
            title="Zoom out"
            onClick={() => setPpb((p) => Math.max(MIN_PPB, p / 1.35))}
          >−</button>
          <button
            className="btn ghost icon"
            title="Zoom in"
            onClick={() => setPpb((p) => Math.min(MAX_PPB, p * 1.35))}
          >+</button>
        </div>
        <div
          className="track-list"
          ref={headsRef}
          onScroll={(e) => {
            if (scrollRef.current) scrollRef.current.scrollTop = e.currentTarget.scrollTop
          }}
        >
          {project.tracks.map((track) => (
            <TrackHead key={track.id} track={track} selected={track.id === selectedTrackId} playing={playing} />
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
            <button
              className="btn ghost"
              style={{ justifyContent: 'center' }}
              onClick={() => useStore.getState().setUI({ instrumentPickerFor: 'new' })}
            >
              <Plus width={13} height={13} /> Add instrument
            </button>
            <button
              className="btn ghost"
              style={{ justifyContent: 'center' }}
              onClick={() => fileRef.current?.click()}
              title="Import a song or loop"
            >
              <Plus width={13} height={13} /> Import audio
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].filter(looksLikeAudio)
                for (const file of files) void importAudioIntoProject(file, { startBeat: 0 })
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>

      <div
        className={`arrangement ${dropping ? 'dropping' : ''}`}
        ref={scrollRef}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDropping(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDropping(false)
          const files = [...e.dataTransfer.files].filter(looksLikeAudio)
          if (files.length === 0) {
            if (e.dataTransfer.files.length > 0) {
              useStore.getState().flash('That file type is not audio', 'warn')
            }
            return
          }
          const startBeat = snapBeat(beatAtClientX(e.clientX))
          for (const file of files) void importAudioIntoProject(file, { startBeat })
        }}
        onScroll={(e) => {
          if (headsRef.current) headsRef.current.scrollTop = e.currentTarget.scrollTop
        }}
        onWheel={(e) => {
          // Ctrl/⌘ + wheel is the universal zoom gesture; trackpad pinch sends it too.
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setPpb((p) => Math.max(MIN_PPB, Math.min(MAX_PPB, p * (e.deltaY > 0 ? 0.92 : 1.08))))
          }
        }}
      >
        <div className="arrange-inner" style={{ width }}>
          <Ruler
            bars={bars}
            beatsPerBar={project.beatsPerBar}
            ppb={ppb}
            onSeek={(b) => engine.seek(snapBeat(b))}
          />

          {project.tracks.map((track) => (
            <Lane
              key={track.id}
              track={track}
              clips={clipsForTrack(project, track.id)}
              audioClips={audioClipsForTrack(project, track.id)}
              bpm={project.bpm}
              ppb={ppb}
              beatsPerBar={project.beatsPerBar}
              selectedClipId={selectedClipId}
              selectedAudioClipId={selectedAudioClipId}
              snapBeat={snapBeat}
              beatAtClientX={beatAtClientX}
            />
          ))}

          {project.tracks.length === 0 && (
            <div className="empty-hint" style={{ height: 180 }}>
              Nothing here yet — hit <b style={{ color: 'var(--rec)', margin: '0 4px' }}>Hum it</b> to sing an
              idea in, add an instrument on the left, or drop an audio file here.
            </div>
          )}

          <div className="playhead" style={{ transform: `translateX(${beat * ppb}px)` }} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Ruler({ bars, beatsPerBar, ppb, onSeek }: {
  bars: number; beatsPerBar: number; ppb: number; onSeek(beat: number): void
}) {
  const [loop, setLoop] = useState({ start: engine.loopStart, end: engine.loopEnd })
  const barWidth = beatsPerBar * ppb
  const labelEvery = barWidth < 34 ? Math.ceil(34 / barWidth) : 1

  const dragLoop = (mode: 'move' | 'start' | 'end', e: React.PointerEvent) => {
    e.stopPropagation()
    const originX = e.clientX
    const origin = { ...loop }
    const move = (ev: PointerEvent) => {
      const deltaBeats = Math.round(((ev.clientX - originX) / ppb) * 4) / 4
      let next = { ...origin }
      if (mode === 'move') { next.start = Math.max(0, origin.start + deltaBeats); next.end = next.start + (origin.end - origin.start) }
      if (mode === 'start') next.start = Math.min(origin.end - 1, Math.max(0, origin.start + deltaBeats))
      if (mode === 'end') next.end = Math.max(origin.start + 1, origin.end + deltaBeats)
      engine.loopStart = next.start
      engine.loopEnd = next.end
      setLoop(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className="ruler"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onSeek((e.clientX - rect.left) / ppb)
      }}
    >
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className="ruler-bar" style={{ left: i * barWidth, width: barWidth }}>
          {i % labelEvery === 0 ? i + 1 : ''}
        </div>
      ))}
      <div
        className="loop-region"
        style={{ left: loop.start * ppb, width: Math.max(6, (loop.end - loop.start) * ppb) }}
        onPointerDown={(e) => dragLoop('move', e)}
        title="Loop region — drag to move, edges to resize"
      >
        <div className="loop-handle" style={{ left: -3 }} onPointerDown={(e) => dragLoop('start', e)} />
        <div className="loop-handle" style={{ right: -3 }} onPointerDown={(e) => dragLoop('end', e)} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TrackHead({ track, selected, playing }: { track: Track; selected: boolean; playing: boolean }) {
  const { select, updateTrack, toggleMute, toggleSolo, setUI, removeTrack } = useStore.getState()
  const level = useLevel(track.id, playing)
  const preset = getPreset(track.presetId)

  return (
    <div
      className={`track-head ${selected ? 'sel' : ''}`}
      style={{ ['--hue' as string]: track.color }}
      onPointerDown={() => select(track.id)}
    >
      <div className="track-title">
        <input
          className="track-name"
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          spellCheck={false}
        />
        <button
          className="mini"
          title="Remove track"
          onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
        >
          <Trash width={10} height={10} />
        </button>
      </div>

      <div className="track-btns">
        <button
          className="track-inst"
          onClick={(e) => { e.stopPropagation(); setUI({ instrumentPickerFor: track.id }) }}
          title="Change instrument"
        >
          {preset.name}
        </button>
        <div className="spacer" />
        <button
          className={`mini ${track.muted ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleMute(track.id) }}
          title="Mute"
        >M</button>
        <button
          className={`mini solo ${track.soloed ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleSolo(track.id) }}
          title="Solo"
        >S</button>
      </div>

      <div className="meter-mini">
        <i style={{ transform: `scaleX(${Math.min(1, level * 1.6)})` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Lane({
  track, clips, audioClips, bpm, ppb, beatsPerBar,
  selectedClipId, selectedAudioClipId, snapBeat, beatAtClientX,
}: {
  track: Track
  clips: Clip[]
  audioClips: AudioClip[]
  bpm: number
  ppb: number
  beatsPerBar: number
  selectedClipId: string | null
  selectedAudioClipId: string | null
  snapBeat(v: number): number
  beatAtClientX(x: number): number
}) {
  const { addClip, select } = useStore.getState()
  const barWidth = beatsPerBar * ppb

  return (
    <div
      className="lane"
      style={{ ['--hue' as string]: track.color }}
      onPointerDown={() => select(track.id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.clip')) return
        if (track.kind === 'audio') return
        const start = snapBeat(beatAtClientX(e.clientX))
        addClip(track.id, Math.floor(start / beatsPerBar) * beatsPerBar)
      }}
      title={track.kind === 'audio'
        ? 'Drop an audio file here'
        : 'Double-click to add an empty clip'}
    >
      <div
        className="lane-grid"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px ${barWidth}px)`,
        }}
      />
      {clips.map((clip) => (
        <ClipView
          key={clip.id}
          clip={clip}
          hue={track.color}
          ppb={ppb}
          selected={clip.id === selectedClipId}
          snapBeat={snapBeat}
        />
      ))}
      {audioClips.map((clip) => (
        <AudioClipView
          key={clip.id}
          clip={clip}
          hue={clip.hue ?? track.color}
          bpm={bpm}
          ppb={ppb}
          selected={clip.id === selectedAudioClipId}
          snapBeat={snapBeat}
        />
      ))}
    </div>
  )
}

function AudioClipView({ clip, hue, bpm, ppb, selected, snapBeat }: {
  clip: AudioClip; hue: number; bpm: number; ppb: number; selected: boolean
  snapBeat(v: number): number
}) {
  const { updateAudioClip, commit, removeAudioClip, setUI } = useStore.getState()
  const meta = getSampleMeta(clip.sampleId)
  const lengthBeats = audioClipLengthBeats(clip, bpm)
  const speed = clip.warp && clip.originalBpm ? bpm / clip.originalBpm : 1

  const startDrag = (mode: 'move' | 'trim') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setUI({ selectedAudioClipId: clip.id, selectedTrackId: clip.trackId })
    const originX = e.clientX
    const origin = { start: clip.startBeat, duration: clip.sourceDurationSec }
    let moved = false

    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - originX) > 3) { moved = true; commit() }
      if (!moved) return
      const deltaBeats = (ev.clientX - originX) / ppb
      if (mode === 'move') {
        updateAudioClip(clip.id, { startBeat: Math.max(0, snapBeat(origin.start + deltaBeats)) })
      } else {
        // Trimming changes how much *source* is used; the timeline length
        // follows from that and the warp speed.
        const deltaSeconds = (deltaBeats * 60 / bpm) * speed
        const maxDuration = (meta?.durationSec ?? origin.duration) - clip.offsetSec
        updateAudioClip(clip.id, {
          sourceDurationSec: Math.max(0.05, Math.min(maxDuration, origin.duration + deltaSeconds)),
        })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const total = meta?.durationSec || 1
  const from = clip.offsetSec / total
  const to = Math.min(1, (clip.offsetSec + clip.sourceDurationSec) / total)

  return (
    <div
      className={`clip audio ${selected ? 'sel' : ''}`}
      style={{
        left: clip.startBeat * ppb,
        width: Math.max(10, lengthBeats * ppb),
        ['--hue' as string]: hue,
      }}
      onPointerDown={startDrag('move')}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); if (e.shiftKey) removeAudioClip(clip.id) }}
      title={`${clip.name}${clip.originalBpm ? ` — ${Math.round(clip.originalBpm)} BPM source` : ''}`}
    >
      <div className="clip-name">
        {clip.name}
        {clip.warp && Math.abs(speed - 1) > 0.005 && (
          <span className="clip-badge">{speed > 1 ? '↑' : '↓'}{Math.round(Math.abs(speed - 1) * 100)}%</span>
        )}
        {clip.pitchSemitones !== 0 && (
          <span className="clip-badge">{clip.pitchSemitones > 0 ? '+' : ''}{clip.pitchSemitones}st</span>
        )}
      </div>
      <div className="clip-wave">
        <Waveform
          peaks={meta?.analysis?.peaks}
          from={clip.reverse ? 1 - to : from}
          to={clip.reverse ? 1 - from : to}
          height={34}
          color={`hsl(${hue} 85% 74%)`}
        />
      </div>
      <div className="clip-resize" onPointerDown={startDrag('trim')} />
    </div>
  )
}

function ClipView({ clip, hue, ppb, selected, snapBeat }: {
  clip: Clip; hue: number; ppb: number; selected: boolean; snapBeat(v: number): number
}) {
  const { updateClip, select, commit, removeClip, duplicateClip } = useStore.getState()

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    select(clip.trackId, clip.id)
    const originX = e.clientX
    const origin = { start: clip.startBeat, length: clip.lengthBeats }
    let moved = false

    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - originX) / ppb
      if (!moved && Math.abs(ev.clientX - originX) > 3) { moved = true; commit() }
      if (!moved) return
      if (mode === 'move') {
        updateClip(clip.id, { startBeat: snapBeat(origin.start + delta) })
      } else {
        const raw = Math.max(clip.contentBeats * 0.25, origin.length + delta)
        // Resizing snaps to whole repeats of the clip's content.
        const repeats = Math.max(1, Math.round(raw / clip.contentBeats))
        updateClip(clip.id, { lengthBeats: repeats * clip.contentBeats })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pitches = clip.notes.map((n) => n.midi)
  const lo = pitches.length ? Math.min(...pitches) : 60
  const hi = pitches.length ? Math.max(...pitches) : 72
  const span = Math.max(6, hi - lo + 1)
  const repeats = Math.max(1, Math.round(clip.lengthBeats / Math.max(0.001, clip.contentBeats)))

  return (
    <div
      className={`clip ${selected ? 'sel' : ''}`}
      style={{ left: clip.startBeat * ppb, width: Math.max(10, clip.lengthBeats * ppb), ['--hue' as string]: hue }}
      onPointerDown={startDrag('move')}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        if (e.shiftKey) removeClip(clip.id)
        else duplicateClip(clip.id)
      }}
      title={`${clip.name} — drag to move, right-click to duplicate, shift+right-click to delete`}
    >
      <div className="clip-name">{clip.name}</div>
      {Array.from({ length: repeats - 1 }, (_, i) => (
        <div key={i} className="clip-loopmark" style={{ left: (i + 1) * clip.contentBeats * ppb }} />
      ))}
      <div className="clip-notes">
        {clip.notes.slice(0, 400).map((note) => (
          <div
            key={note.id}
            className="clip-note"
            style={{
              left: `${(note.start / clip.contentBeats) * (100 / repeats)}%`,
              width: `${Math.max(0.6, (note.duration / clip.contentBeats) * (100 / repeats))}%`,
              bottom: `${((note.midi - lo) / span) * 100}%`,
              ['--hue' as string]: hue,
            }}
          />
        ))}
      </div>
      <div className="clip-resize" onPointerDown={startDrag('resize')} />
    </div>
  )
}

export function ClipActions() {
  const clipId = useStore((s) => s.selectedClipId)
  const { duplicateClip, removeClip } = useStore.getState()
  if (!clipId) return null
  return (
    <>
      <button className="btn icon" title="Duplicate clip (⌘D)" onClick={() => duplicateClip(clipId)}>
        <Copy width={13} height={13} />
      </button>
      <button className="btn icon danger" title="Delete clip" onClick={() => removeClip(clipId)}>
        <Trash width={13} height={13} />
      </button>
    </>
  )
}
