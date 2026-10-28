// Pure renderer: Game -> cells. Pixels are half-block halves (2 per cell
// vertically); text overlays (net rings, "+N", HUD) are drawn on the cells.
import { cannonPos } from './sim'
import type { Creature, Game } from './sim'

import type { Cells } from './shared/cells'

const STOPS = [0xb2f4e8, 0x4ad6d6, 0x1aa8ca, 0x0e80b6, 0x0a5a8a]
const HINT = 'click/space fire · ←→ aim · ↑↓ bet · esc back to chat'

const rgb = (c: number): [number, number, number] => [
  (c >> 16) & 255,
  (c >> 8) & 255,
  c & 255,
]
const pack = (r: number, g: number, b: number) =>
  (Math.max(0, Math.min(255, Math.round(r))) << 16) |
  (Math.max(0, Math.min(255, Math.round(g))) << 8) |
  Math.max(0, Math.min(255, Math.round(b)))

export function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a)
  const [br, bg, bb] = rgb(b)

  return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

function gradient(t: number): number {
  const f = Math.max(0, Math.min(0.9999, t)) * (STOPS.length - 1)
  const i = Math.floor(f)

  return mix(STOPS[i]!, STOPS[i + 1]!, f - i)
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

// Lagoon gradient plus static reef blobs at the edges; rebuilt on resize only.
function background(w: number, h: number): Uint32Array {
  const key = `${w}x${h}`
  if (key === cacheKey) return cache
  const buf = new Uint32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      buf[y * w + x] = gradient((x / w + y / h) / 2)
    }
  }
  const coral = [0xd9486a, 0xf08a5d, 0x8a52b0, 0xe8648a, 0x0b4f78]
  const blob = (cx: number, cy: number, r: number, color: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y += 1) {
      for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const d = Math.hypot(x - cx, (y - cy) * 1.1)
        if (d <= r) buf[y * w + x] = mix(color, 0x06304f, (d / r) * 0.35)
      }
    }
  }
  const side = Math.max(6, Math.floor(w * 0.2))
  for (let i = 0; i < 9; i += 1) {
    const color = coral[Math.floor(hash(i + 1) * coral.length)]!
    const r = 3 + hash(i + 20) * 4
    blob(hash(i + 40) * side * 0.9, h - hash(i + 60) * 7, r, color)
    blob(w - hash(i + 80) * side * 0.9, h - hash(i + 100) * 7, r, color)
  }
  for (let i = 0; i < 4; i += 1) {
    blob(w - hash(i + 120) * 6, hash(i + 140) * 8, 2.5 + hash(i + 160) * 3, coral[i % 4]!)
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

function disc(p: Px, cx: number, cy: number, r: number, c: number) {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) {
    for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) put(p, x, y, c)
    }
  }
}

function glints(p: Px, t: number) {
  const n = Math.floor((p.w * p.h) / 160)
  for (let i = 0; i < n; i += 1) {
    const x = (hash(i * 3 + 1) * p.w + t * (1.5 + hash(i + 7) * 2)) % p.w
    const y = hash(i * 3 + 2) * p.h
    const s = Math.sin(t * 1.4 + hash(i) * 6.28) * Math.sin(t * 0.8 + hash(i + 3) * 6.28)
    if (s > 0.45) {
      const ix = Math.floor(x)
      const iy = Math.floor(y)
      const idx = iy * p.w + ix
      p.buf[idx] = mix(p.buf[idx]!, 0xe8fffb, Math.min(0.8, (s - 0.4) * 1.6))
    }
  }
}

function hibiscus(p: Px, t: number) {
  for (let i = 0; i < 3; i += 1) {
    const span = p.w + 12
    const x = ((hash(i + 300) * span + t * (1.2 + i * 0.4)) % span) - 6
    const y = p.h * (0.25 + 0.22 * i) + Math.sin(t * 0.6 + i * 2) * 3
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2 + t * 0.3
      disc(p, x + Math.cos(a) * 1.3, y + Math.sin(a) * 1.3, 1.1, 0xef3b5a)
    }
    put(p, x, y, 0xffd61f)
  }
}

const WHITE = 0xffffff
const GOLD_LIGHT = 0xfff6b0

function shape(c: Creature, u: number, v: number): number {
  switch (c.kind) {
    case 'fish': {
      if ((u / 3) ** 2 + (v / 1.6) ** 2 < 1) {
        if (u > 1.2 && u < 2.2 && v > -1 && v < 0) return 0x15324a
        if (c.golden) return v < -0.6 ? GOLD_LIGHT : 0xffb300

        return v < -0.6 ? 0xffe866 : 0xffd61f
      }
      if (u < -2.2 && u > -5 && Math.abs(v) < (-u - 2.2) * 0.75 + 0.3) return c.golden ? 0xff8a00 : 0xf0b400

      return -1
    }
    case 'turtle': {
      if ((u / 3) ** 2 + (v / 2.6) ** 2 < 1) return 0xb39a4a
      if ((u / 5) ** 2 + (v / 4) ** 2 < 1) return 0x7d6a2e
      if (((u - 6.2) / 1.7) ** 2 + (v / 1.5) ** 2 < 1) return 0x9bb35a
      for (const [fu, fv] of [[2.5, 4.4], [2.5, -4.4], [-2.5, 3.8], [-2.5, -3.8]] as const) {
        if (((u - fu) / 2.4) ** 2 + ((v - fv) / 1.2) ** 2 < 1) return 0x6d9a52
      }

      return -1
    }
    case 'manta': {
      const body = Math.abs(v) / 10 + Math.abs(u - 1) / 6.5
      if (body < 1) {
        for (const s of [-1, 1]) {
          if (((u - 1) / 2.4) ** 2 + ((v - s * 3.6) / 1.3) ** 2 < 1) return WHITE
        }

        return 0x1e2b3a
      }
      if (u < -4 && u > -13 && Math.abs(v) < 0.6) return 0x1e2b3a
      if (u > 5 && u < 8.5 && Math.abs(Math.abs(v) - 2.2) < 0.9) return 0x2a3d52

      return -1
    }
    default: {
      if ((u / 14) ** 2 + (v / 6) ** 2 < 1) {
        if (u > 8 && u < 10 && v > -2.5 && v < -1.5) return 0x0c1822

        return v > 2.4 ? 0xc9d9e6 : 0x3c5a78
      }
      if (u < -12 && u > -20 && Math.abs(v) < Math.min(6, (-u - 12) * 1.1 + 1)) return 0x34506b

      return -1
    }
  }
}

function drawCreature(p: Px, c: Creature, t: number) {
  const cos = Math.cos(c.ang)
  const sin = Math.sin(c.ang)
  const R = Math.ceil(c.r + 7)
  const blink = c.caught && Math.floor(c.flash * 14) % 2 === 0
  for (let dy = -R; dy <= R; dy += 1) {
    for (let dx = -R; dx <= R; dx += 1) {
      const u = dx * cos + dy * sin
      let v = -dx * sin + dy * cos
      if (cos < 0) v = -v
      const col = shape(c, u, v)
      if (col < 0) continue
      let out = col
      if (blink) out = WHITE
      else if (c.flash > 0) out = mix(col, WHITE, 0.55)
      put(p, c.x + dx, c.y + dy + Math.sin(t * 6 + c.id) * 0.3, out)
    }
  }
}

function drawCannon(p: Px, g: Game) {
  const c = cannonPos(g)
  const raw = Math.atan2(g.aimY - c.y, g.aimX - c.x)
  const ang = Math.max(-Math.PI + 0.12, Math.min(-0.12, raw))
  for (let i = 0; i < 8; i += 1) {
    disc(p, c.x + Math.cos(ang) * i, c.y + Math.sin(ang) * i, 1.2, 0xc9a64a)
  }
  for (let y = 0; y < 4; y += 1) {
    for (let x = -5 + y; x <= 5 - y; x += 1) {
      put(p, c.x + x, c.y + 1 + y, y === 0 ? 0x5a6070 : 0x3b3f4a)
    }
  }
  disc(p, c.x, c.y + 0.5, 2.2, 0x7a7f90)
}

export function renderCells(g: Game, hintOn = true): Cells {
  const cols = g.w
  const rows = Math.floor(g.h / 2)
  const px: Px = { buf: new Uint32Array(background(g.w, g.h)), w: g.w, h: g.h }

  glints(px, g.t)
  hibiscus(px, g.t)

  // Aim guide: a dotted line from the muzzle to the aim point.
  const cn = cannonPos(g)
  const len = Math.hypot(g.aimX - cn.x, g.aimY - cn.y)
  for (let d = 10; d < len; d += 5) {
    const f = d / len
    const x = cn.x + (g.aimX - cn.x) * f
    const y = cn.y + (g.aimY - cn.y) * f
    const idx = Math.floor(y) * px.w + Math.floor(x)
    if (idx >= 0 && idx < px.buf.length) px.buf[idx] = mix(px.buf[idx]!, WHITE, 0.45)
  }

  const order = [...g.creatures].sort((a, b) => b.r - a.r)
  for (const c of order) drawCreature(px, c, g.t)
  drawCannon(px, g)
  for (const s of g.shots) disc(px, s.x, s.y, 1.3, WHITE)

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

  // Net rings, drawn as characters.
  for (const n of g.nets) {
    const fade = n.age / 0.6
    const color = mix(WHITE, 0x4ad6d6, fade)
    const steps = Math.max(12, Math.floor(n.r * 5))
    for (let k = 0; k < steps; k += 1) {
      const a = (k / steps) * Math.PI * 2
      text(Math.round(n.x + Math.cos(a) * n.r), Math.round((n.y + Math.sin(a) * n.r) / 2), k % 2 ? 'o' : '°', color)
    }
    for (let y = -n.r; y <= n.r; y += 2) {
      for (let x = -n.r; x <= n.r; x += 2) {
        if (Math.hypot(x, y) < n.r - 1) text(Math.round(n.x + x), Math.round((n.y + y) / 2), '·', color)
      }
    }
  }

  const ax = Math.floor(g.aimX)
  const ay = Math.floor(g.aimY / 2)
  text(ax, ay, '+', WHITE)

  for (const p of g.pops) text(Math.round(p.x) - 1, Math.round(p.y / 2), p.text, 0xffe45a)

  // HUD row, painted over the top of the field.
  const hud = ` ¢ ${g.coins}  bet x${g.bet}   ${hintOn ? HINT : ''}`.slice(0, cols).padEnd(cols)
  for (let x = 0; x < cols; x += 1) {
    ch[x] = hud[x]!
    fg[x] = x < 22 ? 0xffe45a : 0xdff7f4
    bg[x] = 0x083a5c
  }
  if (g.coins < g.bet) {
    const msg = ' out of coins - press r to refill '
    text(Math.floor((cols - msg.length) / 2), 2, msg, 0xffe45a)
    for (let k = 0; k < msg.length; k += 1) {
      const i = 2 * cols + Math.floor((cols - msg.length) / 2) + k
      if (ch[i] !== undefined) bg[i] = 0x083a5c
    }
  }

  return { cols, rows, ch, fg, bg }
}
