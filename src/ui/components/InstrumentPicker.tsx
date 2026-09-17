import { useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import {
  ALL_PRESETS, FAMILY_LABELS, FAMILY_ORDER, getPreset, searchPresets,
} from '../../audio/instruments'
import type { InstrumentFamily, PresetBase } from '../../audio/types'
import { useStore } from '../../state/store'
import { Close } from '../icons'

/** A short phrase per family so auditioning sounds musical, not like a beep. */
const AUDITION: Record<InstrumentFamily, number[]> = {
  keys: [0, 4, 7, 12], plucked: [0, 7, 12, 16], bowed: [0, 3, 7], winds: [0, 2, 4, 7],
  brass: [0, 4, 7], mallets: [0, 4, 7, 12], synth: [0, 3, 7, 10], bass: [0, 0, 5, 0],
  voice: [0, 4, 7], world: [0, 2, 5, 7], drums: [],
}

export function InstrumentPicker() {
  const target = useStore((s) => s.instrumentPickerFor)
  const project = useStore((s) => s.project)
  const { setUI, setTrackPreset, addTrack, flash } = useStore.getState()

  const currentTrack = project.tracks.find((t) => t.id === target)
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState<InstrumentFamily | 'all'>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const auditionTrack = useRef<string | null>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  // A hidden track lets us audition without touching the user's arrangement.
  useEffect(() => {
    auditionTrack.current = '__audition__'
    return () => {
      if (auditionTrack.current) engine.removeTrack(auditionTrack.current)
      auditionTrack.current = null
    }
  }, [])

  const results = useMemo(() => {
    const pool = query ? searchPresets(query) : ALL_PRESETS
    return family === 'all' ? pool : pool.filter((p) => p.family === family)
  }, [query, family])

  const counts = useMemo(() => {
    const map = new Map<InstrumentFamily, number>()
    for (const preset of ALL_PRESETS) map.set(preset.family, (map.get(preset.family) ?? 0) + 1)
    return map
  }, [])

  const audition = async (preset: PresetBase) => {
    await engine.resume()
    const id = auditionTrack.current
    if (!id) return
    engine.ensureTrack(id, preset.id, {
      volume: 0.75, pan: 0, muted: false, reverbSend: 0.18, delaySend: 0, drive: 0, tone: 20000,
      pump: 0, pumpBeats: 1,
    })

    if (preset.engine === 'drum') {
      // Kits get a one-bar pattern rather than a chord.
      const pieces = Object.keys((preset.params as { pieces?: Record<string, unknown> }).pieces ?? {})
        .map(Number).sort((a, b) => a - b)
      if (pieces.length === 0) return
      const kick = pieces[0]
      const snare = pieces.find((p) => p === 38 || p === 40) ?? pieces[Math.min(2, pieces.length - 1)]
      const hat = pieces.find((p) => p >= 42) ?? pieces[pieces.length - 1]
      const step = 0.135
      const at = (i: number, midi: number, velocity: number) =>
        window.setTimeout(() => engine.playNote(id, midi, 0.4, velocity), i * step * 1000)
      for (let i = 0; i < 8; i++) at(i * 2, hat, i % 2 === 0 ? 0.65 : 0.4)
      for (const i of [0, 10]) at(i, kick, 1)
      for (const i of [4, 12]) at(i, snare, 0.9)
      return
    }

    const offsets = AUDITION[preset.family] ?? [0, 4, 7]
    offsets.forEach((offset, i) => {
      window.setTimeout(() => engine.playNote(id, preset.centerMidi + offset, 0.9, 0.8), i * 130)
    })
  }

  const choose = (preset: PresetBase) => {
    if (target === 'new') {
      addTrack(preset.id)
      flash(`Added ${preset.name}`, 'good')
    } else if (target) {
      setTrackPreset(target, preset.id)
      flash(`${preset.name} loaded`, 'good')
    }
    setUI({ instrumentPickerFor: null })
  }

  return (
    <div className="overlay" onPointerDown={() => setUI({ instrumentPickerFor: null })}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">
              {target === 'new' ? 'Add an instrument' : `Instrument for ${currentTrack?.name ?? 'track'}`}
            </div>
            <div className="sheet-sub">
              {ALL_PRESETS.length} instruments, all synthesised — click one to hear it.
            </div>
          </div>
          <div className="spacer" />
          <input
            ref={searchRef}
            className="field"
            style={{ width: 220 }}
            placeholder="Search: sitar, 808, lo-fi, jazz…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn icon ghost" onClick={() => setUI({ instrumentPickerFor: null })} aria-label="Close">
            <Close width={15} height={15} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="picker-layout">
            <div className="picker-families">
              <button className={`fam ${family === 'all' ? 'on' : ''}`} onClick={() => setFamily('all')}>
                All instruments <span className="fam-count">{ALL_PRESETS.length}</span>
              </button>
              {FAMILY_ORDER.map((f) => (
                <button key={f} className={`fam ${family === f ? 'on' : ''}`} onClick={() => setFamily(f)}>
                  {FAMILY_LABELS[f]} <span className="fam-count">{counts.get(f) ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="picker-grid">
              {results.map((preset) => (
                <button
                  key={preset.id}
                  className={`inst-card ${currentTrack?.presetId === preset.id ? 'on' : ''}`}
                  style={{ ['--hue' as string]: preset.hue }}
                  onClick={() => void audition(preset)}
                  onDoubleClick={() => choose(preset)}
                >
                  <div className="inst-name">{preset.name}</div>
                  <div className="inst-blurb">{preset.blurb}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <span
                      className="chip"
                      style={{ height: 20, fontSize: 10 }}
                      onClick={(e) => { e.stopPropagation(); choose(preset) }}
                    >
                      Use this
                    </span>
                  </div>
                </button>
              ))}
              {results.length === 0 && (
                <div style={{ color: 'var(--faint)', padding: 20 }}>
                  Nothing matches “{query}”. Try a genre, a country, or a texture — “raga”, “lofi”, “buzz”.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <span style={{ color: 'var(--faint)', marginRight: 'auto', fontSize: 11.5 }}>
            Click to audition · double-click or “Use this” to load
          </span>
          <button className="btn" onClick={() => setUI({ instrumentPickerFor: null })}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function presetName(id: string): string {
  return getPreset(id).name
}
