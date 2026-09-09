/**
 * End-to-end test of chord capture — the feature that lifts the old
 * "pitch tracking is monophonic" limitation.
 *
 * Feeds a strummed chord progression through Chromium's fake microphone and
 * checks that Overtone hears the progression, not a single melody line.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const SR = 44100
const PROGRESSION = [
  { name: 'Am', notes: [57, 60, 64, 69] },
  { name: 'F', notes: [53, 57, 60, 65] },
  { name: 'C', notes: [48, 52, 55, 60] },
  { name: 'G', notes: [55, 59, 62, 67] },
]

/** Strummed chords: each note enters slightly after the last, like a pick. */
function renderChords(secondsEach = 1.6, repeats = 2) {
  const total = Math.floor(PROGRESSION.length * repeats * secondsEach * SR)
  const out = new Float32Array(total)
  let index = 0
  for (let pass = 0; pass < repeats; pass++) {
    for (const chord of PROGRESSION) {
      const start = Math.floor(index * secondsEach * SR)
      chord.notes.forEach((midi, voice) => {
        const hz = 440 * Math.pow(2, (midi - 69) / 12)
        const offset = Math.floor(voice * 0.018 * SR)
        const n = Math.floor((secondsEach - 0.08) * SR)
        for (let i = 0; i < n; i++) {
          const at = start + offset + i
          if (at >= total) break
          const t = i / SR
          const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.1)
          out[at] += env * 0.16 * (
            Math.sin(2 * Math.PI * hz * t) +
            0.45 * Math.sin(4 * Math.PI * hz * t) +
            0.2 * Math.sin(6 * Math.PI * hz * t)
          )
        }
      })
      index++
    }
  }

  const bytes = Buffer.alloc(44 + total * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + total * 2, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(total * 2, 40)
  for (let i = 0; i < total; i++) {
    const s = Math.max(-1, Math.min(1, out[i]))
    bytes.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }
  return bytes
}

const wavPath = '/tmp/overtone-chords.wav'
writeFileSync(wavPath, renderChords())

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}%noloop`,
  ],
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage({ viewport: { width: 1440, height: 940 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(process.env.APP_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Start empty' }).click()
await page.waitForSelector('.app')

await page.locator('.hum-btn').click()
await page.waitForSelector('.hum-orb')
await page.locator('.btn', { hasText: 'Playing chords' }).click()
record('Chord mode is offered alongside melody and beatbox', true)

await page.locator('input[type=checkbox]').first().uncheck()
await page.locator('.hum-orb').click()
await page.waitForTimeout(7000)
await page.locator('.hum-orb').click()

await page.waitForSelector('.result-preview', { timeout: 60000 })
record('A strummed take is analysed', true)

const heard = await page.evaluate(() => {
  const text = document.querySelector('.hum')?.textContent ?? ''
  const match = text.match(/(\d+)\s+chords/)
  return { count: match ? Number(match[1]) : 0, text: text.slice(0, 200) }
})
record('It reports chords rather than single notes', heard.count >= 3, `${heard.count} chords`)

const preview = await page.locator('.pv-note').count()
record('The chord voicings are laid out for preview', preview >= 9, `${preview} notes drawn`)

await page.screenshot({ path: 'scripts/screenshots/chords.png' })

await page.locator('.sheet-foot .btn', { hasText: 'Add to project' }).click()
await page.waitForTimeout(400)

const committed = await page.evaluate(() => {
  const p = window.__overtone.useStore.getState().project
  const clip = p.clips[p.clips.length - 1]
  // Group notes by start time: a chord is several notes sharing an onset.
  const byStart = new Map()
  for (const note of clip?.notes ?? []) {
    const key = note.start.toFixed(3)
    byStart.set(key, [...(byStart.get(key) ?? []), note.midi])
  }
  const groups = [...byStart.values()]
  return {
    clipName: clip?.name,
    groups: groups.length,
    sizes: groups.map((g) => g.length),
    // Pitch-class set of each detected chord, in order.
    chords: groups.map((g) => [...new Set(g.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b)),
  }
})
record('The take becomes a chord clip', committed.clipName === 'Chords', String(committed.clipName))
record('Every chord has three notes, not one',
  committed.groups >= 3 && committed.sizes.every((size) => size >= 3),
  `${committed.groups} chords, sizes ${JSON.stringify(committed.sizes.slice(0, 6))}`)
// Am(A C E), F(F A C), C(C E G), G(G B D). Chord tracking is approximate at
// boundaries and neighbouring chords share notes, so require most of the
// progression rather than a perfect transcription.
const played = [[0, 4, 9], [0, 5, 9], [0, 4, 7], [2, 7, 11]]
const detected = committed.chords.map((c) => JSON.stringify(c))
const hits = played.filter((chord) => detected.includes(JSON.stringify(chord))).length
record('It recovers the progression that was played', hits >= 3,
  `${hits}/4 chords found in ${JSON.stringify(committed.chords)}`)
record('It opens on the chord that was strummed first',
  JSON.stringify(committed.chords[0]) === JSON.stringify([0, 4, 9]),
  `${JSON.stringify(committed.chords[0])}`)

record('No uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
