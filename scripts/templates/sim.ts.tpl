// Pure game logic for __TITLE__: steer a dot and collect coins. No clock, no I/O: `step` is
// deterministic given the state (the RNG seed lives inside it) and the input. Plain JSON state.
//
// The field is in pixels: w = columns, h = rows * 2 (a terminal cell is two half-block pixels).

export type Coin = { x: number; y: number; value: number; life: number }

// 0 up, 1 right, 2 down, 3 left
export type Input = {
  // the last tap: the dot keeps heading this way until the next one
  dir?: number
}

export type Game = {
  w: number
  h: number
  seed: number
  t: number
  score: number
  over: boolean
  x: number
  y: number
  dir: number
  coins: Coin[]
}

export const TOP = 2
export const SPEED = 18
export const REACH = 1.5
export const COIN_COUNT = 3
export const COIN_VALUE = 1
export const BONUS_VALUE = 5
export const BONUS_LIFE_S = 10
// plain coins never expire; JSON cannot hold Infinity
export const FOREVER = 1e9

export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

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

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function place(g: Game, value: number, life: number): void {
  const x = 1 + rand(g) * Math.max(0, g.w - 3)
  const y = TOP + 1 + rand(g) * Math.max(0, g.h - TOP - 3)
  g.coins.push({ x, y, value, life })
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = { w, h, seed, t: 0, score: 0, over: false, x: w / 2, y: (h + TOP) / 2, dir: 1, coins: [] }
  for (let i = 0; i < COIN_COUNT; i += 1) place(g, COIN_VALUE, FOREVER)

  return g
}

// Keep the dot and every coin inside a field of the new size.
export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  next.x = clamp(next.x, 0, w - 1)
  next.y = clamp(next.y, TOP, h - 1)
  for (const c of next.coins) {
    c.x = clamp(c.x, 0, w - 1)
    c.y = clamp(c.y, TOP, h - 1)
  }

  return next
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt
  if (input.dir !== undefined) g.dir = input.dir

  g.x = clamp(g.x + DX[g.dir]! * SPEED * dt, 0, g.w - 1)
  g.y = clamp(g.y + DY[g.dir]! * SPEED * dt, TOP, g.h - 1)

  for (const c of g.coins) c.life -= dt
  g.coins = g.coins.filter(c => c.life > 0)

  const kept: Coin[] = []
  for (const c of g.coins) {
    if (Math.abs(c.x - g.x) <= REACH && Math.abs(c.y - g.y) <= REACH) g.score += c.value
    else kept.push(c)
  }
  g.coins = kept
  // the field always holds its plain coins; bonus coins come and go on top
  while (g.coins.filter(c => c.value === COIN_VALUE).length < COIN_COUNT) place(g, COIN_VALUE, FOREVER)

  return g
}

// A bonus coin worth BONUS_VALUE that expires; a reward only, capped at two.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.coins.filter(c => c.value === BONUS_VALUE).length >= 2) return g
  place(g, BONUS_VALUE, BONUS_LIFE_S)

  return g
}
