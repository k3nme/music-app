/** Inline icons — a handful of paths beats an icon-font dependency. */
import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, ...props,
})

export const Play = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
)
export const Stop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
)
export const Mic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
)
export const Loop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
)
export const Metronome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 2h6l4 20H5z" /><path d="M7.5 15h9" /><path d="M12 18L17 5" /></svg>
)
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></svg>
)
export const Copy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
)
export const Undo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 8h11a5 5 0 0 1 0 10H9" /><path d="M7 4L3 8l4 4" /></svg>
)
export const Redo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 8H10a5 5 0 0 0 0 10h5" /><path d="M17 4l4 4-4 4" /></svg>
)
export const Download = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>
)
export const Share = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
)
export const Wand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20l11-11" /><path d="M14 4l1.2 2.8L18 8l-2.8 1.2L14 12l-1.2-2.8L10 8l2.8-1.2z" /><path d="M19 15l.7 1.6L21 17l-1.3.4L19 19l-.7-1.6L17 17l1.3-.4z" /></svg>
)
export const Help = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6" /><path d="M12 17h.01" /></svg>
)
export const Folder = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
)
export const Close = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const Chevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>
)
export const Sliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="7" cy="18" r="2" fill="currentColor" /></svg>
)
export const Piano = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v8M15 5v8M3 13h18" /></svg>
)
export const Layers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17.5l9 5 9-5" /></svg>
)
export const Note = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="7" cy="18" r="3" /><path d="M10 18V4l10-2v13" /><circle cx="17" cy="15" r="3" /></svg>
)
