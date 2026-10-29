// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD is characters drawn over the cells.
import type { Game } from './sim'

import type { Cells } from './shared/cells'

const HINT = 'arrows/WASD · p pause'
const BG_TOP = 0x10182e
const BG_BOTTOM = 0x1d2b4d
const HUD_BG = 0x0a1020
const COIN = 0xffe45a
const BONUS = 0xff9a3c
const DOT = 0x7fe3ff

const pack = (r: number, g: number, b: number) =>
  (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255

  return pack(ar + (((b >> 16) & 255) - ar) * t, ag + (((b >> 8) & 255) - ag) * t, ab + ((b & 255) - ab) * t)
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  // one colour per pixel row: a gradient that costs almost no runs
  const buf = new Uint32Array(g.w * g.h)
  for (let y = 0; y < g.h; y += 1) buf.fill(mix(BG_TOP, BG_BOTTOM, y / g.h), y * g.w, (y + 1) * g.w)

  const put = (x: number, y: number, c: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return
    buf[(iy * g.w + ix) | 0] = c
  }
  for (const c of g.coins) {
    // a bonus about to expire blinks out
    if (c.life < 3 && Math.floor(g.t * 7) % 2 === 0) continue
    const color = c.value > 1 ? BONUS : COIN
    put(c.x, c.y, color)
    put(c.x + 1, c.y, color)
  }
  put(g.x, g.y, DOT)
  put(g.x + 1, g.y, DOT)

  const ch = new Array<string>(cols * rows).fill('▀')
  const fg = new Array<number>(cols * rows)
  const bg = new Array<number>(cols * rows)
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const i = cy * cols + cx
      fg[i | 0] = buf[(cy * 2 * cols + cx) | 0]!
      bg[i | 0] = buf[((cy * 2 + 1) * cols + cx) | 0]!
    }
  }

  // HUD row, painted over the top of the field.
  const left = ` SCORE ${g.score} `
  for (let x = 0; x < cols; x += 1) {
    ch[x | 0] = x < left.length ? left[x | 0]! : ' '
    fg[x | 0] = COIN
    bg[x | 0] = HUD_BG
  }
  if (cols >= left.length + HINT.length + 2) {
    for (let k = 0; k < HINT.length; k += 1) {
      const x = cols - HINT.length - 1 + k
      ch[x | 0] = HINT[k | 0]!
      fg[x | 0] = 0x8aa0d0
    }
  }

  return { cols, rows, ch, fg, bg }
}
