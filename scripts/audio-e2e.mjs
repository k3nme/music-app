/**
 * End-to-end test of the audio side of the DAW.
 *
 * Builds a synthetic "song" in the page (a chord progression over a drum
 * pattern at a known tempo and key), imports it exactly as a dropped file
 * would be, and checks the whole path: decode, analyse, place on the timeline,
 * warp to a new tempo, separate stems, and render the result.
 */
import { chromium } from 'playwright'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Start empty' }).click()
await page.waitForSelector('.app')
await page.waitForFunction(() => Boolean(window.__overtone))

// --- build a song and import it -------------------------------------------
const imported = await page.evaluate(async () => {
  const { encodeWav, importAudioIntoProject, useStore } = window.__overtone
  const SR = 44100
  const BPM = 100
  const beat = 60 / BPM
  const bars = 8
  const seconds = bars * 4 * beat
  const n = Math.floor(seconds * SR)
  const left = new Float32Array(n)
  const right = new Float32Array(n)

  // A minor: Am F C G, one chord per bar, centred.
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length]
    const start = Math.floor(bar * 4 * beat * SR)
    const length = Math.floor(4 * beat * SR)
    chord.forEach((midi, voice) => {
      const hz = 440 * Math.pow(2, (midi - 69) / 12)
      // Bottom two voices centred, the top voice panned right — a mix spreads
      // its parts out, and a fully centred one has nothing to separate.
      const [gainL, gainR] = voice === chord.length - 1 ? [0.25, 1.4] : [1, 1]
      for (let i = 0; i < length && start + i < n; i++) {
        const t = i / SR
        const env = Math.min(1, t / 0.02) * Math.min(1, (4 * beat - t) / 0.08)
        const v = env * 0.11 * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t))
        left[start + i] += v * gainL
        right[start + i] += v * gainR
      }
    })
  }

  // Kick on every beat, hats on eighths, panned slightly for a stereo image.
  for (let b = 0; b * beat < seconds; b++) {
    const at = Math.floor(b * beat * SR)
    for (let i = 0; i < Math.floor(0.16 * SR) && at + i < n; i++) {
      const t = i / SR
      const hz = 130 * Math.exp(-t * 28) + 45
      const v = Math.exp(-t * 22) * Math.sin(2 * Math.PI * hz * t) * 0.85
      left[at + i] += v
      right[at + i] += v
    }
    for (const half of [0, 0.5]) {
      const hatAt = Math.floor((b + half) * beat * SR)
      for (let i = 0; i < Math.floor(0.02 * SR) && hatAt + i < n; i++) {
        const v = Math.exp(-(i / (0.02 * SR)) * 6) * (Math.random() * 2 - 1) * 0.16
        left[hatAt + i] += v * 0.7
        right[hatAt + i] += v * 1.3
      }
    }
  }

  const blob = encodeWav([left, right], SR)
  const file = new File([blob], 'test-song.wav', { type: 'audio/wav' })
  const result = await importAudioIntoProject(file, { startBeat: 0 })
  const state = useStore.getState()
  return {
    ok: Boolean(result),
    bpm: result?.meta.analysis?.beat.bpm ?? null,
    keyRoot: result?.meta.analysis?.key.root ?? null,
    keyMode: result?.meta.analysis?.key.mode ?? null,
    tuning: result?.meta.analysis?.key.tuningCents ?? null,
    tracks: state.project.tracks.length,
    audioClips: state.project.audioClips.length,
    trackKind: state.project.tracks[0]?.kind,
    durationSec: result?.meta.durationSec ?? 0,
    peaks: result?.meta.analysis?.peaks.length ?? 0,
  }
})

record('Audio file imports and lands on a track', imported.ok && imported.audioClips === 1,
  `${imported.tracks} track, ${imported.audioClips} clip`)
record('Imported track is an audio track', imported.trackKind === 'audio', String(imported.trackKind))
record('Tempo is detected from the file', imported.bpm !== null && Math.abs(imported.bpm - 100) < 2,
  `${imported.bpm?.toFixed(2)} BPM`)
// Am-F-C-G that never resolves is genuinely ambiguous between A minor and its
// relative, C major — they contain the same seven notes. What matters for
// matching is the pitch-class set, so assert the keys are equivalent rather
// than pinning a coin flip.
const relativeRoot = imported.keyMode === 'major'
  ? (((imported.keyRoot - 3) % 12) + 12) % 12
  : imported.keyRoot
record('Key is detected (up to relative-key equivalence)', relativeRoot === 9,
  `${imported.keyRoot} ${imported.keyMode} -> folds to ${relativeRoot}`)
record('Tuning reads as concert pitch', Math.abs(imported.tuning ?? 99) < 10, `${imported.tuning?.toFixed(1)}¢`)
record('Waveform peaks are stored', imported.peaks > 100, `${imported.peaks / 2} buckets`)

await page.waitForTimeout(300)
record('Clip renders in the arrangement', (await page.locator('.clip.audio').count()) === 1)

// --- warping ---------------------------------------------------------------
const warped = await page.evaluate(async () => {
  const { useStore, audioClipLengthBeats } = window.__overtone
  const store = useStore.getState()
  const before = audioClipLengthBeats(store.project.audioClips[0], store.project.bpm)
  // The project starts at 120; the file is 100. Length in beats should be
  // unchanged by warping (same musical length), but wall-clock time shrinks.
  store.setBpm(150)
  const after = audioClipLengthBeats(useStore.getState().project.audioClips[0], 150)
  store.setBpm(120)
  return { before, after }
})
record('Warped clip keeps its musical length across tempo changes',
  Math.abs(warped.before - warped.after) < 0.01,
  `${warped.before.toFixed(2)} vs ${warped.after.toFixed(2)} beats`)

const free = await page.evaluate(() => {
  const { useStore, audioClipLengthBeats } = window.__overtone
  const store = useStore.getState()
  const clip = store.project.audioClips[0]
  store.updateAudioClip(clip.id, { warp: false })
  const at120 = audioClipLengthBeats(useStore.getState().project.audioClips[0], 120)
  store.setBpm(60)
  const at60 = audioClipLengthBeats(useStore.getState().project.audioClips[0], 60)
  store.setBpm(120)
  store.updateAudioClip(clip.id, { warp: true })
  return { at120, at60 }
})
record('Unwarped clip holds wall-clock length instead',
  Math.abs(free.at120 / 2 - free.at60) < 0.05,
  `${free.at120.toFixed(1)} beats at 120, ${free.at60.toFixed(1)} at 60`)

// --- key matching ----------------------------------------------------------
const matched = await page.evaluate(() => {
  const { useStore, planMatch, toKeySpec, getSampleMeta } = window.__overtone
  const store = useStore.getState()
  store.setKey(2, 'minor') // move the project to D minor
  const meta = getSampleMeta(store.project.audioClips[0].sampleId)
  const plan = planMatch(meta.analysis, 120, toKeySpec(2, 'minor'))
  store.setKey(0, 'minor')
  return { semitones: plan.semitones, speed: plan.speed }
})
// A minor source into D minor is +5 semitones.
record('Key match computes the right transposition',
  Math.abs(matched.semitones - 5) < 0.35, `${matched.semitones.toFixed(2)} st`)

// --- render includes the audio --------------------------------------------
const render = await page.evaluate(async () => {
  const { renderProject, useStore } = window.__overtone
  const buffer = await renderProject(useStore.getState().project, { tailSeconds: 0.5 })
  const data = buffer.getChannelData(0)
  let peak = 0
  let sumSq = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i])
    if (v > peak) peak = v
    sumSq += data[i] * data[i]
  }
  return { peak, rms: Math.sqrt(sumSq / data.length), seconds: buffer.duration }
})
record('Offline render includes the audio clip', render.peak > 0.05 && render.rms > 0.005,
  `peak ${render.peak.toFixed(3)} rms ${render.rms.toFixed(4)} over ${render.seconds.toFixed(1)}s`)
record('Rendered audio does not clip', render.peak <= 1.001, `peak ${render.peak.toFixed(3)}`)

// --- stem separation -------------------------------------------------------
const stems = await page.evaluate(async () => {
  const { useStore, separateStemsInWorker, getSampleBuffer, bufferToChannels } = window.__overtone
  const store = useStore.getState()
  const clip = store.project.audioClips[0]
  const buffer = getSampleBuffer(clip.sampleId)
  const t0 = performance.now()
  const result = await separateStemsInWorker(bufferToChannels(buffer), buffer.sampleRate)
  const energy = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s }
  return {
    seconds: (performance.now() - t0) / 1000,
    names: Object.keys(result),
    lengths: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v[0].length])),
    energies: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Math.round(energy(v[0]))])),
    sourceLength: buffer.length,
  }
})
record('Stem separation returns four stems in a worker',
  stems.names.length === 4 && stems.names.every((n) => stems.lengths[n] === stems.sourceLength),
  `${stems.names.join(', ')} in ${stems.seconds.toFixed(1)}s`)
record('Every stem carries some signal',
  Object.values(stems.energies).every((e) => e > 0), JSON.stringify(stems.energies))

// --- separation from the UI ------------------------------------------------
await page.locator('.track-head').first().click()
await page.waitForSelector('.inspector')
record('Audio inspector opens for an audio clip', true)
const facts = await page.locator('.fact').allTextContents()
record('Inspector shows detected tempo and key',
  facts.some((f) => f.includes('BPM')) && facts.some((f) => f.includes('key')), facts.join(' | '))

await page.locator('.btn', { hasText: 'Separate vocals' }).click()
await page.waitForFunction(
  () => window.__overtone.useStore.getState().project.tracks.length >= 5,
  null, { timeout: 120000 },
)
const afterSplit = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  return {
    tracks: p.tracks.map((t) => t.name),
    audioClips: p.audioClips.length,
    allAudio: p.tracks.every((t) => t.kind === 'audio'),
  }
})
record('Separating from the inspector adds four stem tracks',
  afterSplit.tracks.length === 5 && afterSplit.audioClips === 5,
  afterSplit.tracks.join(', '))
record('Stem tracks are audio tracks', afterSplit.allAudio)

// --- project bundles -------------------------------------------------------
const bundle = await page.evaluate(async () => {
  const { createBundle, readBundle, useStore, projectSampleIds } = window.__overtone
  const project = useStore.getState().project
  const blob = await createBundle(project)
  const opened = await readBundle(blob)
  const originalIds = projectSampleIds(project)
  return {
    bytes: blob.size,
    name: opened.project.name,
    tracks: opened.project.tracks.length,
    audioClips: opened.project.audioClips.length,
    samples: opened.samples.length,
    idsMatch: opened.samples.every((s) => originalIds.includes(s.meta.id)),
    audioBytes: opened.samples.reduce((sum, s) => sum + s.blob.size, 0),
  }
})
record('A bundle round-trips the project with its audio',
  bundle.tracks === 5 && bundle.audioClips === 5 && bundle.samples === 5 && bundle.idsMatch,
  `${bundle.samples} samples, ${(bundle.bytes / 1024 / 1024).toFixed(1)} MB`)
record('Bundled audio is the actual audio, not a reference',
  bundle.audioBytes > 100000, `${(bundle.audioBytes / 1024 / 1024).toFixed(1)} MB of audio`)

const notBundle = await page.evaluate(async () => {
  const { readBundle } = window.__overtone
  try {
    await readBundle(new Blob(['{"just":"json"}']))
    return 'accepted'
  } catch (error) {
    return error.message
  }
})
record('A non-bundle file is rejected clearly', /not an Overtone bundle/.test(notBundle), notBundle)

await page.screenshot({ path: 'scripts/screenshots/audio-daw.png' })
record('No uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
