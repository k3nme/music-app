import { useEffect, useState } from 'react'
import { engine } from '../../audio/engine'
import { formatPosition } from '../../music/project'
import { NOTE_NAMES, SCALES, type ScaleId } from '../../music/theory'
import { useStore } from '../../state/store'
import { usePlayhead } from '../hooks'
import {
  Download, Folder, Help as HelpIcon, Layers, Loop, Metronome, Mic, Play, Plus, Redo, Share, Stop, Undo,
} from '../icons'

function Jobs() {
  const jobs = useStore((s) => s.jobs)
  if (jobs.length === 0) return null
  // Only the newest matters visually; the rest are counted.
  const job = jobs[jobs.length - 1]
  return (
    <div className="jobs">
      <div className="job">
        <span className="job-spin" />
        {job.label}
        <span className="job-bar"><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></span>
        {jobs.length > 1 && <span style={{ color: 'var(--faint)' }}>+{jobs.length - 1}</span>}
      </div>
    </div>
  )
}

export function TopBar({ onOpenFiles, onExport, onShare, onMashup }: {
  onOpenFiles(): void
  onExport(): void
  onShare(): void
  onMashup(): void
}) {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const loopOn = useStore((s) => s.loopEnabled)
  const metro = useStore((s) => s.metronome)
  const { togglePlay, stop, rename, setBpm, setKey, undo, redo, setUI, addTrack } = useStore.getState()

  const beat = usePlayhead(playing)
  const [bpmDraft, setBpmDraft] = useState(String(project.bpm))

  useEffect(() => setBpmDraft(String(project.bpm)), [project.bpm])

  const commitBpm = () => {
    const value = Number(bpmDraft)
    if (Number.isFinite(value) && value > 0) setBpm(value)
    else setBpmDraft(String(project.bpm))
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 14c2.5 0 2.5-8 5-8s2.5 14 5 14 2.5-8 5-8" />
          </svg>
        </div>
        <span className="brand-name">Overtone</span>
      </div>

      <input
        className="project-name"
        value={project.name}
        onChange={(e) => rename(e.target.value)}
        spellCheck={false}
        aria-label="Project name"
      />

      <div className="sep" />

      <div className="transport">
        <button
          className={`play-btn ${playing ? 'playing' : ''}`}
          onClick={() => void togglePlay()}
          title={playing ? 'Stop (Space)' : 'Play (Space)'}
          aria-label={playing ? 'Stop' : 'Play'}
        >
          {playing ? <Stop width={15} height={15} /> : <Play width={15} height={15} />}
        </button>
        <button
          className="btn icon"
          onClick={() => { stop(); engine.seek(0) }}
          title="Back to start (Enter)"
          aria-label="Back to start"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="6" width="2.4" height="12" rx="1" /><path d="M20 6v12L9.5 12z" />
          </svg>
        </button>
        <div className="position mono">{formatPosition(beat, project.beatsPerBar)}</div>
        <button
          className={`btn icon ${loopOn ? 'on' : ''}`}
          onClick={() => setUI({ loopEnabled: !loopOn })}
          title="Loop (L)"
          aria-pressed={loopOn}
        >
          <Loop width={14} height={14} />
        </button>
        <button
          className={`btn icon ${metro ? 'on' : ''}`}
          onClick={() => setUI({ metronome: !metro })}
          title="Metronome (N)"
          aria-pressed={metro}
        >
          <Metronome width={14} height={14} />
        </button>
      </div>

      <div className="sep" />

      <label className="chip" title="Tempo">
        <input
          className="field bpm-input mono"
          style={{ height: 22, border: 'none', background: 'transparent', padding: 0 }}
          value={bpmDraft}
          onChange={(e) => setBpmDraft(e.target.value)}
          onBlur={commitBpm}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          inputMode="numeric"
          aria-label="Tempo in BPM"
        />
        <span style={{ color: 'var(--faint)' }}>BPM</span>
      </label>

      <select
        className="field"
        value={project.key.root}
        onChange={(e) => setKey(Number(e.target.value), project.key.scale)}
        title="Key"
        aria-label="Key root"
      >
        {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
      </select>
      <select
        className="field"
        style={{ maxWidth: 148 }}
        value={project.key.scale}
        onChange={(e) => setKey(project.key.root, e.target.value as ScaleId)}
        title="Scale — used for snapping hummed notes and shading the piano roll"
        aria-label="Scale"
      >
        {Object.entries(
          Object.entries(SCALES).reduce<Record<string, [string, string][]>>((acc, [id, s]) => {
            ;(acc[s.group] ??= []).push([id, s.label])
            return acc
          }, {}),
        ).map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </optgroup>
        ))}
      </select>

      <div className="spacer" />

      <Jobs />

      <button className="btn icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"><Undo width={14} height={14} /></button>
      <button className="btn icon" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)"><Redo width={14} height={14} /></button>
      <div className="sep" />
      <button className="btn" onClick={() => addTrack('warm-pad')} title="Add a track (T)">
        <Plus width={13} height={13} /> Track
      </button>
      <button className="btn icon" onClick={onOpenFiles} title="Projects"><Folder width={14} height={14} /></button>
      <button className="btn icon" onClick={onShare} title="Share link"><Share width={14} height={14} /></button>
      <button className="btn icon" onClick={onExport} title="Export audio or MIDI"><Download width={14} height={14} /></button>
      <button className="btn icon" onClick={() => setUI({ helpOpen: true })} title="Help (?)"><HelpIcon width={14} height={14} /></button>

      <button className="btn lg mashup-btn" onClick={onMashup} title="Mash up two or more songs (M)">
        <Layers width={14} height={14} /> Mashup
      </button>
      <button className="hum-btn" onClick={() => setUI({ humOpen: true })} title="Hum, sing or beatbox an idea (H)">
        <Mic width={15} height={15} /> Hum it
      </button>
    </header>
  )
}
