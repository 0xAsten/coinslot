// Pure game logic for snake. No clock, no I/O: `step` is deterministic given the
// state (the RNG seed lives inside it) and the input. Plain JSON state.
//
// A cell is 2 columns by 2 half-block pixels, so it looks square. The grid sits inside a
// 1-pixel frame, under a HUD row.

export type Cell = { x: number; y: number }
export type Bonus = Cell & { life: number }

// 0 up, 1 right, 2 down, 3 left
export type Dir = 0 | 1 | 2 | 3

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2.
  w: number
  h: number
  // grid size in cells
  gw: number
  gh: number
  seed: number
  t: number
  score: number
  over: boolean
  // seconds since the run ended; a key restarts it after RESTART_AFTER_S
  overT: number
  // head first
  snake: Cell[]
  dir: number
  // turns waiting for a step, at most MAX_QUEUE, each already legal after the one before
  queue: number[]
  food: Cell | null
  bonuses: Bonus[]
  // time banked toward the next grid step
  acc: number
  // seconds the head flashes after eating
  pulse: number
}

export type Input = {
  turns?: number[]
  // any key or click: only used to leave the game-over screen
  any?: boolean
}

export const CELL_W = 2
export const CELL_H = 2
export const FRAME_X = 1
// HUD row (2 pixels) plus the top frame line
export const FIELD_Y = 3
export const START_LEN = 3
export const MAX_QUEUE = 2
export const MAX_BONUSES = 2
export const FOOD_SCORE = 1
export const BONUS_SCORE = 5
export const BONUS_LIFE_S = 12
export const RESTART_AFTER_S = 0.5
export const PULSE_S = 0.18
// seconds per grid step: START at the first length, shaving STEP_GAIN per cell grown, never below MIN
export const STEP_START_S = 0.16
export const STEP_MIN_S = 0.075
export const STEP_GAIN_S = 0.0025
// float slack so dt = interval always lands one step
const EPS = 1e-9

export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

export const gridW = (w: number): number => Math.max(1, Math.floor((w - FRAME_X * 2) / CELL_W))
export const gridH = (h: number): number => Math.max(1, Math.floor((h - FIELD_Y - 1) / CELL_H))

export const stepInterval = (len: number): number =>
  Math.max(STEP_MIN_S, STEP_START_S - STEP_GAIN_S * Math.max(0, len - START_LEN))

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

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y

// the direction a new turn is judged against: the last one waiting, else the one in motion
const heading = (g: Game): number => g.queue[g.queue.length - 1] ?? g.dir

function occupied(g: Game, c: Cell): boolean {
  return (
    g.snake.some(s => same(s, c)) ||
    (g.food !== null && same(g.food, c)) ||
    g.bonuses.some(b => same(b, c))
  )
}

// A random free cell; after a few misses a scan, so a crowded board still finds one.
function freeCell(g: Game): Cell | null {
  for (let i = 0; i < 12; i += 1) {
    const c = { x: Math.floor(rand(g) * g.gw), y: Math.floor(rand(g) * g.gh) }
    if (!occupied(g, c)) return c
  }
  const start = Math.floor(rand(g) * g.gw * g.gh)
  for (let i = 0; i < g.gw * g.gh; i += 1) {
    const k = (start + i) % (g.gw * g.gh)
    const c = { x: k % g.gw, y: Math.floor(k / g.gw) }
    if (!occupied(g, c)) return c
  }

  return null
}

function fresh(g: Game): void {
  const cx = Math.floor(g.gw / 2)
  const cy = Math.floor(g.gh / 2)
  g.score = 0
  g.over = false
  g.overT = 0
  g.dir = 1
  g.queue = []
  g.acc = 0
  g.pulse = 0
  g.bonuses = []
  g.snake = []
  for (let i = 0; i < START_LEN; i += 1) g.snake.push({ x: cx - i, y: cy })
  g.food = null
  g.food = freeCell(g)
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = {
    w,
    h,
    gw: gridW(w),
    gh: gridH(h),
    seed,
    t: 0,
    score: 0,
    over: false,
    overT: 0,
    snake: [],
    dir: 1,
    queue: [],
    food: null,
    bonuses: [],
    acc: 0,
    pulse: 0,
  }
  fresh(g)

  return g
}

function end(g: Game): void {
  g.over = true
  g.overT = 0
}

// A smaller field that no longer holds the snake ends the run; otherwise everything stays
// where it is and only the food and bonuses that fell outside are moved or dropped.
export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  next.gw = gridW(w)
  next.gh = gridH(h)
  const inside = (c: Cell): boolean => c.x >= 0 && c.y >= 0 && c.x < next.gw && c.y < next.gh
  if (!next.snake.every(inside)) {
    end(next)
    next.food = null
    next.bonuses = []
    next.queue = []

    return next
  }
  next.bonuses = next.bonuses.filter(inside)
  if (next.food !== null && !inside(next.food)) {
    next.food = null
    next.food = freeCell(next)
  }

  return next
}

function turn(g: Game, d: number): void {
  if (g.queue.length >= MAX_QUEUE) return
  const h = heading(g)
  // the same way or straight back: nothing to do, and a reversal would be a death
  if (d === h || d === (h + 2) % 4) return
  g.queue.push(d)
}

function advance(g: Game): void {
  const d = g.queue.shift()
  if (d !== undefined) g.dir = d
  const head = g.snake[0]!
  const to = { x: head.x + DX[g.dir]!, y: head.y + DY[g.dir]! }
  if (to.x < 0 || to.y < 0 || to.x >= g.gw || to.y >= g.gh) {
    end(g)

    return
  }
  // the tail cell is vacated this step; food never lies on the snake, so eating cannot clash with it
  if (g.snake.slice(0, -1).some(s => same(s, to))) {
    end(g)

    return
  }

  g.snake.unshift(to)

  let gained = 0
  if (g.food !== null && same(g.food, to)) {
    gained += FOOD_SCORE
    g.food = null
    g.food = freeCell(g)
    // a full board has nowhere to put food: that is a win, and the run is over
    if (g.food === null) end(g)
  }
  const at = g.bonuses.findIndex(b => same(b, to))
  if (at >= 0) {
    gained += BONUS_SCORE
    g.bonuses.splice(at, 1)
  }
  // eating keeps the tail where it is: one cell longer
  if (gained > 0) {
    g.score += gained
    g.pulse = PULSE_S
  } else {
    g.snake.pop()
  }
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt
  g.pulse = Math.max(0, g.pulse - dt)

  if (g.over) {
    if (g.overT >= RESTART_AFTER_S && input.any) fresh(g)
    else g.overT += dt

    return g
  }

  for (const d of input.turns ?? []) turn(g, d)

  for (const b of g.bonuses) b.life -= dt
  g.bonuses = g.bonuses.filter(b => b.life > 0)

  g.acc += dt
  // a slow frame can owe more than one step; each is a whole grid move
  for (let n = 0; n < 4 && !g.over; n += 1) {
    const every = stepInterval(g.snake.length)
    if (g.acc + EPS < every) break
    g.acc -= every
    advance(g)
  }
  if (g.acc > stepInterval(g.snake.length)) g.acc = 0

  return g
}

// A glowing food worth BONUS_SCORE on a free cell; a reward only, capped at two, and it
// changes nothing but the board (speed comes from length alone).
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.over || g.bonuses.length >= MAX_BONUSES) return g
  const c = freeCell(g)
  if (c !== null) g.bonuses.push({ ...c, life: BONUS_LIFE_S })

  return g
}
