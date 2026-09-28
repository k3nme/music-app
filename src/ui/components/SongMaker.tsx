import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { suggest, type Suggestion } from '../../ai'
import { EXAMPLE_PROMPTS } from '../../ai/prompt'
import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { Close, Play, Stop, Wand } from '../icons'

/**
 * Write me a song.
 *
 * Three versions of the brief rather than one, each auditionable before it is
 * kept, and every one showing what it understood from the words — because the
 * failure mode of a thing like this is not "the music is bad", it is "I have no
 * idea why it did that and no way to change it".
 *
 * Applying one replaces the arrangement, so it goes through `commit()` like any
 * other edit: one Ctrl-Z puts back whatever was there before.
 */
export function SongMaker({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const { commit, flash } = useStore.getState()

  // Tracks with audio on them: the thing a remix is built around.
  const audioTracks = useMemo(() => {
    const withAudio = new Set((project.audioClips ?? []).map((clip) => clip.trackId))
    return project.tracks.filter((track) => withAudio.has(track.id))
  }, [project])

  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'new' | 'remix'>('new')
  const [keepTracks, setKeepTracks] = useState<string[]>([])

  // Default to remixing when there is something to remix — it is almost
  // certainly why the panel was opened with audio on the timeline.
  useEffect(() => {
    if (audioTracks.length === 0) return
    setMode('remix')
    setKeepTracks(audioTracks.map((track) => track.id))
  }, [audioTracks.length])
  const [items, setItems] = useState<Suggestion[]>([])
  const [working, setWorking] = useState(false)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const [previewing, setPreviewing] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewOriginal = useRef<typeof project | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const stopPreview = useCallback(() => {
    engine.stop(0)
    useStore.getState().setPlaying(false)
    if (previewOriginal.current) {
      useStore.setState({ project: previewOriginal.current })
      previewOriginal.current = null
    }
    setPreviewing(null)
  }, [])

  useEffect(() => stopPreview, [stopPreview])

  const write = useCallback(async (nextSeed = seed) => {
    stopPreview()
    setWorking(true)
    try {
      const result = await suggest({
        project, prompt, seed: nextSeed,
        keep: mode === 'remix' ? keepTracks : undefined,
      }, 'song')
      setItems(result)
      if (result.length === 0) flash('Could not make anything of that', 'warn')
    } finally {
      setWorking(false)
    }
  }, [project, prompt, seed, stopPreview, flash, mode, keepTracks])

  /**
   * Auditioning swaps the song in, plays it, and puts the old one back. It
   * never touches history, so a preview you did not keep leaves no trace.
   */
  const preview = useCallback(async (suggestion: Suggestion) => {
    if (previewing === suggestion.id) { stopPreview(); return }
    const current = useStore.getState().project
    if (!previewOriginal.current) previewOriginal.current = current
    useStore.setState({ project: suggestion.apply(previewOriginal.current) })
    setPreviewing(suggestion.id)
    await useStore.getState().play(0)
  }, [previewing, stopPreview])

  const keep = useCallback((suggestion: Suggestion) => {
    const original = previewOriginal.current ?? useStore.getState().project
    engine.stop(0)
    useStore.getState().setPlaying(false)
    previewOriginal.current = null
    // Commit the project as it was *before* any preview, so undo returns there.
    useStore.setState({ project: original })
    commit()
    useStore.setState({ project: suggestion.apply(original) })
    flash(`“${suggestion.title}” — undo puts back what you had`, 'good')
    onClose()
  }, [commit, flash, onClose])

  const surprise = () => {
    const choice = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)]
    setPrompt(choice)
    const next = Math.floor(Math.random() * 100000)
    setSeed(next)
    void write(next)
  }

  const again = () => {
    const next = Math.floor(Math.random() * 100000)
    setSeed(next)
    void write(next)
  }

  return (
    <div className="overlay" onPointerDown={() => { stopPreview(); onClose() }}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">
              {mode === 'remix' ? 'Remix what you have' : 'Write me a song'}
            </div>
            <div className="sheet-sub">
              Say what you want in your own words. It writes the drums, bass, chords, melody and
              arrangement, and tells you what it understood — all of it on your machine.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={() => { stopPreview(); onClose() }} aria-label="Close">
            <Close width={15} height={15} />
          </button>
        </div>

        <div className="sheet-body">
          {audioTracks.length > 0 && (
            <div className="song-mode">
              <button
                className={`mini ${mode === 'remix' ? 'on' : ''}`}
                onClick={() => setMode('remix')}
              >Remix what's here</button>
              <button
                className={`mini ${mode === 'new' ? 'on' : ''}`}
                onClick={() => setMode('new')}
              >Start from nothing</button>
              {mode === 'remix' && (
                <span className="song-warn">
                  Keeps the audio, works at its tempo and key, and writes around it.
                </span>
              )}
            </div>
          )}

          {mode === 'remix' && audioTracks.length > 0 && (
            <div className="song-keep">
              {audioTracks.map((track) => (
                <label key={track.id} className={`song-keep-track${keepTracks.includes(track.id) ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={keepTracks.includes(track.id)}
                    onChange={() => setKeepTracks((current) => current.includes(track.id)
                      ? current.filter((id) => id !== track.id)
                      : [...current, track.id])}
                  />
                  {track.name}
                </label>
              ))}
            </div>
          )}

          <div className="song-ask">
            <input
              ref={inputRef}
              className="field song-prompt"
              placeholder={mode === 'remix'
                ? 'what to build around it — "a house remix", "slow and dubby"'
                : 'a dark amapiano track at 112 with a sad piano'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void write() }}
              aria-label="Describe the song you want"
            />
            <button
              className="btn primary" onClick={() => void write()}
              disabled={working || (mode === 'remix' && keepTracks.length === 0)}
            >
              <Wand width={13} height={13} />
              {working ? 'Writing…' : mode === 'remix' ? 'Remix it' : 'Write it'}
            </button>
          </div>

          {items.length === 0 && (
            <>
              <div className="song-hint">Or start from one of these:</div>
              <div className="song-examples">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example} className="mini song-example"
                    onClick={() => { setPrompt(example); void write() }}
                  >{example}</button>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={surprise}>Surprise me</button>
              </div>
            </>
          )}

          {items.length > 0 && (
            <div className="song-results">
              <div className="song-reasons">
                <span className="label">What it understood</span>
                {(items[0].reasons ?? []).map((reason) => (
                  <span key={reason} className="chip">{reason}</span>
                ))}
              </div>

              {items.map((item, index) => (
                <div key={item.id} className={`song-take${previewing === item.id ? ' on' : ''}`}>
                  <div className="song-take-num">{index + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sound-name">{item.title}</div>
                    <div className="sound-note">{item.detail}</div>
                  </div>
                  <button
                    className="btn" onClick={() => void preview(item)}
                    aria-label={`Hear ${item.title}`}
                  >
                    {previewing === item.id
                      ? <><Stop width={13} height={13} /> Stop</>
                      : <><Play width={13} height={13} /> Hear it</>}
                  </button>
                  <button className="btn primary" onClick={() => keep(item)}>Keep this</button>
                </div>
              ))}

              <div className="song-actions">
                <button className="btn" onClick={again} disabled={working}>
                  {working ? 'Writing…' : 'Three more versions'}
                </button>
                <span className="song-warn">
                  Keeping one replaces what is on the timeline. Undo brings it back.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <span style={{ color: 'var(--faint)', fontSize: 11.5, marginRight: 'auto' }}>
            Written from music theory on your machine — nothing is sent anywhere.
          </span>
          <button className="btn" onClick={() => { stopPreview(); onClose() }}>Close</button>
        </div>
      </div>
    </div>
  )
}
