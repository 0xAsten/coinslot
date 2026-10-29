export type Dir = 'up' | 'down' | 'left' | 'right'

// row-major over `count` tiles; moves wrap inside the row or column (the last row may be short)
export function moveSel(sel: number, dir: Dir, cols: 2 | 3, count: number): number {
  const rows = Math.ceil(count / cols)
  const r = Math.floor(sel / cols)
  const c = sel % cols
  if (dir === 'left' || dir === 'right') {
    const len = Math.min(cols, count - r * cols)
    return r * cols + ((c + len + (dir === 'right' ? 1 : -1)) % len)
  }
  const step = dir === 'down' ? 1 : rows - 1
  let nr = r
  do nr = (nr + step) % rows
  while (nr * cols + c >= count)
  return nr * cols + c
}

const MAX_PULL = 160

export function stickAngle(dx: number, dy: number): { tilt: number; dir: number } {
  const d = Math.hypot(dx, dy)
  if (d === 0) return { tilt: 0, dir: 0 }
  return { tilt: Math.min(1, d / MAX_PULL), dir: Math.atan2(dy, dx) }
}
