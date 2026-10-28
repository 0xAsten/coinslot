import { expect, test } from 'claude-code/testing'

import {
  AIR_IMPULSE,
  BONUS_SCORE,
  COIN_SIZE,
  GRAVITY,
  IMPULSE,
  JUMP_H,
  MAX_BONUSES,
  MAX_SPEED,
  MIN_GAP_S,
  RESTART_AFTER_S,
  RUN_H,
  RUN_W,
  START_SPEED,
  floorY,
  newGame,
  resize,
  spawnBonus,
  step,
} from './sim'
import type { Game, Input, Obstacle } from './sim'

const TAP: Input = { tap: true }
const DT = 1 / 60

const block = (g: Game, x: number, w = 4, h = 5): Obstacle => ({ kind: 'block', x, w, h })
const drone = (x: number): Obstacle => ({ kind: 'drone', x, w: 4, h: 2 })

// a runner on flat ground with no obstacles; the next one is planned far away
function empty(cols = 80, rows = 20): Game {
  const g = newGame(cols, rows * 2, 7)
  g.obstacles = []
  g.bonuses = []
  g.nextX = 1e9

  return g
}

// the top edge of the runner when it stands on the ground
const standY = (g: Game) => floorY(g.h) - RUN_H

function run(g: Game, n: number, input: Input = {}): Game {
  let s = g
  for (let i = 0; i < n && !s.over; i += 1) s = step(s, DT, input)

  return s
}

// the lowest the runner's top gets in one jump from standing
function apex(dt: number, taps: number[] = [0]): number {
  let g = empty()
  let top = g.y
  for (let i = 0; i < 120; i += 1) {
    g = step(g, dt, taps.includes(i) ? TAP : {})
    top = Math.min(top, g.y)
  }

  return standY(g) - top
}

// A player who always jumps at the right moment for the next block and otherwise runs.
// It only ever taps on the ground, so it uses the single jump.
function bot(g: Game): Input {
  if (g.jumps > 0) return {}
  const o = g.obstacles.find(p => p.kind === 'block' && p.x + p.w > g.fx)
  if (!o) return {}
  const dist = o.x - (g.fx + RUN_W)
  // jump so the above-the-block window is centred on the block
  if (dist <= 0.44 * g.speed - (o.w + RUN_W) / 2) return TAP

  return {}
}

function playBot(seed: number, cols: number, rows: number, speed: 'min' | 'max' | 'ramp', seconds: number): Game {
  let g = newGame(cols, rows * 2, seed)
  for (let i = 0; i < seconds * 60 && !g.over; i += 1) {
    if (speed === 'min') g.speed = START_SPEED
    if (speed === 'max') g.speed = MAX_SPEED
    g = step(g, DT, bot(g))
    if (i % 180 === 0) g = spawnBonus(g)
  }

  return g
}

test('a jump has a fixed height and the air jump works once', () => {
  // the height is a constant of the physics, whatever the frame rate
  expect(Math.abs(JUMP_H - (IMPULSE * IMPULSE) / (2 * GRAVITY))).toBeLessThan(1e-9)
  for (const dt of [DT, 1 / 30, 0.05]) expect(Math.abs(apex(dt) - JUMP_H)).toBeLessThan(0.7)
  // taking off then returning to the ground exactly
  let g = empty()
  g = step(g, DT, TAP)
  expect(g.jumps).toBe(1)
  expect(g.vy).toBeLessThan(0)
  g = run(g, 100)
  expect(g.y).toBe(standY(g))
  expect(g.jumps).toBe(0)

  // a second tap in the air jumps again, once
  g = empty()
  g = step(g, DT, TAP)
  g = run(g, 12)
  const before = g.vy
  g = step(g, DT, TAP)
  expect(g.jumps).toBe(2)
  expect(g.vy).toBeLessThan(before)
  expect(Math.abs(g.vy - (-AIR_IMPULSE + GRAVITY * DT))).toBeLessThan(1e-6)
  // a third tap does nothing: velocity just carries on under gravity
  const v = g.vy
  g = step(g, DT, TAP)
  expect(Math.abs(g.vy - (v + GRAVITY * DT))).toBeLessThan(1e-6)
  g = run(g, 6, TAP)
  expect(g.jumps).toBe(2)
  // landing gives the air jump back
  g = run(g, 200)
  expect(g.jumps).toBe(0)
  g = step(g, DT, TAP)
  expect(g.jumps).toBe(1)

  // two taps a frame apart are a hop, not a double jump
  g = empty()
  g = step(g, DT, TAP)
  g = step(g, DT, TAP)
  expect(g.jumps).toBe(1)

  // the air jump climbs higher than the ground jump alone, and the ceiling holds it
  expect(apex(DT, [0, 25])).toBeGreaterThan(JUMP_H + 3)
  g = empty()
  for (let i = 0; i < 60; i += 1) g = step(g, DT, TAP)
  expect(g.y).toBeGreaterThanOrEqual(2)
  expect(g.over).toBe(false)
})

test('a jump clears the tallest block in the smallest field, and a low drone is run under', () => {
  for (const speed of [START_SPEED, MAX_SPEED]) {
    for (const [w, h] of [
      [4, 5],
      [7, 3],
      [3, 3],
    ] as const) {
      let g = empty(40, 10)
      g.speed = speed
      g.obstacles = [block(g, 40, w, h)]
      for (let i = 0; i < 240; i += 1) {
        g.speed = speed
        g = step(g, DT, bot(g))
      }
      expect(g.over).toBe(false)
      expect(g.obstacles.length).toBe(0)
    }
    // running straight under a drone in the same 20-pixel field
    let d = empty(40, 10)
    d.obstacles = [drone(40)]
    for (let i = 0; i < 240; i += 1) {
      d.speed = speed
      d = step(d, DT, {})
    }
    expect(d.over).toBe(false)
    expect(d.obstacles.length).toBe(0)
  }
  // the jump's top fits under the HUD even there
  expect(standY(newGame(40, 20, 1)) - JUMP_H).toBeGreaterThanOrEqual(2)
})

test('obstacle contact ends the run', () => {
  // a block 4 px ahead: contact within 15 ticks, nowhere near any timeout
  let g = empty()
  g.obstacles = [block(g, g.fx + RUN_W + 4)]
  g = run(g, 15)
  expect(g.over).toBe(true)
  const dist = g.dist
  g = step(g, DT, {})
  expect(g.dist).toBe(dist)

  // jumping into a drone is a hit; the same jump with no drone is not
  g = empty()
  g.obstacles = [drone(g.fx + RUN_W + 4)]
  g = step(g, DT, TAP)
  g = run(g, 20)
  expect(g.over).toBe(true)
  g = empty()
  g.obstacles = []
  g = run(step(g, DT, TAP), 20)
  expect(g.over).toBe(false)

  // landing on a block is a hit as well as running into it
  g = empty()
  g.y = standY(g) - 4
  g.vy = 10
  g.jumps = 1
  g.obstacles = [block(g, g.fx - 1, 5, 4)]
  g = run(g, 20)
  expect(g.over).toBe(true)

  // touching edges only is not a hit; one pixel of overlap is
  g = empty()
  g.obstacles = [block(g, g.fx - 5, 5, 5)]
  g = step(g, DT, {})
  expect(g.over).toBe(false)
  g = empty()
  g.obstacles = [block(g, g.fx - 4, 5, 5)]
  g = step(g, 1e-6, {})
  expect(g.over).toBe(true)
  g = empty()
  g.obstacles = [block(g, g.fx + RUN_W + 0.001)]
  g = step(g, 1e-6, {})
  expect(g.over).toBe(false)
  g = empty()
  g.obstacles = [block(g, g.fx + RUN_W - 0.5)]
  g = step(g, 1e-6, {})
  expect(g.over).toBe(true)

  // a long frame does not tunnel through a block
  g = empty()
  g.obstacles = [block(g, g.fx + RUN_W + 3, 3, 3)]
  g = step(g, 0.4, {})
  expect(g.over).toBe(true)
})

test('speed ramps but never past MAX_SPEED', () => {
  let g = empty()
  expect(g.speed).toBe(START_SPEED)
  let prev = g.speed
  let rose = false
  for (let i = 0; i < 60 * 400; i += 1) {
    g.obstacles = []
    g = step(g, DT, {})
    expect(g.over).toBe(false)
    expect(g.speed).toBeLessThanOrEqual(MAX_SPEED)
    expect(g.speed).toBeGreaterThanOrEqual(prev)
    if (g.speed > prev) rose = true
    prev = g.speed
  }
  expect(rose).toBe(true)
  expect(g.speed).toBe(MAX_SPEED)
  // a long frame cannot overshoot either
  g.speed = MAX_SPEED - 0.001
  g = step(g, 5, {})
  expect(g.speed).toBe(MAX_SPEED)
  // distance is the score, at the speed of the moment
  const d = empty()
  const a = step(d, 1, {})
  expect(Math.abs(a.dist - START_SPEED)).toBeLessThan(0.5)
  expect(a.score).toBe(Math.floor(a.dist / 8))
})

test('consecutive obstacles always leave a clearable gap at the current speed', () => {
  for (const [seed, cols, rows, speed] of [
    [1, 40, 10, 'min'],
    [2, 120, 30, 'max'],
    [3, 80, 20, 'ramp'],
  ] as const) {
    let g = newGame(cols, rows * 2, seed)
    let seen = 0
    for (let i = 0; i < 60 * 120; i += 1) {
      if (speed === 'min') g.speed = START_SPEED
      if (speed === 'max') g.speed = MAX_SPEED
      g = step(g, DT, bot(g))
      expect(g.over).toBe(false)
      for (let k = 1; k < g.obstacles.length; k += 1) {
        const a = g.obstacles[k - 1]!
        const b = g.obstacles[k]!
        const gap = b.x - (a.x + a.w)
        // the gap in seconds at the current speed is at least the airborne time of a jump
        expect(gap / g.speed).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-6)
        seen += 1
      }
      // the planned next one honours it too
      const last = g.obstacles[g.obstacles.length - 1]
      if (last) expect((g.nextX - (last.x + last.w)) / g.speed).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-6)
    }
    expect(seen).toBeGreaterThan(100)
  }
})

test('a player who jumps blocks in time survives two minutes at any pace', () => {
  for (const seed of [1, 2, 3, 4]) {
    for (const [cols, rows] of [
      [40, 10],
      [120, 30],
    ] as const) {
      for (const speed of ['min', 'max', 'ramp'] as const) {
        const g = playBot(seed, cols, rows, speed, 120)
        expect(g.over).toBe(false)
        expect(g.t).toBeGreaterThan(119)
      }
    }
  }
})

test('a key in the first 0.5 s after the end does not restart', () => {
  let g = empty()
  g.obstacles = [block(g, g.fx + RUN_W + 4)]
  g.bonusPts = 20
  g = run(g, 15)
  expect(g.over).toBe(true)
  const score = g.score
  expect(score).toBeGreaterThanOrEqual(20)
  g = step(g, 0.1, TAP)
  expect(g.over).toBe(true)
  expect(g.score).toBe(score)
  g = step(g, 0.3, TAP)
  expect(g.over).toBe(true)
  g = step(g, 0.2, {})
  expect(g.overT).toBeGreaterThanOrEqual(RESTART_AFTER_S)
  g = step(g, DT, TAP)
  expect(g.over).toBe(false)
  expect(g.score).toBe(0)
  expect(g.speed).toBe(START_SPEED)
  expect(g.y).toBe(standY(g))
  expect(g.jumps).toBe(0)
})

// no obstacle may overlap or sit within one pixel of a coin
const touching = (g: Game, c: { x: number }) =>
  g.obstacles.some(o => c.x < o.x + o.w + 1 && c.x + COIN_SIZE + 1 > o.x) || c.x + COIN_SIZE + 1 > g.nextX

test('30 bonuses → at most 2 coins, none touching an obstacle', () => {
  for (const seed of [3, 4, 5]) {
    let g = newGame(120, 60, seed)
    for (let i = 0; i < 30; i += 1) g = spawnBonus(g)
    expect(g.bonuses.length).toBe(MAX_BONUSES)
    for (const b of g.bonuses) {
      expect(touching(g, b)).toBe(false)
      // on the running path: the runner picks it up without jumping
      expect(b.y).toBeGreaterThanOrEqual(standY(g))
      expect(b.y + COIN_SIZE).toBeLessThanOrEqual(floorY(g.h))
    }
  }

  // while the field scrolls, obstacles spawn and coins come and go
  for (const [cols, rows] of [
    [120, 30],
    [40, 10],
  ] as const) {
    let s = newGame(cols, rows * 2, 3)
    let coins = 0
    for (let i = 0; i < 60 * 90; i += 1) {
      s = step(s, DT, bot(s))
      expect(s.over).toBe(false)
      if (i % 20 === 0) s = spawnBonus(s)
      expect(s.bonuses.length).toBeLessThanOrEqual(MAX_BONUSES)
      for (const b of s.bonuses) {
        expect(touching(s, b)).toBe(false)
        coins += 1
      }
    }
    expect(coins).toBeGreaterThan(100)
  }

  // none appear on an ended run
  let o = empty()
  o.obstacles = [block(o, o.fx + RUN_W + 4)]
  o = run(o, 15)
  expect(o.over).toBe(true)
  expect(spawnBonus(o).bonuses.length).toBe(0)
})

test('a coin is worth 10 and speeds nothing up', () => {
  const base = empty()
  let a = base
  let b = { ...base, bonuses: [{ x: base.fx + 1, y: standY(base) + 1 }] }
  a = step(a, DT, {})
  b = step(b, DT, {})
  expect(b.bonuses.length).toBe(0)
  expect(b.bonusPts).toBe(BONUS_SCORE)
  expect(BONUS_SCORE).toBe(10)
  expect(b.score - a.score).toBe(BONUS_SCORE)
  expect(b.speed).toBe(a.speed)
  expect(b.dist).toBe(a.dist)
  expect(b.nextX).toBe(a.nextX)
  expect(b.obstacles).toEqual(a.obstacles)
})

test('resize keeps the runner on the ground', () => {
  let g = empty(120, 30)
  g = run(g, 30)
  for (const [w, h] of [
    [40, 20],
    [100, 50],
    [60, 24],
    [120, 60],
  ] as const) {
    g = resize(g, w, h)
    expect(g.w).toBe(w)
    expect(g.h).toBe(h)
    expect(g.y).toBe(standY(g))
    expect(g.fx).toBeLessThan(w)
    g = run(g, 30)
    expect(g.over).toBe(false)
    expect(g.y).toBe(standY(g))
  }
  // mid-jump it keeps its height above the ground, inside the ceiling
  g = empty(120, 30)
  g = run(step(g, DT, TAP), 12)
  const lift = standY(g) - g.y
  expect(lift).toBeGreaterThan(3)
  g = resize(g, 80, 40)
  expect(Math.abs(standY(g) - g.y - lift)).toBeLessThan(1e-9)
  g = resize(g, 40, 20)
  expect(g.y).toBeGreaterThanOrEqual(2)
  expect(g.y).toBeLessThanOrEqual(standY(g))
  g = run(g, 100)
  expect(g.y).toBe(standY(g))

  // coins follow the new ground
  g = newGame(120, 60, 3)
  for (let i = 0; i < 3; i += 1) g = spawnBonus(g)
  g = resize(g, 60, 24)
  for (const c of g.bonuses) expect(c.y + COIN_SIZE).toBeLessThanOrEqual(floorY(24))
  expect(g.bonuses.length).toBeGreaterThan(0)
})

test('deterministic: same seed and inputs give the same run, state is plain JSON', () => {
  const play = (): Game => {
    let g = newGame(80, 40, 42)
    for (let i = 0; i < 500; i += 1) {
      g = step(g, DT, { tap: i % 17 === 0 })
      if (i % 90 === 0) g = spawnBonus(g)
    }

    return g
  }
  const a = play()
  expect(a).toEqual(play())
  expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  expect(newGame(80, 40, 1).nextX).not.toEqual(newGame(80, 40, 2).nextX)
  const kinds = (s: number) => {
    let g = newGame(80, 40, s)
    const ks: string[] = []
    for (let i = 0; i < 60 * 60 && !g.over; i += 1) {
      g = step(g, DT, bot(g))
      for (const o of g.obstacles) ks.push(`${o.kind}${o.w}${o.h}`)
    }

    return ks.join()
  }
  expect(kinds(1)).not.toEqual(kinds(2))
})
