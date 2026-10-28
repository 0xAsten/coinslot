import { expect, test } from 'claude-code/testing'

import { newGame, spawnBonus, step, START_COINS } from './sim'
import type { Creature, Game } from './sim'

function quiet(): Game {
  const g = newGame(80, 60, 7)
  g.spawning = false
  g.creatures = []

  return g
}

function fish(g: Game, x: number, y: number, hp = 1): Creature {
  return {
    id: 999,
    kind: 'fish',
    x,
    y,
    ang: 0,
    turn: 0,
    speed: 0,
    hp,
    maxHp: hp,
    r: 2.6,
    value: 2,
    age: 0,
    flash: 0,
    caught: false,
  }
}

function run(g: Game, seconds: number, first = {}): Game {
  let s = g
  for (let i = 0; i < Math.round(seconds / 0.033); i += 1) {
    s = step(s, 0.033, i === 0 ? first : {})
  }

  return s
}

test('a shot spends the bet', () => {
  let g = quiet()
  g.bet = 3
  g = step(g, 0.033, { fire: true })
  expect(g.coins).toBe(START_COINS - 3)
  expect(g.shots.length).toBe(1)
})

test('a net captures a creature and pays value x bet', () => {
  let g = quiet()
  g.creatures = [fish(g, 40, 20)]
  g = step(g, 0.033, { aimTo: { x: 40, y: 20 }, bet: 2 })
  expect(g.bet).toBe(3)
  const before = g.coins
  g = run(g, 2, { fire: true })
  // spent 3, won 2 * 3
  expect(g.caughtCount).toBe(1)
  expect(g.coins).toBe(before - 3 + 2 * 3)
})

test('cannot fire below the bet cost', () => {
  let g = quiet()
  g.bet = 5
  g.coins = 4
  g = step(g, 0.033, { fire: true })
  expect(g.coins).toBe(4)
  expect(g.shots.length).toBe(0)
})

test('refill restores coins only when broke', () => {
  let g = quiet()
  g.coins = 120
  g = step(g, 0.033, { refill: true })
  expect(g.coins).toBe(120)
  g.coins = 0
  g = step(g, 0.033, { refill: true })
  expect(g.coins).toBe(START_COINS)
})

test('the same seed plays out the same', () => {
  const a = run(newGame(80, 60, 3), 5, { fire: true })
  const b = run(newGame(80, 60, 3), 5, { fire: true })
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
})

test('the bet does not change the catch chance', () => {
  const rate = (bet: number) => {
    let caught = 0
    for (let k = 0; k < 400; k += 1) {
      let g = newGame(80, 60, k + 1)
      g.spawning = false
      g.creatures = [fish(g, 40, 20, 8)]
      g.bet = bet
      g = run(g, 2, { aimTo: { x: 40, y: 20 }, fire: true })
      caught += g.caughtCount
    }
    return caught / 400
  }
  const low = rate(1)
  const high = rate(5)
  expect(Math.abs(low - 1 / 8)).toBeLessThan(0.06)
  expect(Math.abs(high - 1 / 8)).toBeLessThan(0.06)
})

test('bonus fish is capped at three', () => {
  let g = quiet()
  for (let i = 0; i < 30; i += 1) g = spawnBonus(g)
  expect(g.creatures.filter(c => c.golden && !c.caught).length).toBe(3)
})

test('bonus fish pays 15 x bet', () => {
  let paid = 0
  for (let seed = 1; seed <= 20 && paid === 0; seed += 1) {
    let g = newGame(80, 60, seed)
    g.spawning = false
    g.creatures = []
    g = spawnBonus(g)
    const gold = g.creatures[0]!
    expect(gold.value).toBe(15)
    gold.x = 40
    gold.y = 20
    gold.speed = 0
    g.bet = 2
    const before = g.coins
    g = run(g, 2, { aimTo: { x: 40, y: 20 }, fire: true })
    if (g.caughtCount === 1) paid = g.coins - before + 2
  }
  expect(paid).toBe(30)
})
