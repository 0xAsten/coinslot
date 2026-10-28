// Pure game logic for jump-runner. No clock, no I/O: `step` is deterministic given the
// state (the RNG seed lives inside it) and the input. Plain JSON state.
//
// Everything is in pixels (2 per terminal row, 1 per column). The world scrolls left under a
// runner who stays at a fixed x. A tap jumps with one fixed impulse, so the height never
// depends on how long a key is held (there is no key-up); one more tap in the air jumps again.

export type ObstacleKind = 'block' | 'drone'
export type Obstacle = {
  kind: ObstacleKind
  // left edge, pixels
  x: number
  w: number
  // a block stands on the ground; a drone hovers just above the runner's head
  h: number
}
export type Coin = { x: number; y: number }

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2.
  w: number
  h: number
  seed: number
  t: number
  // pixels run, and points from coins; score is derived from both
  dist: number
  bonusPts: number
  score: number
  over: boolean
  // seconds since the run ended; a key restarts it after RESTART_AFTER_S
  overT: number
  // world speed, px/s
  speed: number
  // runner: fixed x, top edge y and downward speed (px/s, up is negative)
  fx: number
  y: number
  vy: number
  // 0 on the ground, 1 after the ground jump, 2 once the air jump is used
  jumps: number
  // seconds since the last take-off
  airT: number
  obstacles: Obstacle[]
  // where the next obstacle's left edge will appear, already scrolling with the world
  nextX: number
  bonuses: Coin[]
  // seconds the runner flashes after a coin
  pulse: number
}

export type Input = {
  // jump (and, on the game-over screen, restart)
  tap?: boolean
}

// HUD (2 pixels) is the ceiling; the last pixel row is the ground line
export const CEIL = 2
export const RUN_W = 3
export const RUN_H = 4
// a drone's bottom edge is this far above the runner's head
export const DRONE_CLEARANCE = 1
export const COIN_SIZE = 2
// px/s², px/s up for the ground jump and for the air jump
export const GRAVITY = 90
export const IMPULSE = 40
export const AIR_IMPULSE = 34
// height of the ground jump: v²/2g, ~8.9 px
export const JUMP_H = (IMPULSE * IMPULSE) / (2 * GRAVITY)
// the air jump must come this long after take-off, so a double-press is one hop
export const AIR_LOCK_S = 0.12
export const START_SPEED = 22
export const MAX_SPEED = 50
// px/s gained per second of running: MAX_SPEED after 80 s
export const RAMP = 0.35
// Between one obstacle's right edge and the next one's left edge: at least MIN_GAP_S seconds of
// travel (a jump is ~0.9 s in the air) plus up to GAP_EXTRA_S more, at the speed when it spawns
// (+2 px/s for the ramp that happens before it arrives).
export const MIN_GAP_S = 1
export const GAP_EXTRA_S = 0.9
export const DIST_PER_POINT = 8
export const MAX_BONUSES = 2
export const BONUS_SCORE = 10
// a coin keeps this many pixels from any obstacle and from the other coin
export const COIN_MARGIN = 2
export const RESTART_AFTER_S = 0.5
export const PULSE_S = 0.18
// physics substep, so a long frame cannot skip over a 3-pixel block
const SUB_S = 1 / 60
const MAX_SUBS = 30

export const floorY = (h: number): number => h - 1
export const standY = (h: number): number => floorY(h) - RUN_H
export const runnerX = (w: number): number => Math.max(8, Math.min(20, Math.floor(w / 5)))
export const obstacleY = (o: Obstacle, h: number): number =>
  o.kind === 'drone' ? floorY(h) - RUN_H - DRONE_CLEARANCE - o.h : floorY(h) - o.h

// kind, width, height, weight
const SHAPES: readonly (readonly [ObstacleKind, number, number, number])[] = [
  ['block', 3, 3, 35],
  ['block', 4, 5, 25],
  ['block', 7, 3, 15],
  ['drone', 4, 2, 25],
]

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

function spawnObstacle(g: Game): void {
  let pick = rand(g) * 100
  let shape = SHAPES[0]!
  for (const s of SHAPES) {
    shape = s
    pick -= s[3]
    if (pick < 0) break
  }
  const [kind, w, h] = shape
  const x = g.nextX
  g.obstacles.push({ kind, x, w, h })
  g.nextX = x + w + (g.speed + 2) * (MIN_GAP_S + rand(g) * GAP_EXTRA_S)
}

function fresh(g: Game): void {
  g.score = 0
  g.dist = 0
  g.bonusPts = 0
  g.over = false
  g.overT = 0
  g.pulse = 0
  g.speed = START_SPEED
  g.y = standY(g.h)
  g.vy = 0
  g.jumps = 0
  g.airT = 0
  g.bonuses = []
  g.obstacles = []
  g.nextX = g.w + 6 + rand(g) * 10
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = {
    w,
    h,
    seed,
    t: 0,
    dist: 0,
    bonusPts: 0,
    score: 0,
    over: false,
    overT: 0,
    speed: START_SPEED,
    fx: runnerX(w),
    y: 0,
    vy: 0,
    jumps: 0,
    airT: 0,
    obstacles: [],
    nextX: 0,
    bonuses: [],
    pulse: 0,
  }
  fresh(g)

  return g
}

const coinY = (h: number): number => standY(h) + 1

// The ground moves with the window: a runner on it stays on it, one in the air keeps its
// height above it (inside the ceiling). Everything else keeps its x.
export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  const lift = Math.max(0, standY(g.h) - g.y)
  next.w = w
  next.h = h
  next.fx = Math.min(next.fx, w - RUN_W - 3)
  next.y = Math.max(CEIL, Math.min(standY(h), standY(h) - lift))
  if (lift === 0) next.y = standY(h)
  for (const c of next.bonuses) c.y = coinY(h)

  return next
}

function end(g: Game): void {
  g.over = true
  g.overT = 0
}

const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by

function move(g: Game, dt: number): void {
  g.speed = Math.min(MAX_SPEED, g.speed + RAMP * dt)
  const dx = g.speed * dt
  g.dist += dx
  g.score = Math.floor(g.dist / DIST_PER_POINT) + g.bonusPts
  for (const o of g.obstacles) o.x -= dx
  for (const c of g.bonuses) c.x -= dx
  g.nextX -= dx

  g.vy += GRAVITY * dt
  g.y += g.vy * dt
  if (g.jumps > 0) g.airT += dt
  const top = standY(g.h)
  if (g.y >= top) {
    g.y = top
    g.vy = 0
    g.jumps = 0
    g.airT = 0
  } else if (g.y < CEIL) {
    g.y = CEIL
    g.vy = Math.max(0, g.vy)
  }

  for (const o of g.obstacles) {
    if (overlap(g.fx, g.y, RUN_W, RUN_H, o.x, obstacleY(o, g.h), o.w, o.h)) {
      end(g)

      return
    }
  }
  const at = g.bonuses.findIndex(c => overlap(g.fx, g.y, RUN_W, RUN_H, c.x, c.y, COIN_SIZE, COIN_SIZE))
  if (at >= 0) {
    g.bonuses.splice(at, 1)
    g.bonusPts += BONUS_SCORE
    g.score += BONUS_SCORE
    g.pulse = PULSE_S
  }
}

function jump(g: Game): void {
  if (g.jumps === 0) {
    g.vy = -IMPULSE
    g.jumps = 1
    g.airT = 0
  } else if (g.jumps === 1 && g.airT >= AIR_LOCK_S) {
    g.vy = -AIR_IMPULSE
    g.jumps = 2
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

  if (input.tap) jump(g)
  const n = Math.max(1, Math.min(MAX_SUBS, Math.ceil(dt / SUB_S)))
  for (let i = 0; i < n && !g.over; i += 1) move(g, dt / n)

  g.obstacles = g.obstacles.filter(o => o.x + o.w > 0)
  g.bonuses = g.bonuses.filter(c => c.x + COIN_SIZE > 0)
  while (!g.over && g.nextX <= g.w) spawnObstacle(g)

  return g
}

// A glowing coin on the running path, worth BONUS_SCORE, in a stretch of ground that is clear
// of obstacles (including the one about to appear). At most two; it changes nothing but the
// score. Coins prefer to appear off the right edge and only pop in on screen when the next
// obstacle is too close for that.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.over || g.bonuses.length >= MAX_BONUSES) return g

  // forbidden spans, left to right: every obstacle, the pending one, the other coin
  const spans: [number, number][] = g.obstacles.map(o => [o.x - COIN_MARGIN, o.x + o.w + COIN_MARGIN])
  for (const c of g.bonuses) spans.push([c.x - COIN_MARGIN, c.x + COIN_SIZE + COIN_MARGIN])
  spans.push([g.nextX - COIN_MARGIN, Infinity])
  spans.sort((a, b) => a[0] - b[0])

  // a coin at x needs x >= a and x + COIN_SIZE <= b for a free stretch [a, b]
  const free: [number, number][] = []
  let cursor = g.fx + RUN_W + 6
  for (const [l, r] of spans) {
    if (l - cursor >= COIN_SIZE) free.push([cursor, l - COIN_SIZE])
    cursor = Math.max(cursor, r)
  }
  const offscreen = free.filter(([, hi]) => hi >= g.w).map(([lo, hi]) => [Math.max(lo, g.w), hi] as [number, number])
  const pool = offscreen.length > 0 ? offscreen : free
  if (pool.length === 0) return g
  const [lo, hi] = pool[Math.floor(rand(g) * pool.length)]!
  g.bonuses.push({ x: lo + rand(g) * (hi - lo), y: coinY(g.h) })

  return g
}
