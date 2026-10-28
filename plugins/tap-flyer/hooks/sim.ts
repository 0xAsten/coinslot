// Pure game logic for tap-flyer. No clock, no I/O: `step` is deterministic given the
// state (the RNG seed lives inside it) and the input. Plain JSON state.
//
// Everything is in pixels (2 per terminal row, 1 per column). Pillars scroll left at a fixed
// speed; the flyer sits at a fixed x and only moves up and down. A tap is one impulse: there
// is no key-up, so holding a key does nothing a second tap would not.

export type Pillar = {
  // left edge, pixels
  x: number
  // the open gap: top edge and height
  gapY: number
  gapH: number
  scored: boolean
}
export type Coin = { x: number; y: number }

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2.
  w: number
  h: number
  seed: number
  t: number
  score: number
  over: boolean
  // seconds since the run ended; a key restarts it after RESTART_AFTER_S
  overT: number
  // flyer: fixed x, top edge y and downward speed (px/s, up is negative)
  fx: number
  y: number
  vy: number
  obstacles: Pillar[]
  bonuses: Coin[]
  // seconds the flyer flashes after a coin
  pulse: number
}

export type Input = {
  // any key or click: one upward impulse (and, on the game-over screen, a restart)
  tap?: boolean
}

// HUD (2 pixels) is the ceiling; the last pixel row is the ground
export const CEIL = 2
export const FLY_W = 3
export const FLY_H = 2
export const OBST_W = 4
export const COIN_SIZE = 2
// px/s², px/s up per tap, px/s terminal fall speed. One tap lifts v²/2g ≈ 4 px.
export const GRAVITY = 60
export const IMPULSE = 22
export const FALL_MAX = 34
// pillars scroll at a constant speed; nothing in the game speeds it up
export const SCROLL = 20
// left edge to left edge
export const SPACING = 32
// gap height: GAP_START shrinking one pixel per GAP_STEP_SCORE points down to GAP_MIN
export const GAP_START = 14
export const GAP_MIN = 9
export const GAP_STEP_SCORE = 4
// a pillar's top and bottom wall are at least this tall
export const WALL_MIN = 2
// the next gap's centre moves at most this far from the last one (a tap run climbs ~19 px/s)
export const GAP_SHIFT = 8
export const MAX_BONUSES = 2
export const BONUS_SCORE = 3
export const RESTART_AFTER_S = 0.5
export const PULSE_S = 0.18
// physics substep, so a long frame cannot skip over a 4-pixel pillar
const SUB_S = 1 / 60
const MAX_SUBS = 30
const START_PILLARS = 3

export const floorY = (h: number): number => h - 1
export const flyerX = (w: number): number => Math.max(8, Math.min(24, Math.floor(w / 4)))

export const gapFor = (score: number, h: number): number => {
  const room = floorY(h) - CEIL - WALL_MIN * 2 - 1
  const want = GAP_START - Math.floor(score / GAP_STEP_SCORE)

  return Math.max(GAP_MIN, Math.min(want, room))
}

export function rand(g: Game): number {
  // mulberry32
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

const clampGapY = (y: number, gapH: number, h: number): number =>
  Math.max(CEIL + WALL_MIN, Math.min(floorY(h) - WALL_MIN - gapH, y))

function spawnPillar(g: Game, x: number): void {
  const gapH = gapFor(g.score, g.h)
  const last = g.obstacles[g.obstacles.length - 1]
  const mid = last ? last.gapY + last.gapH / 2 : (CEIL + floorY(g.h)) / 2
  const centre = mid + (rand(g) * 2 - 1) * GAP_SHIFT
  g.obstacles.push({ x, gapY: Math.round(clampGapY(centre - gapH / 2, gapH, g.h)), gapH, scored: false })
}

function fresh(g: Game): void {
  g.score = 0
  g.over = false
  g.overT = 0
  g.pulse = 0
  g.bonuses = []
  g.obstacles = []
  g.y = Math.round((CEIL + floorY(g.h) - FLY_H) / 2)
  // a first hop, so the opening fall is not the player's first problem
  g.vy = -IMPULSE
  for (let i = 0; i < START_PILLARS; i += 1) spawnPillar(g, g.w + i * SPACING)
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = {
    w,
    h,
    seed,
    t: 0,
    score: 0,
    over: false,
    overT: 0,
    fx: flyerX(w),
    y: 0,
    vy: 0,
    obstacles: [],
    bonuses: [],
    pulse: 0,
  }
  fresh(g)

  return g
}

const pillarAt = (g: Game, c: Coin): Pillar | undefined =>
  g.obstacles.find(p => c.x >= p.x && c.x + COIN_SIZE <= p.x + OBST_W)

const coinY = (p: Pillar): number => Math.round(p.gapY + p.gapH / 2 - COIN_SIZE / 2)

// Gaps are re-fitted to the new height and everything stays where it is in x; coins follow
// their gap, and any that lost it are dropped.
export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  next.fx = Math.min(next.fx, w - FLY_W - 3)
  for (const p of next.obstacles) {
    p.gapH = Math.max(GAP_MIN, Math.min(p.gapH, gapFor(0, h)))
    p.gapY = clampGapY(p.gapY, p.gapH, h)
  }
  const coins: Coin[] = []
  for (const c of next.bonuses) {
    const p = pillarAt(next, c)
    if (p) coins.push({ x: c.x, y: coinY(p) })
  }
  next.bonuses = coins
  next.y = Math.max(CEIL, Math.min(floorY(h) - FLY_H, next.y))

  return next
}

function end(g: Game): void {
  g.over = true
  g.overT = 0
}

const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by

function move(g: Game, dt: number): void {
  g.vy = Math.min(FALL_MAX, g.vy + GRAVITY * dt)
  g.y += g.vy * dt
  if (g.y < CEIL) {
    g.y = CEIL
    g.vy = Math.max(0, g.vy)
  }
  const dx = SCROLL * dt
  for (const p of g.obstacles) p.x -= dx
  for (const c of g.bonuses) c.x -= dx

  if (g.y + FLY_H >= floorY(g.h)) {
    g.y = floorY(g.h) - FLY_H
    end(g)

    return
  }
  for (const p of g.obstacles) {
    if (!overlap(g.fx, g.y, FLY_W, FLY_H, p.x, CEIL, OBST_W, floorY(g.h) - CEIL)) continue
    if (g.y < p.gapY || g.y + FLY_H > p.gapY + p.gapH) {
      end(g)

      return
    }
  }
  for (const p of g.obstacles) {
    if (!p.scored && p.x + OBST_W <= g.fx) {
      p.scored = true
      g.score += 1
    }
  }
  const at = g.bonuses.findIndex(c => overlap(g.fx, g.y, FLY_W, FLY_H, c.x, c.y, COIN_SIZE, COIN_SIZE))
  if (at >= 0) {
    g.bonuses.splice(at, 1)
    g.score += BONUS_SCORE
    g.pulse = PULSE_S
  }
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt
  g.pulse = Math.max(0, g.pulse - dt)

  if (g.over) {
    if (g.overT >= RESTART_AFTER_S && input.tap) fresh(g)
    else g.overT += dt

    return g
  }

  if (input.tap) g.vy = -IMPULSE
  const n = Math.max(1, Math.min(MAX_SUBS, Math.ceil(dt / SUB_S)))
  for (let i = 0; i < n && !g.over; i += 1) move(g, dt / n)

  g.obstacles = g.obstacles.filter(p => p.x + OBST_W > 0)
  g.bonuses = g.bonuses.filter(c => c.x + COIN_SIZE > 0)
  const last = g.obstacles[g.obstacles.length - 1]
  if (!g.over && (!last || last.x + SPACING <= g.w)) spawnPillar(g, g.w)

  return g
}

// A glowing coin in the middle of an upcoming gap, worth BONUS_SCORE. At most two, one per
// pillar, never in a wall, and it changes nothing but the board.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.over || g.bonuses.length >= MAX_BONUSES) return g
  const open = g.obstacles.filter(p => p.x > g.fx + FLY_W + 1 && !g.bonuses.some(c => pillarAt(g, c) === p))
  if (open.length === 0) return g
  const p = open[Math.floor(rand(g) * open.length)]!
  g.bonuses.push({ x: p.x + (OBST_W - COIN_SIZE) / 2, y: coinY(p) })

  return g
}
