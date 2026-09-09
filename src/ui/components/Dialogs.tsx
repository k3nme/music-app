import { useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { exportMidi, exportTrackStems, exportWav } from '../../lib/export'
import {
  deleteProject, downloadProject, listProjects, loadProject, readProjectFile, saveProject,
  type ProjectSummary,
} from '../../lib/persistence'
import { copyToClipboard, createShareLink } from '../../lib/share'
import { formatBytes, knownSamples, deleteSample, storageUsage } from '../../lib/samples'
import { contentEndBeat } from '../../music/project'
import { useStore } from '../../state/store'
import { Close, Download, Share, Trash } from '../icons'

function Sheet({ title, sub, onClose, children, foot }: {
  title: string; sub?: string; onClose(): void
  children: React.ReactNode; foot?: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="sheet narrow" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{title}</div>
            {sub && <div className="sheet-sub">{sub}</div>}
          </div>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><Close width={15} height={15} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function FilesDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const { setProject, newProject, flash } = useStore.getState()
  const [entries, setEntries] = useState<ProjectSummary[]>(() => listProjects())
  const [samples, setSamples] = useState(() => knownSamples())
  const [usage, setUsage] = useState({ usedBytes: 0, quotaBytes: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    setEntries(listProjects())
    setSamples(knownSamples())
    void storageUsage().then(setUsage)
  }

  useEffect(() => { void storageUsage().then(setUsage) }, [])

  return (
    <Sheet
      title="Projects"
      sub="Everything is stored in this browser. Download a project to keep it somewhere safer."
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import file…</button>
          <div className="spacer" />
          <button className="btn" onClick={() => { newProject(); onClose() }}>New project</button>
          <button
            className="btn primary"
            onClick={() => {
              const ok = saveProject(useStore.getState().project)
              flash(ok ? 'Project saved' : 'Could not save — storage may be full', ok ? 'good' : 'warn')
              refresh()
            }}
          >Save “{project.name}”</button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            setProject(await readProjectFile(file), { resetHistory: true })
            flash('Project imported', 'good')
            onClose()
          } catch (err) {
            flash(err instanceof Error ? err.message : 'Could not read that file', 'warn')
          }
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.length === 0 && (
          <div style={{ color: 'var(--faint)', padding: '12px 0' }}>
            No saved projects yet. Save this one to come back to it later.
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
              background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{entry.name}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)' }}>
                {entry.trackCount} tracks · {entry.bpm} BPM · {new Date(entry.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              className="btn"
              onClick={() => {
                const loaded = loadProject(entry.id)
                if (!loaded) { flash('Could not open that project', 'warn'); return }
                engine.stop(0)
                setProject(loaded, { resetHistory: true })
                onClose()
              }}
            >Open</button>
            <button className="btn icon" title="Download" onClick={() => { const p = loadProject(entry.id); if (p) downloadProject(p) }}>
              <Download width={13} height={13} />
            </button>
            <button
              className="btn icon danger"
              title="Delete"
              onClick={() => { deleteProject(entry.id); refresh() }}
            ><Trash width={13} height={13} /></button>
          </div>
        ))}
      </div>

      {samples.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Audio storage — {formatBytes(usage.usedBytes)}
            {usage.quotaBytes > 0 && ` of about ${formatBytes(usage.quotaBytes)} available`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflow: 'auto' }}>
            {samples.map((sample) => (
              <div key={sample.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px',
                background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sample.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--faint)' }}>
                    {sample.durationSec.toFixed(1)}s · {formatBytes(sample.byteSize)}
                    {sample.analysis && ` · ${Math.round(sample.analysis.beat.bpm)} BPM`}
                  </div>
                </div>
                <button
                  className="btn icon danger"
                  title="Delete this audio"
                  onClick={async () => {
                    const inUse = (project.audioClips ?? []).some((c) => c.sampleId === sample.id)
                    if (inUse) { flash('That audio is used in this project', 'warn'); return }
                    await deleteSample(sample.id)
                    refresh()
                  }}
                ><Trash width={12} height={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const { flash } = useStore.getState()
  const [busy, setBusy] = useState(false)
  const [scope, setScope] = useState<'song' | 'loop'>('song')

  const end = Math.max(contentEndBeat(project), project.lengthBeats)
  const seconds = ((scope === 'loop' ? engine.loopEnd - engine.loopStart : end) * 60) / project.bpm

  return (
    <Sheet
      title="Export"
      sub="WAV renders the real signal chain offline — faster than real time, and identical to what you hear."
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="label">Range</span>
          <button className={`btn ${scope === 'song' ? 'on' : ''}`} onClick={() => setScope('song')}>
            Whole song
          </button>
          <button className={`btn ${scope === 'loop' ? 'on' : ''}`} onClick={() => setScope('loop')}>
            Loop region
          </button>
          <div className="spacer" />
          <span className="mono" style={{ color: 'var(--faint)', fontSize: 11.5 }}>
            ≈{Math.max(1, Math.round(seconds))}s
          </span>
        </div>

        <button
          className="btn primary lg"
          disabled={busy || (project.clips.length === 0 && (project.audioClips ?? []).length === 0)}
          onClick={async () => {
            setBusy(true)
            try {
              await exportWav(project, {
                range: scope === 'loop'
                  ? { startBeat: engine.loopStart, endBeat: engine.loopEnd }
                  : undefined,
              })
              flash('WAV exported', 'good')
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Export failed', 'warn')
            } finally {
              setBusy(false)
            }
          }}
        >
          <Download width={14} height={14} /> {busy ? 'Rendering…' : 'Export WAV'}
        </button>

        <button
          className="btn lg"
          disabled={busy || project.tracks.length === 0}
          onClick={async () => {
            setBusy(true)
            try {
              await exportTrackStems(project, {
                range: scope === 'loop'
                  ? { startBeat: engine.loopStart, endBeat: engine.loopEnd }
                  : undefined,
                onTrack: (name, index, total) => flash(`Bouncing ${name} (${index + 1}/${total})`),
              })
              flash('Track stems exported', 'good')
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Export failed', 'warn')
            } finally {
              setBusy(false)
            }
          }}
        >
          Export each track as its own WAV
        </button>

        <button
          className="btn lg"
          disabled={project.clips.length === 0}
          onClick={() => { exportMidi(project); flash('MIDI exported', 'good') }}
        >
          Export MIDI — take it into any other DAW
        </button>

        <button className="btn lg" onClick={() => downloadProject(project)}>
          Download project file (.json)
        </button>

        {project.clips.length === 0 && (project.audioClips ?? []).length === 0 && (
          <div style={{ color: 'var(--faint)', fontSize: 12 }}>Add something to the arrangement first.</div>
        )}
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function ShareDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const { flash } = useStore.getState()
  const [link, setLink] = useState<string | null>(null)
  const [tooLong, setTooLong] = useState(false)

  useEffect(() => {
    let cancelled = false
    void createShareLink(project).then((url) => {
      if (cancelled) return
      setLink(url)
      setTooLong(url.length > 30000)
    })
    return () => { cancelled = true }
  }, [project])

  return (
    <Sheet
      title="Share this song"
      sub="The whole song is encoded in the link itself — no account, no upload, nothing stored on a server."
      onClose={onClose}
      foot={
        <>
          <div className="spacer" />
          <button
            className="btn primary"
            disabled={!link}
            onClick={async () => {
              if (!link) return
              flash(await copyToClipboard(link) ? 'Link copied' : 'Could not copy — select it and copy manually', 'good')
            }}
          >
            <Share width={13} height={13} /> Copy link
          </button>
        </>
      }
    >
      <textarea
        className="field"
        readOnly
        value={link ?? 'Building link…'}
        onFocus={(e) => e.currentTarget.select()}
        style={{ width: '100%', height: 96, resize: 'none', padding: 9, lineHeight: 1.4, fontSize: 11 }}
      />
      <div style={{ marginTop: 10, fontSize: 11.5, color: tooLong ? 'var(--warn)' : 'var(--faint)' }}>
        {tooLong
          ? 'This link is very long and some apps will truncate it. Export the project file instead for big arrangements.'
          : `${link ? Math.round(link.length / 1024) : 0} KB. Anyone who opens it gets an editable copy.`}
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / stop'],
  ['Enter', 'Return to start'],
  ['H', 'Hum something in'],
  ['T', 'Add an instrument'],
  ['I', 'Ideas — chords, bass, drums'],
  ['L', 'Toggle loop'],
  ['N', 'Metronome'],
  ['⌘/Ctrl + Z', 'Undo'],
  ['⌘/Ctrl + ⇧ + Z', 'Redo'],
  ['⌘/Ctrl + S', 'Save project'],
  ['⌘/Ctrl + D', 'Duplicate clip'],
  ['Delete', 'Delete selected notes'],
  ['A…J, W E T Y U', 'Play the keyboard (Play tab)'],
  ['Z / X', 'Octave down / up'],
  ['⌘/Ctrl + scroll', 'Zoom the timeline'],
]

export function HelpDialog({ onClose }: { onClose(): void }) {
  return (
    <Sheet title="How Overtone works" onClose={onClose}>
      <div className="help-grid">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>The idea</div>
          <p style={{ color: 'var(--dim)', margin: 0, lineHeight: 1.65, fontSize: 12.5 }}>
            Hum, sing or beatbox anything. Overtone tracks the pitch and rhythm, turns it into
            notes, and plays them on whatever instrument you pick — a sitar, an 808, a string
            section. From there it's a normal studio: loop it, arrange it, layer more parts.
          </p>
          <p style={{ color: 'var(--dim)', marginTop: 12, lineHeight: 1.65, fontSize: 12.5 }}>
            Every instrument is synthesised from scratch rather than sampled, which is why the
            app loads instantly and keeps working offline.
          </p>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Shortcuts</div>
          {SHORTCUTS.map(([key, label]) => (
            <div className="help-row" key={key}>
              <span>{label}</span>
              <span className="kbd">{key}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function Welcome({ onStart }: { onStart(demo: boolean): void }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-mark">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 14c2.5 0 2.5-8 5-8s2.5 14 5 14 2.5-8 5-8" />
          </svg>
        </div>
        <h1>Overtone</h1>
        <p>
          Hum it, hear it on anything.<br />
          Sing an idea and play it back on a sitar, an 808, a string section — then loop it,
          arrange it and build the whole track.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn primary lg" onClick={() => onStart(true)}>Start with a groove</button>
          <button className="btn lg" onClick={() => onStart(false)}>Start empty</button>
        </div>
        <div style={{ color: 'var(--faint)', fontSize: 11.5, marginTop: 6 }}>
          Works best with headphones. Nothing you make leaves your browser.
        </div>
      </div>
    </div>
  )
}
