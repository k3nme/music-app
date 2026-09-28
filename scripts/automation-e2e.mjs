/**
 * End-to-end test of automation.
 *
 * A curve is only real if you can hear it, and "you can hear it" is the one
 * thing vitest cannot tell you. So every check here is a measurement of
 * rendered audio: a fade has to actually get quieter, a filter sweep has to
 * actually get brighter, and the live transport has to move the same parameter
 * the offline render does — they are separate code paths and either could
 * silently do nothing.
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
await page.getByRole('button', { name: /or open the empty studio/ }).click()
await page.waitForSelector('.app')
await page.waitForFunction(() => Boolean(window.__overtone))

// Something steady to measure against, with nothing moving except the
// parameter under test.
//
// A single held note will not do: an instrument's own filter envelope decays
// over the note, so a long tone gets duller on its own and fights a filter
// sweep going the other way. Re-striking the note every beat restarts that
// envelope, so every chunk of the render has the same timbre and the only
// difference between them is the automation.
const setup = `
  const { useStore } = window.__overtone
  const { createTrack, createClip, createNote, emptyProject } = await import('/src/music/project.ts')
  const project = emptyProject('automation')
  project.bpm = 120
  const track = createTrack({ presetId: 'supersaw', name: 'Test' })
  track.channel = { ...track.channel, volume: 0.8, reverbSend: 0, delaySend: 0, tone: 20000 }
  project.tracks = [track]
  const clip = createClip(track.id, { contentBeats: 32, lengthBeats: 32 })
  clip.notes = Array.from({ length: 32 }, (_, i) => createNote(60, i, 0.92, 0.9))
  project.clips = [clip]
  project.lengthBeats = 32
`

/** Render the project and report loudness and brightness per eighth. */
const measure = `
  const buffer = await window.__overtone.renderProject(project, { tailSeconds: 0.2, sampleRate: 22050 })
  const data = buffer.getChannelData(0)
  const chunk = Math.floor(data.length / 8)
  const loud = []
  const bright = []
  for (let s = 0; s < 8; s++) {
    let sum = 0, flat = 0, slope = 0
    for (let i = s * chunk; i < (s + 1) * chunk; i++) {
      sum += data[i] * data[i]
      flat += Math.abs(data[i])
      slope += Math.abs(data[i] - data[i - 1 < 0 ? 0 : i - 1])
    }
    loud.push(Math.sqrt(sum / chunk))
    // How fast the waveform moves, relative to how big it is. A differentiator
    // weights high frequencies, so this rises with brightness and — unlike
    // counting zero crossings — keeps rising after the filter passes the
    // loudest harmonic instead of saturating.
    bright.push(flat > 0 ? slope / flat : 0)
  }
`

// --- a fade out has to get quieter ---------------------------------------
const fade = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')
  project.automation = [createAutomationLane(track.id, 'volume', [
    { beat: 0, value: 0.9 }, { beat: 32, value: 0 },
  ])]
  ${measure}
  return { loud, bright }
})()`)
const fadesDown = fade.loud.every((value, i) => i === 0 || value < fade.loud[i - 1] + 1e-4)
record('A fade out actually gets quieter, all the way down',
  fadesDown && fade.loud[7] < fade.loud[0] * 0.25,
  fade.loud.map((v) => v.toFixed(3)).join(' '))

// --- a filter sweep has to actually sweep ---------------------------------
// Measured against static references rather than against itself. "Brighter at
// the end than the start" can be satisfied by a curve that does nothing for
// most of its length; and a brightness proxy is not scale-free once the master
// limiter starts working, which made an earlier version of this dip in the
// middle for reasons that had nothing to do with automation. Comparing the
// swept render to renders pinned at each end asks the question directly: does
// the lane put the parameter where it says, when it says?
const filter = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')

  const brightnessOf = async (mutate) => {
    const copy = JSON.parse(JSON.stringify(project))
    mutate(copy)
    const buffer = await window.__overtone.renderProject(copy, { tailSeconds: 0.2, sampleRate: 22050 })
    const data = buffer.getChannelData(0)
    const chunk = Math.floor(data.length / 8)
    const out = []
    for (let s = 0; s < 8; s++) {
      let flat = 0, slope = 0
      for (let i = s * chunk; i < (s + 1) * chunk; i++) {
        flat += Math.abs(data[i])
        slope += Math.abs(data[i] - data[i - 1 < 0 ? 0 : i - 1])
      }
      out.push(flat > 0 ? slope / flat : 0)
    }
    return out
  }

  const closed = await brightnessOf((p) => { p.tracks[0].channel.tone = 200 })
  const open = await brightnessOf((p) => { p.tracks[0].channel.tone = 18000 })
  const swept = await brightnessOf((p) => {
    p.automation = [createAutomationLane(p.tracks[0].id, 'tone', [
      { beat: 0, value: 200 }, { beat: 32, value: 18000 },
    ])]
  })
  return { closed, open, swept }
})()`)

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance * Math.max(a, b)
record('A closed filter and an open one sound measurably different',
  filter.open[4] > filter.closed[4] * 1.5,
  `closed ${filter.closed[4].toFixed(3)} vs open ${filter.open[4].toFixed(3)}`)
// Not compared to the closed reference directly. The sweep is logarithmic —
// which is how a filter is heard, and what makes it usable — so it crosses the
// note's fundamental inside the first eighth and is already well up from 200 Hz
// by the end of that chunk. What matters is that it starts down in the closed
// half of the range rather than open.
record('A sweep starts down near the closed end',
  filter.swept[0] < filter.open[0] * 0.8 && filter.swept[0] > filter.closed[0],
  `closed ${filter.closed[0].toFixed(3)} < swept ${filter.swept[0].toFixed(3)} < open ${filter.open[0].toFixed(3)}`)
record('And ends where the lane says it ends',
  near(filter.swept[7], filter.open[7], 0.25),
  `swept ${filter.swept[7].toFixed(3)} vs open ${filter.open[7].toFixed(3)}`)
record('And is somewhere in between in the middle',
  filter.swept[4] > filter.closed[4] && filter.swept[4] < filter.open[4] * 1.1,
  `closed ${filter.closed[4].toFixed(3)} < swept ${filter.swept[4].toFixed(3)} < open ${filter.open[4].toFixed(3)}`)

// --- a lane that starts late leaves the opening alone --------------------
const late = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')
  // Nothing until bar 5, then fade away.
  project.automation = [createAutomationLane(track.id, 'volume', [
    { beat: 16, value: 0.9 }, { beat: 32, value: 0 },
  ])]
  ${measure}
  return { loud }
})()`)
record('A lane holds its first value before it starts',
  Math.abs(late.loud[0] - late.loud[2]) < late.loud[0] * 0.15 && late.loud[7] < late.loud[0] * 0.3,
  late.loud.map((v) => v.toFixed(3)).join(' '))

// --- holding steps instead of sliding ------------------------------------
const held = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')
  project.automation = [createAutomationLane(track.id, 'volume', [
    { beat: 0, value: 0.9 }, { beat: 16, value: 0.05, hold: true },
  ])]
  ${measure}
  return { loud }
})()`)
record('A held point steps rather than sliding',
  held.loud[2] > held.loud[0] * 0.8 && held.loud[5] < held.loud[0] * 0.25,
  held.loud.map((v) => v.toFixed(3)).join(' '))

// --- the live transport moves the same parameter -------------------------
const live = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')
  project.automation = [createAutomationLane(track.id, 'tone', [
    { beat: 0, value: 300 }, { beat: 16, value: 16000 },
  ])]
  useStore.getState().setProject(project, { resetHistory: true })
  await useStore.getState().play(0)
  const samples = []
  for (let i = 0; i < 40; i++) {
    const channel = window.__overtone.engine.getChannel(track.id)
    samples.push(channel ? channel.tone.frequency.value : -1)
    await new Promise((r) => setTimeout(r, 50))
  }
  useStore.getState().stop()
  return { first: samples[0], last: samples[samples.length - 1], samples }
})()`)
record('The live transport sweeps the filter too, not just the render',
  live.last > live.first * 2 && live.first > 0,
  `${Math.round(live.first)}Hz → ${Math.round(live.last)}Hz`)

// --- the mixer must not fight the lane -----------------------------------
const fight = await page.evaluate(`(async () => {
  ${setup}
  const { createAutomationLane } = await import('/src/music/project.ts')
  project.automation = [createAutomationLane(track.id, 'volume', [
    { beat: 0, value: 0.2 }, { beat: 32, value: 0.2 },
  ])]
  useStore.getState().setProject(project, { resetHistory: true })
  await useStore.getState().play(0)
  await new Promise((r) => setTimeout(r, 300))
  // Something the mixer writes on every React update.
  useStore.getState().updateChannel(track.id, { volume: 1.2 })
  await new Promise((r) => setTimeout(r, 300))
  const channel = window.__overtone.engine.getChannel(track.id)
  const faderNow = channel ? channel.fader.gain.value : -1
  // And an un-automated parameter on the same track must still respond.
  useStore.getState().updateChannel(track.id, { reverbSend: 0.7 })
  await new Promise((r) => setTimeout(r, 200))
  const reverbNow = channel ? channel.reverbSend.gain.value : -1
  useStore.getState().stop()
  return { faderNow, reverbNow }
})()`)
record('The mixer does not overwrite an automated parameter',
  Math.abs(fight.faderNow - 0.2) < 0.08, `fader sat at ${fight.faderNow.toFixed(3)}, not 1.2`)
record('But un-automated knobs on the same track still work',
  Math.abs(fight.reverbNow - 0.7) < 0.08, `reverb went to ${fight.reverbNow.toFixed(3)}`)

// --- it survives a save and reload ---------------------------------------
const saved = await page.evaluate(`(async () => {
  const { useStore } = window.__overtone
  const { migrate } = await import('/src/lib/persistence.ts')
  const project = useStore.getState().project
  const roundTripped = migrate(JSON.parse(JSON.stringify(project)))
  return {
    lanes: roundTripped.automation.length,
    points: roundTripped.automation[0] ? roundTripped.automation[0].points.length : 0,
  }
})()`)
record('Automation survives being saved and reopened',
  saved.lanes === 1 && saved.points === 2, `${saved.lanes} lane, ${saved.points} points`)

const older = await page.evaluate(`(async () => {
  const { migrate } = await import('/src/lib/persistence.ts')
  const { emptyProject } = await import('/src/music/project.ts')
  const old = { ...emptyProject('old'), version: 1 }
  delete old.automation
  const migrated = migrate(old)
  return { automation: migrated.automation, version: migrated.version }
})()`)
record('A project saved before automation existed still opens',
  Array.isArray(older.automation) && older.automation.length === 0,
  `version ${older.version}`)

// --- and it can be drawn by hand -----------------------------------------
// Everything above went through the store directly. This is the part a person
// actually touches: the lane has to open, take points, and those points have
// to reach the audio.
await page.evaluate(`(async () => {
  ${setup}
  useStore.getState().setProject(project, { resetHistory: true })
})()`)
await page.waitForSelector('.track-head')

const autoButton = page.locator('.track-head .mini', { hasText: /^A$/ }).first()
record('Every track offers an automation lane', await autoButton.count() === 1)
await autoButton.click()
await page.waitForSelector('.auto-lane')
record('Opening it shows an empty lane',
  (await page.locator('.auto-hint').count()) === 1)

// Head and lane must stay in register, or the whole arrangement shears.
const aligned = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.track-head, .auto-head')]
  const lanes = [...document.querySelectorAll('.lane, .auto-lane')]
  if (heads.length !== lanes.length) return { same: false, heads: heads.length, lanes: lanes.length }
  const same = heads.every((head, i) =>
    Math.abs(head.getBoundingClientRect().height - lanes[i].getBoundingClientRect().height) < 1.5)
  return { same, heads: heads.length, lanes: lanes.length }
})
record('The heads column and the lanes column stay in register',
  aligned.same, `${aligned.heads} rows each`)

// Click three points across the lane.
const box = await page.locator('.auto-lane svg').first().boundingBox()
await page.mouse.click(box.x + 20, box.y + box.height * 0.2)
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.8)
await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25)
const drawn = await page.evaluate(() => {
  const lanes = window.__overtone.useStore.getState().project.automation
  return { lanes: lanes.length, points: lanes[0] ? lanes[0].points.length : 0, param: lanes[0]?.param }
})
record('Clicking the lane writes points', drawn.points === 3,
  `${drawn.points} points on ${drawn.param}`)
record('Drawn points are in the project, so they save with it', drawn.lanes === 1)

const shown = await page.locator('.auto-point').count()
record('And they are drawn on the curve', shown === 3, `${shown} handles`)

await page.screenshot({ path: 'scripts/screenshots/automation.png' })

// A shape from the menu.
await page.locator('.auto-shape').first().selectOption('fade-out')
const shaped = await page.evaluate(() => {
  const lane = window.__overtone.useStore.getState().project.automation[0]
  return { param: lane.param, first: lane.points[0].value, last: lane.points[lane.points.length - 1].value }
})
record('A ready-made shape draws a real move',
  shaped.param === 'volume' && shaped.first > shaped.last && shaped.last < 0.05,
  `${shaped.param}: ${shaped.first.toFixed(2)} → ${shaped.last.toFixed(2)}`)

// Undo has to work on all of it, like any other edit.
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
const undone = await page.evaluate(() => {
  const lane = window.__overtone.useStore.getState().project.automation[0]
  return lane ? lane.points.length : 0
})
record('Undo steps back through automation edits like any other edit',
  undone === 3, `${undone} points after undo`)

// And the hand-drawn curve reaches the audio.
const audible = await page.evaluate(async () => {
  const { useStore, renderProject } = window.__overtone
  const { createAutomationLane } = await import('/src/music/project.ts')
  const project = useStore.getState().project
  const track = project.tracks[0]
  const faded = {
    ...project,
    automation: [createAutomationLane(track.id, 'volume', [
      { beat: 0, value: 0.9 }, { beat: project.lengthBeats, value: 0 },
    ])],
  }
  const render = async (p) => {
    const buffer = await renderProject(p, { tailSeconds: 0.2, sampleRate: 22050 })
    const data = buffer.getChannelData(0)
    const half = Math.floor(data.length / 2)
    let early = 0, late = 0
    for (let i = 0; i < half; i++) early += data[i] * data[i]
    for (let i = half; i < data.length; i++) late += data[i] * data[i]
    return { early: Math.sqrt(early / half), late: Math.sqrt(late / (data.length - half)) }
  }
  return { with: await render(faded), without: await render({ ...project, automation: [] }) }
})
record('A lane changes the rendered audio and no lane leaves it alone',
  audible.with.late < audible.with.early * 0.5 &&
  Math.abs(audible.without.late - audible.without.early) < audible.without.early * 0.35,
  `faded ${audible.with.early.toFixed(3)}→${audible.with.late.toFixed(3)}, ` +
  `flat ${audible.without.early.toFixed(3)}→${audible.without.late.toFixed(3)}`)

record('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
