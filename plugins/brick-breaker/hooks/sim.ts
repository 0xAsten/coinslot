// Pure game logic for brick-breaker. No clock, no I/O: `step` is deterministic
// given the state (the RNG seed lives inside it) and the input. Plain JSON state.

export type Ball = { x: number; y: number; vx: number; vy: number; stuck: boolean }
export type CapsuleKind = 'wide' | 'ball'
export type Capsule = { x: number; y: number; kind: CapsuleKind }
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number }

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2 (half-block cells).
  w: number
  h: number
  seed: number
  t: number
  score: number
  lives: number
  level: number
  over: boolean
  // seconds since the run ended; a key restarts it after RESTART_AFTER_S
  overT: number
  // seconds left of the LEVEL banner
  flash: number
  // ROWS x COLS, row-major; 0 empty, else a color index 1..6
  bricks: number[]
  balls: Ball[]
  capsules: Capsule[]
  particles: Particle[]
  padX: number
  padW: number
  wideT: number
}

export type Input = {
  padTo?: number
  nudge?: number
  launch?: boolean
  // any key or click: only used to leave the game-over screen
  any?: boolean
}

export const COLS = 10
export const ROWS = 6
export const START_LIVES = 3
export const MAX_BALLS = 3
export const MAX_CAPSULES = 2
// Each particle is one pixel and a pixel that moves recolors a cell, so this caps both the
// per-frame cost and the number of distinct Text runs in the Client tree (see render.test.ts).
export const MAX_PARTICLES = 100
export const WIDE_S = 10
export const RESTART_AFTER_S = 0.5
export const LEVEL_FLASH_S = 1.6
export const NUDGE = 4

export const HUD_PX = 2
export const BRICK_TOP = 3
export const PAD_H = 2
const BALL_SPEED = 42
const BALL_SPEED_MAX = 62
const CAPSULE_SPEED = 16
const GRAVITY = 46
const BURST = 16
const MAX_SUBSTEP = 0.8

// Layouts cycle; a digit is the brick's color, '.' a gap. Rows past what fits are dropped.
const LAYOUTS: string[][] = [
  ['1111111111', '2222222222', '3333333333', '4444444444', '5555555555', '6666666666'],
  ['1.1.1.1.1.', '.2.2.2.2.2', '3.3.3.3.3.', '.4.4.4.4.4', '5.5.5.5.5.', '.6.6.6.6.6'],
  ['....11....', '...2222...', '..333333..', '.44444444.', '5555555555', '6666666666'],
  ['1111111111', '..........', '2222222222', '.33333333.', '..........', '4444444444'],
]

export const brickH = (h: number): number => (h >= 36 ? 3 : 2)
export const visibleRows = (h: number): number =>
  clamp(Math.floor(((h - BRICK_TOP - 8) * 0.6) / brickH(h)), 1, ROWS)
export const padTop = (h: number): number => h - 4
export const paddleWidth = (w: number, wide: boolean): number => {
  const base = clamp(Math.round(w * 0.14), 8, 16)

  return wide ? Math.round(base * 1.6) : base
}
export const speedFor = (level: number): number => Math.min(BALL_SPEED + level * 3, BALL_SPEED_MAX)

export function rand(g: Game): number {
  // mulberry32
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

export const brickAt = (g: Game, col: number, row: number): number => g.bricks[row * COLS + col] ?? 0

function layout(level: number, h: number): number[] {
  const out = new Array<number>(COLS * ROWS).fill(0)
  const rows = LAYOUTS[level % LAYOUTS.length]!
  const vis = visibleRows(h)
  for (let r = 0; r < Math.min(vis, rows.length); r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const ch = rows[r]![c]!
      out[r * COLS + c] = ch === '.' ? 0 : Number(ch)
    }
  }

  return out
}

function park(g: Game): void {
  g.balls = [{ x: g.padX, y: padTop(g.h) - 1, vx: 0, vy: 0, stuck: true }]
}

function fresh(g: Game): void {
  g.score = 0
  g.lives = START_LIVES
  g.level = 0
  g.over = false
  g.overT = 0
  g.flash = 0
  g.bricks = layout(0, g.h)
  g.capsules = []
  g.wideT = 0
  g.padW = paddleWidth(g.w, false)
  g.padX = g.w / 2
  park(g)
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = {
    w,
    h,
    seed,
    t: 0,
    score: 0,
    lives: START_LIVES,
    level: 0,
    over: false,
    overT: 0,
    flash: 0,
    bricks: [],
    balls: [],
    capsules: [],
    particles: [],
    padX: w / 2,
    padW: paddleWidth(w, false),
    wideT: 0,
  }
  fresh(g)

  return g
}

export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  next.padW = paddleWidth(w, next.wideT > 0)
  next.padX = clamp(next.padX, next.padW / 2, w - next.padW / 2)
  const vis = visibleRows(h)
  for (let i = vis * COLS; i < next.bricks.length; i += 1) next.bricks[i] = 0
  for (const b of next.balls) {
    b.x = clamp(b.x, 1, w - 1)
    b.y = clamp(b.y, HUD_PX, h)
    if (b.stuck) {
      b.x = next.padX
      b.y = padTop(h) - 1
    }
  }
  for (const c of next.capsules) {
    c.x = clamp(c.x, 0, w)
    c.y = clamp(c.y, 0, h)
  }
  for (const p of next.particles) {
    p.x = clamp(p.x, 0, w)
    p.y = clamp(p.y, 0, h)
  }

  return next
}

function launchVelocity(g: Game, b: Ball, ang: number): void {
  const sp = speedFor(g.level)
  b.vx = sp * Math.sin(ang)
  b.vy = -sp * Math.cos(ang)
  b.stuck = false
}

function burst(g: Game, x: number, y: number, color: number): void {
  for (let i = 0; i < BURST; i += 1) {
    const a = rand(g) * Math.PI * 2
    const sp = 8 + rand(g) * 26
    const life = 0.45 + rand(g) * 0.55
    // a quarter are white-hot sparks that cool into the brick color
    g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 14, life, max: life, color: i % 4 === 0 ? 0xfff6d0 : color })
  }
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES)
}

// Palette index -> color; shared with the renderer.
export const BRICK_COLORS = [0, 0xe8484f, 0xf28b30, 0xf2d23c, 0x4cc46a, 0x3f8fe0, 0x9b5de5]

function brickCell(g: Game, x: number, y: number): number {
  const bw = g.w / COLS
  const col = Math.floor(x / bw)
  const row = Math.floor((y - BRICK_TOP) / brickH(g.h))
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS || y < BRICK_TOP) return -1

  return g.bricks[row * COLS + col]! > 0 ? row * COLS + col : -1
}

function spawnCapsule(g: Game, x: number, y: number): void {
  if (g.capsules.length >= MAX_CAPSULES) return
  g.capsules.push({ x: clamp(x, 3, g.w - 3), y, kind: rand(g) < 0.5 ? 'wide' : 'ball' })
}

function moveBall(g: Game, b: Ball, dt: number): void {
  const dist = Math.hypot(b.vx, b.vy) * dt
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP))
  const sdt = dt / n
  const top = padTop(g.h)
  for (let i = 0; i < n; i += 1) {
    const px = b.x
    const py = b.y
    b.x += b.vx * sdt
    b.y += b.vy * sdt

    if (b.x < 1) {
      b.x = 1
      b.vx = Math.abs(b.vx)
    } else if (b.x > g.w - 1) {
      b.x = g.w - 1
      b.vx = -Math.abs(b.vx)
    }
    if (b.y < HUD_PX) {
      b.y = HUD_PX
      b.vy = Math.abs(b.vy)
    }

    const k = brickCell(g, b.x, b.y)
    if (k >= 0) {
      // which face did it come through? the old row means sideways, the old column vertical
      const sideways = brickCell(g, b.x, py) === k
      const vertical = brickCell(g, px, b.y) === k
      if (sideways && !vertical) b.vx = -b.vx
      else if (vertical && !sideways) b.vy = -b.vy
      else {
        b.vx = -b.vx
        b.vy = -b.vy
      }
      b.x = px
      b.y = py

      const color = g.bricks[k]!
      g.bricks[k] = 0
      g.score += 10 * (7 - color)
      const bw = g.w / COLS
      const bh = brickH(g.h)
      const cx = (k % COLS) * bw + bw / 2
      const cy = BRICK_TOP + (Math.floor(k / COLS) + 0.5) * bh
      burst(g, cx, cy, BRICK_COLORS[color]!)

      return
    }

    if (b.vy > 0 && b.y + 1 >= top && b.y < top + PAD_H && Math.abs(b.x - g.padX) <= g.padW / 2 + 1) {
      const off = clamp((b.x - g.padX) / (g.padW / 2 + 1), -1, 1)
      const sp = speedFor(g.level)
      b.vx = sp * Math.sin(off * 1)
      b.vy = -sp * Math.cos(off * 1)
      b.y = top - 1
    }
  }
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt
  g.flash = Math.max(0, g.flash - dt)
  updateParticles(g, dt)

  if (g.over) {
    if (g.overT >= RESTART_AFTER_S && (input.any || input.launch)) fresh(g)
    else g.overT += dt

    return g
  }

  if (input.padTo !== undefined) g.padX = input.padTo
  if (input.nudge) g.padX += input.nudge
  g.wideT = Math.max(0, g.wideT - dt)
  g.padW = paddleWidth(g.w, g.wideT > 0)
  g.padX = clamp(g.padX, g.padW / 2, g.w - g.padW / 2)

  for (const b of g.balls) {
    if (!b.stuck) continue
    b.x = g.padX
    b.y = padTop(g.h) - 1
    if (input.launch) launchVelocity(g, b, (rand(g) - 0.5) * 0.6)
  }
  for (const b of g.balls) if (!b.stuck) moveBall(g, b, dt)
  g.balls = g.balls.filter(b => b.y <= g.h)

  updateCapsules(g, dt)

  if (g.balls.length === 0) {
    g.lives -= 1
    g.capsules = []
    if (g.lives <= 0) {
      g.lives = 0
      g.over = true
      g.overT = 0
    } else {
      park(g)
    }
  } else if (g.bricks.every(b => b === 0)) {
    g.level += 1
    g.score += 100 * g.level
    g.bricks = layout(g.level, g.h)
    g.capsules = []
    g.flash = LEVEL_FLASH_S
    park(g)
  }

  return g
}

function updateParticles(g: Game, dt: number): void {
  for (const p of g.particles) {
    p.life -= dt
    p.vy += GRAVITY * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  g.particles = g.particles.filter(p => p.life > 0 && p.y < g.h && p.x >= 0 && p.x < g.w)
}

function updateCapsules(g: Game, dt: number): void {
  const top = padTop(g.h)
  const kept: Capsule[] = []
  for (const c of g.capsules) {
    c.y += CAPSULE_SPEED * dt
    if (c.y + 1 >= top && c.y <= top + PAD_H && Math.abs(c.x - g.padX) <= g.padW / 2 + 2) {
      g.score += 25
      if (c.kind === 'wide') {
        g.wideT = WIDE_S
        g.padW = paddleWidth(g.w, true)
      } else if (g.balls.length < MAX_BALLS) {
        const b: Ball = { x: g.padX, y: top - 2, vx: 0, vy: 0, stuck: false }
        launchVelocity(g, b, (rand(g) < 0.5 ? -1 : 1) * (0.3 + rand(g) * 0.3))
        g.balls.push(b)
      }
      continue
    }
    if (c.y <= g.h) kept.push(c)
  }
  g.capsules = kept
}

// One capsule drops from the top at a random x; a reward, never a hazard, capped at two.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.over || g.capsules.length >= MAX_CAPSULES) return g
  spawnCapsule(g, 3 + rand(g) * (g.w - 6), HUD_PX)

  return g
}
