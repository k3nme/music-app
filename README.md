# Overtone

**Hum it, hear it on anything.**

Sing, hum, whistle or beatbox an idea into your browser. Overtone works out the
notes and the rhythm, and plays them back on any instrument you like — a sitar,
a Rhodes, an 808, a string section. From there it's a studio: loop it, arrange
it, layer more parts, and export a WAV.

No install, no account, no upload. Everything runs in the browser and stays
there.

```bash
npm install
npm run dev        # http://localhost:5173
```

![The Overtone studio](docs/screenshot-studio.png)

---

## What it does

**Hum → notes → any instrument.** Record from the mic, and a YIN pitch tracker
turns the take into notes: onsets, pitches, velocities, and a tempo estimate.
It reads the key you hummed in, so "snap into key" corrects your pitching
instead of transposing your idea somewhere else. Then you pick the sound — and
swapping instruments re-voices the same performance instantly, which is the
whole point.

Beatboxing works the same way: onsets are classified by frequency band into
kick / snare / hat and land on a drum kit.

![Turning a hummed take into an instrument](docs/screenshot-hum.png)

**A real studio around it.** Arrangement timeline with draggable clips and a
loop region, a piano roll, a drum step grid, a mixer with per-channel sends, a
playable keyboard (mouse, touch or computer keys) that can record straight into
a clip, undo/redo throughout.

**75 instruments, none of them sampled.** Every instrument is synthesised from
scratch, which is why the app is ~110 KB gzipped, loads instantly and works
offline — and why instruments stay editable rather than being frozen
recordings. Keys, guitars, bowed strings, winds, brass, mallets, synths, bass,
voices, drum kits, and a deliberate spread of world instruments (sitar, koto,
oud, bansuri, shakuhachi, kalimba, santoor, erhu, tabla, hand percussion).

**Getting your work out.** WAV rendered offline through the exact signal chain
you hear, MIDI to take the idea into any other DAW, a project file, or a share
link with the entire song encoded in the URL fragment.

**Ideas.** Chord progressions fitted bar-by-bar to what you've written, bass
lines that follow the harmony, drum patterns in six styles, harmony lines that
stay in key. All local, all from music theory, all undoable.

---

## How it's put together

```
src/
  audio/
    engine.ts            transport, scheduler, channel strips, master bus
    dsp.ts               noise, saturation, reverb impulses, envelopes
    recorder.ts          raw PCM mic capture
    instruments/
      subtractive.ts     oscillators → filter → amp  (pads, leads, winds, bowed)
      fm.ts              routable operators          (EPs, bells, mallets, brass)
      pluck.ts           extended Karplus-Strong     (guitars, sitar, harp, piano)
      drums.ts           procedural percussion
      presets.ts         the instrument library
    analysis/
      pitch.ts           YIN, segmentation, onsets, tempo — pure functions
      analysis.worker.ts runs it off the main thread
  music/
    theory.ts            scales (incl. ragas and maqam), chords, progressions
    key.ts               key detection from a melody
    quantize.ts          analysis → notes, with a quantise *strength*
    project.ts           the data model, and the scheduler's view of it
    demo.ts              the starter groove
  ai/                    provider seam + the local theory-based provider
  state/store.ts         zustand store; engine reconciliation
  ui/                    React components
public/worklets/         audio worklets (plain JS, loaded at runtime)
```

### Decisions worth knowing about

**Time is beats, everywhere.** Seconds only appear at the audio layer, so a
tempo change never rewrites musical data.

**The playhead is not in React state.** It moves 60 times a second; pushing it
through the store would re-render the app on every frame. `usePlayhead` reads
it straight from the engine instead.

**Scheduling uses two clocks.** A worker-driven timer wakes the scheduler every
25 ms and it schedules everything in the next 140 ms against the AudioContext
clock — the only clock accurate enough. The worker matters: a plain
`setInterval` gets throttled hard in a background tab and playback stutters.

**Karplus-Strong lives in an AudioWorklet.** A native `DelayNode` feedback loop
has a one-render-quantum (128 sample) minimum delay, which caps the pitch at
about 344 Hz — useless for a guitar. The worklet uses a plain circular buffer
with a fractional read, so any pitch works, plus an allpass stage for string
stiffness and a nonlinear bridge stage for the sitar's buzz.

**Offline rendering can't use `postMessage`.** Messages posted in the same task
as `startRendering()` are never delivered, so plucked instruments rendered
silent. Offline instruments buffer their schedule and hand it to the processor
through `processorOptions` at construction, committed by `finalize()`. This was
found by a browser test, not by reading the spec.

**Quantisation is a strength, not a switch.** Pulling a hummed take fully onto
a 16th grid makes it stiff. The default of 80% fixes the sloppiness and keeps
the feel.

**Suggestions are pure functions over the project.** A suggestion returns a new
project rather than mutating one, which keeps undo working and means a future
remote provider's output can be inspected before it's applied — never executed.

---

## The AI seam

Overtone ships with no model and no network calls. `src/ai/types.ts` defines
`MusicProvider`, and `src/ai/local.ts` implements it from music theory —
instant, offline, and inspectable.

A model-backed provider implements the same interface, registers itself in
`src/ai/index.ts`, and the Ideas panel picks it up with no other changes. The
interface is deliberately shaped so that a remote provider returns *data*, from
which `apply` is constructed locally — remote suggestions are never executable
code. If a provider fails, the app falls back to local rather than blocking.

The places a model would genuinely beat theory: "make this sound more like
[reference]", generating a full arrangement from a text prompt, and stem
separation for remixing. The seams are there; nothing is wired up.

---

## Testing

```bash
npm test           # unit tests (vitest)
npm run build      # typecheck + production build

# browser tests — start the dev server first (npm run dev)
node scripts/smoke.mjs      # drives the real app in Chromium
node scripts/hum-e2e.mjs    # hums into it via a fake audio device
```

The unit tests cover the parts where being wrong is silent: pitch detection
against synthesised tones, note segmentation, key detection, and the
suggestion engine.

The browser tests cover what unit tests can't. `smoke.mjs` boots the real app,
plays the transport, renders every synthesis engine offline and asserts the
audio is not silent and does not clip, then exercises the editors, the picker,
share round-trips and MIDI export. `hum-e2e.mjs` feeds a synthesised voice
through Chromium's fake microphone and asserts that a sung A–C–E–D comes back
as exactly those notes on a sitar.

---

## Limitations, stated plainly

- **Pitch tracking is monophonic.** One voice at a time. Humming a chord won't
  work; humming a line will.
- **Synthesised instruments are models, not recordings.** The sitar is
  convincingly a sitar and the Rhodes is convincingly a Rhodes; the violin is a
  synthesised violin and sounds like one. That is the trade for a 110 KB app
  that works offline.
- **Projects live in this browser.** localStorage, plus autosave. Download the
  project file or a share link if it matters.
- **Share links get long.** A busy arrangement can exceed what some apps will
  carry; the dialog warns you and suggests the project file instead.
- **iOS Safari** needs a tap before any audio starts (a platform rule), and
  microphone latency there is worse than on desktop.

## Licence

MIT.
