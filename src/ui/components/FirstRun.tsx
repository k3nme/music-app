import { useState } from 'react'
import { Layers, Mic, Note as NoteIcon, Play, Wand } from '../icons'

/**
 * The first thing anyone sees.
 *
 * The old welcome screen offered "start with a groove" or "start empty", which
 * only means something if you already know what a groove or an empty project
 * is for. These doors are phrased as things you might actually want to do,
 * and each leads somewhere that needs no prior knowledge.
 */

export type Door = 'mashup' | 'hum' | 'sounds' | 'groove' | 'learn' | 'studio'

const DOORS: {
  id: Door
  icon: React.ReactNode
  title: string
  body: string
  tag: string
  hue: number
}[] = [
  {
    id: 'mashup',
    icon: <Layers width={20} height={20} />,
    title: 'Mash up two songs',
    body: 'Drop in two tracks you already love. Take the vocal from one and the beat from the other — it works out the tempos and keys for you.',
    tag: 'No music knowledge needed',
    hue: 205,
  },
  {
    id: 'hum',
    icon: <Mic width={20} height={20} />,
    title: 'Hum an idea',
    body: 'Sing, hum or beatbox into your microphone. It becomes real notes you can play on a sitar, a piano, an 808 — anything.',
    tag: 'No music knowledge needed',
    hue: 348,
  },
  {
    id: 'sounds',
    icon: <Wand width={20} height={20} />,
    title: 'Take a song apart',
    body: 'Drop in a song and pull the sounds out of it — the kick, the bass, the voice — as instruments you can play yourself. It tells you which ones you do not already have.',
    tag: 'No music knowledge needed',
    hue: 96,
  },
  {
    id: 'groove',
    icon: <Play width={20} height={20} />,
    title: 'Play with something',
    body: 'A short piece of music is already made. Press play, change things, see what happens. The safest way to find out what everything does.',
    tag: 'Start here if unsure',
    hue: 152,
  },
  {
    id: 'learn',
    icon: <NoteIcon width={20} height={20} />,
    title: 'Learn music from scratch',
    body: 'What a note is, why chords sound happy or sad, how every instrument makes sound. Short lessons, and you can hear all of it.',
    tag: 'Start from nothing',
    hue: 265,
  },
]

export function FirstRun({ onPick }: { onPick(door: Door): void }) {
  const [hovered, setHovered] = useState<Door | null>(null)

  return (
    <div className="welcome firstrun">
      <div className="firstrun-inner">
        <div className="welcome-mark">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 14c2.5 0 2.5-8 5-8s2.5 14 5 14 2.5-8 5-8" />
          </svg>
        </div>
        <h1>Overtone</h1>
        <p className="firstrun-lede">
          Make music without knowing any. Pick whichever of these sounds most like you.
        </p>

        <div className="firstrun-doors">
          {DOORS.map((door) => (
            <button
              key={door.id}
              className={`door ${hovered === door.id ? 'hot' : ''}`}
              style={{ ['--hue' as string]: door.hue }}
              onPointerEnter={() => setHovered(door.id)}
              onPointerLeave={() => setHovered(null)}
              onClick={() => onPick(door.id)}
            >
              <span className="door-icon">{door.icon}</span>
              <span className="door-title">{door.title}</span>
              <span className="door-body">{door.body}</span>
              <span className="door-tag">{door.tag}</span>
            </button>
          ))}
        </div>

        <button className="firstrun-skip" onClick={() => onPick('studio')}>
          or open the empty studio
        </button>

        <div className="firstrun-foot">
          Headphones help. Nothing you make leaves your browser — there is no account and no upload.
        </div>
      </div>
    </div>
  )
}
