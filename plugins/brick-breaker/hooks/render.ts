// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD and banners are characters drawn over the cells.
import { BRICK_COLORS, BRICK_TOP, COLS, HUD_PX, MAX_BALLS, PAD_H, ROWS, START_LIVES, brickH, padTop } from './sim'
import type { Game } from './sim'

import type { Cells } from './shared/cells'

const HINT = 'mouse/←→ move · space launch · p pause'
const SKY_TOP = 0x0b0d2a
const SKY_BOTTOM = 0x241a4a
const WHITE = 0xffffff
const COIN = 0xffe45a
const HUD_BG = 0x15163a
const COOL = 0xff9a3c

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

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16

  return (x >>> 0) / 4294967296
}

let cacheKey = ''
let cache: Uint32Array = new Uint32Array(0)

// Night gradient plus a few fixed stars; rebuilt on resize only.
function background(w: number, h: number): Uint32Array {
  const key = `${w}x${h}`
  if (key === cacheKey) return cache
  const buf = new Uint32Array(w * h)
  for (let y = 0; y < h; y += 1) buf.fill(mix(SKY_TOP, SKY_BOTTOM, y / h), y * w, (y + 1) * w)
  const stars = Math.floor((w * h) / 220)
  for (let i = 0; i < stars; i += 1) {
    const x = Math.floor(hash(i * 2 + 1) * w)
    const y = HUD_PX + Math.floor(hash(i * 2 + 2) * (h - HUD_PX - 8))
    buf[y * w + x] = 0x6a68a8
  }
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

function rect(p: Px, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(p, x + i, y + j, c)
}

function drawBricks(p: Px, g: Game) {
  const bw = g.w / COLS
  const bh = brickH(g.h)
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const v = g.bricks[r * COLS + c]!
      if (v === 0) continue
      const x0 = Math.round(c * bw)
      // one pixel of gap on the right, and below when bricks are 3 high
      const x1 = Math.round((c + 1) * bw) - 1
      const y0 = BRICK_TOP + r * bh
      const body = BRICK_COLORS[v]!
      const w = Math.max(1, x1 - x0)
      rect(p, x0, y0, w, bh, body)
      // lit top edge, shaded bottom edge
      rect(p, x0, y0, w, 1, mix(body, WHITE, 0.4))
      rect(p, x0, y0 + bh - 1, w, 1, mix(body, 0x000000, 0.35))
    }
  }
}

function drawPaddle(p: Px, g: Game) {
  const top = padTop(g.h)
  const x0 = Math.round(g.padX - g.padW / 2)
  const wide = g.wideT > 0
  const cap = wide ? 0xffd24a : 0xff5a5f
  rect(p, x0, top, g.padW, 1, 0xe4eaf8)
  rect(p, x0, top + 1, g.padW, PAD_H - 1, 0x8798c4)
  rect(p, x0, top, 2, PAD_H, cap)
  rect(p, x0 + g.padW - 2, top, 2, PAD_H, cap)
}

function drawBalls(p: Px, g: Game) {
  for (const b of g.balls) rect(p, Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2, WHITE)
}

function drawCapsules(p: Px, g: Game) {
  for (const c of g.capsules) {
    const body = c.kind === 'wide' ? 0x3ad7e8 : 0xff6fb5
    const lit = Math.sin(g.t * 12) > 0
    const x = Math.round(c.x) - 2
    const y = Math.round(c.y) - 1
    rect(p, x, y, 5, 2, lit ? mix(body, WHITE, 0.5) : body)
    rect(p, x, y, 1, 2, mix(body, 0x000000, 0.4))
    rect(p, x + 4, y, 1, 2, mix(body, 0x000000, 0.4))
  }
}

function drawParticles(p: Px, g: Game) {
  for (const q of g.particles) {
    const t = Math.max(0, q.life / q.max)
    const ix = Math.floor(q.x)
    const iy = Math.floor(q.y)
    if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) continue
    const under = p.buf[iy * p.w + ix]!
    // white-hot sparks cool through orange, the rest fade from the brick color into the night
    const c = q.color === 0xfff6d0 ? mix(COOL, q.color, t) : q.color
    p.buf[iy * p.w + ix] = mix(under, c, Math.min(1, t * 1.6))
  }
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const px: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  drawBricks(px, g)
  drawCapsules(px, g)
  drawPaddle(px, g)
  drawBalls(px, g)
  drawParticles(px, g)

  const ch = new Array<string>(cols * rows).fill('▀')
  const fg = new Array<number>(cols * rows)
  const bg = new Array<number>(cols * rows)
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const i = cy * cols + cx
      fg[i] = px.buf[cy * 2 * cols + cx]!
      bg[i] = px.buf[(cy * 2 + 1) * cols + cx]!
    }
  }

  const text = (cx: number, cy: number, s: string, color: number) => {
    for (let k = 0; k < s.length; k += 1) {
      const x = cx + k
      if (x < 0 || x >= cols || cy < 0 || cy >= rows) continue
      const i = cy * cols + x
      ch[i] = s[k]!
      fg[i] = color
      bg[i] = mix(px.buf[cy * 2 * cols + x]!, px.buf[(cy * 2 + 1) * cols + x]!, 0.5)
    }
  }
  const centered = (cy: number, s: string, color: number) => text(Math.floor((cols - s.length) / 2), cy, s, color)

  if (g.over) {
    centered(Math.floor(rows / 2) - 1, ' GAME OVER ', 0xff5a5f)
    centered(Math.floor(rows / 2), ` SCORE ${g.score} `, COIN)
    if (g.overT >= 0.5) centered(Math.floor(rows / 2) + 1, ' press any key ', 0xdde3f5)
  } else {
    if (g.flash > 0) centered(Math.floor(rows / 2), ` LEVEL ${g.level + 1} `, COIN)
    if (g.balls.some(b => b.stuck) && Math.floor(g.t * 2.5) % 2 === 0) {
      centered(rows - 4, ' space / click to launch ', 0xdde3f5)
    }
  }

  // HUD row, painted over the top of the field.
  const left = ` SCORE ${g.score}  LV ${g.level + 1}  `
  const hearts = '♥'.repeat(g.lives)
  const empty = '♡'.repeat(Math.max(0, START_LIVES - g.lives))
  const hud = new Array<string>(cols).fill(' ')
  const hudFg = new Array<number>(cols).fill(0xdde3f5)
  const paint = (at: number, s: string, color: number) => {
    for (let k = 0; k < s.length && at + k < cols; k += 1) {
      hud[at + k] = s[k]!
      hudFg[at + k] = color
    }
  }
  paint(0, left, COIN)
  paint(left.length, hearts, 0xff5a5f)
  paint(left.length + hearts.length, empty, 0x6a68a8)
  const used = left.length + START_LIVES
  if (cols >= used + HINT.length + 2) paint(cols - HINT.length - 1, HINT, 0x8e93c4)
  if (g.balls.length > 1) paint(used + 1, `x${Math.min(g.balls.length, MAX_BALLS)}`, 0xff6fb5)
  for (let x = 0; x < cols; x += 1) {
    ch[x] = hud[x]!
    fg[x] = hudFg[x]!
    bg[x] = HUD_BG
  }

  return { cols, rows, ch, fg, bg }
}
