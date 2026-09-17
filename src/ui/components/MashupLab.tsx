import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { STEM_NAMES, type StemName } from '../../audio/spectral/stems'
import { analyseAudioInWorker, separateStemsInWorker, warpInWorker } from '../../audio/workers'
import { describeKey, looksLikeAudio } from '../../lib/importAudio'
import {
  barSeconds, deckChannels, deckNeedsStems, describeSelection, levelMatch,
  planFor, SECTION_OPTIONS, sliceFromDownbeat, type Deck,
} from '../../lib/mashup'
import {
  bufferToChannels, createSample, ensureSample, getSampleBuffer, importAudioFile,
  knownSamples, samplePeaks, updateSampleMeta,
} from '../../lib/samples'
import { toKeySpec } from '../../music/matching'
import { NOTE_NAMES } from '../../music/theory'
import { uid } from '../../lib/id'
import { useStore } from '../../state/store'
import { Close, Play, Plus, Stop, Trash, Wand } from '../icons'
import { Term } from './Term'
import { Waveform } from './Waveform'

const STEM_HUES: Record<StemName, number> = { vocals: 330, drums: 18, bass: 210, other: 268 }
const DECK_HUES = [265, 172, 32, 320, 200, 100]

export function MashupLab({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const {
    flash, startJob, updateJob, endJob, addAudioTrack, addAudioClipFromSample, updateTrack, commit,
  } = useStore.getState()

  const [decks, setDecks] = useState<Deck[]>([])
  const [targetBpm, setTargetBpm] = useState(project.bpm)
  const [targetRoot, setTargetRoot] = useState(project.key.root)
  const [targetMode, setTargetMode] = useState<'major' | 'minor'>(
    toKeySpec(project.key.root, project.key.scale).mode,
  )
  const [matchKey, setMatchKey] = useState(true)
  const [correctTuning, setCorrectTuning] = useState(true)
  const [levelMatchOn, setLevelMatchOn] = useState(true)
  const [bars, setBars] = useState<number>(8)
  const [over, setOver] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [working, setWorking] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const previewNodes = useRef<AudioBufferSourceNode[]>([])
  const targetKey = { root: targetRoot, mode: targetMode }

  const stopPreview = useCallback(() => {
    for (const node of previewNodes.current) {
      try { node.stop() } catch { /* already stopped */ }
    }
    previewNodes.current = []
    setPreviewing(false)
  }, [])

  useEffect(() => stopPreview, [stopPreview])

  // --- adding decks --------------------------------------------------------

  const addDeck = useCallback(async (file: File) => {
    const ctx = await engine.resume()
    const job = startJob(`Reading ${file.name}`)
    try {
      const { meta, buffer } = await importAudioFile(ctx, file)
      const channels = bufferToChannels(buffer)
      const analysis = meta.analysis ?? await analyseAudioInWorker(
        channels, buffer.sampleRate,
        ({ fraction, stage }) => updateJob(job, fraction, stage ? `${stage} — ${meta.name}` : undefined),
      )
      await updateSampleMeta(meta.id, { analysis })
      meta.analysis = analysis

      setDecks((current) => {
        // The first deck sets the target, so dropping one song and then
        // another lands the second on the first's grid.
        if (current.length === 0) {
          setTargetBpm(Math.round(analysis.beat.bpm))
          setTargetRoot(analysis.key.root)
          setTargetMode(analysis.key.mode)
        }
        return [...current, {
          id: uid('deck'), meta, analysis, channels, sampleRate: buffer.sampleRate,
          stems: null, separating: false,
          selection: current.length === 0 ? 'full' : (['vocals'] as StemName[]),
          gain: 1, enabled: true, startBar: 0,
        }]
      })
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not read that file', 'warn')
    } finally {
      endJob(job)
    }
  }, [flash, startJob, updateJob, endJob])

  const addFromLibrary = useCallback(async (sampleId: string) => {
    const ctx = await engine.resume()
    const meta = knownSamples().find((s) => s.id === sampleId)
    if (!meta) return
    const buffer = getSampleBuffer(sampleId) ?? await ensureSample(ctx, sampleId)
    if (!buffer) { flash('That audio is no longer stored', 'warn'); return }

    const channels = bufferToChannels(buffer)
    const job = startJob(`Analysing ${meta.name}`)
    try {
      const analysis = meta.analysis ?? await analyseAudioInWorker(
        channels, buffer.sampleRate, ({ fraction }) => updateJob(job, fraction),
      )
      if (!meta.analysis) { await updateSampleMeta(meta.id, { analysis }); meta.analysis = analysis }
      setDecks((current) => {
        if (current.length === 0) {
          setTargetBpm(Math.round(analysis.beat.bpm))
          setTargetRoot(analysis.key.root)
          setTargetMode(analysis.key.mode)
        }
        return [...current, {
          id: uid('deck'), meta, analysis, channels, sampleRate: buffer.sampleRate,
          stems: null, separating: false,
          selection: current.length === 0 ? 'full' : (['vocals'] as StemName[]),
          gain: 1, enabled: true, startBar: 0,
        }]
      })
    } finally {
      endJob(job)
    }
  }, [flash, startJob, updateJob, endJob])

  const patchDeck = (id: string, patch: Partial<Deck>) =>
    setDecks((current) => current.map((deck) => (deck.id === id ? { ...deck, ...patch } : deck)))

  // --- stems ---------------------------------------------------------------

  const separate = useCallback(async (deck: Deck) => {
    if (deck.stems) return deck.stems
    patchDeck(deck.id, { separating: true })
    const job = startJob(`Separating ${deck.meta.name}`)
    try {
      const stems = await separateStemsInWorker(
        deck.channels, deck.sampleRate, undefined,
        ({ fraction }) => updateJob(job, fraction),
      )
      patchDeck(deck.id, { stems, separating: false })
      return stems
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Separation failed', 'warn')
      patchDeck(deck.id, { separating: false, selection: 'full' })
      return null
    } finally {
      endJob(job)
    }
  }, [flash, startJob, updateJob, endJob])

  const toggleStem = (deck: Deck, stem: StemName) => {
    const current = deck.selection === 'full' ? [...STEM_NAMES] : [...deck.selection]
    const next = current.includes(stem) ? current.filter((s) => s !== stem) : [...current, stem]
    patchDeck(deck.id, { selection: next })
    if (!deck.stems && !deck.separating) void separate(deck)
  }

  // --- rendering the blend -------------------------------------------------

  /** Warp each enabled deck's slice onto the target grid. */
  const renderBlend = useCallback(async (
    sectionBars: number, label: string,
  ): Promise<{ deck: Deck; channels: Float32Array[]; gain: number }[]> => {
    const targetDb = decks.reduce((max, deck) => Math.max(max, deck.analysis.loudnessDb), -60)
    const out: { deck: Deck; channels: Float32Array[]; gain: number }[] = []
    const active = decks.filter((deck) => deck.enabled)

    for (let index = 0; index < active.length; index++) {
      let deck = active[index]
      // A deck asking for specific stems must actually get them. Falling back
      // to the full mix here would quietly hand back the whole song when the
      // user asked for the vocal.
      if (deckNeedsStems(deck)) {
        const stems = await separate(deck)
        if (!stems) continue
        deck = { ...deck, stems }
      }
      if (deck.selection !== 'full' && deck.selection.length === 0) continue

      const plan = planFor(deck, targetBpm, targetKey, { matchKey, correctTuning, bars: sectionBars })
      const slice = sliceFromDownbeat(
        deckChannels(deck), deck.sampleRate, deck.analysis,
        deck.startBar, sectionBars, plan.sourceBpm,
      )
      const job = startJob(`${label} — ${deck.meta.name}`)
      try {
        const warped = Math.abs(plan.speed - 1) < 0.001 && Math.abs(plan.semitones) < 0.001
          ? slice.channels
          : await warpInWorker(
              slice.channels, 1 / plan.speed, plan.semitones,
              ({ fraction }) => updateJob(job, (index + fraction) / active.length),
            )
        out.push({
          deck,
          channels: warped,
          gain: deck.gain * (levelMatchOn ? levelMatch(deck, targetDb) : 1),
        })
      } finally {
        endJob(job)
      }
    }
    return out
  }, [decks, targetBpm, targetRoot, targetMode, matchKey, correctTuning, levelMatchOn,
      separate, startJob, updateJob, endJob])

  const preview = useCallback(async () => {
    if (previewing) { stopPreview(); return }
    if (decks.filter((d) => d.enabled).length === 0) return
    setWorking('preview')
    try {
      const ctx = await engine.resume()
      const rendered = await renderBlend(Math.min(bars, 8), 'Preparing preview')
      if (rendered.length === 0) return

      const loopSeconds = Math.max(...rendered.map((r) => r.channels[0].length)) / ctx.sampleRate
      const startAt = ctx.currentTime + 0.15
      stopPreview()

      for (const item of rendered) {
        const buffer = ctx.createBuffer(
          Math.max(1, item.channels.length), item.channels[0].length, item.deck.sampleRate,
        )
        item.channels.forEach((data, c) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, c))
        const node = ctx.createBufferSource()
        node.buffer = buffer
        node.loop = true
        node.loopEnd = loopSeconds
        const gain = ctx.createGain()
        gain.gain.value = item.gain
        node.connect(gain).connect(engine.master?.bus ?? ctx.destination)
        node.start(startAt)
        previewNodes.current.push(node)
      }
      setPreviewing(true)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Preview failed', 'warn')
    } finally {
      setWorking(null)
    }
  }, [previewing, decks, bars, renderBlend, stopPreview, flash])

  const sendToTimeline = useCallback(async () => {
    if (decks.filter((d) => d.enabled).length === 0) return
    stopPreview()
    setWorking('commit')
    try {
      const ctx = await engine.resume()
      const rendered = await renderBlend(bars, 'Rendering')
      commit()

      // The whole mashup is baked at the target tempo, so nothing needs
      // warping again at playback time.
      useStore.getState().setBpm(targetBpm)
      useStore.getState().setKey(targetRoot, targetMode === 'major' ? 'major' : 'minor')
      // Size the arrangement to the section and loop it, so hitting play just
      // works instead of running into empty bars.
      useStore.getState().setLength(bars * 4)
      useStore.getState().setUI({ loopEnabled: true })
      engine.loopStart = 0
      engine.loopEnd = bars * 4

      for (let index = 0; index < rendered.length; index++) {
        const { deck, channels, gain } = rendered[index]
        const label = `${deck.meta.name} · ${describeSelection(deck.selection)}`
        const created = await createSample(ctx, channels, deck.sampleRate, label, {
          sourceId: deck.meta.id,
        })
        const hue = deck.selection !== 'full' && deck.selection.length === 1
          ? STEM_HUES[deck.selection[0]]
          : DECK_HUES[index % DECK_HUES.length]

        const trackId = addAudioTrack(label.slice(0, 28))
        updateTrack(trackId, { color: hue })
        addAudioClipFromSample(trackId, created.meta.id, {
          startBeat: 0,
          name: label,
          // Already at the project tempo, so it plays untouched.
          originalBpm: targetBpm,
          warp: true,
          gain,
          hue,
        })
      }
      flash(`${rendered.length} parts added at ${targetBpm} BPM`, 'good')
      onClose()
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not build the mashup', 'warn')
    } finally {
      setWorking(null)
    }
  }, [decks, bars, targetBpm, targetRoot, targetMode, renderBlend, stopPreview, commit,
      addAudioTrack, addAudioClipFromSample, updateTrack, flash, onClose])

  // --- derived -------------------------------------------------------------

  const plans = useMemo(
    () => new Map(decks.map((deck) => [
      deck.id,
      planFor(deck, targetBpm, targetKey, { matchKey, correctTuning, bars }),
    ])),
    [decks, targetBpm, targetRoot, targetMode, matchKey, correctTuning, bars],
  )

  const library = useMemo(
    () => knownSamples().filter((s) => !decks.some((d) => d.meta.id === s.id)),
    [decks],
  )

  const sectionSeconds = (bars * 4 * 60) / Math.max(1, targetBpm)
  const busy = working !== null || decks.some((d) => d.separating)

  return (
    <div className="overlay" onPointerDown={() => { stopPreview(); onClose() }}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Mashup Lab</div>
            <div className="sheet-sub">
              Drop in two or more songs. Overtone reads each one's tempo, key and tuning,
              pulls them onto a common grid, and lets you take whichever parts you want from each.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={() => { stopPreview(); onClose() }} aria-label="Close">
            <Close width={15} height={15} />
          </button>
        </div>

        <div className="sheet-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* --- target ---------------------------------------------- */}
            <div className="match-summary">
              <span className="label">Mash to</span>
              <input
                className="field mono" style={{ width: 66, textAlign: 'center' }}
                value={targetBpm}
                onChange={(e) => setTargetBpm(Math.max(40, Math.min(220, Number(e.target.value) || 0)))}
                inputMode="numeric" aria-label="Target tempo"
              />
              <span style={{ color: 'var(--faint)' }}>BPM</span>
              <select className="field" value={targetRoot} onChange={(e) => setTargetRoot(Number(e.target.value))}>
                {NOTE_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
              </select>
              <select
                className="field" value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as 'major' | 'minor')}
              >
                <option value="minor">minor</option>
                <option value="major">major</option>
              </select>

              <div className="sep" />
              <Term of="Bar"><span className="label">Section</span></Term>
              <select className="field" value={bars} onChange={(e) => setBars(Number(e.target.value))}>
                {SECTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} bars</option>
                ))}
              </select>
              <span className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>
                {sectionSeconds.toFixed(1)}s
              </span>

              <div className="spacer" />
              <label className="chip" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={matchKey} onChange={(e) => setMatchKey(e.target.checked)} />
                Match keys
              </label>
              <label className="chip" style={{ cursor: 'pointer' }} title="Songs cut off concert pitch get corrected as part of the transposition.">
                <input type="checkbox" checked={correctTuning} onChange={(e) => setCorrectTuning(e.target.checked)} />
                Correct tuning
              </label>
              <label className="chip" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={levelMatchOn} onChange={(e) => setLevelMatchOn(e.target.checked)} />
                Match levels
              </label>
            </div>

            {/* --- decks ------------------------------------------------ */}
            {decks.map((deck, index) => {
              const plan = plans.get(deck.id)!
              const hue = DECK_HUES[index % DECK_HUES.length]
              const selected = deck.selection === 'full' ? STEM_NAMES : deck.selection
              const perBar = barSeconds(plan.sourceBpm, deck.analysis.beat.beatsPerBar)
              const maxStartBar = Math.max(0, Math.floor((deck.analysis.durationSec - deck.analysis.beat.downbeatSec) / perBar) - 1)

              return (
                <div key={deck.id} className={`deck ${index === 0 ? 'target' : ''}`} style={{ ['--hue' as string]: hue }}>
                  <div className="deck-head">
                    <span className="stem-dot" style={{ background: `hsl(${hue} 70% 58%)` }} />
                    <span className="deck-name">{deck.meta.name}</span>
                    <span className={`fact ${deck.selection !== 'full' && deck.selection.length === 0 ? 'warn' : ''}`}>
                      {describeSelection(deck.selection)}
                    </span>
                    <span className="fact">{Math.round(deck.analysis.beat.bpm)} BPM</span>
                    <span className="fact">{describeKey(deck.analysis)}</span>
                    {Math.abs(deck.analysis.key.tuningCents) >= 8 && (
                      <span className="fact warn" title="Not at concert pitch — the transposition corrects for it.">
                        {deck.analysis.key.tuningCents > 0 ? '+' : ''}
                        {Math.round(deck.analysis.key.tuningCents)}¢
                      </span>
                    )}
                    <button
                      className={`mini ${deck.enabled ? '' : 'on'}`}
                      onClick={() => patchDeck(deck.id, { enabled: !deck.enabled })}
                      title={deck.enabled ? 'Mute this deck' : 'Unmute'}
                    >M</button>
                    <button
                      className="btn icon danger"
                      onClick={() => setDecks((c) => c.filter((d) => d.id !== deck.id))}
                      title="Remove"
                    ><Trash width={12} height={12} /></button>
                  </div>

                  <div className="deck-wave">
                    <Waveform
                      peaks={samplePeaks(deck.meta) ?? deck.analysis.peaks}
                      height={54}
                      color={`hsl(${hue} 78% 66%)`}
                    />
                  </div>

                  <div className="stem-row">
                    <button
                      className={`stem-chip ${deck.selection === 'full' ? 'on' : ''}`}
                      onClick={() => patchDeck(deck.id, { selection: 'full' })}
                    >
                      Full mix
                    </button>
                    {STEM_NAMES.map((stem) => (
                      <button
                        key={stem}
                        className={`stem-chip ${deck.selection !== 'full' && selected.includes(stem) ? 'on' : ''}`}
                        onClick={() => toggleStem(deck, stem)}
                        disabled={deck.separating}
                      >
                        <span className="stem-dot" style={{ background: `hsl(${STEM_HUES[stem]} 70% 58%)` }} />
                        {stem[0].toUpperCase() + stem.slice(1)}
                      </button>
                    ))}
                    {deck.separating && <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>Separating…</span>}
                    {deckNeedsStems(deck) && !deck.separating && (
                      <button className="btn" onClick={() => void separate(deck)}>Split stems</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="control" style={{ minWidth: 150 }}>
                      <div className="control-head">
                        <span className="label">Start bar</span>
                        <span className="mono" style={{ fontSize: 11 }}>{deck.startBar + 1}</span>
                      </div>
                      <input
                        type="range" min={0} max={Math.max(1, maxStartBar)} step={1}
                        value={deck.startBar}
                        onChange={(e) => patchDeck(deck.id, { startBar: Number(e.target.value) })}
                      />
                    </div>
                    <div className="control" style={{ minWidth: 130 }}>
                      <div className="control-head">
                        <span className="label">Level</span>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {(20 * Math.log10(Math.max(0.01, deck.gain))).toFixed(1)} dB
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={2} step={0.01} value={deck.gain}
                        onChange={(e) => patchDeck(deck.id, { gain: Number(e.target.value) })}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className={`fact ${plan.strain.advice === 'try-half-time' ? 'warn' : ''}`}>
                        {Math.abs(plan.speed - 1) < 0.0005
                          ? <>tempo <b>already matches</b></>
                          : <>{plan.speed > 1 ? 'speed up' : 'slow down'}{' '}
                              <b>{Math.abs((plan.speed - 1) * 100).toFixed(1)}%</b></>}
                      </span>
                      {Math.abs(plan.sourceBpm - deck.analysis.beat.bpm) > 1 && (
                        <span className="fact" title="Half or double time gives a gentler stretch than the detected tempo would.">
                          reading as <b>{Math.round(plan.sourceBpm)} BPM</b>
                        </span>
                      )}
                      {matchKey && Math.abs(plan.semitones) >= 0.01 && (
                        <span className="fact">
                          transpose <b>{plan.semitones > 0 ? '+' : ''}{plan.semitones.toFixed(2)} st</b>
                        </span>
                      )}
                      {matchKey && Math.abs(plan.semitones) < 0.01 && (
                        <span className="fact">key <b>already matches</b></span>
                      )}
                      {plan.strain.advice === 'try-half-time' && (
                        <span className="fact warn">a stretch this big will be audible</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* --- add ---------------------------------------------------- */}
            <div
              className={`deck-empty ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                const files = [...e.dataTransfer.files].filter(looksLikeAudio)
                for (const file of files) void addDeck(file)
              }}
            >
              <div>
                <button className="btn primary" onClick={() => fileRef.current?.click()}>
                  <Plus width={13} height={13} /> Add a song
                </button>
                <input
                  ref={fileRef} type="file" accept="audio/*" multiple style={{ display: 'none' }}
                  onChange={(e) => {
                    for (const file of [...(e.target.files ?? [])].filter(looksLikeAudio)) void addDeck(file)
                    e.target.value = ''
                  }}
                />
                <div style={{ marginTop: 10, lineHeight: 1.6 }}>
                  …or drop files here.
                  {decks.length === 0 && ' The first song sets the tempo and key everything else matches.'}
                </div>
                {library.length > 0 && (
                  <select
                    className="field" style={{ marginTop: 10 }}
                    value=""
                    onChange={(e) => { if (e.target.value) void addFromLibrary(e.target.value) }}
                  >
                    <option value="">Or use something already imported…</option>
                    {library.map((sample) => (
                      <option key={sample.id} value={sample.id}>{sample.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {decks.length > 0 && (
              <p style={{ color: 'var(--faint)', fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>
                Separation works on the spectrogram, not on words, so language makes no difference —
                a Tamil vocal separates exactly like an English one. It is an estimate though: a
                hard-panned vocal or a mono recording will defeat the centre-channel cue, and you'll
                hear bleed between parts.
              </p>
            )}
          </div>
        </div>

        <div className="sheet-foot">
          <button
            className="btn"
            onClick={() => void preview()}
            disabled={decks.length === 0 || (busy && working !== 'preview')}
          >
            {previewing ? <Stop width={13} height={13} /> : <Play width={13} height={13} />}
            {working === 'preview' ? 'Preparing…' : previewing ? 'Stop' : 'Preview the blend'}
          </button>
          <span style={{ color: 'var(--faint)', fontSize: 11.5, marginRight: 'auto' }}>
            {decks.filter((d) => d.enabled).length} of {decks.length} decks
            {decks.some((d) => d.enabled && d.selection !== 'full' && d.selection.length === 0) &&
              ' · one deck has nothing selected'}
          </span>
          <button className="btn" onClick={() => { stopPreview(); onClose() }}>Cancel</button>
          <button
            className="btn primary"
            onClick={() => void sendToTimeline()}
            disabled={decks.length === 0 || busy}
          >
            <Wand width={13} height={13} />
            {working === 'commit' ? 'Rendering…' : 'Send to timeline'}
          </button>
        </div>
      </div>
    </div>
  )
}
