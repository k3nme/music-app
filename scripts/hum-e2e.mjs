/**
 * End-to-end test of the hero flow, with a synthetic voice.
 *
 * Chromium's fake audio capture device plays a WAV file into getUserMedia, so
 * this exercises the real path: worklet capture -> analysis worker -> quantise
 * -> preview -> commit into the project. Nothing is stubbed.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const SR = 44100
const MELODY = [69, 72, 76, 74] // A4 C5 E5 D5 — an A-minor-ish phrase

function renderVoice() {
  const noteSec = 0.42
  const gapSec = 0.13
  const total = Math.ceil((noteSec + gapSec) * MELODY.length * SR)
  const samples = new Float32Array(total)
  let offset = 0
  for (const midi of MELODY) {
    const hz = 440 * Math.pow(2, (midi - 69) / 12)
    const n = Math.floor(noteSec * SR)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      const env = Math.min(1, t / 0.03) * Math.min(1, (noteSec - t) / 0.05)
      // A few harmonics plus gentle vibrato — closer to a hum than a sine.
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)
      samples[offset + i] = env * 0.5 * (
        Math.sin(2 * Math.PI * hz * vib * t) +
        0.45 * Math.sin(4 * Math.PI * hz * vib * t) +
        0.2 * Math.sin(6 * Math.PI * hz * vib * t)
      ) / 1.65
    }
    offset += n + Math.floor(gapSec * SR)
  }

  const bytes = new ArrayBuffer(44 + total * 2)
  const view = new DataView(bytes)
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, 36 + total * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, SR, true); view.setUint32(28, SR * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, total * 2, true)
  for (let i = 0; i < total; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return Buffer.from(bytes)
}

const wavPath = '/tmp/overtone-voice.wav'
writeFileSync(wavPath, renderVoice())

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}%noloop`,
  ],
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'or open the empty studio' }).click()
await page.waitForSelector('.app')

const before = await page.evaluate(() => window.__overtone.useStore.getState().project.tracks.length)

await page.locator('.hum-btn').click()
await page.waitForSelector('.hum-orb')
// No count-in: the fake device starts playing the file the moment it opens.
await page.locator('input[type=checkbox]').first().uncheck()
await page.locator('.hum-orb').click()
await page.waitForTimeout(2600)
await page.locator('.hum-orb').click()

await page.waitForSelector('.result-preview', { timeout: 20000 })
record('Recording analysed into a result', true)

const detected = await page.locator('.pv-note').count()
record('Preview shows the hummed notes', detected >= MELODY.length, `${detected} notes drawn`)

const summary = await page.locator('.hum .spacer').first().locator('xpath=preceding-sibling::span[1]').textContent()
record('Result summarises the take', Boolean(summary && summary.includes('notes')), summary?.trim())

await page.screenshot({ path: 'scripts/screenshots/overtone-hum-result.png' })

// Swap the instrument — the whole point of the flow.
await page.locator('.btn', { hasText: 'Sitar' }).click()
await page.waitForTimeout(150)
record('Instrument can be swapped on the result', true)

await page.locator('.btn', { hasText: 'Hear it' }).click()
await page.waitForTimeout(400)
record('Preview plays without error', errors.length === 0, errors[0] ?? '')

await page.locator('.sheet-foot .btn', { hasText: 'Add to project' }).click()
await page.waitForTimeout(400)

const after = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  const clip = p.clips[p.clips.length - 1]
  return {
    tracks: p.tracks.length,
    preset: p.tracks[p.tracks.length - 1]?.presetId,
    notes: clip?.notes.map((n) => n.midi) ?? [],
    contentBeats: clip?.contentBeats,
    key: `${p.key.root}/${p.key.scale}`,
  }
})
record('Hummed take becomes a real track', after.tracks === before + 1, `${before} -> ${after.tracks} tracks`)
record('Committed on the chosen instrument', after.preset === 'sitar', String(after.preset))

// The melody is transposed into the sitar's range, so compare intervals.
const intervals = (arr) => arr.slice(1).map((v, i) => v - arr[i])
const expected = JSON.stringify(intervals(MELODY))
const got = JSON.stringify(intervals(after.notes))
record('Notes match what was sung', got === expected, `${got} vs ${expected} (midi ${JSON.stringify(after.notes)})`)
record('Project key follows the hummed take', after.key !== '0/minor', after.key)
record('Clip is a whole number of bars', after.contentBeats % 4 === 0, `${after.contentBeats} beats`)

await page.screenshot({ path: 'scripts/screenshots/overtone-after-hum.png' })
record('No uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
