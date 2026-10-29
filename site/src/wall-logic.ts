export type Dir = 'up' | 'down' | 'left' | 'right'

// 6 tiles, row-major; moves wrap inside the row or column
export function moveSel(sel: number, dir: Dir, cols: 2 | 3): number {
  const rows = 6 / cols
  const r = Math.floor(sel / cols)
  const c = sel % cols
  if (dir === 'left') return r * cols + ((c + cols - 1) % cols)
  if (dir === 'right') return r * cols + ((c + 1) % cols)
  if (dir === 'up') return ((r + rows - 1) % rows) * cols + c
  return ((r + 1) % rows) * cols + c
}

const MAX_PULL = 160

export function stickAngle(dx: number, dy: number): { tilt: number; dir: number } {
  const d = Math.hypot(dx, dy)
  if (d === 0) return { tilt: 0, dir: 0 }
  return { tilt: Math.min(1, d / MAX_PULL), dir: Math.atan2(dy, dx) }
}
