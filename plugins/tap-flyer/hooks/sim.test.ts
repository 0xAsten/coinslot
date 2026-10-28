import { expect, test } from 'claude-code/testing'

import {
  BONUS_SCORE,
  FLY_H,
  GAP_MIN,
  GRAVITY,
  IMPULSE,
  MAX_BONUSES,
  OBST_W,
  RESTART_AFTER_S,
  floorY,
  newGame,
  resize,
  spawnBonus,
  step,
} from './sim'
import type { Game, Input } from './sim'

const TAP: Input = { tap: true }
const DT = 1 / 60

// a game with no obstacles and the flyer mid-field, so physics is the only thing moving
function empty(): Game {
  const g = newGame(80, 40, 7)
  g.obstacles = []
  g.bonuses = []
  g.y = 20
  g.vy = 0

  return g
}

// run n ticks, stopping early when the run ends
function run(g: Game, n: number, input: Input = {}): Game {
  let s = g
  for (let i = 0; i < n && !s.over; i += 1) s = step(s, DT, input)

  return s
}

// the pillar a coin sits in, by x range
const pillarOf = (g: Game, b: { x: number }) => g.obstacles.find(p => b.x >= p.x && b.x + 2 <= p.x + OBST_W)

test('a tap sets upward velocity, gravity pulls down', () => {
  let g = empty()
  g = step(g, DT, TAP)
  expect(g.vy).toBeLessThan(0)
  expect(Math.abs(g.vy - (-IMPULSE + GRAVITY * DT))).toBeLessThan(1e-6)
  const y1 = g.y
  expect(y1).toBeLessThan(20)
  // a second tap while rising resets the speed, it does not add up
  g = step(g, DT, TAP)
  expect(Math.abs(g.vy - (-IMPULSE + GRAVITY * DT))).toBeLessThan(1e-6)
  // untouched, the flyer slows, turns and falls
  let prev = g.vy
  for (let i = 0; i < 20; i += 1) {
    g = step(g, DT, {})
    expect(g.vy).toBeGreaterThan(prev)
    prev = g.vy
  }
  g = run(g, 40)
  expect(g.vy).toBeGreaterThan(0)
  expect(g.y).toBeGreaterThan(y1)
})

test('passing a gap scores once', () => {
  let g = empty()
  g.obstacles = [{ x: g.fx + 6, gapY: 12, gapH: 20, scored: false }]
  let gained = 0
  for (let i = 0; i < 120; i += 1) {
    const before = g.score
    g = step(g, DT, {})
    // hold the flyer level in the gap
    g.vy = 0
    g.y = 20
    gained += g.score - before
  }
  expect(g.over).toBe(false)
  expect(g.score).toBe(1)
  expect(gained).toBe(1)
})

test('obstacle and floor contact end the run', () => {
  // the top wall of the next pillar: dead within 15 ticks, long before the floor
  let g = empty()
  g.obstacles = [{ x: g.fx + 6, gapY: 30, gapH: 6, scored: false }]
  g.y = 10
  g = run(g, 15, {})
  expect(g.over).toBe(true)
  expect(g.y + FLY_H).toBeLessThan(floorY(g.h))

  // the bottom wall, same
  g = empty()
  g.obstacles = [{ x: g.fx + 6, gapY: 4, gapH: 6, scored: false }]
  g.y = 28
  g = run(g, 15, {})
  expect(g.over).toBe(true)
  expect(g.y + FLY_H).toBeLessThan(floorY(g.h))

  // the same pillars with the flyer inside the gap: alive through the crossing
  g = empty()
  g.obstacles = [{ x: g.fx + 6, gapY: 12, gapH: 20, scored: false }]
  for (let i = 0; i < 15; i += 1) {
    g = step(g, DT, {})
    g.y = 20
    g.vy = 0
  }
  expect(g.over).toBe(false)

  // the floor
  g = empty()
  g = run(g, 600, {})
  expect(g.over).toBe(true)
  expect(g.y + FLY_H).toBeGreaterThanOrEqual(floorY(g.h) - 1e-6)
  expect(g.score).toBe(0)
})

test('touching the edge of the gap is not a hit', () => {
  // flyer overlapping the pillar's columns, exactly on the gap's top / bottom edge
  let g = empty()
  g.obstacles = [{ x: g.fx, gapY: 20, gapH: 10, scored: false }]
  g.y = 20
  g.vy = 0.001
  g = step(g, 1e-6, {})
  expect(g.over).toBe(false)

  g = empty()
  g.obstacles = [{ x: g.fx, gapY: 20, gapH: 10, scored: false }]
  g.y = 30 - FLY_H
  g.vy = -0.001
  g = step(g, 1e-6, {})
  expect(g.over).toBe(false)

  // one pixel past either edge is a hit
  g = empty()
  g.obstacles = [{ x: g.fx, gapY: 20, gapH: 10, scored: false }]
  g.y = 19
  g = step(g, 1e-6, {})
  expect(g.over).toBe(true)
  g = empty()
  g.obstacles = [{ x: g.fx, gapY: 20, gapH: 10, scored: false }]
  g.y = 29 - FLY_H + 1.5
  g = step(g, 1e-6, {})
  expect(g.over).toBe(true)
})

test('the ceiling holds the flyer in without ending the run', () => {
  let g = empty()
  g.y = 3
  for (let i = 0; i < 60; i += 1) g = step(g, DT, TAP)
  expect(g.over).toBe(false)
  expect(g.y).toBeGreaterThanOrEqual(2)
})

test('a key in the first 0.5 s after the end does not restart', () => {
  let g = empty()
  g.score = 4
  g = run(g, 600, {})
  expect(g.over).toBe(true)
  g = step(g, 0.1, TAP)
  expect(g.over).toBe(true)
  expect(g.score).toBe(4)
  g = step(g, 0.3, TAP)
  expect(g.over).toBe(true)
  g = step(g, 0.2, {})
  expect(g.overT).toBeGreaterThanOrEqual(RESTART_AFTER_S)
  g = step(g, DT, TAP)
  expect(g.over).toBe(false)
  expect(g.score).toBe(0)
  expect(g.obstacles.length).toBeGreaterThan(0)
})

test('30 bonuses → at most 2 coins, each inside a gap', () => {
  const h = newGame(120, 60, 3)
  expect(h.obstacles.length).toBeGreaterThan(0)
  let g = h
  for (let i = 0; i < 30; i += 1) g = spawnBonus(g)
  expect(g.bonuses.length).toBe(MAX_BONUSES)
  for (const b of g.bonuses) {
    const o = pillarOf(g, b)
    expect(o).toBeDefined()
    expect(b.y).toBeGreaterThanOrEqual(o!.gapY)
    expect(b.y + 2).toBeLessThanOrEqual(o!.gapY + o!.gapH)
  }

  // and while the field scrolls and pillars come and go
  let s = newGame(120, 60, 3)
  for (let i = 0; i < 600; i += 1) {
    s = step(s, DT, {})
    s.y = 30
    s.vy = 0
    s.over = false
    if (i % 20 === 0) s = spawnBonus(s)
    expect(s.bonuses.length).toBeLessThanOrEqual(MAX_BONUSES)
    for (const b of s.bonuses) {
      const o = pillarOf(s, b)
      expect(o).toBeDefined()
      expect(b.y).toBeGreaterThanOrEqual(o!.gapY)
      expect(b.y + 2).toBeLessThanOrEqual(o!.gapY + o!.gapH)
    }
  }
})

test('a coin is worth 3 and changes nothing else', () => {
  let g = empty()
  g.obstacles = [{ x: g.fx - 1, gapY: 8, gapH: 30, scored: true }]
  g.bonuses = [{ x: g.fx, y: g.y }]
  g = step(g, DT, {})
  expect(g.score).toBe(BONUS_SCORE)
  expect(g.bonuses.length).toBe(0)
  // none appear on an ended run
  let o = run(empty(), 600, {})
  o = spawnBonus(o)
  expect(o.bonuses.length).toBe(0)
})

test('gap size never shrinks below the minimum', () => {
  for (const rows of [10, 30]) {
    let g = newGame(60, rows * 2, 11)
    g.score = 5000
    for (let i = 0; i < 1500; i += 1) {
      g = step(g, DT, {})
      g.y = floorY(g.h) / 2
      g.vy = 0
      g.over = false
    }
    expect(g.obstacles.length).toBeGreaterThan(0)
    for (const o of g.obstacles) expect(o.gapH).toBeGreaterThanOrEqual(GAP_MIN)
  }
})

test('every gap fits the smallest field, and one tap cannot overshoot a gap', () => {
  let g = newGame(40, 20, 5)
  for (let i = 0; i < 1200; i += 1) {
    g = step(g, DT, {})
    g.y = 8
    g.vy = 0
    g.over = false
    for (const o of g.obstacles) {
      expect(o.gapY).toBeGreaterThanOrEqual(2)
      expect(o.gapY + o.gapH).toBeLessThanOrEqual(floorY(20))
    }
  }
  expect((IMPULSE * IMPULSE) / (2 * GRAVITY)).toBeLessThan(GAP_MIN / 2)
})

test('resize keeps the flyer and gaps inside', () => {
  let g = newGame(120, 60, 9)
  for (let i = 0; i < 300; i += 1) {
    g = step(g, DT, {})
    g.y = 30
    g.vy = 0
    g.over = false
    if (i % 25 === 0) g = spawnBonus(g)
  }
  g.y = 50
  for (const [w, h] of [
    [40, 20],
    [100, 50],
    [60, 24],
  ] as const) {
    g = resize(g, w, h)
    expect(g.w).toBe(w)
    expect(g.h).toBe(h)
    expect(g.y).toBeGreaterThanOrEqual(2)
    expect(g.y + FLY_H).toBeLessThanOrEqual(floorY(h) + 1e-6)
    expect(g.fx).toBeLessThan(w)
    for (const o of g.obstacles) {
      expect(o.gapY).toBeGreaterThanOrEqual(2)
      expect(o.gapY + o.gapH).toBeLessThanOrEqual(floorY(h))
      expect(o.gapH).toBeGreaterThanOrEqual(GAP_MIN)
    }
    for (const b of g.bonuses) {
      const o = pillarOf(g, b)
      expect(o).toBeDefined()
      expect(b.y).toBeGreaterThanOrEqual(o!.gapY)
      expect(b.y + 2).toBeLessThanOrEqual(o!.gapY + o!.gapH)
    }
  }
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
  expect(newGame(80, 40, 1).obstacles).not.toEqual(newGame(80, 40, 2).obstacles)
})

test('a long frame does not tunnel through a pillar', () => {
  let g = empty()
  g.obstacles = [{ x: g.fx + 4, gapY: 2, gapH: 9, scored: false }]
  g.y = 30
  g.vy = 0
  g = step(g, 0.4, {})
  expect(g.over).toBe(true)
})
