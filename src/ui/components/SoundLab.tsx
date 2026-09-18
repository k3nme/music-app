import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import type { ExtractedSound } from '../../audio/analysis/dissect'
import { isPercussive } from '../../audio/analysis/sounds'
import { describeMatch, matchAgainstLibrary, type MatchVerdict } from '../../audio/instruments/match'
import { dissectInWorker } from '../../audio/workers'
import {
  instrumentFromSound, kitFromSounds, nameFor, noteName, padName, planImport, removeInstrument,
  saveInstrument, storedInstruments,
} from '../../lib/instruments'
import { looksLikeAudio } from '../../lib/importAudio'
import { bufferToChannels, importAudioFile } from '../../lib/samples'
import { useStore } from '../../state/store'
import { Close, Layers, Play, Plus, Trash, Wand } from '../icons'
import { Term } from './Term'

const STEM_HUES: Record<string, number> = { vocals: 330, drums: 18, bass: 210, other: 268 }

interface Row {
  sound: ExtractedSound
  chosen: boolean
  /** Name for a saved instrument, which the user can edit. */
  name: string
  /** Name for a drum pad, when this sound is going on the kit. */
  pad: string
  match?: MatchVerdict
  matching: boolean
}

/**
 * Take a song apart into the sounds inside it, and keep the ones worth keeping.
 *
 * The order here is deliberate: hear it, see what it is, see whether you
 * already own something like it, *then* decide. Importing everything a song
 * contains would bury the user's own shelf in near-duplicates of the drum
 * machines they already have.
 */
export function SoundLab({ onClose }: { onClose(): void }) {
  const { flash, startJob, updateJob, endJob } = useStore.getState()

  const [rows, setRows] = useState<Row[]>([])
  const [songName, setSongName] = useState('')
  const [sourceId, setSourceId] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [mine, setMine] = useState(storedInstruments())
  const fileRef = useRef<HTMLInputElement>(null)
  const playing = useRef<AudioBufferSourceNode[]>([])

  const stopAudition = useCallback(() => {
    for (const node of playing.current) {
      try { node.stop() } catch { /* already done */ }
    }
    playing.current = []
  }, [])

  useEffect(() => stopAudition, [stopAudition])

  // --- taking a song apart -------------------------------------------------

  const dissect = useCallback(async (file: File) => {
    if (!looksLikeAudio(file)) {
      flash('That does not look like an audio file', 'warn')
      return
    }
    const ctx = await engine.resume()
    const job = startJob(`Taking ${file.name} apart`)
    setBusy('dissecting')
    stopAudition()
    setRows([])
    try {
      const { meta, buffer } = await importAudioFile(ctx, file)
      setSongName(meta.name)
      setSourceId(meta.id)
      const sounds = await dissectInWorker(
        bufferToChannels(buffer), buffer.sampleRate, {},
        ({ fraction, stage }) => updateJob(job, fraction, stage),
      )
      if (sounds.length === 0) {
        flash('Nothing came out of that — try a busier section of the song', 'warn')
        return
      }
      const used = new Set<string>()
      const pads = new Set<string>()
      setRows(sounds.map((sound) => ({
        sound,
        // Default to taking what the library does not already cover. The
        // matching pass below turns this off for anything it recognises.
        chosen: true,
        name: nameFor(sound, meta.name, used),
        // Drums keep their plain name — they end up on a kit that is already
        // named after the song.
        pad: padName(sound, pads),
        matching: true,
      })))
      flash(`Found ${sounds.length} sound${sounds.length === 1 ? '' : 's'} in ${meta.name}`, 'good')
      void compare(sounds)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not take that song apart', 'warn')
    } finally {
      endJob(job)
      setBusy(null)
    }
  }, [flash, startJob, updateJob, endJob, stopAudition])

  /** Compare each sound with the library, one at a time so the UI keeps up. */
  const compare = useCallback(async (sounds: ExtractedSound[]) => {
    for (const sound of sounds) {
      const verdict = await matchAgainstLibrary(
        sound.best.audio, sound.sampleRate, sound.kind, sound.best.midi ?? undefined,
      )
      setRows((current) => current.map((row) => row.sound.id !== sound.id ? row : {
        ...row,
        match: verdict,
        matching: false,
        // Anything the library already has is unticked by default — it is
        // still there to take if the user wants that exact recording.
        chosen: verdict.verdict !== 'have-it',
      }))
    }
  }, [])

  // --- auditioning ---------------------------------------------------------

  const audition = useCallback(async (sound: ExtractedSound, takeIndex = -1) => {
    const ctx = await engine.resume()
    stopAudition()
    const take = takeIndex >= 0 ? sound.takes[takeIndex] : sound.best
    const buffer = ctx.createBuffer(1, take.audio.length, sound.sampleRate)
    buffer.getChannelData(0).set(take.audio)
    const node = ctx.createBufferSource()
    node.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = 0.9
    node.connect(gain).connect(ctx.destination)
    node.start()
    playing.current.push(node)
    node.onended = () => { playing.current = playing.current.filter((n) => n !== node) }
  }, [stopAudition])

  // --- keeping them --------------------------------------------------------

  const keepChosen = useCallback(async () => {
    const chosen = rows.filter((r) => r.chosen)
    if (chosen.length === 0) return
    const ctx = await engine.resume()
    const job = startJob('Adding to your instruments')
    setBusy('saving')
    try {
      const { kit, instruments } = planImport(chosen.map((r) => r.sound))
      const padOf = new Map(chosen.map((r) => [r.sound.id, r.pad]))
      let added = 0

      if (kit.length > 0) {
        const preset = await kitFromSounds(ctx, kit.map((sound) => ({
          sound, name: padOf.get(sound.id) ?? sound.label,
        })), {
          name: `${shorten(songName)} Kit`, sourceName: songName, sourceId,
        })
        if (preset && saveInstrument(preset)) added++
      }

      for (const sound of instruments) {
        const row = chosen.find((r) => r.sound.id === sound.id)
        const preset = await instrumentFromSound(ctx, sound, {
          name: row?.name ?? sound.label, sourceName: songName, sourceId,
        })
        if (preset && saveInstrument(preset)) added++
      }

      setMine(storedInstruments())
      flash(
        added === 0
          ? 'Nothing could be saved — your browser may be out of storage'
          : `Added ${added} instrument${added === 1 ? '' : 's'}. They are in the instrument picker under "Your sounds".`,
        added === 0 ? 'warn' : 'good',
      )
      if (added > 0) setRows((current) => current.map((r) => ({ ...r, chosen: false })))
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not save those sounds', 'warn')
    } finally {
      endJob(job)
      setBusy(null)
    }
  }, [rows, songName, sourceId, flash, startJob, endJob])

  const forget = useCallback(async (id: string) => {
    await removeInstrument(id)
    setMine(storedInstruments())
  }, [])

  const chosenCount = rows.filter((r) => r.chosen).length
  const stillMatching = rows.some((r) => r.matching)
  const grouped = useMemo(() => {
    const order = ['drums', 'bass', 'other', 'vocals']
    return order
      .map((stem) => ({ stem, rows: rows.filter((r) => r.sound.stem === stem) }))
      .filter((group) => group.rows.length > 0)
  }, [rows])

  return (
    <div className="overlay" onPointerDown={() => { stopAudition(); onClose() }}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Take a song apart</div>
            <div className="sheet-sub">
              Drop in a song and Overtone separates it, finds the individual sounds inside it, and
              tells you which ones you don't already have. Keep the ones you want as playable
              instruments.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={() => { stopAudition(); onClose() }} aria-label="Close">
            <Close width={15} height={15} />
          </button>
        </div>

        <div className="sheet-body">
          {rows.length === 0 && (
            <div
              className={`deck-empty${over ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                const file = e.dataTransfer.files[0]
                if (file) void dissect(file)
              }}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'dissecting'
                ? 'Listening…'
                : 'Drop a song here, or click to choose one'}
            </div>
          )}

          <input
            ref={fileRef} type="file" accept="audio/*" hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void dissect(file)
              e.target.value = ''
            }}
          />

          {rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="match-summary">
                <span className="label">Found in</span>
                <strong>{songName}</strong>
                <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                  {rows.length} distinct sound{rows.length === 1 ? '' : 's'}
                  {stillMatching && ' · checking them against your library…'}
                </span>
                <div className="spacer" />
                <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                  <Plus width={13} height={13} /> Another song
                </button>
              </div>

              {grouped.map((group) => (
                <div key={group.stem} className="sound-group">
                  <div className="sound-group-head" style={{ color: `hsl(${STEM_HUES[group.stem]} 60% 62%)` }}>
                    <Layers width={13} height={13} />
                    {LAYER_LABELS[group.stem] ?? group.stem}
                    <span style={{ color: 'var(--faint)' }}>{group.rows.length}</span>
                  </div>
                  {group.rows.map((row) => (
                    <SoundRow
                      key={row.sound.id}
                      row={row}
                      onPlay={(takeIndex) => void audition(row.sound, takeIndex)}
                      onToggle={() => setRows((rs) => rs.map((r) =>
                        r.sound.id === row.sound.id ? { ...r, chosen: !r.chosen } : r))}
                      onRename={(name) => setRows((rs) => rs.map((r) =>
                        r.sound.id === row.sound.id ? { ...r, name } : r))}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {mine.length > 0 && (
            <div className="sound-group" style={{ marginTop: 16 }}>
              <div className="sound-group-head">Your sounds <span style={{ color: 'var(--faint)' }}>{mine.length}</span></div>
              {mine.map((preset) => (
                <div key={preset.id} className="sound-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sound-name">{preset.name}</div>
                    <div className="sound-note">{preset.blurb}</div>
                  </div>
                  <button
                    className="btn icon ghost" title={`Forget ${preset.name}`}
                    onClick={() => void forget(preset.id)}
                  >
                    <Trash width={13} height={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <span style={{ color: 'var(--faint)', fontSize: 11.5, marginRight: 'auto' }}>
            {rows.length > 0 && `${chosenCount} of ${rows.length} selected`}
          </span>
          <button className="btn" onClick={() => { stopAudition(); onClose() }}>Close</button>
          <button
            className="btn primary"
            onClick={() => void keepChosen()}
            disabled={chosenCount === 0 || busy !== null}
          >
            <Wand width={13} height={13} />
            {busy === 'saving' ? 'Adding…' : 'Add to my instruments'}
          </button>
        </div>
      </div>
    </div>
  )
}

const LAYER_LABELS: Record<string, string> = {
  drums: 'Drums and percussion',
  bass: 'Bass',
  other: 'Instruments',
  vocals: 'Voices',
}

function SoundRow({ row, onPlay, onToggle, onRename }: {
  row: Row
  onPlay(takeIndex: number): void
  onToggle(): void
  onRename(name: string): void
}) {
  const { sound } = row
  const percussive = isPercussive(sound.kind)
  const verdict = row.match?.verdict

  return (
    <div className={`sound-row${row.chosen ? ' chosen' : ''}`}>
      <input
        type="checkbox" checked={row.chosen} onChange={onToggle}
        aria-label={`Keep ${row.name}`}
      />
      <button className="btn icon ghost" onClick={() => onPlay(-1)} aria-label={`Play ${row.name}`}>
        <Play width={13} height={13} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {percussive ? (
          <div className="sound-name">{row.pad}</div>
        ) : (
          <input
            className="field sound-rename" value={row.name}
            onChange={(e) => onRename(e.target.value)}
            aria-label={`Name for ${sound.label}`}
          />
        )}
        <div className="sound-note">
          {sound.count > 1 && `plays ${sound.count} times · `}
          {sound.best.midi !== null && `${noteName(sound.best.midi)} · `}
          {row.matching
            ? 'checking your library…'
            : row.match ? describeMatch(row.match) : ''}
        </div>
      </div>

      {!percussive && sound.takes.length > 1 && (
        <div className="sound-takes">
          {sound.takes.map((take, index) => (
            <button
              key={index} className="mini" onClick={() => onPlay(index)}
              title={`Play the note this instrument was sampled at`}
            >
              {take.midi !== null ? noteName(take.midi) : index + 1}
            </button>
          ))}
        </div>
      )}

      {verdict && (
        <span className={`sound-verdict ${verdict}`}>
          {verdict === 'have-it' ? <Term of="Already yours">have it</Term>
            : verdict === 'similar' ? 'similar' : 'new'}
        </span>
      )}
    </div>
  )
}

function shorten(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]{2,4}$/i, '')
  return withoutExtension.length > 18 ? `${withoutExtension.slice(0, 18).trimEnd()}…` : withoutExtension
}
