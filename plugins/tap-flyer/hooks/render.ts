// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD and banners are characters drawn over the cells.
import { CEIL, COIN_SIZE, FLY_H, FLY_W, OBST_W, SCROLL, floorY } from './sim'
import type { Game } from './sim'

import type { Cells } from './shared/cells'

const HINT_LONG = 'any key flaps · p pause · esc back to chat'
const HINT_SHORT = 'any key · p pause · esc back'
const SKY_TOP = 0x120f33
const SKY_BOTTOM = 0x4a2a5c
const WHITE = 0xffffff
const COIN = 0xffe45a
const HUD_BG = 0x0c0a24
const STONE_LIGHT = 0xe8a55c
const STONE = 0xb8703a
const STONE_DARK = 0x7a4426
const CAP = 0xf4c27a
const GROUND_A = 0x3a2a4a
const GROUND_B = 0x56406a
const EMBER_CORE = 0xfff1a8
const EMBER = 0xff8a3c
const EMBER_DEEP = 0xd9442f

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

// Dusk gradient; one color a row, so it costs almost no runs. Rebuilt on resize only.
function background(w: number, h: number): Uint32Array {
  const key = `${w}x${h}`
  if (key === cacheKey) return cache
  const buf = new Uint32Array(w * h)
  for (let y = 0; y < h; y += 1) buf.fill(mix(SKY_TOP, SKY_BOTTOM, y / h), y * w, (y + 1) * w)
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

function drawGround(p: Px, g: Game) {
  const y = floorY(g.h)
  const shift = Math.floor(g.t * SCROLL)
  for (let x = 0; x < g.w; x += 1) put(p, x, y, ((x + shift) >> 2) % 2 === 0 ? GROUND_A : GROUND_B)
}

function drawPillars(p: Px, g: Game) {
  const floor = floorY(g.h)
  for (const o of g.obstacles) {
    const x = Math.round(o.x)
    const top = o.gapY - CEIL
    const bottom = floor - (o.gapY + o.gapH)
    for (const [y, h] of [
      [CEIL, top],
      [o.gapY + o.gapH, bottom],
    ] as const) {
      rect(p, x, y, 1, h, STONE_LIGHT)
      rect(p, x + 1, y, OBST_W - 2, h, STONE)
      rect(p, x + OBST_W - 1, y, 1, h, STONE_DARK)
    }
    // a lit lip on each wall's open end, one pixel wider than the column
    rect(p, x - 1, o.gapY - 1, OBST_W + 2, 1, CAP)
    rect(p, x - 1, o.gapY + o.gapH, OBST_W + 2, 1, CAP)
  }
}

function drawCoins(p: Px, g: Game) {
  for (const c of g.bonuses) {
    const x = Math.round(c.x)
    const y = Math.round(c.y)
    const glow = 0.18 + 0.14 * Math.sin(g.t * 8)
    for (let j = -1; j <= COIN_SIZE; j += 1) {
      for (let i = -1; i <= COIN_SIZE; i += 1) {
        if (i >= 0 && i < COIN_SIZE && j >= 0 && j < COIN_SIZE) continue
        blend(p, x + i, y + j, COIN, glow)
      }
    }
    const core = Math.sin(g.t * 10) > 0 ? mix(COIN, WHITE, 0.6) : COIN
    rect(p, x, y, COIN_SIZE, COIN_SIZE, core)
    put(p, x + 1, y + 1, mix(COIN, 0xff8a00, 0.6))
  }
}

// An ember: a bright core with two flickering wing sparks that lift on a rising flap.
function drawFlyer(p: Px, g: Game) {
  const x = g.fx
  const y = Math.round(g.y)
  const core = g.pulse > 0 ? WHITE : EMBER_CORE
  rect(p, x, y, FLY_W, FLY_H, EMBER)
  put(p, x + 1, y, core)
  put(p, x + 1, y + 1, EMBER_DEEP)
  const wingY = g.vy < 0 ? y - 1 : y
  put(p, x, wingY, g.vy < 0 ? CAP : EMBER_CORE)
  put(p, x + FLY_W - 1, wingY, g.vy < 0 ? CAP : EMBER_CORE)
  // a short trail while rising
  if (g.vy < 0) put(p, x + 1, y + FLY_H, mix(EMBER, SKY_BOTTOM, 0.5))
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const pix: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  drawGround(pix, g)
  drawPillars(pix, g)
  drawCoins(pix, g)
  drawFlyer(pix, g)

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
  const left = ` SCORE ${g.score} `
  const hint = cols >= left.length + HINT_LONG.length + 2 ? HINT_LONG : HINT_SHORT
  for (let x = 0; x < cols; x += 1) {
    ch[x] = x < left.length ? left[x]! : ' '
    fg[x] = COIN
    bg[x] = HUD_BG
  }
  if (cols >= left.length + hint.length + 2) {
    for (let k = 0; k < hint.length; k += 1) {
      const x = cols - hint.length - 1 + k
      ch[x] = hint[k]!
      fg[x] = 0xa79bd0
    }
  }

  return { cols, rows, ch, fg, bg }
}
