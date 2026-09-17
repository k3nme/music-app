import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine, DEFAULT_CHANNEL } from '../../audio/engine'
import { analyseRecording, type AnalysisResult } from '../../audio/analysis'
import type { AudioAnalysis } from '../../audio/analysis/audio'
import { analyseAudioInWorker } from '../../audio/workers'
import { chordNotes } from '../../music/theory'
import { ALL_PRESETS, getPreset, isDrumPreset, kitPieces } from '../../audio/instruments'
import { recorder } from '../../audio/recorder'
import { createClip, createNote, type Note } from '../../music/project'
import { GRID_OPTIONS, notesFromAnalysis, notesFromHits, roundToBars } from '../../music/quantize'
import { detectKey, type KeyGuess } from '../../music/key'
import { midiToName, NOTE_NAMES, SCALES } from '../../music/theory'
import { useStore } from '../../state/store'
import { Close, Mic, Play, Stop, Wand } from '../icons'
import { Term } from './Term'

type Stage = 'setup' | 'recording' | 'analysing' | 'result'
type Mode = 'melody' | 'beat' | 'chords'

const PREVIEW_TRACK = '__hum_preview__'
const MAX_SECONDS = 40

/** Instruments offered as quick picks, by mode. */
const QUICK_MELODIC = ['grand-piano', 'rhodes', 'steel-guitar', 'sitar', 'supersaw', 'cello', 'bansuri', 'marimba', 'warm-pad', 'bass-guitar']
const QUICK_DRUMS = ['kit-808', 'kit-909', 'kit-acoustic', 'kit-lofi', 'kit-tabla', 'kit-latin']
const QUICK_CHORDS = ['rhodes', 'warm-pad', 'grand-piano', 'nylon-guitar', 'drawbar-organ', 'string-ensemble']

export function HumStudio() {
  const project = useStore((s) => s.project)
  const { setUI, flash, addTrack, commit, setBpm, setKey } = useStore.getState()

  const [stage, setStage] = useState<Stage>('setup')
  const [mode, setMode] = useState<Mode>('melody')
  const [presetId, setPresetId] = useState('grand-piano')
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState(0)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  /** Chord mode uses the full audio analyser rather than the pitch tracker. */
  const [chordAnalysis, setChordAnalysis] = useState<AudioAnalysis | null>(null)
  const [clickTrack, setClickTrack] = useState(true)

  // Quantisation controls, live-applied to the preview.
  const [grid, setGrid] = useState(0.25)
  const [strength, setStrength] = useState(0.8)
  const [snapScale, setSnapScale] = useState(true)
  const [useDetectedTempo, setUseDetectedTempo] = useState(false)
  const [useDetectedKey, setUseDetectedKey] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const levelHistory = useRef<number[]>([])
  const stopTimer = useRef<number | null>(null)
  const previewTimers = useRef<number[]>([])

  const preset = getPreset(presetId)
  const detectedTempo = mode === 'chords'
    ? (chordAnalysis && chordAnalysis.beat.confidence > 0.2 ? Math.round(chordAnalysis.beat.bpm) : null)
    : (analysis?.tempo ?? null)
  const targetBpm = useDetectedTempo && detectedTempo ? detectedTempo : project.bpm

  /** What key the take itself is in — so snapping helps instead of transposing. */
  const detectedKey: KeyGuess | null = useMemo(() => {
    if (mode === 'chords') {
      if (!chordAnalysis) return null
      return {
        root: chordAnalysis.key.root,
        scale: chordAnalysis.key.mode === 'major' ? 'major' : 'minor',
        confidence: chordAnalysis.key.confidence,
      }
    }
    if (!analysis || mode === 'beat') return null
    return detectKey(analysis.notes.map((n) => ({
      midi: n.midi, duration: n.endSec - n.startSec, velocity: n.velocity,
    })))
  }, [analysis, chordAnalysis, mode])

  const targetKey = useDetectedKey && detectedKey
    ? { root: detectedKey.root, scale: detectedKey.scale }
    : project.key

  // --- derived notes -------------------------------------------------------

  const notes: Note[] = useMemo(() => {
    if (mode === 'chords') {
      if (!chordAnalysis) return []
      const beatsPerSecond = targetBpm / 60
      const offset = chordAnalysis.chords[0]?.timeSec ?? 0
      const snapTo = (beats: number) => (grid > 0 ? Math.round(beats / grid) * grid : beats)
      return chordAnalysis.chords.flatMap((chord) => {
        const start = Math.max(0, snapTo((chord.timeSec - offset) * beatsPerSecond))
        const duration = Math.max(grid || 0.5, snapTo(chord.durationSec * beatsPerSecond))
        // Voiced in first inversion around middle C, which keeps a progression
        // from leaping around as the roots move.
        return chordNotes(48 + chord.root, chord.quality === 'min' ? 'min' : 'maj', 1)
          .map((midi) => createNote(midi, start, duration - 0.05, 0.6 + chord.confidence * 0.3))
      })
    }
    if (!analysis) return []
    if (mode === 'beat') {
      const pieces = kitPieces(preset)
      const find = (match: (name: string) => boolean, fallback: number) =>
        pieces.find((p) => match(p.piece.name.toLowerCase()))?.midi ?? fallback
      return notesFromHits(
        analysis.hits,
        {
          low: find((n) => n.includes('kick') || n.includes('bass'), pieces[0]?.midi ?? 36),
          mid: find((n) => n.includes('snare') || n.includes('clap') || n.includes('tone'), pieces[1]?.midi ?? 38),
          high: find((n) => n.includes('hat') || n.includes('shaker') || n.includes('ride'), pieces[pieces.length - 1]?.midi ?? 42),
        },
        { bpm: targetBpm, grid, strength, trimStart: true },
      )
    }
    return notesFromAnalysis(analysis.notes, {
      bpm: targetBpm, grid, strength, snapScale,
      root: targetKey.root, scale: targetKey.scale,
      fitRange: preset.range, trimStart: true,
    })
  }, [analysis, chordAnalysis, mode, grid, strength, snapScale, targetKey, preset, targetBpm])

  const lengthBeats = useMemo(() => {
    if (notes.length === 0) return project.beatsPerBar * 2
    const end = Math.max(...notes.map((n) => n.start + n.duration))
    return roundToBars(end, project.beatsPerBar)
  }, [notes, project.beatsPerBar])

  // --- preview -------------------------------------------------------------

  const stopPreview = useCallback(() => {
    for (const id of previewTimers.current) window.clearTimeout(id)
    previewTimers.current = []
    engine.panic()
    setPreviewing(false)
  }, [])

  const startPreview = useCallback(() => {
    stopPreview()
    if (notes.length === 0) return
    engine.ensureTrack(PREVIEW_TRACK, presetId, { ...DEFAULT_CHANNEL, reverbSend: 0.18 })
    const beatSec = 60 / targetBpm
    const t0 = engine.currentTime + 0.12
    for (const note of notes) {
      engine.playNoteAt(PREVIEW_TRACK, note.midi, t0 + note.start * beatSec, note.duration * beatSec, note.velocity)
    }
    setPreviewing(true)
    const total = lengthBeats * beatSec * 1000
    previewTimers.current.push(window.setTimeout(() => setPreviewing(false), total + 150))
  }, [notes, presetId, targetBpm, lengthBeats, stopPreview])

  // Swapping the instrument mid-preview should be instant — that's the whole point.
  useEffect(() => {
    if (previewing) startPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  useEffect(() => () => {
    stopPreview()
    engine.removeTrack(PREVIEW_TRACK)
    if (recorder.recording) recorder.stop()
    recorder.close()
  }, [stopPreview])

  // --- recording -----------------------------------------------------------

  const beginRecording = async () => {
    setError(null)
    try {
      const ctx = await engine.resume()
      await recorder.open(ctx)
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser’s address bar, then try again.'
          : err instanceof Error ? err.message : 'Could not open the microphone.',
      )
      return
    }

    levelHistory.current = []
    recorder.onLevel = (peak) => {
      setLevel(peak)
      levelHistory.current.push(peak)
      if (levelHistory.current.length > 400) levelHistory.current.shift()
      setElapsed(recorder.elapsed)
    }

    const beatSec = 60 / project.bpm
    if (clickTrack) {
      const start = engine.currentTime + 0.15
      // Two bars: one counting in, one to hum against.
      for (let i = 0; i < project.beatsPerBar * 2; i++) {
        engine.scheduleClick(start + i * beatSec, i % project.beatsPerBar === 0)
      }
    }

    const delay = clickTrack ? project.beatsPerBar * beatSec * 1000 + 150 : 0
    stopTimer.current = window.setTimeout(() => {
      recorder.start()
      setStage('recording')
      // Hard stop so a forgotten tab doesn't record forever.
      stopTimer.current = window.setTimeout(() => void finishRecording(), MAX_SECONDS * 1000)
    }, delay)

    if (clickTrack) setStage('recording')
  }

  const finishRecording = async () => {
    if (stopTimer.current) { window.clearTimeout(stopTimer.current); stopTimer.current = null }
    const pcm = recorder.stop()
    recorder.onLevel = null
    setStage('analysing')
    setProgress(0)

    if (pcm.length < recorder.sampleRate * 0.25) {
      setError('That was too short to work with — try humming for a few seconds.')
      setStage('setup')
      return
    }

    try {
      if (mode === 'chords') {
        const result = await analyseAudioInWorker(
          [pcm], recorder.sampleRate, ({ fraction }) => setProgress(fraction),
        )
        setChordAnalysis(result)
        if (result.chords.length === 0) {
          setError('No chords found. Try strumming or holding each chord for a beat or two.')
          setStage('setup')
          return
        }
        setUseDetectedTempo(false)
        setUseDetectedKey(project.clips.length === 0 && result.key.confidence > 0.25)
        setStage('result')
        return
      }

      const result = await analyseRecording(pcm, recorder.sampleRate, undefined, setProgress)
      setAnalysis(result)
      if (result.peak < 0.02) {
        setError('That recording is very quiet. Check your mic input and try again.')
        setStage('setup')
        return
      }
      const found = mode === 'beat' ? result.hits.length : result.notes.length
      if (found === 0) {
        setError(
          mode === 'beat'
            ? 'No hits found. Try tapping or beatboxing closer to the mic.'
            : 'No pitch found. Hum a steady “aah” or “doo” — whistling and singing both work well.',
        )
        setStage('setup')
        return
      }
      setUseDetectedTempo(false)
      // Adopting the hummed key is only safe when nothing is written yet —
      // otherwise it would re-key an arrangement the user already likes.
      const guess = mode === 'beat' ? null : detectKey(result.notes.map((n) => ({
        midi: n.midi, duration: n.endSec - n.startSec, velocity: n.velocity,
      })))
      // On an empty project any read of the take beats the arbitrary default
      // key — snapping to C minor would bend a melody that was never in it.
      // Once there's material to protect, only a confident guess is offered.
      setUseDetectedKey(
        Boolean(guess) && (project.clips.length === 0 || guess!.confidence > 0.3),
      )
      setStage('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
      setStage('setup')
    }
  }

  // --- commit --------------------------------------------------------------

  const addToProject = () => {
    stopPreview()
    if (useDetectedTempo && analysis?.tempo) setBpm(analysis.tempo)
    if (useDetectedKey && detectedKey) setKey(detectedKey.root, detectedKey.scale)

    const trackId = addTrack(presetId, preset.name)
    const clip = createClip(trackId, {
      name: mode === 'beat' ? 'Beatbox' : mode === 'chords' ? 'Chords' : 'Hummed idea',
      startBeat: 0,
      contentBeats: lengthBeats,
      lengthBeats,
      notes,
    })
    commit()
    useStore.setState((s) => ({
      project: {
        ...s.project,
        clips: [...s.project.clips, clip],
        lengthBeats: Math.max(s.project.lengthBeats, lengthBeats),
      },
      selectedClipId: clip.id,
      selectedTrackId: trackId,
      humOpen: false,
    }))
    flash(`${notes.length} notes added as ${preset.name}`, 'good')
  }

  const close = () => { stopPreview(); setUI({ humOpen: false }) }
  const quickPicks = mode === 'beat' ? QUICK_DRUMS : mode === 'chords' ? QUICK_CHORDS : QUICK_MELODIC

  return (
    <div className="overlay" onPointerDown={close}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Hum it, hear it on anything</div>
            <div className="sheet-sub">
              Sing, hum, whistle, beatbox, or play chords on any instrument. Overtone works out the
              notes and plays them back on whatever you like.
            </div>
          </div>
          <div className="spacer" />
          <Steps stage={stage} />
          <button className="btn icon ghost" onClick={close} aria-label="Close"><Close width={15} height={15} /></button>
        </div>

        <div className="sheet-body">
          <div className="hum">
            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
                background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.35)', color: '#ffb3c0',
              }}>{error}</div>
            )}

            {(stage === 'setup' || stage === 'recording') && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="label">I'll be</span>
                  <button className={`btn ${mode === 'melody' ? 'on' : ''}`} onClick={() => setMode('melody')} disabled={stage === 'recording'}>
                    Humming a melody
                  </button>
                  <button className={`btn ${mode === 'beat' ? 'on' : ''}`} onClick={() => { setMode('beat'); setPresetId('kit-808') }} disabled={stage === 'recording'}>
                    Beatboxing a rhythm
                  </button>
                  <button
                    className={`btn ${mode === 'chords' ? 'on' : ''}`}
                    onClick={() => { setMode('chords'); setPresetId('rhodes') }}
                    disabled={stage === 'recording'}
                    title="Play chords on any instrument and Overtone will work out the progression"
                  >
                    Playing chords
                  </button>
                  <div className="spacer" />
                  <label className="chip" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={clickTrack} onChange={(e) => setClickTrack(e.target.checked)} disabled={stage === 'recording'} />
                    Count me in at {project.bpm} BPM
                  </label>
                </div>

                <div className="hum-stage">
                  <Waveform history={levelHistory.current} recording={stage === 'recording'} />
                  <button
                    className={`hum-orb ${stage === 'recording' ? 'armed' : ''}`}
                    style={{ transform: `scale(${1 + Math.min(0.35, level * 1.2)})` }}
                    onClick={() => (stage === 'recording' ? void finishRecording() : void beginRecording())}
                  >
                    {stage === 'recording' ? <Stop width={26} height={26} /> : <Mic width={30} height={30} />}
                  </button>
                </div>

                <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 12.5 }}>
                  {stage === 'recording' ? (
                    <>Recording — <span className="mono">{elapsed.toFixed(1)}s</span> · click the button when you're done</>
                  ) : (
                    mode === 'chords'
                      ? <>Play or strum chords into the mic — guitar, piano, anything. Hold each one for a beat or two so it can be read.</>
                      : mode === 'beat'
                        ? <>Beatbox or tap a rhythm. Low sounds become kicks, mid ones snares, sharp ones hats.</>
                        : <>Click the mic and hum. A steady “doo” or “aah” tracks best — and it's fine to be a bit off, you can tidy it up after.</>
                  )}
                </div>
              </>
            )}

            {stage === 'analysing' && (
              <div className="hum-stage" style={{ flexDirection: 'column', gap: 14 }}>
                <Wand width={30} height={30} />
                <div style={{ color: 'var(--dim)' }}>Finding the notes…</div>
                <div style={{ width: 220, height: 4, background: 'var(--panel-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.15s linear' }} />
                </div>
              </div>
            )}

            {stage === 'result' && (analysis || chordAnalysis) && (
              <>
                <NotePreview notes={notes} lengthBeats={lengthBeats} hue={preset.hue} />

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn primary lg" onClick={() => (previewing ? stopPreview() : startPreview())}>
                    {previewing ? <Stop width={14} height={14} /> : <Play width={14} height={14} />}
                    {previewing ? 'Stop' : 'Hear it'}
                  </button>
                  <span style={{ color: 'var(--dim)', fontSize: 12.5 }}>
                    {mode === 'chords' && chordAnalysis
                      ? `${chordAnalysis.chords.length} chords`
                      : `${notes.length} notes`}
                    {mode === 'melody' && notes.length > 0 && (
                      <> · {midiToName(Math.min(...notes.map((n) => n.midi)))}–{midiToName(Math.max(...notes.map((n) => n.midi)))}</>
                    )}
                    {' · '}{(lengthBeats / project.beatsPerBar).toFixed(0)} bars
                  </span>
                  <div className="spacer" />
                  {detectedKey &&
                    (detectedKey.root !== project.key.root || detectedKey.scale !== project.key.scale) && (
                    <label className="chip" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={useDetectedKey} onChange={(e) => setUseDetectedKey(e.target.checked)} />
                      Sounds like {NOTE_NAMES[detectedKey.root]} {SCALES[detectedKey.scale].label.toLowerCase()} — use it?
                    </label>
                  )}
                  {detectedTempo && Math.abs(detectedTempo - project.bpm) > 1 && (
                    <label className="chip" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={useDetectedTempo} onChange={(e) => setUseDetectedTempo(e.target.checked)} />
                      That was around {detectedTempo} BPM — use it?
                    </label>
                  )}
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 8 }}>Play it on</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {quickPicks.map((id) => (
                      <button
                        key={id}
                        className={`btn ${presetId === id ? 'on' : ''}`}
                        onClick={() => setPresetId(id)}
                      >
                        {getPreset(id).name}
                      </button>
                    ))}
                    <select
                      className="field"
                      value={quickPicks.includes(presetId) ? '' : presetId}
                      onChange={(e) => e.target.value && setPresetId(e.target.value)}
                    >
                      <option value="">All {ALL_PRESETS.length} instruments…</option>
                      {ALL_PRESETS.filter((p) => (mode === 'beat' ? isDrumPreset(p.id) : !isDrumPreset(p.id)))
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="opt-grid">
                  <div className="opt">
                    <div className="opt-head"><Term of="Grid"><span className="label">Grid</span></Term></div>
                    <select className="field" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
                      {GRID_OPTIONS.map((g) => <option key={g.label} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div className="opt">
                    <div className="opt-head">
                      <Term of="Quantise"><span className="label">Timing correction</span></Term>
                      <span className="mono" style={{ fontSize: 11 }}>{Math.round(strength * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                    <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                      {strength > 0.95 ? 'Locked to the grid' : strength < 0.2 ? 'Exactly as you sang it' : 'Tidied, still human'}
                    </span>
                  </div>
                  {mode === 'melody' && (
                    <div className="opt">
                      <div className="opt-head"><span className="label">Pitch</span></div>
                      <label className="chip" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={snapScale} onChange={(e) => setSnapScale(e.target.checked)} />
                        Snap into key
                      </label>
                      <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                        Into {NOTE_NAMES[targetKey.root]} {SCALES[targetKey.scale].label.toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sheet-foot">
          {stage === 'result' && (
            <button
              className="btn"
              onClick={() => { stopPreview(); setStage('setup'); setAnalysis(null); setChordAnalysis(null) }}
            >
              Record again
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={stage !== 'result' || notes.length === 0} onClick={addToProject}>
            Add to project
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Steps({ stage }: { stage: Stage }) {
  const items: { id: Stage; label: string }[] = [
    { id: 'setup', label: 'Record' },
    { id: 'analysing', label: 'Analyse' },
    { id: 'result', label: 'Choose sound' },
  ]
  const order: Stage[] = ['setup', 'recording', 'analysing', 'result']
  const current = order.indexOf(stage)
  return (
    <div className="hum-steps">
      {items.map((item, i) => {
        const index = order.indexOf(item.id)
        const done = current > index + (item.id === 'setup' ? 1 : 0)
        const on = stage === item.id || (item.id === 'setup' && stage === 'recording')
        return (
          <div key={item.id} className={`hum-step ${on ? 'on' : ''} ${done ? 'done' : ''}`}>
            <span className="hum-dot">{done ? '✓' : i + 1}</span>
            {item.label}
          </div>
        )
      })}
    </div>
  )
}

function Waveform({ history, recording }: { history: number[]; recording: boolean }) {
  if (!recording || history.length === 0) return null
  const points = history.slice(-260)
  return (
    <svg className="hum-wave" viewBox="0 0 260 100" preserveAspectRatio="none">
      {points.map((peak, i) => {
        const h = Math.max(1.5, Math.min(48, peak * 130))
        return (
          <rect
            key={i}
            x={260 - points.length + i}
            y={50 - h / 2}
            width={0.8}
            height={h}
            fill="rgba(255,77,109,0.5)"
          />
        )
      })}
    </svg>
  )
}

function NotePreview({ notes, lengthBeats, hue }: { notes: Note[]; lengthBeats: number; hue: number }) {
  if (notes.length === 0) return <div className="result-preview" />
  const lo = Math.min(...notes.map((n) => n.midi))
  const hi = Math.max(...notes.map((n) => n.midi))
  const span = Math.max(8, hi - lo + 2)
  return (
    <div className="result-preview">
      {notes.map((note) => (
        <div
          key={note.id}
          className="pv-note"
          style={{
            left: `${(note.start / lengthBeats) * 100}%`,
            width: `${Math.max(0.7, (note.duration / lengthBeats) * 100)}%`,
            bottom: `${((note.midi - lo + 1) / span) * 100}%`,
            height: Math.max(3, 108 / span),
            opacity: 0.45 + note.velocity * 0.55,
            ['--hue' as string]: hue,
          }}
        />
      ))}
    </div>
  )
}
