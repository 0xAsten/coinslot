import { expect, test } from 'claude-code/testing'

import { BONUS_SCORE, MAX_BONUSES, STEP_MIN_S, newGame, resize, spawnBonus, step, stepInterval } from './sim'
import type { Game, Input } from './sim'

const UP = 0
const RIGHT = 1
const DOWN = 2
const LEFT = 3

// one grid step at the current speed
const every = (g: Game): number => stepInterval(g.snake.length)

function tick(g: Game, input: Input = {}): Game {
  return step(g, every(g), input)
}

// a roomy field with the food parked out of the way, snake of 3 heading right from the middle
function open(): Game {
  const g = newGame(80, 40, 7)
  g.food = { x: 0, y: 0 }

  return g
}

const head = (g: Game) => g.snake[0]!

test('turns queue: ↑ then ← inside one tick turn over two ticks, never a reversal', () => {
  let g = open()
  const h0 = { ...head(g) }
  // moving right; both keys land in the same tick
  g = step(g, 0.001, { turns: [UP, LEFT] })
  expect(g.queue).toEqual([UP, LEFT])
  g = step(g, every(g), {})
  expect(g.dir).toBe(UP)
  expect(head(g)).toEqual({ x: h0.x, y: h0.y - 1 })
  g = tick(g)
  expect(g.dir).toBe(LEFT)
  expect(head(g)).toEqual({ x: h0.x - 1, y: h0.y - 1 })
  expect(g.over).toBe(false)
})

test('a reversal key alone is ignored', () => {
  let g = open()
  g = step(g, 0.001, { turns: [LEFT] })
  expect(g.queue).toEqual([])
  const x0 = head(g).x
  g = tick(g)
  expect(g.dir).toBe(RIGHT)
  expect(head(g).x).toBe(x0 + 1)
  expect(g.over).toBe(false)
  // the same direction twice is a no-op too, and the queue is bounded
  g = step(g, 0.001, { turns: [RIGHT, UP, UP, DOWN, LEFT, RIGHT] })
  expect(g.queue).toEqual([UP, LEFT])
})

test('movement happens once per grid step, not every tick', () => {
  let g = open()
  const x0 = head(g).x
  g = step(g, 0.033, {})
  expect(head(g).x).toBe(x0)
  g = tick(g)
  expect(head(g).x).toBe(x0 + 1)
})

test('eating food grows by one and scores', () => {
  let g = open()
  g.food = { x: head(g).x + 1, y: head(g).y }
  const len = g.snake.length
  g = tick(g)
  expect(g.score).toBe(1)
  expect(g.snake.length).toBe(len + 1)
  expect(g.food).not.toBeNull()
  expect(g.snake.some(s => s.x === g.food!.x && s.y === g.food!.y)).toBe(false)
  g = tick(g)
  expect(g.snake.length).toBe(len + 1)
})

test('eating a bonus scores 5 and grows by one', () => {
  let g = open()
  g.bonuses = [{ x: head(g).x + 1, y: head(g).y, life: 5 }]
  const len = g.snake.length
  g = tick(g)
  expect(g.score).toBe(BONUS_SCORE)
  expect(g.bonuses.length).toBe(0)
  expect(g.snake.length).toBe(len + 1)
})

test('speed rises gently with length and stops at a floor', () => {
  expect(stepInterval(10)).toBeLessThan(stepInterval(3))
  expect(stepInterval(10)).toBeGreaterThan(stepInterval(3) * 0.8)
  expect(stepInterval(500)).toBe(STEP_MIN_S)
})

test('wall and self collisions end the run', () => {
  let g = open()
  for (let i = 0; i < 60 && !g.over; i += 1) g = tick(g)
  expect(g.over).toBe(true)
  // stopped at the wall, not past it
  expect(head(g).x).toBeLessThan(g.gw)

  // a snake long enough to bite itself: up, left, down into its own body
  g = open()
  g.snake = [
    { x: 12, y: 10 },
    { x: 11, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 11 },
    { x: 11, y: 11 },
    { x: 12, y: 11 },
    { x: 13, y: 11 },
  ]
  g.dir = UP
  g = step(g, 0.001, { turns: [LEFT, DOWN] })
  g = tick(g) // left
  g = tick(g) // down into its own body
  expect(g.over).toBe(true)
})

test('the cell the tail just left is safe to enter', () => {
  let g = open()
  // a 2x2 loop: head chases its own tail without dying
  g.snake = [
    { x: 10, y: 10 },
    { x: 10, y: 11 },
    { x: 11, y: 11 },
    { x: 11, y: 10 },
  ]
  g.dir = UP
  g = step(g, 0.001, { turns: [RIGHT] })
  g = tick(g)
  expect(g.over).toBe(false)
  expect(head(g)).toEqual({ x: 11, y: 10 })
})

test('a key in the first 0.5 s after the end does not restart', () => {
  let g = open()
  for (let i = 0; i < 60 && !g.over; i += 1) g = tick(g)
  expect(g.over).toBe(true)
  g = step(g, 0.1, { any: true })
  expect(g.over).toBe(true)
  for (let i = 0; i < 6; i += 1) g = step(g, 0.1, {})
  g = step(g, 0.033, { any: true })
  expect(g.over).toBe(false)
  expect(g.score).toBe(0)
  expect(g.snake.length).toBe(3)
})

test('30 bonuses → at most 2 glowing foods, never on the snake', () => {
  let g = open()
  for (let i = 0; i < 30; i += 1) g = spawnBonus(g)
  expect(g.bonuses.length).toBe(MAX_BONUSES)
  for (const b of g.bonuses) {
    expect(g.snake.some(s => s.x === b.x && s.y === b.y)).toBe(false)
    expect(b.x >= 0 && b.x < g.gw && b.y >= 0 && b.y < g.gh).toBe(true)
  }
  expect(g.bonuses[0]).not.toEqual(g.bonuses[1])
  // they never touch the snake's pace
  expect(every(g)).toBe(stepInterval(3))
})

test('a bonus fades after its time', () => {
  let g = spawnBonus(open())
  expect(g.bonuses[0]!.life).toBeGreaterThan(5)
  g.bonuses[0]!.life = 0.1
  for (let i = 0; i < 5; i += 1) g = step(g, 0.033, {})
  expect(g.bonuses.length).toBe(0)
})

test('resize to a smaller field keeps the snake inside or ends the run cleanly, never throws', () => {
  let g = open()
  g.bonuses = [{ x: 30, y: 15, life: 5 }]
  g.food = { x: 35, y: 18 }
  const small = resize(g, 44, 24)
  expect(small.gw).toBe(21)
  expect(small.over).toBe(false)
  expect(small.bonuses.length).toBe(0)
  for (const c of small.snake) expect(c.x < small.gw && c.y < small.gh).toBe(true)
  const f = small.food!
  expect(f.x < small.gw && f.y < small.gh).toBe(true)
  expect(small.snake.some(s => s.x === f.x && s.y === f.y)).toBe(false)

  // the snake sits where the smaller field has no room
  g = open()
  g.snake = [{ x: 35, y: 18 }, { x: 34, y: 18 }, { x: 33, y: 18 }]
  const cut = resize(g, 40, 24)
  expect(cut.over).toBe(true)
  // and a grown field leaves it alone
  const big = resize(g, 120, 60)
  expect(big.over).toBe(false)
  expect(big.snake).toEqual(g.snake)
  // a run that ended cleanly can be restarted
  const again = step(step(cut, 0.6, {}), 0.033, { any: true })
  expect(again.over).toBe(false)
})

test('same seed + same inputs → identical state after 300 steps', () => {
  const play = (): Game => {
    let g = newGame(100, 50, 42)
    for (let i = 0; i < 300; i += 1) {
      g = step(g, 0.033, { turns: i % 9 === 0 ? [(i / 9) % 4] : [], ...(i % 97 === 0 ? { any: true } : {}) })
      if (i === 100) g = spawnBonus(g)
    }

    return g
  }
  expect(JSON.stringify(play())).toBe(JSON.stringify(play()))
})
