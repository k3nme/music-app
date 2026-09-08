# Overtone — notes for working in this repo

A browser music studio: hum an idea, hear it on any instrument, build the track
around it. React + TypeScript + Web Audio, no backend.

See `README.md` for what it does and why the architecture is shaped the way it
is. This file is the working notes.

## Commands

```bash
npm run dev        # dev server on :5173
npm test           # vitest
npm run build      # tsc -b && vite build — run before committing
node scripts/smoke.mjs     # browser smoke test (needs the dev server running)
node scripts/hum-e2e.mjs   # end-to-end hum test with a fake mic
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

**Analysis code stays pure.** `src/audio/analysis/pitch.ts` has no Web Audio
and no DOM, so it runs identically in the worker and in tests. Keep it that way.

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

## Testing what matters

Unit-test the silent failures: pitch detection, segmentation, key detection,
suggestion output. Use the browser tests for anything involving the audio graph
— "it makes a sound" is not something vitest can tell you, and both real bugs
found so far (silent plucked renders, levels over unity) were caught there.
