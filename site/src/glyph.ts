export type GlyphShape = 'space' | 'full' | 'top' | 'bottom' | 'text'

export function glyphShape(ch: string): GlyphShape {
  if (ch === ' ') return 'space'
  if (ch === '█') return 'full'
  if (ch === '▀') return 'top'
  if (ch === '▄') return 'bottom'
  return 'text'
}
