// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); the HUD and banners are characters drawn over the cells.
import { BOSS_H, BOSS_W, ENEMY_COLORS, HUD_PX, LIVES, MAX_WEAPON, SHIP_H, SHIP_W } from './sim'
import type { Enemy, Game } from './sim'

import type { Cells } from './shared/cells'

const HINT = 'mouse/arrows move · auto-fire · esc back to chat'
const SKY_TOP = 0x05061c
const SKY_BOTTOM = 0x1a1540
const WHITE = 0xffffff
const COIN = 0xffe45a
const HUD_BG = 0x15163a
const SHIELD = 0x3ad7e8

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

// Night gradient; rebuilt on resize only. Stars scroll on top, per frame.
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

function rect(p: Px, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(p, x + i, y + j, c)
}

// A sprite is rows of palette letters, '.' transparent; drawn centered on (cx, cy).
function sprite(p: Px, rows: string[], pal: Record<string, number>, cx: number, cy: number, flash = false) {
  const x0 = Math.round(cx - rows[0]!.length / 2)
  const y0 = Math.round(cy - rows.length / 2)
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) {
      const k = row[i]!
      if (k !== '.') put(p, x0 + i, y0 + j, flash ? WHITE : pal[k]!)
    }
  })
}

const SHIP = ['.dd....', 'aaccwww', '.dd....']
const SHIP_PAL = { a: 0xb9c6e8, c: 0x4a6fe0, w: 0xffffff, d: 0x7d6ae0 }
const SPRITES: Record<Exclude<Enemy['kind'], 'boss'>, { rows: string[]; pal: Record<string, number> }> = {
  drone: { rows: ['m...m', 'mmwmm', '.m.m.'], pal: { m: ENEMY_COLORS.drone, w: 0xffe9a8 } },
  wavey: { rows: ['.ggg.', 'gwgwg', 'g.g.g'], pal: { g: ENEMY_COLORS.wavey, w: 0xf4ffd0 } },
  tank: { rows: ['.oooo.', 'oOwwOo', 'oOOOOo', '.o..o.'], pal: { o: ENEMY_COLORS.tank, O: 0xb85c14, w: 0xffe9a8 } },
  gunner: { rows: ['.vvv.', 'bvwvv', '.vvv.'], pal: { v: ENEMY_COLORS.gunner, b: 0xe4eaf8, w: 0xffe9a8 } },
}
const BOSS = [
  '...rrrrrr...',
  '..rRrrrrRr..',
  '.rrwwrrwwrr.',
  'rrrwkrrwkrrr',
  'rRrrrrrrrrRr',
  '.rrbbbbbbrr.',
  '..rRrrrrRr..',
  '...rr..rr...',
]
const BOSS_PAL = { r: ENEMY_COLORS.boss, R: 0x9c2a30, w: 0xffffff, k: 0x15163a, b: 0xffd24a }

function drawStars(p: Px, g: Game) {
  const n = Math.floor((g.w * g.h) / 260)
  for (let i = 0; i < n; i += 1) {
    const layer = 1 + (i % 3)
    const x = (((hash(i * 2 + 1) * g.w - g.t * 4 * layer) % g.w) + g.w) % g.w
    const y = HUD_PX + Math.floor(hash(i * 2 + 2) * (g.h - HUD_PX))
    put(p, x, y, layer === 3 ? 0x9a98d8 : 0x5a58a0)
  }
}

function drawShip(p: Px, g: Game) {
  const { x, y } = g.ship
  // blink while invulnerable
  if (g.inv > 0 && Math.floor(g.t * 10) % 2 === 0) return
  sprite(p, SHIP, SHIP_PAL, x, y)
  // engine flame
  const flick = Math.floor(g.t * 20) % 2
  put(p, Math.round(x - SHIP_W / 2) - 1, Math.round(y), flick ? 0xffd24a : 0xff8a30)
  if (g.shield) {
    const x0 = Math.round(x - SHIP_W / 2) - 1
    const y0 = Math.round(y - SHIP_H / 2) - 1
    for (let i = 1; i < SHIP_W + 1; i += 1) {
      put(p, x0 + i, y0, SHIELD)
      put(p, x0 + i, y0 + SHIP_H + 1, SHIELD)
    }
    for (let j = 1; j < SHIP_H + 1; j += 1) {
      put(p, x0, y0 + j, SHIELD)
      put(p, x0 + SHIP_W + 1, y0 + j, SHIELD)
    }
  }
}

function drawEnemies(p: Px, g: Game) {
  for (const e of g.enemies) {
    const flash = e.hitT > 0
    if (e.kind === 'boss') sprite(p, BOSS, BOSS_PAL, e.x, e.y, flash)
    else sprite(p, SPRITES[e.kind].rows, SPRITES[e.kind].pal, e.x, e.y, flash)
  }
}

function drawShots(p: Px, g: Game) {
  for (const s of g.shots) {
    put(p, s.x - 1, s.y, 0xfff6d0)
    put(p, s.x, s.y, 0xffd24a)
  }
  for (const b of g.bullets) rect(p, Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2, 0xff6a3c)
}

function drawPods(p: Px, g: Game) {
  for (const pod of g.pods) {
    const body = pod.kind === 'weapon' ? 0xff6fb5 : SHIELD
    const lit = Math.sin(g.t * 12) > 0
    const x = Math.round(pod.x) - 2
    const y = Math.round(pod.y) - 1
    rect(p, x, y, 5, 3, lit ? mix(body, WHITE, 0.5) : body)
    rect(p, x, y, 1, 3, mix(body, 0x000000, 0.4))
    rect(p, x + 4, y, 1, 3, mix(body, 0x000000, 0.4))
  }
}

function drawParticles(p: Px, g: Game) {
  for (const q of g.particles) {
    const t = Math.max(0, q.life / q.max)
    const ix = Math.floor(q.x)
    const iy = Math.floor(q.y)
    if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) continue
    p.buf[iy * p.w + ix] = mix(p.buf[iy * p.w + ix]!, q.color, Math.min(1, t * 1.6))
  }
}

export function renderCells(g: Game): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const px: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  drawStars(px, g)
  drawPods(px, g)
  drawEnemies(px, g)
  drawShots(px, g)
  drawShip(px, g)
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

  const boss = g.enemies.find(e => e.kind === 'boss')
  if (g.over) {
    centered(Math.floor(rows / 2) - 1, ' GAME OVER ', 0xff5a5f)
    centered(Math.floor(rows / 2), ` SCORE ${g.score}  WAVE ${g.wave} `, COIN)
    if (g.overT >= 0.5) centered(Math.floor(rows / 2) + 1, ' press any key ', 0xdde3f5)
  } else {
    if (g.gapT > 0) centered(Math.floor(rows / 2) - 2, g.wave % 5 === 0 ? ` WAVE ${g.wave} · BOSS ` : ` WAVE ${g.wave} `, COIN)
    if (boss) {
      const len = Math.min(20, Math.max(6, cols - 12))
      const on = Math.max(0, Math.round((boss.hp / boss.maxHp) * len))
      text(cols - len - 6, 1, 'BOSS ', 0xdde3f5)
      text(cols - len - 1, 1, '█'.repeat(on), 0xe8484f)
      text(cols - len - 1 + on, 1, '░'.repeat(len - on), 0x6a68a8)
    }
  }

  // HUD row, painted over the top of the field.
  const left = ` SCORE ${g.score}  WAVE ${g.wave}  `
  const hearts = '♥'.repeat(g.lives)
  const empty = '♡'.repeat(Math.max(0, LIVES - g.lives))
  const gear = ` W${Math.min(g.weapon, MAX_WEAPON)}${g.shield ? ' ◈' : ''}`
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
  paint(left.length + LIVES, gear, SHIELD)
  const used = left.length + LIVES + gear.length
  if (cols >= used + HINT.length + 2) paint(cols - HINT.length - 1, HINT, 0x8e93c4)
  for (let x = 0; x < cols; x += 1) {
    ch[x] = hud[x]!
    fg[x] = hudFg[x]!
    bg[x] = HUD_BG
  }

  return { cols, rows, ch, fg, bg }
}
