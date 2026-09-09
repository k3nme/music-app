import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { recorder } from '../../audio/recorder'
import { createSample } from '../../lib/samples'
import { useStore } from '../../state/store'

/**
 * Records the microphone straight onto an audio track, in time with the
 * transport.
 *
 * The clip is placed at the beat the recording started on, and tagged with the
 * project tempo, so it follows later tempo changes like any other warped clip.
 */
export function RecordButton() {
  const playing = useStore((s) => s.playing)
  const [state, setState] = useState<'idle' | 'recording'>('idle')
  const [level, setLevel] = useState(0)
  const startBeat = useRef(0)
  const trackId = useRef<string | null>(null)

  const finish = useCallback(async () => {
    if (!recorder.recording) return
    const pcm = recorder.stop()
    recorder.onLevel = null
    setState('idle')
    setLevel(0)

    const store = useStore.getState()
    const targetTrack = trackId.current
    trackId.current = null
    if (!targetTrack) return

    if (pcm.length < recorder.sampleRate * 0.2) {
      store.flash('That take was too short to keep', 'warn')
      return
    }

    const job = store.startJob('Saving take')
    try {
      const ctx = await engine.resume()
      const { meta } = await createSample(
        ctx, [pcm], recorder.sampleRate,
        `Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      )
      store.addAudioClipFromSample(targetTrack, meta.id, {
        startBeat: startBeat.current,
        name: meta.name,
        // Recorded against the click, so it already sits at the project tempo.
        originalBpm: store.project.bpm,
        warp: true,
      })
      store.flash(`Recorded ${(pcm.length / recorder.sampleRate).toFixed(1)}s`, 'good')
    } catch (error) {
      store.flash(error instanceof Error ? error.message : 'Could not save that take', 'warn')
    } finally {
      store.endJob(job)
    }
  }, [])

  // Stopping the transport ends the take.
  useEffect(() => {
    if (!playing && state === 'recording') void finish()
  }, [playing, state, finish])

  useEffect(() => () => { if (recorder.recording) recorder.stop() }, [])

  const begin = useCallback(async () => {
    const store = useStore.getState()
    try {
      const ctx = await engine.resume()
      await recorder.open(ctx)
    } catch (error) {
      store.flash(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser’s address bar.'
          : 'Could not open the microphone',
        'warn',
      )
      return
    }

    // Record onto the selected audio track, or make one.
    const selected = store.project.tracks.find((t) => t.id === store.selectedTrackId)
    trackId.current = selected?.kind === 'audio' ? selected.id : store.addAudioTrack('Recording')

    recorder.onLevel = setLevel
    recorder.start()
    startBeat.current = engine.positionBeats
    setState('recording')
    if (!store.playing) void store.play()
  }, [])

  return (
    <button
      className={`btn icon ${state === 'recording' ? 'rec' : ''}`}
      onClick={() => (state === 'recording' ? void finish() : void begin())}
      title={state === 'recording' ? 'Stop recording' : 'Record audio onto a track (R)'}
      aria-pressed={state === 'recording'}
      style={state === 'recording'
        ? { boxShadow: `0 0 ${6 + level * 26}px rgba(255,77,109,${0.35 + level * 0.5})` }
        : undefined}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="7" />
      </svg>
    </button>
  )
}
