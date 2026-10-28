// Pure game logic for reef-net. No clock, no I/O: `step` is deterministic
// given the state (the RNG seed lives inside it) and the input.

export type Kind = 'fish' | 'turtle' | 'manta' | 'whale'

export type Creature = {
  id: number
  kind: Kind
  x: number
  y: number
  ang: number
  turn: number
  speed: number
  hp: number
  maxHp: number
  r: number
  value: number
  age: number
  flash: number
  caught: boolean
  // bonus fish from Claude's tool calls: pays 15, caught half the time, swims through once
  golden?: boolean
}

export type Shot = { x: number; y: number; tx: number; ty: number; bet: number }
export type Net = {
  x: number
  y: number
  maxR: number
  r: number
  age: number
  bet: number
}
export type Pop = { x: number; y: number; text: string; age: number }

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2 (half-block cells).
  w: number
  h: number
  seed: number
  t: number
  coins: number
  bet: number
  aimX: number
  aimY: number
  cooldown: number
  creatures: Creature[]
  shots: Shot[]
  nets: Net[]
  pops: Pop[]
  nextId: number
  spawning: boolean
  timers: Record<Kind, number>
  caughtCount: number
  // seconds left of the HUD's BONUS flash after a golden fish arrives
  bonusFlash: number
}

export type Input = {
  aimTo?: { x: number; y: number }
  aimDx?: number
  fire?: boolean
  bet?: number
  refill?: boolean
}

export const START_COINS = 200
export const MAX_BET = 5
export const MAX_SHOTS = 6
export const SHOT_SPEED = 85
export const FIRE_COOLDOWN = 0.2

type Spec = {
  hp: number
  value: number
  r: number
  speed: [number, number]
}
export const SPECS: Record<Kind, Spec> = {
  // hp is toughness: each net catches with chance 1/hp, whatever the bet
  fish: { hp: 2, value: 2, r: 2.6, speed: [16, 24] },
  turtle: { hp: 8, value: 7, r: 5.5, speed: [8, 12] },
  manta: { hp: 25, value: 22, r: 9, speed: [5, 8] },
  whale: { hp: 100, value: 120, r: 14, speed: [3, 4.5] },
}

export function rand(g: Game): number {
  // mulberry32
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const range = (g: Game, a: number, b: number) => a + (b - a) * rand(g)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function cannonPos(g: Game): { x: number; y: number } {
  return { x: g.w / 2, y: g.h - 4 }
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g: Game = {
    w,
    h,
    seed,
    t: 0,
    coins: START_COINS,
    bet: 1,
    aimX: w / 2,
    aimY: h * 0.35,
    cooldown: 0,
    creatures: [],
    shots: [],
    nets: [],
    pops: [],
    nextId: 1,
    spawning: true,
    timers: { fish: 0.2, turtle: 1.5, manta: 4, whale: 40 },
    caughtCount: 0,
    bonusFlash: 0,
  }
  // Seed the lagoon so it is not empty on the first frame.
  for (let i = 0; i < 2; i += 1) spawnGroup(g, 'fish', true)
  spawnGroup(g, 'turtle', true)
  spawnGroup(g, 'manta', true)

  return g
}

export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  next.aimX = clamp(next.aimX, 0, w - 1)
  next.aimY = clamp(next.aimY, 2, h - 6)

  return next
}

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

function makeCreature(
  g: Game,
  kind: Kind,
  x: number,
  y: number,
  ang: number,
): Creature {
  const s = SPECS[kind]
  const id = g.nextId
  g.nextId += 1

  return {
    id,
    kind,
    x,
    y,
    ang,
    turn: range(g, -0.3, 0.3),
    speed: range(g, s.speed[0], s.speed[1]),
    hp: s.hp,
    maxHp: s.hp,
    r: s.r,
    value: s.value,
    age: 0,
    flash: 0,
    caught: false,
  }
}

function spawnGroup(g: Game, kind: Kind, inside: boolean): void {
  const s = SPECS[kind]
  const margin = s.r + 4
  let x: number
  let y: number
  if (inside) {
    x = range(g, g.w * 0.1, g.w * 0.9)
    y = range(g, g.h * 0.1, g.h * 0.6)
  } else {
    const edge = Math.floor(rand(g) * 3) // 0 left, 1 right, 2 top
    if (edge === 0) {
      x = -margin
      y = range(g, 3, g.h * 0.7)
    } else if (edge === 1) {
      x = g.w + margin
      y = range(g, 3, g.h * 0.7)
    } else {
      x = range(g, 0, g.w)
      y = -margin
    }
  }
  const tx = range(g, g.w * 0.2, g.w * 0.8)
  const ty = range(g, g.h * 0.15, g.h * 0.6)
  const ang = Math.atan2(ty - y, tx - x)
  const n = kind === 'fish' ? 3 + Math.floor(rand(g) * 3) : 1
  const base = makeCreature(g, kind, x, y, ang)
  g.creatures.push(base)
  for (let i = 1; i < n; i += 1) {
    const c = makeCreature(g, kind, 0, 0, ang + range(g, -0.12, 0.12))
    // A school keeps its members close and at nearly one speed.
    c.x = x - Math.cos(ang) * i * 3.5 + range(g, -3, 3)
    c.y = y - Math.sin(ang) * i * 3.5 + range(g, -3, 3)
    c.speed = base.speed * range(g, 0.92, 1.08)
    c.turn = base.turn
    g.creatures.push(c)
  }
}

function count(g: Game, kind: Kind): number {
  return g.creatures.filter(c => c.kind === kind && !c.caught).length
}

function updateSpawns(g: Game, dt: number): void {
  if (!g.spawning) return
  const rules: [Kind, number, number, number, number][] = [
    // kind, cap, min gap, max gap, chance (1 = always when due)
    ['fish', 14, 2.5, 5, 1],
    ['turtle', 4, 6, 11, 1],
    ['manta', 2, 14, 24, 1],
    ['whale', 1, 70, 140, 1],
  ]
  for (const [kind, cap, lo, hi] of rules) {
    g.timers[kind] -= dt
    if (g.timers[kind] > 0) continue
    g.timers[kind] = range(g, lo, hi)
    if (count(g, kind) < cap) spawnGroup(g, kind, false)
  }
}

function updateCreatures(g: Game, dt: number): void {
  for (const c of g.creatures) {
    c.age += dt
    if (c.flash > 0) c.flash -= dt
    if (c.caught) continue
    if (!c.golden) c.turn = clamp(c.turn + (rand(g) - 0.5) * dt * 1.6, -0.55, 0.55)
    c.ang += c.turn * dt
    c.x += Math.cos(c.ang) * c.speed * dt
    c.y += Math.sin(c.ang) * c.speed * dt
    // Swim back toward the field if a curve carries it away from the water.
    if (c.age > 3) {
      const away =
        c.x < -c.r * 2 - 6 ||
        c.x > g.w + c.r * 2 + 6 ||
        c.y < -c.r * 2 - 6 ||
        c.y > g.h + c.r * 2 + 6
      if (away) c.hp = -999
    }
  }
  g.creatures = g.creatures.filter(
    c => (c.caught ? c.flash > 0 : c.hp !== -999),
  )
}

export function netRadius(bet: number): number {
  return 5 + bet * 1.2
}

function openNet(g: Game, x: number, y: number, bet: number): void {
  const maxR = netRadius(bet)
  g.nets.push({ x, y, maxR, r: 0, age: 0, bet })
  for (const c of g.creatures) {
    if (c.caught) continue
    if (Math.hypot(c.x - x, c.y - y) > maxR + c.r * 0.6) continue
    c.flash = 0.15
    if (rand(g) < 1 / c.maxHp) {
      c.caught = true
      c.flash = 0.6
      const gain = c.value * bet
      g.coins += gain
      g.caughtCount += 1
      g.pops.push({ x: c.x, y: c.y, text: `+${gain}`, age: 0 })
    }
  }
}

function updateShots(g: Game, dt: number): void {
  const left: Shot[] = []
  for (const s of g.shots) {
    const dx = s.tx - s.x
    const dy = s.ty - s.y
    const d = Math.hypot(dx, dy)
    const move = SHOT_SPEED * dt
    const arrived = d <= move
    const nx = arrived ? s.tx : s.x + (dx / d) * move
    const ny = arrived ? s.ty : s.y + (dy / d) * move
    const hit = g.creatures.some(
      c => !c.caught && Math.hypot(c.x - nx, c.y - ny) <= c.r,
    )
    if (arrived || hit) {
      openNet(g, nx, ny, s.bet)
    } else {
      s.x = nx
      s.y = ny
      left.push(s)
    }
  }
  g.shots = left
}

function updateEffects(g: Game, dt: number): void {
  for (const n of g.nets) {
    n.age += dt
    n.r = n.maxR * Math.min(1, n.age / 0.15)
  }
  g.nets = g.nets.filter(n => n.age < 0.6)
  for (const p of g.pops) {
    p.age += dt
    p.y -= 6 * dt
  }
  g.pops = g.pops.filter(p => p.age < 1.2)
  g.bonusFlash = Math.max(0, g.bonusFlash - dt)
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt

  if (input.aimTo) {
    g.aimX = clamp(input.aimTo.x, 0, g.w - 1)
    g.aimY = clamp(input.aimTo.y, 2, g.h - 6)
  }
  if (input.aimDx) g.aimX = clamp(g.aimX + input.aimDx, 0, g.w - 1)
  if (input.bet) g.bet = clamp(g.bet + input.bet, 1, MAX_BET)
  if (input.refill && g.coins < g.bet) g.coins = START_COINS

  g.cooldown = Math.max(0, g.cooldown - dt)
  if (
    input.fire &&
    g.cooldown <= 0 &&
    g.coins >= g.bet &&
    g.shots.length < MAX_SHOTS
  ) {
    const c = cannonPos(g)
    g.coins -= g.bet
    g.cooldown = FIRE_COOLDOWN
    g.shots.push({ x: c.x, y: c.y, tx: g.aimX, ty: g.aimY, bet: g.bet })
  }

  updateShots(g, dt)
  updateCreatures(g, dt)
  updateSpawns(g, dt)
  updateEffects(g, dt)

  return g
}

export const BONUS_VALUE = 15
export const BONUS_MAX = 3
export const BONUS_SCALE = 1.6
export const BONUS_FLASH_S = 1.5

// One golden fish crossing the lagoon left to right or right to left. A reward
// only: it is caught half the time, pays 15 x bet and never changes the rest.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.creatures.filter(c => c.golden && !c.caught).length >= BONUS_MAX) return g
  const fromLeft = rand(g) < 0.5
  // born with its nose already over the edge, so it is on screen from the first frame
  const c = makeCreature(
    g,
    'fish',
    fromLeft ? -1 : g.w,
    range(g, g.h * 0.12, g.h * 0.55),
    fromLeft ? 0 : Math.PI,
  )
  c.golden = true
  c.value = BONUS_VALUE
  c.maxHp = 2
  c.hp = 2
  c.turn = 0
  c.speed = range(g, 14, 20)
  c.r = SPECS.fish.r * BONUS_SCALE
  g.bonusFlash = BONUS_FLASH_S
  g.creatures.push(c)

  return g
}
