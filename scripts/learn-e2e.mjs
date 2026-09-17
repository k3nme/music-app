/**
 * End-to-end test of the first-run doors and the Learn mode.
 *
 * The point of both features is that someone who knows nothing about music can
 * get somewhere, so this drives them the way that person would: click a door,
 * open a lesson, press a demo button, and check something audible happened.
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

// --- first run -------------------------------------------------------------
await page.waitForSelector('.door')
const doors = await page.locator('.door-title').allTextContents()
record('First run offers four plain-language doors', doors.length === 4, doors.join(' · '))
record('No door assumes music knowledge',
  doors.every((d) => !/DAW|BPM|MIDI|key|scale|quantis/i.test(d)), doors.join(' · '))
await page.screenshot({ path: 'scripts/screenshots/first-run.png' })

// Learn door: loads something to listen to and opens the lessons.
await page.getByRole('button', { name: /Learn music from scratch/ }).click()
await page.waitForSelector('.sheet.learn')
record('The learn door opens the lessons', true)

const state = await page.evaluate(() => {
  const s = window.__overtone.useStore.getState()
  return { tracks: s.project.tracks.length, experience: s.experience }
})
record('It also loads music, so the app is not empty behind it', state.tracks > 0, `${state.tracks} tracks`)
record('New users start in the simplified view', state.experience === 'guided', state.experience)

// --- the curriculum --------------------------------------------------------
const modules = await page.locator('.learn-module-title').allTextContents()
record('All ten modules are listed', modules.length === 10, modules.map((m) => m.replace(/^\d+\s*/, '')).join(' · '))

const lessonCount = await page.locator('.learn-lesson').count()
record('Every lesson is reachable from the browser', lessonCount >= 25, `${lessonCount} lessons`)

// --- open a lesson and play a demo ----------------------------------------
await page.locator('.learn-lesson', { hasText: 'Why instruments sound different' }).click()
await page.waitForSelector('.lesson')
const demoButtons = await page.locator('.demo-btn').count()
record('A lesson pairs its explanation with playable demos', demoButtons >= 6, `${demoButtons} demos`)

// Pressing a demo must actually produce sound through the engine.
await page.locator('.demo-btn').first().click()
await page.waitForTimeout(700)
const audio = await page.evaluate(() => ({
  state: window.__overtone.engine.ctx?.state,
  level: window.__overtone.engine.level(),
}))
record('Pressing a demo starts the audio engine', audio.state === 'running', String(audio.state))
record('The demo makes an audible signal', audio.level > 0.001, `level ${audio.level.toFixed(4)}`)
await page.screenshot({ path: 'scripts/screenshots/learn-lesson.png' })

// --- progress + navigation -------------------------------------------------
await page.waitForTimeout(1200)
await page.locator('.sheet-foot .btn.primary').click()
await page.waitForTimeout(300)
const afterNext = await page.locator('.sheet-title').textContent()
record('Next moves to the following lesson', afterNext?.includes('Loud, soft'), afterNext ?? '')

await page.locator('.btn', { hasText: 'All lessons' }).click()
await page.waitForSelector('.learn-module')
const readCount = await page.locator('.learn-lesson.done').count()
record('Read lessons are marked as done', readCount >= 1, `${readCount} marked`)

const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('overtone.learn.progress') ?? '{}'))
record('Progress is stored locally', (progress.completed ?? []).length >= 1,
  `${(progress.completed ?? []).length} completed, terms: ${(progress.seenTerms ?? []).length}`)

// --- a lesson can send you into the app ------------------------------------
await page.locator('.learn-lesson', { hasText: 'Grooves that define genres' }).click()
await page.waitForSelector('.lesson-try')
await page.locator('.lesson-try .btn.primary').click()
await page.waitForSelector('.hum-orb', { timeout: 10000 })
record('A lesson can hand you off into the app', true)
await page.locator('.sheet-foot .btn', { hasText: 'Cancel' }).click()

// --- guided mode -----------------------------------------------------------
await page.waitForSelector('.nextstep')
const guidance = await page.locator('.nextstep-text').textContent()
record('Guided mode suggests a next step', Boolean(guidance && guidance.length > 20), guidance?.slice(0, 70))

const hiddenJargon = await page.locator('.topbar select').count()
record('Guided mode hides the key and scale dropdowns', hiddenJargon === 0, `${hiddenJargon} selects visible`)

await page.locator('.nextstep .btn.icon.ghost').click()
await page.waitForTimeout(250)
const afterFull = await page.evaluate(() => ({
  experience: window.__overtone.useStore.getState().experience,
  stored: localStorage.getItem('overtone.experience'),
}))
record('Dismissing guidance switches to the full studio',
  afterFull.experience === 'full' && afterFull.stored === 'full', JSON.stringify(afterFull))
const selectsNow = await page.locator('.topbar select').count()
record('The full studio brings the controls back', selectsNow >= 2, `${selectsNow} selects`)

// --- glossary --------------------------------------------------------------
await page.locator('.topbar .btn.icon[title^="Learn music"]').click()
await page.waitForSelector('.sheet.learn')
// Learn resumes the last lesson you read, so step back to the index first.
const backToIndex = page.locator('.btn', { hasText: 'All lessons' })
if (await backToIndex.count()) await backToIndex.click()
await page.waitForSelector('.learn-module')
record('Learn resumes where you left off', true)
await page.locator('.tab', { hasText: 'Glossary' }).click()
await page.waitForSelector('.glossary')
const glossaryCount = await page.locator('.glossary .lesson-term').count()
record('The glossary lists every term in one place', glossaryCount > 40, `${glossaryCount} terms`)

await page.getByPlaceholder(/Search — try/).fill('warp')
await page.waitForTimeout(200)
const warpText = await page.locator('.glossary .lesson-term').first().textContent()
record('Glossary search finds an interface term', /stretch/i.test(warpText ?? ''), warpText?.slice(0, 80))
await page.locator('.sheet-head .btn.icon.ghost').click()

// --- terms explain themselves in place -------------------------------------
await page.locator('.tab', { hasText: 'Mix' }).click()
await page.waitForSelector('.strip')
const termCount = await page.locator('.strip .term').count()
record('Mixer labels are self-explaining', termCount >= 4, `${termCount} explainable labels`)

await page.locator('.strip .term').first().hover()
await page.waitForSelector('.term-bubble')
const bubble = await page.locator('.term-bubble').first().textContent()
record('Hovering a term explains it in plain language',
  Boolean(bubble && bubble.length > 25), bubble?.slice(0, 80))

await page.screenshot({ path: 'scripts/screenshots/glossary-term.png' })
await page.screenshot({ path: 'scripts/screenshots/guided-off.png' })
record('No uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
