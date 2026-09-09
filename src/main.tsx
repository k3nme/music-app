import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

// Dev-only handle for debugging and browser-driven tests: lets a console or a
// test driver poke the store, render audio offline, and inspect the engine.
if (import.meta.env.DEV) {
  void Promise.all([
    import('./state/store'),
    import('./audio/engine'),
    import('./lib/export'),
    import('./music/demo'),
    import('./audio/analysis'),
    import('./lib/samples'),
    import('./lib/importAudio'),
    import('./music/matching'),
    import('./music/project'),
    import('./audio/workers'),
    import('./lib/wav'),
    import('./lib/bundle'),
  ]).then((modules) => {
    Object.assign(window, { __overtone: Object.assign({}, ...modules) })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
