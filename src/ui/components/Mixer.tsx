import { getPreset } from '../../audio/instruments'
import type { Track } from '../../music/project'
import { useStore } from '../../state/store'
import { useLevel } from '../hooks'

export function Mixer() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const selectedTrackId = useStore((s) => s.selectedTrackId)

  return (
    <div className="mixer">
      {project.tracks.map((track) => (
        <Strip key={track.id} track={track} playing={playing} selected={track.id === selectedTrackId} />
      ))}
      <MasterStrip playing={playing} />
      {project.tracks.length === 0 && (
        <div style={{ color: 'var(--faint)', alignSelf: 'center' }}>
          Add a track and its channel strip appears here.
        </div>
      )}
    </div>
  )
}

function Knob({ label, value, min, max, step = 0.01, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number
  format?(v: number): string
  onChange(v: number): void
}) {
  return (
    <div className="knob-row">
      <div className="knob-label">
        <span>{label}</span>
        <span className="mono">{format ? format(value) : Math.round(value * 100)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}

function Fader({ value, onChange, level }: { value: number; onChange(v: number): void; level: number }) {
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const apply = (clientY: number) => {
      const rect = el.getBoundingClientRect()
      const ratio = 1 - (clientY - rect.top) / rect.height
      onChange(Math.max(0, Math.min(1.2, ratio * 1.2)))
    }
    apply(e.clientY)
    const move = (ev: PointerEvent) => apply(ev.clientY)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pct = Math.min(100, (value / 1.2) * 100)
  return (
    <div className="strip-fader">
      <div className="fader-track" onPointerDown={drag}>
        <div className="fader-fill" style={{ height: `${pct}%` }} />
        <div className="fader-knob" style={{ bottom: `${pct}%` }} />
      </div>
      <div className="meter-v">
        <i style={{ height: `${Math.min(100, level * 130)}%` }} />
      </div>
    </div>
  )
}

function Strip({ track, playing, selected }: { track: Track; playing: boolean; selected: boolean }) {
  const { updateChannel, toggleMute, toggleSolo, select } = useStore.getState()
  const level = useLevel(track.id, playing)
  const c = track.channel

  return (
    <div
      className="strip"
      style={{ borderColor: selected ? `hsl(${track.color} 60% 50%)` : undefined }}
      onPointerDown={() => select(track.id)}
    >
      <div className="strip-name" title={track.name}>{track.name}</div>
      <div style={{ fontSize: 10, color: 'var(--faint)', textAlign: 'center', marginTop: -6 }}>
        {getPreset(track.presetId).name}
      </div>

      <Fader value={c.volume} level={level} onChange={(v) => updateChannel(track.id, { volume: v })} />

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className={`mini ${track.muted ? 'on' : ''}`}
          style={{ flex: 1 }}
          onClick={() => toggleMute(track.id)}
        >MUTE</button>
        <button
          className={`mini solo ${track.soloed ? 'on' : ''}`}
          style={{ flex: 1 }}
          onClick={() => toggleSolo(track.id)}
        >SOLO</button>
      </div>

      <Knob label="Pan" value={c.pan} min={-1} max={1}
        format={(v) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)}
        onChange={(v) => updateChannel(track.id, { pan: v })} />
      <Knob label="Reverb" value={c.reverbSend} min={0} max={1}
        onChange={(v) => updateChannel(track.id, { reverbSend: v })} />
      <Knob label="Delay" value={c.delaySend} min={0} max={1}
        onChange={(v) => updateChannel(track.id, { delaySend: v })} />
      <Knob label="Drive" value={c.drive} min={0} max={1}
        onChange={(v) => updateChannel(track.id, { drive: v })} />
      <Knob label="Tone" value={c.tone} min={300} max={20000} step={50}
        format={(v) => (v >= 19000 ? 'open' : `${(v / 1000).toFixed(1)}k`)}
        onChange={(v) => updateChannel(track.id, { tone: v })} />
    </div>
  )
}

function MasterStrip({ playing }: { playing: boolean }) {
  const master = useStore((s) => s.project.master)
  const { setMaster } = useStore.getState()
  const level = useLevel(undefined, playing)

  return (
    <div className="strip master">
      <div className="strip-name">Master</div>
      <div style={{ fontSize: 10, color: 'var(--faint)', textAlign: 'center', marginTop: -6 }}>
        glue + limiter
      </div>
      <Fader value={master.volume} level={level} onChange={(v) => setMaster({ volume: v })} />
      <Knob label="Reverb" value={master.reverbAmount} min={0} max={1.6}
        onChange={(v) => setMaster({ reverbAmount: v })} />
      <Knob label="Size" value={master.reverbSize} min={0.4} max={6} step={0.1}
        format={(v) => `${v.toFixed(1)}s`}
        onChange={(v) => setMaster({ reverbSize: v })} />
      <Knob label="Delay" value={master.delayTimeBeats} min={0.125} max={2} step={0.125}
        format={(v) => `${v}b`}
        onChange={(v) => setMaster({ delayTimeBeats: v })} />
      <Knob label="Feedback" value={master.delayFeedback} min={0} max={0.9}
        onChange={(v) => setMaster({ delayFeedback: v })} />
    </div>
  )
}
