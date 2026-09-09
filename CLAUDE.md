# Overtone — notes for working in this repo

A browser DAW: hum an idea, hear it on any instrument, import and mash up
finished songs, build the track around it. React + TypeScript + Web Audio, no
backend.

See `README.md` for what it does and why the architecture is shaped the way it
is. This file is the working notes.

## Commands

```bash
npm run dev        # dev server on :5173
npm test           # vitest
npm run build      # tsc -b && vite build — run before committing
# all browser tests need the dev server running
node scripts/smoke.mjs        # boots the app, renders every engine, exercises the UI
node scripts/hum-e2e.mjs      # hum capture with a fake mic
node scripts/chords-e2e.mjs   # chord capture with a fake mic
node scripts/audio-e2e.mjs    # import, warp, separate, render, bundle
node scripts/mashup-e2e.mjs   # the Mashup Lab, end to end
```

## Ground rules

**Time is beats.** Anything musical is measured in beats as a float. Convert to
seconds only at the audio layer, using the current bpm. Never store seconds in
the project.

**Don't put the playhead in React state.** It updates every frame. Read it from
`engine.positionBeats` via `usePlayhead`.

**Instruments implement one interface.** `InstrumentInstance` in
`src/audio/types.ts`. Adding an instrument usually means adding a preset to
`src/audio/instruments/presets.ts`, not writing new code — reach for a new
engine only when no existing one can make the sound.

**Analysis and DSP stay pure.** `src/audio/analysis/*` and `src/audio/spectral/*`
have no Web Audio and no DOM, so they run identically in a worker and in tests.
Keep it that way — it is what makes any of this testable.

**Audio clip length is derived.** `audioClipLengthBeats(clip, bpm)` computes it
from the source duration and the warp speed. Never store it; a tempo change
would leave it stale.

**Heavy DSP goes in a worker.** Anything that takes more than a frame — analysis,
separation, warping — goes through `src/audio/workers`. Surface it with
`startJob`/`updateJob`/`endJob` so the app never looks frozen.

**Suggestions never mutate.** `Suggestion.apply` returns a new project. This is
what keeps undo working, and it's the contract that would make a remote
provider safe.

**The store owns the project; the engine mirrors it.** `syncEngine` reconciles
after every change. Don't reach into the engine to change musical state —
change the project and let it flow.

## Things that will bite you

- **Worklet messages and offline rendering.** `port.postMessage` in the same
  task as `startRendering()` is never delivered. Offline instruments buffer
  their schedule and pass it via `processorOptions`; `export.ts` calls
  `finalize()` on every instrument before rendering. If a plucked instrument
  renders silent, this is why.
- **`DelayNode` feedback loops** have a 128-sample minimum delay, so they can't
  do Karplus-Strong above ~344 Hz. That's why `pluck-processor.js` exists.
- **Worklet files are plain JS in `public/worklets/`**, loaded by URL at
  runtime. They aren't bundled or typechecked — be careful in there, and add a
  browser test for anything non-trivial.
- **The keyboard steals letter keys.** A–J, W/E/T/Y/U, K/O/L/P are notes while
  the Play tab is open, so global letter shortcuts are suppressed there. Check
  `letterShortcutsLive` in `App.tsx` before adding one.
- **Levels add up.** Parallel paths (body resonances, unison voices, sends) sum
  well above unity if you're not careful. The master limiter hides it until
  someone renders a stem. `scripts/smoke.mjs` asserts renders don't clip.
- **Chroma needs a long window.** At 2048 points and 22 kHz a bin is wider than
  a semitone below ~400 Hz, so bass notes land in the wrong pitch class. Harmony
  analysis uses 8192; onset detection uses 2048. Don't unify them.
- **Never silently substitute.** A deck asking for the vocal stem once rendered
  the full mix because separation hadn't run. Falling back is fine while
  previewing; it is not fine when committing. If you can't do what was asked,
  do the work or say so.
- **Renders follow content, not the canvas.** `project.lengthBeats` is a working
  area. Bouncing to it pads the file with silence.

## Testing what matters

Unit-test the silent failures: pitch detection, segmentation, key detection,
tempo, tuning, stem routing, match planning, suggestion output. Use the browser
tests for anything involving the audio graph — "it makes a sound" is not
something vitest can tell you, and *every* real bug found so far surfaced there:
silent plucked renders, levels over unity, a deck rendering the wrong stems, and
exports padded with silence.

When a test fails, check the measurement before the code. Two of these were bad
metrics (summing total energy in a window that also held a loud sustained tone;
asserting an exact key on a progression that is genuinely ambiguous between
relative keys). But most were real.
