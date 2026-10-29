import { expect, test } from 'claude-code/testing'

import { BONUS_VALUE, COIN_COUNT, FOREVER, newGame, resize, spawnBonus, step } from './sim'

test('the dot keeps heading the way it was last steered', () => {
  let g = newGame(60, 40, 3)
  const x0 = g.x
  g = step(g, 0.1, {})
  expect(g.x).toBeGreaterThan(x0)
  g = step(g, 0.1, { dir: 0 })
  const y1 = g.y
  g = step(g, 0.1, {})
  expect(g.y).toBeLessThan(y1)
})

test('touching a coin scores it and the field refills', () => {
  let g = newGame(60, 40, 3)
  g.coins = [{ x: g.x + 1, y: g.y, value: 1, life: FOREVER }]
  g = step(g, 0.01, {})
  expect(g.score).toBe(1)
  expect(g.coins.length).toBe(COIN_COUNT)
})

test('the dot stops at the walls', () => {
  let g = newGame(60, 40, 3)
  g = step(g, 10, { dir: 1 })
  expect(g.x).toBe(59)
})

test('bonus coins are capped at two and expire', () => {
  let g = newGame(60, 40, 3)
  for (let i = 0; i < 5; i += 1) g = spawnBonus(g)
  expect(g.coins.filter(c => c.value === BONUS_VALUE).length).toBe(2)
  g.coins = g.coins.filter(c => c.value !== BONUS_VALUE)
  g = spawnBonus(g)
  g = step({ ...g, x: 0, y: 2, dir: 3 }, 11, {})
  expect(g.coins.some(c => c.value === BONUS_VALUE)).toBe(false)
})

test('resize keeps everything inside the smaller field', () => {
  const g = resize(newGame(80, 60, 3), 30, 20)
  expect(g.x).toBeLessThanOrEqual(29)
  expect(g.coins.every(c => c.x <= 29 && c.y <= 19)).toBe(true)
})

test('same seed, same run', () => {
  const run = () => {
    let g = newGame(60, 40, 9)
    for (let i = 0; i < 50; i += 1) g = step(g, 1 / 30, i % 20 === 0 ? { dir: i % 4 } : {})

    return JSON.stringify(g)
  }
  expect(run()).toBe(run())
})
