import { useEffect, useState } from 'react'
import { CAPABILITY_LABELS, activeProvider, suggest, type Capability, type Suggestion } from '../../ai'
import { useStore } from '../../state/store'
import { Close, Wand } from '../icons'

const ORDER: Capability[] = ['drums', 'chords', 'bass', 'harmony', 'arrangement']

export function IdeasPanel({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)
  const selectedClipId = useStore((s) => s.selectedClipId)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const { commit, flash } = useStore.getState()

  const [capability, setCapability] = useState<Capability>('drums')
  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  const provider = activeProvider()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void suggest({ project, trackId: selectedTrackId, clipId: selectedClipId }, capability)
      .then((result) => { if (!cancelled) { setItems(result); setLoading(false) } })
    return () => { cancelled = true }
  }, [capability, project, selectedClipId, selectedTrackId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const applyIt = (suggestion: Suggestion) => {
    commit()
    useStore.setState({ project: suggestion.apply(useStore.getState().project) })
    flash(`Added: ${suggestion.title}`, 'good')
    onClose()
  }

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Ideas</div>
            <div className="sheet-sub">
              Suggestions built from what you've already written — nothing leaves your browser.
            </div>
          </div>
          <div className="spacer" />
          <span className="chip" title={provider.remote ? 'Remote provider' : 'Runs locally'}>
            {provider.label}
          </span>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><Close width={15} height={15} /></button>
        </div>

        <div className="sheet-body">
          <div className="picker-layout">
            <div className="picker-families">
              {ORDER.filter((c) => provider.capabilities.includes(c)).map((c) => (
                <button key={c} className={`fam ${capability === c ? 'on' : ''}`} onClick={() => setCapability(c)}>
                  {CAPABILITY_LABELS[c]}
                </button>
              ))}
            </div>

            <div className="picker-grid">
              {loading && <div style={{ color: 'var(--faint)' }}>Thinking…</div>}
              {!loading && items.length === 0 && (
                <div style={{ color: 'var(--faint)', padding: 16, lineHeight: 1.6 }}>
                  {capability === 'harmony'
                    ? 'Select a melodic clip first — harmony is built from the notes in it.'
                    : 'Nothing to suggest yet. Add a part and come back.'}
                </div>
              )}
              {!loading && items.map((item) => (
                <button
                  key={item.id}
                  className="inst-card"
                  style={{ ['--hue' as string]: 265 }}
                  onClick={() => applyIt(item)}
                >
                  <div className="inst-name">{item.title}</div>
                  <div className="inst-blurb">{item.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <span style={{ color: 'var(--faint)', marginRight: 'auto', fontSize: 11.5 }}>
            Everything here is undoable — try one and press ⌘Z if it isn't right.
          </span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function IdeasButton({ onClick }: { onClick(): void }) {
  return (
    <button className="btn" onClick={onClick} title="Suggestions built from what you've written">
      <Wand width={13} height={13} /> Ideas
    </button>
  )
}
