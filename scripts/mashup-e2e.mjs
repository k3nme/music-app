/**
 * End-to-end test of the Mashup Lab.
 *
 * Builds two synthetic "songs" that differ in every way that matters — tempo,
 * key, tuning reference, and stereo layout — then drives the real UI: add both
 * as decks, take the vocal from one over the instrumental of the other, and
 * send the result to the timeline.
 */
import { chromium } from 'playwright'

const SR = 44100

function encodeWav(channels, sampleRate) {
  const count = channels.length
  const frames = channels[0].length
  const blockAlign = count * 2
  const buffer = Buffer.alloc(44 + frames * blockAlign)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + frames * blockAlign, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(count, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * blockAlign, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * blockAlign, 40)
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      buffer.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), offset)
      offset += 2
    }
  }
  return buffer
}

/**
 * @param bars       length in bars
 * @param bpm        tempo
 * @param chords     MIDI note sets, one per bar
 * @param detune     tuning offset in cents, to mimic a recording off A440
 * @param leadMidi   a centred "vocal" line, or null
 */
function makeSong({ bars, bpm, chords, detune = 0, leadMidi = null }) {
  const beat = 60 / bpm
  const seconds = bars * 4 * beat
  const n = Math.floor(seconds * SR)
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  const scale = Math.pow(2, detune / 1200)

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length]
    const start = Math.floor(bar * 4 * beat * SR)
    const length = Math.floor(4 * beat * SR)
    // Accompaniment spread across the image, as a real mix would be.
    chord.forEach((midi, voice) => {
      const hz = 440 * Math.pow(2, (midi - 69) / 12) * scale
      const pan = voice === 0 ? 0 : voice === 1 ? -0.6 : 0.6
      const gl = 1 - Math.max(0, pan)
      const gr = 1 + Math.min(0, pan)
      for (let i = 0; i < length && start + i < n; i++) {
        const t = i / SR
        const env = Math.min(1, t / 0.02) * Math.min(1, (4 * beat - t) / 0.1)
        const v = env * 0.09 * (Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(4 * Math.PI * hz * t))
        left[start + i] += v * gl
        right[start + i] += v * gr
      }
    })

    // A centred lead, in the vocal range, with vibrato — this is what the
    // centre-channel cue is supposed to pull out.
    if (leadMidi) {
      const midi = leadMidi[bar % leadMidi.length]
      const hz = 440 * Math.pow(2, (midi - 69) / 12) * scale
      for (let i = 0; i < length && start + i < n; i++) {
        const t = i / SR
        const env = Math.min(1, t / 0.05) * Math.min(1, (4 * beat - t) / 0.15)
        const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t)
        const v = env * 0.2 * (
          Math.sin(2 * Math.PI * hz * vib * t) + 0.3 * Math.sin(4 * Math.PI * hz * vib * t)
        )
        left[start + i] += v
        right[start + i] += v
      }
    }
  }

  // Drums: kick every beat, hats on eighths.
  for (let b = 0; b * beat < seconds; b++) {
    const at = Math.floor(b * beat * SR)
    for (let i = 0; i < Math.floor(0.16 * SR) && at + i < n; i++) {
      const t = i / SR
      const hz = 130 * Math.exp(-t * 28) + 45
      const v = Math.exp(-t * 22) * Math.sin(2 * Math.PI * hz * t) * 0.8
      left[at + i] += v
      right[at + i] += v
    }
    for (const half of [0, 0.5]) {
      const hatAt = Math.floor((b + half) * beat * SR)
      for (let i = 0; i < Math.floor(0.02 * SR) && hatAt + i < n; i++) {
        const v = Math.exp(-(i / (0.02 * SR)) * 6) * (Math.random() * 2 - 1) * 0.14
        left[hatAt + i] += v * 0.8
        right[hatAt + i] += v * 1.2
      }
    }
  }
  return encodeWav([left, right], SR)
}

// Song A: 100 BPM, A minor, instrumental, at concert pitch.
const songA = makeSong({
  bars: 8, bpm: 100,
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
})
// Song B: 92 BPM, D minor, with a centred vocal line, cut 30 cents flat.
const songB = makeSong({
  bars: 8, bpm: 92, detune: -30,
  chords: [[50, 53, 57], [46, 50, 53], [45, 48, 52], [48, 52, 55]],
  leadMidi: [69, 72, 74, 72],
})

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'or open the empty studio' }).click()
await page.waitForSelector('.app')
await page.waitForFunction(() => Boolean(window.__overtone))

// --- open the lab and add both songs --------------------------------------
await page.locator('.mashup-btn').click()
await page.waitForSelector('.deck-empty')
record('Mashup Lab opens', true)

await page.locator('.deck-empty input[type=file]').setInputFiles([
  { name: 'song-a.wav', mimeType: 'audio/wav', buffer: songA },
  { name: 'song-b.wav', mimeType: 'audio/wav', buffer: songB },
])
await page.waitForFunction(() => document.querySelectorAll('.deck').length === 2, null, { timeout: 120000 })
record('Both songs load as decks', true)

const deckFacts = await page.evaluate(() =>
  [...document.querySelectorAll('.deck')].map((deck) =>
    [...deck.querySelectorAll('.deck-head .fact')].map((f) => f.textContent.trim())),
)
// Deck order is the order the files were handed over, not the order their
// analyses finished. The two are analysed concurrently and take different
// amounts of time, and the first deck sets the target tempo and key — so
// without that guarantee, dropping the same two songs twice gives two
// different mashups. This check reads as "deck A is song A" and is really
// asserting that the race is gone.
record('Deck A reads ~100 BPM', deckFacts[0].some((f) => /\b(99|100|101)\b/.test(f)), deckFacts[0].join(' | '))
record('Deck B reads ~92 BPM', deckFacts[1].some((f) => /\b(91|92|93)\b/.test(f)), deckFacts[1].join(' | '))
// --- does it say whether these two go together? --------------------------
const fit = await page.evaluate(() => {
  const badge = document.querySelector('.fit-panel .fit')
  const notes = [...document.querySelectorAll('.fit-note')].map((n) => n.textContent.trim())
  return { verdict: badge?.textContent?.trim() ?? null, notes }
})
record('It says how well the two records go together',
  Boolean(fit.verdict), fit.verdict ?? 'no verdict shown')
record('And explains why, in sentences',
  fit.notes.length >= 2 && fit.notes.every((n) => n.length > 10), fit.notes.join(' · '))
record('It read the tempo relationship',
  fit.notes.some((n) => /tempo|%|time/i.test(n)), fit.notes.join(' · '))
record('And the key relationship',
  fit.notes.some((n) => /major|minor|semitone/i.test(n)), fit.notes.join(' · '))

const suggested = await page.evaluate(async () => {
  const before = [...document.querySelectorAll('.deck-head .fact')].map((f) => f.textContent.trim())
  const button = [...document.querySelectorAll('button')]
    .find((b) => b.textContent.includes('Use the stems it suggests'))
  button?.click()
  await new Promise((r) => setTimeout(r, 250))
  const after = [...document.querySelectorAll('.deck-head .fact')].map((f) => f.textContent.trim())
  return { had: Boolean(button), before, after }
})
record('It can choose the stems for you', suggested.had && suggested.after.length > 0,
  suggested.after.slice(0, 4).join(' | '))

record('Deck B is flagged as off concert pitch',
  deckFacts[1].some((f) => f.includes('¢')), deckFacts[1].join(' | '))

// --- take the vocal from deck B -------------------------------------------
const deckB = page.locator('.deck').nth(1)
const deckBSelection = await deckB.locator('.deck-head .fact').first().textContent()
record('Second deck defaults to taking the vocal', deckBSelection?.includes('Vocals'), deckBSelection ?? '')

await deckB.locator('.btn', { hasText: 'Split stems' }).click()
await page.waitForFunction(
  () => !document.body.textContent.includes('Separating…'),
  null, { timeout: 180000 },
)
record('Stems separate for deck B', true)

const plan = await page.evaluate(() =>
  [...document.querySelectorAll('.deck')].map((deck) =>
    [...deck.querySelectorAll('.fact')].map((f) => f.textContent.replace(/\s+/g, ' ').trim())),
)
const bStretch = plan[1].find((f) => f.includes('speed up') || f.includes('slow down'))
const bTranspose = plan[1].find((f) => f.includes('transpose'))
record('Deck B shows the tempo move it needs', Boolean(bStretch), bStretch)
// D minor -> A minor is -5 semitones, plus +0.3 for the 30-cent flat tuning.
record('Transposition includes the tuning correction',
  Boolean(bTranspose && /-4\.[67]/.test(bTranspose)), bTranspose)

await page.screenshot({ path: 'scripts/screenshots/mashup-lab.png' })

// --- preview ---------------------------------------------------------------
await page.locator('.sheet-foot .btn', { hasText: /Preview|Preparing/ }).click()
await page.waitForFunction(
  () => Boolean([...document.querySelectorAll('.sheet-foot .btn')].find((b) => b.textContent.includes('Stop'))),
  null, { timeout: 180000 },
)
record('Preview starts', true)
await page.waitForTimeout(600)
await page.locator('.sheet-foot .btn', { hasText: 'Stop' }).click()

// --- commit ----------------------------------------------------------------
await page.locator('.sheet-foot .btn', { hasText: /Send to timeline|Rendering/ }).click()
await page.waitForFunction(
  () => window.__overtone.useStore.getState().project.audioClips.length >= 2,
  null, { timeout: 240000 },
)

const committed = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  return {
    bpm: p.bpm,
    keyRoot: p.key.root,
    tracks: p.tracks.map((t) => ({ name: t.name, kind: t.kind })),
    clips: p.audioClips.map((c) => ({
      name: c.name, originalBpm: c.originalBpm, startBeat: c.startBeat, gain: c.gain,
    })),
  }
})
record('Mashup lands on the timeline as audio tracks',
  committed.clips.length === 2 && committed.tracks.every((t) => t.kind === 'audio'),
  committed.tracks.map((t) => t.name).join(' + '))
record('Project tempo follows the mashup target', Math.abs(committed.bpm - 100) <= 1, `${committed.bpm} BPM`)
record('Both parts start on the same bar',
  committed.clips.every((c) => c.startBeat === 0), JSON.stringify(committed.clips.map((c) => c.startBeat)))
record('Clips are baked at the project tempo, needing no further warp',
  committed.clips.every((c) => Math.abs((c.originalBpm ?? 0) - committed.bpm) < 0.51),
  JSON.stringify(committed.clips.map((c) => c.originalBpm)))
// The suggestion was taken earlier in this run, so deck B brings the vocal and
// deck A keeps the groove — which is the thing that must not silently become
// "both decks play their full mix".
record('Each deck contributes only the stems it was asked for',
  committed.clips.some((c) => c.name.includes('Vocals')) &&
  committed.clips.every((c) => !c.name.includes('Full mix')),
  committed.clips.map((c) => c.name).join(' | '))

// --- does it actually sound? ----------------------------------------------
const render = await page.evaluate(async () => {
  const { renderProject, useStore } = window.__overtone
  const buffer = await renderProject(useStore.getState().project, { tailSeconds: 0.5 })
  const data = buffer.getChannelData(0)
  let peak = 0, sumSq = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]); if (v > peak) peak = v
    sumSq += data[i] * data[i]
  }
  return { peak, rms: Math.sqrt(sumSq / data.length), seconds: buffer.duration }
})
record('The mashup renders as audible audio', render.peak > 0.05 && render.rms > 0.005,
  `peak ${render.peak.toFixed(3)} rms ${render.rms.toFixed(4)} over ${render.seconds.toFixed(1)}s`)
record('The mashup does not clip', render.peak <= 1.001, `peak ${render.peak.toFixed(3)}`)

// The section was 8 bars at 100 BPM = 19.2s.
// 8 bars at 100 BPM is 19.2s; the render should follow the content, not the
// arrangement canvas.
record('Rendered length matches the chosen section',
  Math.abs(render.seconds - 0.5 - 19.2) < 1.5, `${render.seconds.toFixed(1)}s`)

await page.screenshot({ path: 'scripts/screenshots/mashup-result.png' })

// --- a DJ set: the same records, end to end ------------------------------
// Everything above stacked two records on the same bars. A set plays them one
// after another with the transition written as automation, which is the thing
// automation was built for.
await page.getByRole('button', { name: /Mashup/ }).click()
await page.waitForSelector('.sheet')

// Re-add both songs from the library. Their analyses are already stored, so
// this costs nothing.
// Read the list fresh each time: the picker hides whatever is already on a
// deck, so the options shift after every pick.
const libraryPicker = page.locator('.sheet select').last()
for (let pick = 0; pick < 2; pick++) {
  const values = []
  for (const option of await libraryPicker.locator('option').all()) {
    const value = await option.getAttribute('value')
    // The earlier mashup left its own rendered stems in the library; the two
    // original songs are the ones with a full analysis behind them.
    if (value && /song-[ab]/.test(await option.textContent() ?? '')) values.push(value)
  }
  if (values.length === 0) break
  await libraryPicker.selectOption(values[0])
  await page.waitForFunction(
    (n) => document.querySelectorAll('.deck').length === n, pick + 1, { timeout: 30000 },
  )
}
const deckCount = await page.locator('.deck').count()
record('Both records load back onto the decks', deckCount === 2, `${deckCount} decks`)

await page.getByRole('button', { name: 'Build a DJ set' }).click()
await page.waitForSelector('.sheet', { state: 'detached' })

const built = await page.evaluate(() => {
  const project = window.__overtone.useStore.getState().project
  const clips = [...project.audioClips].sort((a, b) => a.startBeat - b.startBeat)
  return {
    bpm: project.bpm,
    lengthBeats: project.lengthBeats,
    clips: clips.map((c) => ({ start: c.startBeat, name: c.name, originalBpm: c.originalBpm })),
    lanes: project.automation.map((l) => ({ param: l.param, points: l.points.length })),
  }
})

record('A set plays the records one after another, not on top of each other',
  built.clips.length === 2 && built.clips[1].start > built.clips[0].start,
  built.clips.map((c) => `${c.name}@${c.start}`).join(' → '))
record('Overlapping, so there is no gap to fall into',
  built.clips[1].start > 0 && built.clips[1].start < built.lengthBeats,
  `second enters at beat ${built.clips[1].start} of ${built.lengthBeats}`)
record('Every record is warped to one tempo',
  built.clips.every((c) => Math.abs((c.originalBpm ?? 0) - built.bpm) < 12 ||
    Math.abs((c.originalBpm ?? 0) - built.bpm * 2) < 12),
  `${built.bpm} BPM; clips read ${built.clips.map((c) => Math.round(c.originalBpm ?? 0)).join(', ')}`)
record('Each change is written as automation',
  built.lanes.length >= 2 &&
  built.lanes.some((l) => l.param === 'volume') &&
  built.lanes.some((l) => l.param === 'tone'),
  built.lanes.map((l) => `${l.param}:${l.points}`).join(' '))

// The point of all of it: does it come out as one continuous mix?
const mix = await page.evaluate(async () => {
  const { renderProject, useStore } = window.__overtone
  const buffer = await renderProject(useStore.getState().project, {
    tailSeconds: 0.5, sampleRate: 22050,
  })
  const data = buffer.getChannelData(0)
  const slices = 24
  const chunk = Math.floor(data.length / slices)
  const loud = []
  let peak = 0
  for (let s = 0; s < slices; s++) {
    let sum = 0
    for (let i = s * chunk; i < (s + 1) * chunk; i++) {
      sum += data[i] * data[i]
      peak = Math.max(peak, Math.abs(data[i]))
    }
    loud.push(Math.sqrt(sum / chunk))
  }
  return { loud, peak, seconds: buffer.duration }
})

const median = [...mix.loud].sort((a, b) => a - b)[Math.floor(mix.loud.length / 2)]
// Ignore the very ends: a set opens and closes dry by design.
const middle = mix.loud.slice(1, -1)
const quietest = Math.min(...middle)
record('It renders as one continuous mix, with no silence in the middle',
  quietest > median * 0.3,
  `quietest ${quietest.toFixed(3)} against a median of ${median.toFixed(3)} over ${mix.seconds.toFixed(0)}s`)
record('And the crossfade does not dip',
  // Equal power, not equal gain: two straight fades meeting at half level sum
  // about 3 dB down, an audible hole exactly where the mix should be seamless.
  quietest > median * 0.5, middle.map((v) => v.toFixed(2)).join(' '))
record('The set does not clip', mix.peak <= 1.001, `peak ${mix.peak.toFixed(3)}`)
await page.screenshot({ path: 'scripts/screenshots/dj-set.png' })

record('No uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
