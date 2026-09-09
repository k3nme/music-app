/**
 * Browser smoke test. Drives the real app in Chromium and checks the things
 * unit tests can't: that the audio graph builds, that every synthesis engine
 * actually makes sound, and that the hum pipeline works end to end in-page.
 */
import { chromium } from 'playwright'

const URL = process.env.APP_URL ?? 'http://localhost:5173'
const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL, { waitUntil: 'networkidle' })

// --- boot ------------------------------------------------------------------
await page.getByRole('button', { name: 'Start with a groove' }).click()
await page.waitForSelector('.app', { timeout: 10000 })
await page.waitForFunction(() => Boolean(window.__overtone), null, { timeout: 10000 })
record('App boots into the studio', true)

const trackCount = await page.locator('.track-head').count()
record('Demo project loads its tracks', trackCount === 5, `${trackCount} tracks`)

const clipCount = await page.locator('.clip').count()
record('Clips render in the arrangement', clipCount === 5, `${clipCount} clips`)

// --- transport -------------------------------------------------------------
await page.keyboard.press('Space')
await page.waitForTimeout(900)
const moved = await page.evaluate(() => window.__overtone.engine.positionBeats)
record('Transport advances on play', moved > 0.5, `beat ${moved.toFixed(2)}`)

const ctxState = await page.evaluate(() => window.__overtone.engine.ctx?.state)
record('AudioContext is running', ctxState === 'running', String(ctxState))

const workletOk = await page.evaluate(() => window.__overtone.engine.workletReady)
record('String worklet loaded', workletOk === true)

await page.keyboard.press('Space')

// --- offline render: does it actually make sound? --------------------------
const render = await page.evaluate(async () => {
  const { renderProject, useStore } = window.__overtone
  const buffer = await renderProject(useStore.getState().project, { tailSeconds: 1 })
  const data = buffer.getChannelData(0)
  let peak = 0, sumSq = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i])
    if (v > peak) peak = v
    sumSq += data[i] * data[i]
  }
  return { peak, rms: Math.sqrt(sumSq / data.length), seconds: buffer.duration }
})
record('Demo renders audible audio', render.peak > 0.1 && render.rms > 0.01,
  `peak ${render.peak.toFixed(3)} rms ${render.rms.toFixed(4)} over ${render.seconds.toFixed(1)}s`)
record('Render does not clip', render.peak <= 1.001, `peak ${render.peak.toFixed(3)}`)

// --- every synthesis engine makes sound ------------------------------------
const perEngine = await page.evaluate(async () => {
  const { renderProject, ALL_PRESETS, emptyProject, createTrack, createClip, createNote } =
    { ...window.__overtone, ...await import('/src/music/project.ts'), ...await import('/src/audio/instruments/index.ts') }

  const sample = ['grand-piano', 'rhodes', 'sitar', 'supersaw', 'kit-909', 'cello', 'trumpet', 'marimba', 'bansuri', 'sub-bass']
  const out = {}
  for (const id of sample) {
    const preset = ALL_PRESETS.find((p) => p.id === id)
    const project = emptyProject('t')
    const track = createTrack({ presetId: id, isDrum: preset.engine === 'drum' })
    project.tracks = [track]
    const midi = preset.engine === 'drum' ? 36 : preset.centerMidi
    const clip = createClip(track.id, { contentBeats: 4, lengthBeats: 4 })
    clip.notes = [createNote(midi, 0, 1, 0.9), createNote(midi + (preset.engine === 'drum' ? 0 : 4), 1.5, 1, 0.9)]
    project.clips = [clip]
    const buffer = await renderProject(project, { tailSeconds: 1, sampleRate: 22050 })
    const data = buffer.getChannelData(0)
    let peak = 0
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
    out[id] = Number(peak.toFixed(4))
  }
  return out
})
const silent = Object.entries(perEngine).filter(([, peak]) => peak < 0.01).map(([id]) => id)
record('Every sampled instrument makes sound', silent.length === 0,
  silent.length ? `silent: ${silent.join(', ')}` : JSON.stringify(perEngine))

// --- hum pipeline in-page --------------------------------------------------
const hum = await page.evaluate(async () => {
  const { analyseRecording } = window.__overtone
  const sr = 44100
  const melody = [62, 65, 69, 67]
  const parts = []
  for (const midi of melody) {
    const hz = 440 * Math.pow(2, (midi - 69) / 12)
    const n = Math.floor(0.32 * sr)
    const seg = new Float32Array(n + Math.floor(0.1 * sr))
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const env = Math.min(1, t / 0.02) * Math.min(1, (0.32 - t) / 0.03)
      seg[i] = env * 0.45 * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t))
    }
    parts.push(seg)
  }
  const total = parts.reduce((a, p) => a + p.length, 0)
  const pcm = new Float32Array(total)
  let off = 0
  for (const p of parts) { pcm.set(p, off); off += p.length }

  const result = await analyseRecording(pcm, sr)
  return { detected: result.notes.map((n) => Math.round(n.midi)), expected: melody, tempo: result.tempo }
})
record('Hum analysis finds the sung notes in-browser',
  JSON.stringify(hum.detected) === JSON.stringify(hum.expected),
  `${JSON.stringify(hum.detected)} vs ${JSON.stringify(hum.expected)}`)

// --- UI interactions -------------------------------------------------------
await page.locator('.tab', { hasText: 'Mix' }).click()
record('Mixer opens', (await page.locator('.strip').count()) === 6,
  `${await page.locator('.strip').count()} strips`)

await page.locator('.tab', { hasText: 'Play' }).click()
record('Keyboard opens', (await page.locator('.pkey').count()) > 20)

await page.locator('.tab', { hasText: 'Beat' }).or(page.locator('.tab', { hasText: 'Notes' })).first().click()
await page.locator('.track-head').nth(2).click()
await page.waitForTimeout(200)
record('Piano roll renders notes for the arp track', (await page.locator('.note').count()) > 8,
  `${await page.locator('.note').count()} notes`)

await page.locator('.track-head').first().click()
await page.waitForTimeout(200)
record('Drum grid renders for the drum track', (await page.locator('.step.on').count()) > 20,
  `${await page.locator('.step.on').count()} active steps`)

// instrument picker
await page.locator('.track-inst').first().click()
await page.waitForSelector('.inst-card')
const cards = await page.locator('.inst-card').count()
record('Instrument picker lists the library', cards > 60, `${cards} instruments`)
await page.getByPlaceholder('Search: sitar, 808, lo-fi, jazz…').fill('sitar')
await page.waitForTimeout(150)
record('Instrument search filters', (await page.locator('.inst-card').count()) < 6,
  `${await page.locator('.inst-card').count()} results for "sitar"`)
await page.keyboard.press('Escape')
await page.locator('.sheet-foot .btn', { hasText: 'Close' }).click()

// hum studio opens
await page.locator('.hum-btn').click()
await page.waitForSelector('.hum-orb')
record('Hum studio opens', true)
await page.locator('.sheet-foot .btn', { hasText: 'Cancel' }).click()

// ideas panel
await page.locator('.btn', { hasText: 'Ideas' }).click()
await page.waitForSelector('.picker-grid .inst-card')
const ideaCount = await page.locator('.picker-grid .inst-card').count()
record('Ideas panel offers drum patterns', ideaCount >= 4, `${ideaCount} suggestions`)
await page.locator('.fam', { hasText: 'Chords' }).click()
await page.waitForTimeout(250)
const chordTitle = await page.locator('.picker-grid .inst-name').first().textContent()
record('Chord suggestions are fitted to the song', /^[A-G]/.test(chordTitle ?? ''), chordTitle ?? '')

const tracksBefore = await page.evaluate(() => window.__overtone.useStore.getState().project.tracks.length)
await page.locator('.picker-grid .inst-card').first().click()
await page.waitForTimeout(300)
const afterIdea = await page.evaluate(() => {
  const s = window.__overtone.useStore.getState()
  return { tracks: s.project.tracks.length, canUndo: s.past.length > 0 }
})
record('Applying a suggestion adds a part', afterIdea.tracks === tracksBefore + 1,
  `${tracksBefore} -> ${afterIdea.tracks}`)
record('Suggestions are undoable', afterIdea.canUndo)
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const undone = await page.evaluate(() => window.__overtone.useStore.getState().project.tracks.length)
record('Undo removes the suggested part', undone === tracksBefore, `back to ${undone}`)

// share round-trip
const share = await page.evaluate(async () => {
  const { useStore } = window.__overtone
  const { createShareLink, readShareLink } = await import('/src/lib/share.ts')
  const project = useStore.getState().project
  const link = await createShareLink(project)
  const hash = link.slice(link.indexOf('#'))
  const restored = await readShareLink(hash)
  return {
    length: link.length,
    ok: restored?.tracks.length === project.tracks.length &&
        restored?.clips[0]?.notes.length === project.clips[0].notes.length,
  }
})
record('Share link round-trips the project', share.ok, `${share.length} chars`)

// midi export
const midi = await page.evaluate(async () => {
  const { encodeMidi, useStore } = window.__overtone
  const blob = encodeMidi(useStore.getState().project)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { size: bytes.length, header: String.fromCharCode(...bytes.slice(0, 4)) }
})
record('MIDI export produces a valid file', midi.header === 'MThd' && midi.size > 200, `${midi.size} bytes`)

await page.screenshot({ path: 'scripts/screenshots/overtone-studio.png' })
await page.locator('.hum-btn').click()
await page.waitForSelector('.hum-orb')
await page.screenshot({ path: 'scripts/screenshots/overtone-hum.png' })

record('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
