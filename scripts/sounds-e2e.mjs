/**
 * End-to-end test of taking a song apart.
 *
 * This is the one feature where "it made a sound" cannot be checked any other
 * way: a sampled instrument is only real if audio came out of a file, through
 * separation and slicing, into storage, and back out of the speakers on a note
 * the user played. So the whole path runs here — including a reload, because
 * an instrument that does not survive one is not an instrument, it is a
 * temporary file.
 */
import { chromium } from 'playwright'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// --- build a song to take apart -------------------------------------------
const SR = 44100
const BPM = 120
const BEAT = 60 / BPM
const BARS = 8

function rng(seed = 1) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2) - 1
  }
}

function makeSong() {
  const n = Math.floor(BARS * 4 * BEAT * SR)
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  const add = (at, signal, pan = 0, gain = 1) => {
    const from = Math.floor(at * SR)
    const l = gain * Math.min(1, 1 - pan)
    const r = gain * Math.min(1, 1 + pan)
    for (let i = 0; i < signal.length && from + i < n; i++) {
      left[from + i] += signal[i] * l
      right[from + i] += signal[i] * r
    }
  }

  const kick = () => {
    const out = new Float32Array(Math.round(0.3 * SR))
    let phase = 0
    for (let i = 0; i < out.length; i++) {
      const t = i / SR
      phase += (2 * Math.PI * (50 + 110 * Math.exp(-t * 55))) / SR
      out[i] = Math.sin(phase) * 0.95 * Math.exp(-t * 14)
    }
    return out
  }
  const snare = (seed) => {
    const out = new Float32Array(Math.round(0.22 * SR))
    const rand = rng(seed)
    let low = 0, high = 0
    for (let i = 0; i < out.length; i++) {
      const t = i / SR
      const white = rand()
      low += (white - low) * 0.2
      high += (low - high) * 0.02
      const tone = Math.sin(2 * Math.PI * 190 * t) * 0.55 + Math.sin(2 * Math.PI * 330 * t) * 0.3
      out[i] = ((low - high) * 1.7 + tone * 0.8) * 0.75 * Math.exp(-t * 22)
    }
    return out
  }
  const hat = (seed) => {
    const out = new Float32Array(Math.round(0.05 * SR))
    const rand = rng(seed)
    let previous = 0
    for (let i = 0; i < out.length; i++) {
      const white = rand()
      out[i] = (white - previous * 0.92) * 0.3 * Math.exp(-(i / SR) * 90)
      previous = white
    }
    return out
  }
  const note = (midi, seconds, gain, harmonics) => {
    const hz = 440 * Math.pow(2, (midi - 69) / 12)
    const out = new Float32Array(Math.round(seconds * SR))
    const fade = Math.round(0.03 * SR)
    for (let i = 0; i < out.length; i++) {
      const t = i / SR
      const release = Math.min(1, (out.length - i) / fade)
      let value = 0
      harmonics.forEach((level, h) => { value += level * Math.sin(2 * Math.PI * hz * (h + 1) * t) })
      out[i] = release * gain * Math.exp(-t * 3.5) * value
    }
    return out
  }

  // Drums centred, bass centred and low, a bright melody panned wide so the
  // centre-extraction has something to pull apart.
  for (let bar = 0; bar < BARS; bar++) {
    const base = bar * 4 * BEAT
    for (const beat of [0, 2]) add(base + beat * BEAT, kick(), 0, 1)
    for (const beat of [1, 3]) add(base + beat * BEAT, snare(bar * 7 + beat), 0, 1)
    for (let e = 0; e < 8; e++) add(base + e * 0.5 * BEAT + 0.25 * BEAT, hat(bar * 13 + e), 0.15, 1)

    const roots = [38, 41, 36, 43][bar % 4]
    add(base, note(roots, 1.9, 0.55, [1, 0.35, 0.12]), 0, 1)
    add(base + 2 * BEAT, note(roots, 1.9, 0.5, [1, 0.35, 0.12]), 0, 1)

    const melody = [69, 72, 76, 74][bar % 4]
    add(base, note(melody, 1.5, 0.3, [1, 0.5, 0.3, 0.15]), -0.75, 1)
    add(base + 2 * BEAT, note(melody + 3, 1.5, 0.3, [1, 0.5, 0.3, 0.15]), 0.75, 1)
  }

  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  const trim = 0.89 / (peak || 1)
  for (let i = 0; i < n; i++) { left[i] *= trim; right[i] *= trim }
  return [left, right]
}

function wavBytes(channels, sampleRate) {
  const frames = channels[0].length
  const blockAlign = channels.length * 2
  const bytes = new Uint8Array(44 + frames * blockAlign)
  const view = new DataView(bytes.buffer)
  const ascii = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)) }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + frames * blockAlign, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, frames * blockAlign, true)
  let at = 44
  for (let i = 0; i < frames; i++) {
    for (const channel of channels) {
      const value = Math.max(-1, Math.min(1, channel[i]))
      view.setInt16(at, value < 0 ? value * 0x8000 : value * 0x7fff, true)
      at += 2
    }
  }
  return Buffer.from(bytes)
}

const songBuffer = wavBytes(makeSong(), SR)

// --- drive the app ---------------------------------------------------------
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForSelector('.door')

// The feature has its own front door, because it is a reason to open the app.
const door = page.locator('.door', { hasText: 'Take a song apart' })
record('There is a door for it on the first run', await door.count() === 1)
await door.click()
await page.waitForSelector('.sheet')
await page.waitForFunction(() => Boolean(window.__overtone))
record('The door opens the sound lab',
  (await page.locator('.sheet-title').first().textContent())?.includes('Take a song apart'))

// --- take a song apart -----------------------------------------------------
await page.setInputFiles('.sheet input[type=file]', {
  name: 'test-song.wav', mimeType: 'audio/wav', buffer: songBuffer,
})

await page.waitForSelector('.sound-row', { timeout: 180000 })
await page.waitForFunction(
  () => !document.body.textContent.includes('checking your library…'),
  { timeout: 180000 },
)

const found = await page.evaluate(() =>
  [...document.querySelectorAll('.sound-group')].map((group) => ({
    layer: group.querySelector('.sound-group-head')?.textContent?.trim(),
    sounds: [...group.querySelectorAll('.sound-row')].map((row) => ({
      name: row.querySelector('.sound-name')?.textContent
        ?? row.querySelector('.sound-rename')?.value,
      note: row.querySelector('.sound-note')?.textContent,
      verdict: row.querySelector('.sound-verdict')?.textContent,
    })),
  })))

const everySound = found.flatMap((g) => g.sounds)
record('It finds the sounds inside the song', everySound.length >= 3,
  `${everySound.length} sounds across ${found.length} layers`)
record('It groups them by which layer they came from', found.length >= 2,
  found.map((g) => g.layer?.replace(/\s+/g, ' ')).join(' · '))

const drums = found.find((g) => (g.layer ?? '').startsWith('Drums'))
record('It finds the drums and names them in plain language',
  Boolean(drums) && drums.sounds.length >= 2,
  drums ? drums.sounds.map((s) => s.name).join(', ') : 'no drum layer')

record('It says how often each sound plays',
  everySound.some((s) => /plays \d+ times/.test(s.note ?? '')),
  everySound.find((s) => /plays \d+ times/.test(s.note ?? ''))?.note ?? '')

const names = drums ? drums.sounds.map((s) => s.name) : []
record('Two sounds of the same kind get names you can tell apart',
  new Set(names).size === names.length, names.join(', '))

record('It says whether your library already has each sound',
  everySound.every((s) => Boolean(s.verdict)),
  [...new Set(everySound.map((s) => s.verdict))].join(' / '))

await page.screenshot({ path: 'scripts/screenshots/sound-lab.png' })

// --- keep them -------------------------------------------------------------
const beforeCount = await page.evaluate(() => window.__overtone.storedInstruments().length)
// Take everything, including what the library already covers, so the test
// exercises both paths.
const boxes = await page.locator('.sound-row input[type=checkbox]').all()
for (const box of boxes) { if (!(await box.isChecked())) await box.check() }

await page.locator('.sheet-foot .btn.primary').click()
await page.waitForFunction(
  (before) => window.__overtone.storedInstruments().length > before,
  beforeCount, { timeout: 60000 },
)

const kept = await page.evaluate(() => window.__overtone.storedInstruments().map((p) => ({
  id: p.id, name: p.name, family: p.family, engine: p.engine, userMade: p.userMade,
  zones: p.params.zones.length, range: p.range,
})))
record('Keeping them adds instruments to the library', kept.length > 0,
  kept.map((k) => `${k.name} (${k.zones} zone${k.zones === 1 ? '' : 's'})`).join(', '))
record('They are sampled instruments, marked as the user’s own',
  kept.every((k) => k.engine === 'sampler' && k.userMade === true))

const kit = kept.find((k) => k.family === 'drums')
record('The drums become one kit rather than a pile of instruments',
  Boolean(kit) && kit.zones >= 2, kit ? `${kit.name}: ${kit.zones} pieces` : 'no kit')

// --- can you actually play them? ------------------------------------------
const played = await page.evaluate(async (presetId) => {
  const { renderProject, emptyProject, createTrack, createClip, createNote, getPreset, kitPieces } =
    { ...window.__overtone, ...await import('/src/music/project.ts') }
  const preset = getPreset(presetId)
  const pieces = kitPieces(preset).map((p) => p.midi)
  const project = emptyProject('sampled')
  const track = createTrack({ presetId, isDrum: true })
  project.tracks = [track]
  const clip = createClip(track.id, { contentBeats: 4, lengthBeats: 4 })
  clip.notes = pieces.slice(0, 4).map((midi, i) => createNote(midi, i, 0.5, 0.9))
  project.clips = [clip]
  const buffer = await renderProject(project, { tailSeconds: 0.5, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  let peak = 0, sumSq = 0
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]))
    sumSq += data[i] * data[i]
  }
  return { peak, rms: Math.sqrt(sumSq / data.length), pieces: pieces.length }
}, kit?.id)
record('A kit taken out of a song actually plays', played.peak > 0.02,
  `peak ${played.peak.toFixed(3)} rms ${played.rms.toFixed(4)} over ${played.pieces} pieces`)
record('And it does not clip', played.peak <= 1.001, `peak ${played.peak.toFixed(3)}`)

const melodicId = kept.find((k) => k.family !== 'drums' && k.zones > 1)?.id
const melodic = await page.evaluate(async (presetId) => {
  const { renderProject, emptyProject, createTrack, createClip, createNote, getPreset } =
    { ...window.__overtone, ...await import('/src/music/project.ts') }
  const preset = getPreset(presetId)
  const project = emptyProject('sampled melody')
  const track = createTrack({ presetId })
  project.tracks = [track]
  const clip = createClip(track.id, { contentBeats: 4, lengthBeats: 4 })
  // Play across the whole range, including notes between the recordings —
  // a gap in the zone layout would show up here as a silent beat.
  const [low, high] = preset.range
  const notes = [low, Math.round((low * 2 + high) / 3), Math.round((low + high * 2) / 3), high]
  clip.notes = notes.map((midi, i) => createNote(midi, i, 0.9, 0.9))
  project.clips = [clip]
  const buffer = await renderProject(project, { tailSeconds: 0.5, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  const beatSamples = Math.floor(0.5 * 22050)
  // Each note should be audible in its own beat, not just somewhere.
  const perNote = notes.map((_, i) => {
    let peak = 0
    for (let j = i * beatSamples; j < Math.min(data.length, (i + 1) * beatSamples); j++) {
      peak = Math.max(peak, Math.abs(data[j]))
    }
    return peak
  })
  return { notes, perNote, range: preset.range }
}, melodicId)
record('A pitched instrument plays across its whole range, with no dead notes',
  melodic.perNote.every((peak) => peak > 0.01),
  melodic.notes.map((m, i) => `${m}:${melodic.perNote[i].toFixed(2)}`).join(' '))

// --- does it show up where instruments live? -------------------------------
await page.locator('.sheet-foot .btn', { hasText: 'Close' }).click()
await page.keyboard.press('KeyT')
await page.waitForSelector('.picker-families')
const shelf = page.locator('.fam', { hasText: 'Your sounds' })
record('The picker grows a shelf for your own sounds', await shelf.count() === 1)
await shelf.click()
const mine = await page.locator('.picker-grid .inst-card').count()
record('Your sounds are in it', mine > 0, `${mine} instruments`)
await page.screenshot({ path: 'scripts/screenshots/your-sounds.png' })
await page.keyboard.press('Escape')

// --- do they survive a reload? --------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
const doorAgain = await page.locator('.door').count()
if (doorAgain > 0) await page.locator('.door', { hasText: 'Play with something' }).click()
await page.waitForSelector('.app')
await page.waitForFunction(() => Boolean(window.__overtone))
await page.waitForFunction(
  (expected) => window.__overtone.storedInstruments().length >= expected,
  kept.length, { timeout: 30000 },
)
const afterReload = await page.evaluate(() => window.__overtone.storedInstruments().length)
record('Your instruments are still there after a reload', afterReload >= kept.length,
  `${afterReload} instruments`)

const stillPlays = await page.evaluate(async (presetId) => {
  const { renderProject, emptyProject, createTrack, createClip, createNote, getPreset, kitPieces } =
    { ...window.__overtone, ...await import('/src/music/project.ts') }
  const preset = getPreset(presetId)
  if (preset.id !== presetId) return { peak: 0, missing: true }
  const project = emptyProject('after reload')
  const track = createTrack({ presetId, isDrum: true })
  project.tracks = [track]
  const clip = createClip(track.id, { contentBeats: 2, lengthBeats: 2 })
  clip.notes = kitPieces(preset).slice(0, 2).map((p, i) => createNote(p.midi, i, 0.5, 0.9))
  project.clips = [clip]
  const buffer = await renderProject(project, { tailSeconds: 0.4, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  return { peak, missing: false }
}, kit?.id)
record('And they still make a sound — the audio came back too',
  !stillPlays.missing && stillPlays.peak > 0.02, `peak ${stillPlays.peak.toFixed(3)}`)

// --- can you send one to someone else? ------------------------------------
const travelled = await page.evaluate(async (presetId) => {
  const { createBundle, readBundle, emptyProject, createTrack } =
    { ...window.__overtone, ...await import('/src/music/project.ts') }
  const project = emptyProject('bundled')
  project.tracks = [createTrack({ presetId, isDrum: true })]
  const bundle = await createBundle(project)
  const opened = await readBundle(bundle)
  return {
    instruments: opened.instruments.length,
    name: opened.instruments[0]?.name,
    samples: opened.samples.length,
  }
}, kit?.id)
record('A bundle carries the instrument, not just a name for it',
  travelled.instruments === 1 && travelled.samples > 0,
  `${travelled.name}: ${travelled.samples} audio file(s)`)

record('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
