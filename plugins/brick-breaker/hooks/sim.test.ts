import { expect, test } from 'claude-code/testing'

import { BRICK_TOP, MAX_BALLS, MAX_CAPSULES, MAX_PARTICLES, START_LIVES, brickAt, brickH, newGame, resize, spawnBonus, step } from './sim'
import type { Ball, Game, Input } from './sim'

const DT = 0.033

function ball(x: number, y: number, vx: number, vy: number): Ball {
  return { x, y, vx, vy, stuck: false }
}

// a field with no bricks in the way, one live ball
function open(): Game {
  const g = newGame(80, 40, 7)
  g.bricks = g.bricks.map(() => 0)
  g.bricks[0] = 1 // keep one brick far away so the field is never "cleared"
  g.balls = [ball(40, 20, 0, 0)]

  return g
}

function run(g: Game, steps: number, input: Input = {}): Game {
  let s = g
  for (let i = 0; i < steps; i += 1) s = step(s, DT, i === 0 ? input : {})

  return s
}

test('ball reflects off side and top walls', () => {
  let g = open()
  g.balls = [ball(2, 20, -40, 0)]
  g = run(g, 6)
  expect(g.balls[0]!.vx).toBeGreaterThan(0)
  expect(g.balls[0]!.x).toBeGreaterThanOrEqual(0)

  g = open()
  g.balls = [ball(78, 20, 40, 0)]
  g = run(g, 6)
  expect(g.balls[0]!.vx).toBeLessThan(0)
  expect(g.balls[0]!.x).toBeLessThanOrEqual(80)

  g = open()
  g.balls = [ball(40, 3, 0, -40)]
  g = run(g, 6)
  expect(g.balls[0]!.vy).toBeGreaterThan(0)
  expect(g.balls[0]!.y).toBeGreaterThanOrEqual(0)
})

test('a brick hit removes the brick, adds score, spawns particles', () => {
  let g = newGame(80, 40, 7)
  const before = g.bricks.filter(b => b > 0).length
  // fire a ball straight up into the bottom row of bricks
  const col = 3
  let row = 0
  for (let r = 0; r < 6; r += 1) if (brickAt(g, col, r) > 0) row = r
  const bw = g.w / 10
  g.balls = [ball(col * bw + bw / 2, 30, 0, -40)]
  g = run(g, 14)
  expect(g.bricks.filter(b => b > 0).length).toBe(before - 1)
  expect(brickAt(g, col, row)).toBe(0)
  expect(g.score).toBeGreaterThan(0)
  expect(g.particles.length).toBeGreaterThan(0)
  // it bounced back down
  expect(g.balls[0]!.vy).toBeGreaterThan(0)
})

test('particles never exceed MAX_PARTICLES', () => {
  let g = newGame(120, 60, 3)
  let peak = 0
  for (let i = 0; i < 150; i += 1) {
    // a fresh ball just under the lowest brick every frame
    const k = g.bricks.map((b, i) => (b > 0 ? i : -1)).filter(i => i >= 0).pop()
    if (k === undefined) break
    const bw = g.w / 10
    g.balls = [ball((k % 10) * bw + bw / 2, BRICK_TOP + (Math.floor(k / 10) + 1) * brickH(g.h) + 0.5, 0, -40)]
    g = step(g, DT, {})
    peak = Math.max(peak, g.particles.length)
    expect(g.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  }
  expect(peak).toBe(MAX_PARTICLES)
})

test('missing the last ball costs a life and parks a new ball on the paddle', () => {
  let g = open()
  g.balls = [ball(10, g.h + 2, 0, 40)]
  g.padX = 70
  g = run(g, 3)
  expect(g.lives).toBe(START_LIVES - 1)
  expect(g.balls.length).toBe(1)
  expect(g.balls[0]!.stuck).toBe(true)
  expect(g.balls[0]!.x).toBe(g.padX)
  expect(g.over).toBe(false)
  // a launch sends it up
  g = step(g, DT, { launch: true })
  expect(g.balls[0]!.stuck).toBe(false)
  expect(g.balls[0]!.vy).toBeLessThan(0)
})

test('losing the last life ends the run and a key after 0.5 s starts a new one', () => {
  let g = open()
  g.lives = 1
  g.score = 120
  g.balls = [ball(10, g.h + 2, 0, 40)]
  g.padX = 70
  g = run(g, 1)
  expect(g.over).toBe(true)
  expect(g.lives).toBe(0)

  // too early: ignored
  g = step(g, DT, { any: true })
  expect(g.over).toBe(true)

  g = run(g, 20)
  g = step(g, DT, { any: true })
  expect(g.over).toBe(false)
  expect(g.lives).toBe(START_LIVES)
  expect(g.score).toBe(0)
  expect(g.balls[0]!.stuck).toBe(true)
})

test('30 bonuses in one frame leave at most 2 capsules', () => {
  let g = open()
  for (let i = 0; i < 30; i += 1) g = spawnBonus(g)
  expect(g.capsules.length).toBe(MAX_CAPSULES)
  for (const c of g.capsules) {
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.x).toBeLessThanOrEqual(g.w)
  }
})

test('catching a capsule widens the paddle or adds a ball, never beyond 3 balls', () => {
  const caught = (kind: 'wide' | 'ball', balls: number): Game => {
    let g = open()
    g.balls = Array.from({ length: balls }, (_, i) => ball(10 + i * 5, 10, 0, 1))
    g.capsules = [{ x: g.padX, y: g.h - 6, kind }]

    return run(g, 10)
  }
  const base = open().padW
  const wide = caught('wide', 1)
  expect(wide.padW).toBeGreaterThan(base)
  expect(wide.capsules.length).toBe(0)
  // it wears off after 10 s
  expect(run(wide, 330).padW).toBe(base)

  expect(caught('ball', 1).balls.length).toBe(2)
  expect(caught('ball', 3).balls.length).toBe(MAX_BALLS)
  let g = caught('ball', 2)
  expect(g.balls.length).toBe(3)
  g.capsules = [{ x: g.padX, y: g.h - 6, kind: 'ball' }]
  g = run(g, 10)
  expect(g.balls.length).toBeLessThanOrEqual(MAX_BALLS)
})

test('resize clamps paddle, balls and capsules inside', () => {
  let g = open()
  g.padX = 75
  g.balls = [ball(78, 38, 10, 10)]
  g.capsules = [{ x: 79, y: 30, kind: 'wide' }]
  g = resize(g, 40, 20)
  expect(g.w).toBe(40)
  expect(g.padX).toBeLessThanOrEqual(40 - g.padW / 2)
  for (const b of g.balls) {
    expect(b.x).toBeLessThanOrEqual(40)
    expect(b.y).toBeLessThanOrEqual(20)
  }
  for (const c of g.capsules) {
    expect(c.x).toBeLessThanOrEqual(40)
    expect(c.y).toBeLessThanOrEqual(20)
  }
})

test('same seed + same inputs → identical state after 300 steps', () => {
  const play = (): Game => {
    let g = newGame(100, 50, 42)
    for (let i = 0; i < 300; i += 1) {
      g = step(g, DT, { padTo: 20 + ((i * 7) % 60), launch: i % 40 === 0, ...(i % 97 === 0 ? { any: true } : {}) })
      if (i === 100) g = spawnBonus(g)
    }

    return g
  }
  expect(JSON.stringify(play())).toBe(JSON.stringify(play()))
})
