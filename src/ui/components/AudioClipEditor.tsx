import { useState } from 'react'
import { engine } from '../../audio/engine'
import { separateStemsInWorker } from '../../audio/workers'
import { STEM_NAMES, type StemName } from '../../audio/spectral/stems'
import { describeKey } from '../../lib/importAudio'
import {
  bufferToChannels, createSample, ensureSample, getSampleBuffer, getSampleMeta,
} from '../../lib/samples'
import { audioClipLengthBeats, type AudioClip, type Track } from '../../music/project'
import { planMatch, tempoStrain, toKeySpec } from '../../music/matching'
import { NOTE_NAMES } from '../../music/theory'
import { useStore } from '../../state/store'
import { Waveform } from './Waveform'
import { Wand } from '../icons'

const STEM_HUES: Record<StemName, number> = { vocals: 330, drums: 18, bass: 210, other: 268 }

export function AudioClipEditor({ clip, track }: { clip: AudioClip; track: Track }) {
  const project = useStore((s) => s.project)
  const { updateAudioClip, commit, flash, addAudioTrack, addAudioClipFromSample, startJob, updateJob, endJob } =
    useStore.getState()

  const meta = getSampleMeta(clip.sampleId)
  const analysis = meta?.analysis
  const [separating, setSeparating] = useState(false)

  const lengthBeats = audioClipLengthBeats(clip, project.bpm)
  const speed = clip.warp && clip.originalBpm ? project.bpm / clip.originalBpm : 1
  const strain = clip.originalBpm ? tempoStrain(clip.originalBpm, project.bpm) : null

  const matchKey = () => {
    if (!analysis) return
    const plan = planMatch(analysis, project.bpm, toKeySpec(project.key.root, project.key.scale))
    commit()
    updateAudioClip(clip.id, {
      pitchSemitones: Math.round(plan.semitones * 100) / 100,
      originalBpm: plan.sourceBpm,
      warp: true,
    })
    flash(
      `Matched to ${NOTE_NAMES[project.key.root]} ${project.key.scale} · ${plan.semitones > 0 ? '+' : ''}${plan.semitones.toFixed(2)} st`,
      'good',
    )
  }

  const separate = async () => {
    const ctx = engine.ctx ?? (await engine.resume())
    const buffer = getSampleBuffer(clip.sampleId) ?? (await ensureSample(ctx, clip.sampleId))
    if (!buffer) { flash('That audio is no longer available', 'warn'); return }

    setSeparating(true)
    const job = startJob(`Separating ${meta?.name ?? 'audio'}`)
    try {
      const stems = await separateStemsInWorker(
        bufferToChannels(buffer), buffer.sampleRate, undefined,
        ({ fraction }) => updateJob(job, fraction),
      )
      for (const name of STEM_NAMES) {
        const channels = stems[name]
        const created = await createSample(
          ctx, channels, buffer.sampleRate, `${meta?.name ?? 'Audio'} — ${name}`,
          { sourceId: clip.sampleId, stem: name, analysis: meta?.analysis },
        )
        const trackId = addAudioTrack(`${name[0].toUpperCase()}${name.slice(1)}`)
        useStore.getState().updateTrack(trackId, { color: STEM_HUES[name] })
        addAudioClipFromSample(trackId, created.meta.id, {
          startBeat: clip.startBeat,
          name,
          originalBpm: clip.originalBpm,
          warp: clip.warp,
          warpMode: clip.warpMode,
          pitchSemitones: clip.pitchSemitones,
          offsetSec: clip.offsetSec,
          sourceDurationSec: clip.sourceDurationSec,
          hue: STEM_HUES[name],
        })
      }
      flash('Split into vocals, drums, bass and other', 'good')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Separation failed', 'warn')
    } finally {
      endJob(job)
      setSeparating(false)
    }
  }

  const total = meta?.durationSec || 1

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input
          className="project-name"
          style={{ width: 200 }}
          value={clip.name}
          onChange={(e) => updateAudioClip(clip.id, { name: e.target.value })}
        />
        <div className="inspector-facts">
          <span className="fact">
            length <b>{lengthBeats.toFixed(1)} beats</b>
          </span>
          {analysis && (
            <>
              <span className="fact">source <b>{Math.round(analysis.beat.bpm)} BPM</b></span>
              <span className="fact">key <b>{describeKey(analysis)}</b></span>
              {Math.abs(analysis.key.tuningCents) >= 8 && (
                <span className="fact warn" title="This recording isn't at concert pitch. Matching the key corrects for it.">
                  tuned {analysis.key.tuningCents > 0 ? '+' : ''}{Math.round(analysis.key.tuningCents)}¢
                </span>
              )}
            </>
          )}
          {strain && strain.advice !== 'easy' && (
            <span className="fact warn">
              {strain.advice === 'try-half-time'
                ? `${Math.round(strain.percent)}% stretch — try half or double time`
                : `${Math.round(strain.percent)}% stretch`}
            </span>
          )}
        </div>
      </div>

      <div className="wave-panel">
        <Waveform
          peaks={analysis?.peaks}
          from={clip.offsetSec / total}
          to={Math.min(1, (clip.offsetSec + clip.sourceDurationSec) / total)}
          height={90}
          color={`hsl(${clip.hue ?? track.color} 80% 66%)`}
        />
      </div>

      <div className="inspector-grid">
        <div className="control">
          <div className="control-head">
            <span className="label">Follow project tempo</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn ${clip.warp ? 'on' : ''}`}
              onClick={() => updateAudioClip(clip.id, { warp: !clip.warp })}
              disabled={!clip.originalBpm}
            >
              {clip.warp ? 'Warping' : 'Free'}
            </button>
            <button
              className={`btn ${clip.warpMode === 'repitch' ? 'on' : ''}`}
              onClick={() => updateAudioClip(clip.id, {
                warpMode: clip.warpMode === 'stretch' ? 'repitch' : 'stretch',
              })}
              title="Repitch changes speed and pitch together, like a turntable. Stretch keeps the pitch."
            >
              {clip.warpMode === 'stretch' ? 'Keeps pitch' : 'Turntable'}
            </button>
          </div>
          <span className="control-note">
            {clip.originalBpm
              ? `${Math.round(clip.originalBpm)} → ${project.bpm} BPM (${speed > 1 ? '+' : ''}${((speed - 1) * 100).toFixed(1)}%)`
              : 'Tempo unknown — set it below to enable warping'}
          </span>
        </div>

        <div className="control">
          <div className="control-head">
            <span className="label">Source tempo</span>
            <span className="mono" style={{ fontSize: 11 }}>{clip.originalBpm?.toFixed(1) ?? '—'}</span>
          </div>
          <input
            type="range" min={50} max={200} step={0.5}
            value={clip.originalBpm ?? 120}
            onChange={(e) => updateAudioClip(clip.id, { originalBpm: Number(e.target.value) })}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            <button className="btn" style={{ height: 24, fontSize: 11 }}
              onClick={() => updateAudioClip(clip.id, { originalBpm: (clip.originalBpm ?? 120) / 2 })}>÷2</button>
            <button className="btn" style={{ height: 24, fontSize: 11 }}
              onClick={() => updateAudioClip(clip.id, { originalBpm: (clip.originalBpm ?? 120) * 2 })}>×2</button>
            {analysis && (
              <button className="btn" style={{ height: 24, fontSize: 11 }}
                onClick={() => updateAudioClip(clip.id, { originalBpm: analysis.beat.bpm })}>
                reset
              </button>
            )}
          </div>
          <span className="control-note">Correct it if the detection was off — everything else follows.</span>
        </div>

        <div className="control">
          <div className="control-head">
            <span className="label">Transpose</span>
            <span className="mono" style={{ fontSize: 11 }}>
              {clip.pitchSemitones > 0 ? '+' : ''}{clip.pitchSemitones.toFixed(2)} st
            </span>
          </div>
          <input
            type="range" min={-12} max={12} step={0.25}
            value={clip.pitchSemitones}
            onChange={(e) => updateAudioClip(clip.id, { pitchSemitones: Number(e.target.value) })}
          />
          <button className="btn" style={{ height: 26 }} onClick={matchKey} disabled={!analysis}>
            <Wand width={12} height={12} /> Match project key
          </button>
        </div>

        <div className="control">
          <div className="control-head">
            <span className="label">Gain</span>
            <span className="mono" style={{ fontSize: 11 }}>
              {(20 * Math.log10(Math.max(0.001, clip.gain))).toFixed(1)} dB
            </span>
          </div>
          <input
            type="range" min={0} max={2} step={0.01}
            value={clip.gain}
            onChange={(e) => updateAudioClip(clip.id, { gain: Number(e.target.value) })}
          />
          {analysis && (
            <span className="control-note">source level {analysis.loudnessDb.toFixed(1)} dBFS</span>
          )}
        </div>

        <div className="control">
          <div className="control-head">
            <span className="label">Fades</span>
            <span className="mono" style={{ fontSize: 11 }}>
              {clip.fadeInBeats.toFixed(2)} / {clip.fadeOutBeats.toFixed(2)}
            </span>
          </div>
          <input
            type="range" min={0} max={4} step={0.05}
            value={clip.fadeInBeats}
            onChange={(e) => updateAudioClip(clip.id, { fadeInBeats: Number(e.target.value) })}
          />
          <input
            type="range" min={0} max={4} step={0.05}
            value={clip.fadeOutBeats}
            onChange={(e) => updateAudioClip(clip.id, { fadeOutBeats: Number(e.target.value) })}
          />
        </div>

        <div className="control">
          <div className="control-head">
            <span className="label">Start offset</span>
            <span className="mono" style={{ fontSize: 11 }}>{clip.offsetSec.toFixed(2)}s</span>
          </div>
          <input
            type="range" min={0} max={Math.max(0.1, total - 0.2)} step={0.01}
            value={clip.offsetSec}
            onChange={(e) => {
              const offsetSec = Number(e.target.value)
              updateAudioClip(clip.id, {
                offsetSec,
                sourceDurationSec: Math.min(clip.sourceDurationSec, total - offsetSec),
              })
            }}
          />
          <button
            className={`btn ${clip.reverse ? 'on' : ''}`}
            style={{ height: 26 }}
            onClick={() => updateAudioClip(clip.id, { reverse: !clip.reverse })}
          >
            Reverse
          </button>
        </div>
      </div>

      <div>
        <div className="label" style={{ marginBottom: 8 }}>Split into stems</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => void separate()} disabled={separating}>
            {separating ? 'Separating…' : 'Separate vocals, drums, bass, other'}
          </button>
          <span style={{ color: 'var(--faint)', fontSize: 11.5, maxWidth: 460, lineHeight: 1.5 }}>
            Each stem lands on its own track, warped the same way as this clip. It's an
            estimate from the spectrogram, not a studio multitrack — a hard-panned vocal
            or a mono recording will defeat it.
          </span>
        </div>
      </div>
    </div>
  )
}
