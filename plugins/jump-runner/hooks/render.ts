// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD and banners are characters drawn over the cells.
import { COIN_SIZE, RUN_W, floorY, obstacleY, standY } from './sim'
import type { Game } from './sim'

import type { Cells } from './shared/cells'

const HINT_LONG = 'space jump · p pause · esc back to chat'
const HINT_SHORT = 'space jump · p pause · esc back'
const SKY_TOP = 0x0b1d3a
const SKY_BOTTOM = 0xe8845a
const WHITE = 0xffffff
const COIN = 0xffe45a
const HUD_BG = 0x08142b
const FAR = 0x2a3558
const FAR_LIT = 0xffd98a
const GROUND_A = 0x2b2438
const GROUND_B = 0x4a3f5c
const CRATE = 0xc98a4b
const CRATE_LIGHT = 0xf0c27a
const CRATE_DARK = 0x7a4a24
const DRONE_BODY = 0x3b4252
const DRONE_ROTOR = 0xb8c4d8
const DRONE_EYE = 0xff4d4d
const HOOD = 0x2b6cb0
const VISOR = 0x7df9ff
const COAT = 0xff6b6b
const COAT_DARK = 0xb8434f
const SCARF = 0xffd166
const BOOT = 0x2d2a3a

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

// Dawn gradient; one color a row, so it costs almost no runs. Rebuilt on resize only.
function background(w: number, h: number): Uint32Array {
  const key = `${w}x${h}`
  if (key === cacheKey) return cache
  const buf = new Uint32Array(w * h)
  for (let y = 0; y < h; y += 1) buf.fill(mix(SKY_TOP, SKY_BOTTOM, (y / h) ** 1.6), y * w, (y + 1) * w)
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

const hash = (n: number): number => {
  let t = Math.imul(n | 0, 0x9e3779b1)
  t ^= t >>> 15

  return (Math.imul(t, 0x85ebca6b) >>> 8) & 0xffff
}

// A far skyline that drifts at a third of the ground speed: buildings six pixels wide.
function drawSkyline(p: Px, g: Game) {
  const ground = floorY(g.h)
  const shift = Math.floor(g.dist / 3)
  const room = Math.max(3, Math.min(14, ground - 6))
  for (let x = 0; x < g.w; x += 1) {
    const b = Math.floor((x + shift) / 6)
    const top = ground - 2 - (hash(b) % room)
    for (let y = top; y < ground; y += 1) put(p, x, y, FAR)
    // a lit window here and there
    if ((x + shift) % 6 === 2 && hash(b * 7 + 1) % 3 === 0) put(p, x, top + 2, FAR_LIT)
  }
}

function drawGround(p: Px, g: Game) {
  const y = floorY(g.h)
  const shift = Math.floor(g.dist)
  for (let x = 0; x < g.w; x += 1) put(p, x, y, ((x + shift) >> 2) % 2 === 0 ? GROUND_A : GROUND_B)
}

// Crates: a lit top edge, a dark right edge and a plank cross on the tall ones.
function drawBlock(p: Px, x: number, y: number, w: number, h: number) {
  rect(p, x, y, w, h, CRATE)
  rect(p, x, y, w, 1, CRATE_LIGHT)
  rect(p, x + w - 1, y + 1, 1, h - 1, CRATE_DARK)
  if (h >= 5) rect(p, x, y + Math.floor(h / 2), w, 1, CRATE_DARK)
  else if (w >= 7) rect(p, x + Math.floor(w / 2), y + 1, 1, h - 1, CRATE_DARK)
}

// A drone: a spinning rotor bar over a dark body with one red eye that blinks.
function drawDrone(p: Px, g: Game, x: number, y: number, w: number) {
  const spin = Math.floor(g.t * 20) % 2 === 0
  rect(p, x + (spin ? 0 : 1), y, w - (spin ? 0 : 2), 1, DRONE_ROTOR)
  rect(p, x, y + 1, w, 1, DRONE_BODY)
  put(p, x + 1, y + 1, Math.floor(g.t * 3) % 2 === 0 ? DRONE_EYE : mix(DRONE_EYE, DRONE_BODY, 0.6))
}

function drawObstacles(p: Px, g: Game) {
  for (const o of g.obstacles) {
    const x = Math.round(o.x)
    const y = Math.round(obstacleY(o, g.h))
    if (o.kind === 'block') drawBlock(p, x, y, o.w, o.h)
    else drawDrone(p, g, x, y, o.w)
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

// A courier in a hood and a long scarf: visor, coat, two boots that swap as it runs and tuck
// in the air. The scarf streams behind and lifts on the way up.
function drawRunner(p: Px, g: Game) {
  const x = g.fx
  const y = Math.round(g.y)
  const flash = g.pulse > 0
  const coat = flash ? WHITE : COAT
  rect(p, x, y, RUN_W, 1, HOOD)
  put(p, x + 1, y, VISOR)
  rect(p, x, y + 1, RUN_W, 1, coat)
  rect(p, x, y + 2, RUN_W, 1, COAT_DARK)
  const air = y < standY(g.h)
  const stride = Math.floor(g.dist / 3) % 2 === 0
  if (air) {
    put(p, x, y + 3, BOOT)
    put(p, x + RUN_W - 1, y + 3, BOOT)
  } else {
    put(p, x + (stride ? 0 : 1), y + 3, BOOT)
    put(p, x + (stride ? 1 : 2), y + 3, BOOT)
  }
  const rising = g.vy < 0
  put(p, x - 1, y + (rising ? 0 : 1), SCARF)
  put(p, x - 2, y + (rising ? 0 : stride ? 1 : 2), mix(SCARF, SKY_BOTTOM, 0.35))
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const pix: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  drawSkyline(pix, g)
  drawGround(pix, g)
  drawObstacles(pix, g)
  drawCoins(pix, g)
  drawRunner(pix, g)

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
    if (g.overT >= 0.5) centered(Math.floor(rows / 2) + 1, ' press space ', 0xdde3f5)
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
