// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD and banners are characters drawn over the cells.
import { CELL_H, CELL_W, FIELD_Y, FRAME_X } from './sim'
import type { Cell, Game } from './sim'

import type { Cells } from './shared/cells'

const HINT = 'arrows/WASD · p pause'
const FIELD_TOP = 0x0d1f1a
const FIELD_BOTTOM = 0x16342a
const FRAME = 0x5f9a72
const WHITE = 0xffffff
const COIN = 0xffe45a
const HUD_BG = 0x0a1612
const HEAD = 0xb6ff7a
const TAIL = 0x2c8a4c
const APPLE = 0xe8484f
const LEAF = 0x4cc46a

const pack = (r: number, g: number, b: number) =>
  (Math.max(0, Math.min(255, Math.round(r))) << 16) |
  (Math.max(0, Math.min(255, Math.round(g))) << 8) |
  Math.max(0, Math.min(255, Math.round(b)))

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255

  return pack(ar + (((b >> 16) & 255) - ar) * t, ag + (((b >> 8) & 255) - ag) * t, ab + ((b & 255) - ab) * t)
}

let cacheKey = ''
let cache: Uint32Array = new Uint32Array(0)

// Dark vertical gradient; one color a row, so it costs almost no runs. Rebuilt on resize only.
function background(w: number, h: number): Uint32Array {
  const key = `${w}x${h}`
  if (key === cacheKey) return cache
  const buf = new Uint32Array(w * h)
  for (let y = 0; y < h; y += 1) buf.fill(mix(FIELD_TOP, FIELD_BOTTOM, y / h), y * w, (y + 1) * w)
  cacheKey = key
  cache = buf

  return buf
}

type Px = { buf: Uint32Array; w: number; h: number }

function put(p: Px, x: number, y: number, c: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) return
  p.buf[iy * p.w + ix] = c
}

function blend(p: Px, x: number, y: number, c: number, t: number) {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return
  p.buf[y * p.w + x] = mix(p.buf[y * p.w + x]!, c, t)
}

function rect(p: Px, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(p, x + i, y + j, c)
}

const px = (c: Cell): number => FRAME_X + c.x * CELL_W
const py = (c: Cell): number => FIELD_Y + c.y * CELL_H

function drawFrame(p: Px, g: Game) {
  const x1 = FRAME_X + g.gw * CELL_W
  const y1 = FIELD_Y + g.gh * CELL_H
  rect(p, 0, FIELD_Y - 1, x1 + 1, 1, FRAME)
  rect(p, 0, y1, x1 + 1, 1, FRAME)
  rect(p, 0, FIELD_Y - 1, 1, y1 - FIELD_Y + 2, FRAME)
  rect(p, x1, FIELD_Y - 1, 1, y1 - FIELD_Y + 2, FRAME)
}

function drawFood(p: Px, g: Game) {
  if (g.food === null) return
  const x = px(g.food)
  const y = py(g.food)
  put(p, x, y, mix(APPLE, WHITE, 0.45))
  put(p, x + 1, y, LEAF)
  put(p, x, y + 1, APPLE)
  put(p, x + 1, y + 1, mix(APPLE, 0x000000, 0.35))
}

function drawBonuses(p: Px, g: Game) {
  for (const b of g.bonuses) {
    // about to expire: blink out
    if (b.life < 3 && Math.floor(g.t * 7) % 2 === 0) continue
    const x = px(b)
    const y = py(b)
    const glow = 0.18 + 0.14 * Math.sin(g.t * 8)
    // a ring of light one pixel out, over whatever is under it
    for (let j = -1; j <= CELL_H; j += 1) {
      for (let i = -1; i <= CELL_W; i += 1) {
        if (i >= 0 && i < CELL_W && j >= 0 && j < CELL_H) continue
        blend(p, x + i, y + j, COIN, glow)
      }
    }
    const lit = Math.sin(g.t * 10) > 0
    const core = lit ? mix(COIN, WHITE, 0.6) : COIN
    rect(p, x, y, CELL_W, CELL_H, core)
    put(p, x + 1, y + 1, mix(COIN, 0xff8a00, 0.6))
  }
}

function drawSnake(p: Px, g: Game) {
  const n = g.snake.length
  for (let i = n - 1; i >= 0; i -= 1) {
    const c = g.snake[i]!
    const x = px(c)
    const y = py(c)
    if (i === 0) {
      const body = g.pulse > 0 ? WHITE : HEAD
      rect(p, x, y, CELL_W, CELL_H, body)
      put(p, x + 1, y + 1, mix(body, 0x000000, 0.2))
      // one dark eye on the leading side
      const eye: [number, number] = [[1, 0], [1, 0], [1, 1], [0, 0]][g.dir] as [number, number]
      put(p, x + eye[0], y + eye[1], 0x10231b)
      continue
    }
    // the body fades toward the tail in a few flat bands, which also keeps the run count down
    const t = n <= 2 ? 0 : Math.min(1, ((i - 1) / (n - 1)) * 1.2)
    const body = mix(HEAD, TAIL, Math.round(t * 4) / 4)
    rect(p, x, y, CELL_W, 1, mix(body, WHITE, 0.25))
    rect(p, x, y + 1, CELL_W, 1, mix(body, 0x000000, 0.3))
  }
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const pix: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  drawFrame(pix, g)
  drawFood(pix, g)
  drawBonuses(pix, g)
  drawSnake(pix, g)

  const ch = new Array<string>(cols * rows).fill('▀')
  const fg = new Array<number>(cols * rows)
  const bg = new Array<number>(cols * rows)
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const i = cy * cols + cx
      fg[i] = pix.buf[cy * 2 * cols + cx]!
      bg[i] = pix.buf[(cy * 2 + 1) * cols + cx]!
    }
  }

  const text = (cx: number, cy: number, s: string, color: number) => {
    for (let k = 0; k < s.length; k += 1) {
      const x = cx + k
      if (x < 0 || x >= cols || cy < 0 || cy >= rows) continue
      const i = cy * cols + x
      ch[i] = s[k]!
      fg[i] = color
      bg[i] = mix(pix.buf[cy * 2 * cols + x]!, pix.buf[(cy * 2 + 1) * cols + x]!, 0.5)
    }
  }
  const centered = (cy: number, s: string, color: number) => text(Math.floor((cols - s.length) / 2), cy, s, color)

  if (g.over) {
    centered(Math.floor(rows / 2) - 1, ' GAME OVER ', 0xff5a5f)
    centered(Math.floor(rows / 2), ` SCORE ${g.score} `, COIN)
    if (g.overT >= 0.5) centered(Math.floor(rows / 2) + 1, ' press any key ', 0xdde3f5)
  }

  // HUD row, painted over the top of the field.
  const left = ` SCORE ${g.score}  LEN ${g.snake.length} `
  for (let x = 0; x < cols; x += 1) {
    ch[x] = x < left.length ? left[x]! : ' '
    fg[x] = COIN
    bg[x] = HUD_BG
  }
  if (cols >= left.length + HINT.length + 2) {
    for (let k = 0; k < HINT.length; k += 1) {
      const x = cols - HINT.length - 1 + k
      ch[x] = HINT[k]!
      fg[x] = 0x7fb08e
    }
  }

  return { cols, rows, ch, fg, bg }
}
