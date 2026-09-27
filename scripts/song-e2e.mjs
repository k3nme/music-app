/**
 * End-to-end test of writing a song from a prompt.
 *
 * The unit tests already check the notes are in key, in range and in the kit.
 * What they cannot check is the thing that matters: that the result is music
 * you can hear — that it renders, that it is not silent, that it does not
 * clip, and that it actually *changes* over its length rather than being one
 * loop repeated until the end.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForSelector('.door')

const door = page.locator('.door', { hasText: 'Write me a song' })
record('There is a door for it on the first run', await door.count() === 1)
await door.click()
await page.waitForSelector('.sheet')
await page.waitForFunction(() => Boolean(window.__overtone))
record('The door opens the songwriter',
  (await page.locator('.sheet-title').first().textContent())?.includes('Write me a song'))

// --- write one ------------------------------------------------------------
const PROMPT = 'a dark amapiano track at 112 with a sad piano'
await page.locator('.song-prompt').fill(PROMPT)
await page.locator('.song-ask .btn.primary').click()
await page.waitForSelector('.song-take', { timeout: 30000 })

const takes = await page.locator('.song-take').count()
record('It offers more than one version', takes === 3, `${takes} versions`)

const reasons = await page.locator('.song-reasons .chip').allTextContents()
record('It shows what it understood from the words', reasons.length >= 3, reasons.join(' · '))
record('It understood the genre, the tempo and the mood',
  reasons.some((r) => /amapiano/i.test(r)) &&
  reasons.some((r) => /112/.test(r)) &&
  reasons.some((r) => /sad|dark/i.test(r)),
  reasons.join(' · '))

const details = await page.locator('.song-take .sound-note').allTextContents()
record('Each version says what it is', details.every((d) => /BPM/.test(d)), details[0] ?? '')
record('The versions are genuinely different, not three names for one song',
  new Set(details).size === details.length,
  details.map((d) => d.split(' · ').slice(2, 5).join(' ')).join('  |  '))

await page.screenshot({ path: 'scripts/screenshots/song-maker.png' })

// What was on the timeline before any of this — captured before previewing,
// which temporarily swaps the song in.
const before = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  return { name: p.name, tracks: p.tracks.length }
})

// --- does it make a sound? -------------------------------------------------
await page.locator('.song-take').first().locator('.btn', { hasText: 'Hear it' }).click()
await page.waitForTimeout(1200)
const heard = await page.evaluate(() => ({
  state: window.__overtone.engine.ctx?.state,
  level: window.__overtone.engine.level(),
  playing: window.__overtone.useStore.getState().playing,
}))
record('Previewing plays it', heard.state === 'running' && heard.playing === true)
record('And it is audible', heard.level > 0.001, `level ${heard.level.toFixed(4)}`)

// --- keep it ---------------------------------------------------------------
await page.locator('.song-take').first().locator('.btn.primary').click()
await page.waitForSelector('.sheet', { state: 'detached' })

const kept = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  return {
    name: p.name,
    bpm: p.bpm,
    key: p.key,
    tracks: p.tracks.map((t) => ({ name: t.name, preset: t.presetId, pump: t.channel.pump })),
    clips: p.clips.length,
    lengthBeats: p.lengthBeats,
    notes: p.clips.reduce((sum, c) => sum + c.notes.length, 0),
  }
})
record('Keeping it puts a whole arrangement on the timeline',
  kept.tracks.length >= 4 && kept.notes > 100,
  `${kept.tracks.length} tracks, ${kept.clips} clips, ${kept.notes} notes, ${kept.lengthBeats / 4} bars`)
record('It used the tempo that was asked for', kept.bpm === 112, `${kept.bpm} BPM`)
record('It wrote the parts a song needs',
  ['Drums', 'Bass', 'Chords', 'Melody'].every((name) => kept.tracks.some((t) => t.name === name)),
  kept.tracks.map((t) => t.name).join(', '))
record('It set up a sidechain duck, as amapiano wants',
  kept.tracks.some((t) => (t.pump ?? 0) > 0),
  kept.tracks.filter((t) => t.pump > 0).map((t) => `${t.name}:${t.pump.toFixed(2)}`).join(' '))

// --- render it -------------------------------------------------------------
const rendered = await page.evaluate(async () => {
  const { renderProject, useStore } = window.__overtone
  const project = useStore.getState().project
  const buffer = await renderProject(project, { tailSeconds: 1, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  let peak = 0, sumSq = 0
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]))
    sumSq += data[i] * data[i]
  }
  // Loudness per eighth of the song: a song should not be one flat loop.
  const chunk = Math.floor(data.length / 8)
  const sections = []
  for (let s = 0; s < 8; s++) {
    let sum = 0
    for (let i = s * chunk; i < (s + 1) * chunk; i++) sum += data[i] * data[i]
    sections.push(Math.sqrt(sum / chunk))
  }
  return { peak, rms: Math.sqrt(sumSq / data.length), seconds: buffer.duration, sections }
})
record('The song renders as audible audio',
  rendered.peak > 0.1 && rendered.rms > 0.01,
  `peak ${rendered.peak.toFixed(3)} rms ${rendered.rms.toFixed(4)} over ${rendered.seconds.toFixed(1)}s`)
record('It does not clip', rendered.peak <= 1.001, `peak ${rendered.peak.toFixed(3)}`)

// The song above used whatever seed the UI happened to pick, so the headroom
// check is repeated over a fixed set — levels adding up is the failure this
// codebase keeps rediscovering, and it must not depend on a lucky seed.
const headroom = await page.evaluate(async () => {
  const { readPrompt, composeSong, renderProject, planSections } = window.__overtone
  const out = []
  for (const prompt of ['epic festival house', 'hard techno at 140', 'a dark amapiano track',
    'drum and bass', 'indie rock', 'chilled lo-fi hip hop']) {
    for (const seed of [1, 2]) {
      const brief = readPrompt(prompt, { seed })
      const song = composeSong(brief, { seed })
      // Around the first drop: the riser, the impact and every part at once.
      const drop = planSections(brief).find((s) => s.kind === 'drop' && s.startBar > 0)
      const from = drop ? Math.max(0, drop.startBar - 3) : 0
      const to = drop ? drop.startBar + 4 : Math.min(8, song.lengthBeats / 4)
      const buffer = await renderProject(song, {
        tailSeconds: 0.3, sampleRate: 22050,
        range: { startBeat: from * 4, endBeat: to * 4 },
      })
      const data = buffer.getChannelData(0)
      let peak = 0
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
      out.push({ prompt: prompt.slice(0, 18), seed, peak: +peak.toFixed(3) })
    }
  }
  return out
})
// And one whole song end to end. The sends accumulate over a full render, so
// a mix that measures fine over eight bars can still be over by the last
// chorus — that is exactly how this was found.
const wholeSong = await page.evaluate(async () => {
  const { readPrompt, composeSong, renderProject } = window.__overtone
  const song = composeSong(readPrompt('epic festival house', { seed: 3 }), { seed: 3 })
  const buffer = await renderProject(song, { tailSeconds: 1, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  return { peak: +peak.toFixed(3), seconds: +buffer.duration.toFixed(1) }
})
record('A whole song, start to finish, stays under unity',
  wholeSong.peak <= 1.001, `peak ${wholeSong.peak} over ${wholeSong.seconds}s`)

const hottest = headroom.reduce((worst, row) => (row.peak > worst.peak ? row : worst), headroom[0])
record('No style clips at its loudest moment', hottest.peak <= 1.001,
  `hottest: ${hottest.prompt} seed ${hottest.seed} at ${hottest.peak}`)
record('And none of them is so quiet it sounds broken',
  headroom.every((row) => row.peak > 0.05),
  `quietest ${Math.min(...headroom.map((r) => r.peak))}`)

const loudest = Math.max(...rendered.sections)
const quietest = Math.min(...rendered.sections.filter((v) => v > 0))
record('It rises and falls rather than being one loop repeated',
  loudest / quietest > 1.25,
  rendered.sections.map((v) => v.toFixed(3)).join(' '))

// --- undo ------------------------------------------------------------------
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
const afterUndo = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  return { name: p.name, tracks: p.tracks.length }
})
record('One undo puts back what you had',
  afterUndo.tracks === before.tracks && afterUndo.name === before.name,
  `${afterUndo.tracks} tracks (was ${before.tracks})`)

// --- a different prompt gives a different song -----------------------------
const compared = await page.evaluate(async () => {
  const { readPrompt, composeSong } = window.__overtone
  const write = (prompt, seed) => composeSong(readPrompt(prompt, { seed }), { seed })
  const techno = write('hard techno at 140', 1)
  const lofi = write('chilled lo-fi hip hop', 1)
  return {
    technoBpm: techno.bpm,
    lofiBpm: lofi.bpm,
    technoKit: techno.tracks.find((t) => t.isDrum)?.presetId,
    lofiKit: lofi.tracks.find((t) => t.isDrum)?.presetId,
  }
})
record('Different words give a genuinely different song',
  compared.technoBpm === 140 && compared.lofiBpm < 100 && compared.technoKit !== compared.lofiKit,
  `${compared.technoKit} @${compared.technoBpm} vs ${compared.lofiKit} @${compared.lofiBpm}`)

record('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
