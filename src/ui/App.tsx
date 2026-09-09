import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { demoProject } from '../music/demo'
import { emptyProject, projectSampleIds } from '../music/project'
import { hydrateProjectSamples } from '../lib/samples'
import { GRID_OPTIONS } from '../music/quantize'
import { loadLastProject, saveProject } from '../lib/persistence'
import { readShareLink } from '../lib/share'
import { syncEngine, useStore } from '../state/store'
import { Arrangement, ClipActions } from './components/Arrangement'
import { AudioClipEditor } from './components/AudioClipEditor'
import { DrumGrid } from './components/DrumGrid'
import { ExportDialog, FilesDialog, HelpDialog, ShareDialog, Welcome } from './components/Dialogs'
import { HumStudio } from './components/HumStudio'
import { IdeasButton, IdeasPanel } from './components/IdeasPanel'
import { InstrumentPicker } from './components/InstrumentPicker'
import { MashupLab } from './components/MashupLab'
import { Keyboard } from './components/Keyboard'
import { Mixer } from './components/Mixer'
import { PianoRoll } from './components/PianoRoll'
import { TopBar } from './components/TopBar'
import { Note as NoteIcon, Piano, Sliders } from './icons'

type Dialog = 'files' | 'export' | 'share' | 'ideas' | 'mashup' | null

export function App() {
  const project = useStore((s) => s.project)
  const humOpen = useStore((s) => s.humOpen)
  const helpOpen = useStore((s) => s.helpOpen)
  const pickerFor = useStore((s) => s.instrumentPickerFor)
  const status = useStore((s) => s.status)
  const editorTab = useStore((s) => s.editorTab)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const selectedClipId = useStore((s) => s.selectedClipId)
  const selectedAudioClipId = useStore((s) => s.selectedAudioClipId)
  const grid = useStore((s) => s.grid)
  const snap = useStore((s) => s.snap)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [started, setStarted] = useState(false)
  const [booting, setBooting] = useState(true)

  // --- boot: a shared link wins, then the last local session ---------------
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const shared = await readShareLink()
      if (cancelled) return
      if (shared) {
        useStore.getState().setProject(shared, { resetHistory: true })
        useStore.getState().flash(`Opened “${shared.name}” from a shared link`, 'good')
        history.replaceState(null, '', location.pathname + location.search)
        setBooting(false)
        return
      }
      const last = loadLastProject()
      if (last && last.tracks.length > 0) {
        useStore.getState().setProject(last, { resetHistory: true })
      }
      setBooting(false)
    })()
    return () => { cancelled = true }
  }, [])

  const start = useCallback(async (demo: boolean) => {
    const state = useStore.getState()
    const hasContent = state.project.tracks.length > 0
    if (!hasContent) {
      state.setProject(demo ? demoProject() : emptyProject(), { resetHistory: true })
    }
    await engine.resume()
    useStore.setState({ audioReady: true })
    syncEngine(useStore.getState().project, true)
    setStarted(true)
  }, [])

  // --- keep stored audio loaded for whatever the project references --------
  const hydrated = useRef(new Set<string>())
  useEffect(() => {
    if (!started) return
    const ids = projectSampleIds(project).filter((id) => !hydrated.current.has(id))
    if (ids.length === 0) return
    for (const id of ids) hydrated.current.add(id)
    void (async () => {
      const ctx = await engine.resume()
      const missing = await hydrateProjectSamples(ctx, ids)
      if (missing.length > 0) {
        useStore.getState().flash(
          `${missing.length} audio file${missing.length > 1 ? 's are' : ' is'} missing from this browser's storage`,
          'warn',
        )
      }
    })()
  }, [started, project.audioClips, project])

  // --- autosave ------------------------------------------------------------
  useEffect(() => {
    if (!started || project.tracks.length === 0) return
    const id = window.setTimeout(() => saveProject(project), 1200)
    return () => window.clearTimeout(id)
  }, [project, started])

  // --- global shortcuts ----------------------------------------------------
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    }
    const onKey = (e: KeyboardEvent) => {
      const state = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.code === 'KeyZ') {
        e.preventDefault()
        e.shiftKey ? state.redo() : state.undo()
        return
      }
      if (mod && e.code === 'KeyS') {
        e.preventDefault()
        const ok = saveProject(state.project)
        state.flash(ok ? 'Saved' : 'Could not save', ok ? 'good' : 'warn')
        return
      }
      if (mod && e.code === 'KeyD') {
        if (state.selectedClipId) { e.preventDefault(); state.duplicateClip(state.selectedClipId) }
        return
      }
      if (typing() || mod) return

      // While the Play tab is open its keys are musical, so only the
      // non-letter shortcuts stay live — otherwise humming an H would both
      // play a note and open a dialog.
      const letterShortcutsLive = state.editorTab !== 'keyboard'

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          void state.togglePlay()
          break
        case 'Enter':
          e.preventDefault()
          state.stop()
          engine.seek(0)
          break
        case 'KeyH':
          if (letterShortcutsLive && !state.humOpen) { e.preventDefault(); state.setUI({ humOpen: true }) }
          break
        case 'KeyT':
          if (letterShortcutsLive) { e.preventDefault(); state.setUI({ instrumentPickerFor: 'new' }) }
          break
        case 'KeyI':
          if (letterShortcutsLive) { e.preventDefault(); setDialog((d) => (d === 'ideas' ? null : 'ideas')) }
          break
        case 'KeyM':
          if (letterShortcutsLive) { e.preventDefault(); setDialog((d) => (d === 'mashup' ? null : 'mashup')) }
          break
        case 'KeyL':
          if (!letterShortcutsLive) break
          state.setUI({ loopEnabled: !state.loopEnabled })
          state.flash(state.loopEnabled ? 'Loop off' : 'Loop on')
          break
        case 'KeyN':
          if (!letterShortcutsLive) break
          state.setUI({ metronome: !state.metronome })
          state.flash(state.metronome ? 'Metronome off' : 'Metronome on')
          break
        case 'Backspace':
        case 'Delete':
          if (state.selectedClipId && state.selectedNoteIds.length > 0) {
            e.preventDefault()
            state.removeNotes(state.selectedClipId, state.selectedNoteIds)
          }
          break
        case 'Slash':
          if (e.shiftKey) state.setUI({ helpOpen: true })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Release the audio graph when the tab goes away.
  useEffect(() => {
    const onHide = () => { if (document.hidden) engine.panic() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const track = project.tracks.find((t) => t.id === selectedTrackId) ?? project.tracks[0] ?? null
  const clip = project.clips.find((c) => c.id === selectedClipId)
    ?? (track ? project.clips.find((c) => c.trackId === track.id) : undefined)
    ?? null
  const audioClip = (project.audioClips ?? []).find((c) => c.id === selectedAudioClipId)
    ?? (track ? (project.audioClips ?? []).find((c) => c.trackId === track.id) : undefined)
    ?? null

  if (!started) {
    return booting ? <div className="welcome" /> : <Welcome onStart={(demo) => void start(demo)} />
  }

  return (
    <div className="app">
      <TopBar
        onOpenFiles={() => setDialog('files')}
        onExport={() => setDialog('export')}
        onShare={() => setDialog('share')}
        onMashup={() => setDialog('mashup')}
      />

      <div className="main">
        <Arrangement />

        <div className="editor-pane">
          <div className="editor-head">
            <div className="tabs">
              <button className={`tab ${editorTab === 'notes' ? 'on' : ''}`} onClick={() => useStore.getState().setUI({ editorTab: 'notes' })}>
                <NoteIcon width={12} height={12} style={{ marginRight: 5, verticalAlign: -2 }} />
                {track?.kind === 'audio' ? 'Audio' : track?.isDrum ? 'Beat' : 'Notes'}
              </button>
              <button className={`tab ${editorTab === 'keyboard' ? 'on' : ''}`} onClick={() => useStore.getState().setUI({ editorTab: 'keyboard' })}>
                <Piano width={12} height={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Play
              </button>
              <button className={`tab ${editorTab === 'mixer' ? 'on' : ''}`} onClick={() => useStore.getState().setUI({ editorTab: 'mixer' })}>
                <Sliders width={12} height={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Mix
              </button>
            </div>

            {editorTab === 'notes' && track?.kind !== 'audio' && (
              <>
                <div className="sep" />
                <span className="label">Grid</span>
                <select
                  className="field"
                  value={grid}
                  onChange={(e) => useStore.getState().setUI({ grid: Number(e.target.value) })}
                >
                  {GRID_OPTIONS.map((g) => <option key={g.label} value={g.value}>{g.label}</option>)}
                </select>
                <button
                  className={`btn ${snap ? 'on' : ''}`}
                  onClick={() => useStore.getState().setUI({ snap: !snap })}
                  title="Snap edits to the grid"
                >Snap</button>
              </>
            )}

            <div className="spacer" />
            {clip && <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>{clip.name}</span>}
            <ClipActions />
            <IdeasButton onClick={() => setDialog('ideas')} />
          </div>

          <div className="editor-body" style={{ position: 'relative' }}>
            {editorTab === 'mixer' && <Mixer />}
            {editorTab === 'keyboard' && (track
              ? <Keyboard track={track} clip={clip} />
              : <EmptyEditor message="Add a track to start playing." />)}
            {editorTab === 'notes' && (
              track?.kind === 'audio'
                ? (audioClip
                    ? <AudioClipEditor clip={audioClip} track={track} />
                    : <EmptyEditor message="Drop an audio file onto this track’s row above." />)
                : track && clip
                  ? (track.isDrum
                      ? <DrumGrid clip={clip} track={track} />
                      : <PianoRoll clip={clip} track={track} />)
                  : <EmptyEditor message={
                      track
                        ? 'Double-click in this track’s row above to add a clip.'
                        : 'Hum something in, drop in an audio file, or add an instrument.'
                    } />
            )}
          </div>
        </div>
      </div>

      {humOpen && <HumStudio />}
      {pickerFor && <InstrumentPicker />}
      {helpOpen && <HelpDialog onClose={() => useStore.getState().setUI({ helpOpen: false })} />}
      {dialog === 'files' && <FilesDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
      {dialog === 'ideas' && <IdeasPanel onClose={() => setDialog(null)} />}
      {dialog === 'mashup' && <MashupLab onClose={() => setDialog(null)} />}

      {status && <div className={`toast ${status.tone}`}>{status.message}</div>}
    </div>
  )
}

function EmptyEditor({ message }: { message: string }) {
  return (
    <div style={{
      flex: 1, display: 'grid', placeItems: 'center',
      color: 'var(--faint)', fontSize: 12.5, textAlign: 'center', padding: 24,
    }}>
      {message}
    </div>
  )
}
