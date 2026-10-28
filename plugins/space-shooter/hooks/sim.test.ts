import { expect, test } from 'claude-code/testing'

import { BOSS_HP, INVULN_S, LIVES, MAX_PODS, MAX_WEAPON, FIRE_S, newGame, overlap, podBox, resize, spawnBonus, step } from './sim'
import type { Enemy, Game, Input } from './sim'

const DT = 0.02

// a roomy field with the first wave's spawns suppressed, so a test places what it needs
function quiet(): Game {
  const g = newGame(100, 50, 7)
  g.toSpawn = 0
  g.gapT = 0
  g.enemies = []

  return g
}

function enemy(kind: Enemy['kind'], x: number, y: number, hp = 1): Enemy {
  return { kind, x, y, y0: y, vx: 0, hp, maxHp: hp, w: 5, h: 3, ph: 0, fireT: 99, hitT: 0 }
}

function run(g: Game, seconds: number, input: Input = {}): Game {
  let out = g
  for (let t = 0; t < seconds - 1e-9; t += DT) out = step(out, DT, input)

  return out
}

test('auto-fire spawns shots at the weapon rate: faster and wider with each level', () => {
  const volleys: number[] = []
  const shots: number[] = []
  for (const level of [1, 2, 3]) {
    let g = quiet()
    g.weapon = level
    g = run(g, 2)
    volleys.push(g.volleys)
    shots.push(g.fired)
  }
  // 2 s at 0.28 s a volley
  expect(volleys[0]).toBeGreaterThanOrEqual(7)
  expect(volleys[0]).toBeLessThanOrEqual(8)
  expect(volleys[1]!).toBeGreaterThan(volleys[0]!)
  expect(volleys[2]!).toBeGreaterThan(volleys[1]!)
  expect(shots[0]).toBe(volleys[0]!)
  expect(shots[1]).toBe(volleys[1]! * 2)
  expect(shots[2]).toBe(volleys[2]! * 3)
  expect(FIRE_S[0]).toBeGreaterThan(FIRE_S[1]!)
})

test('a shot destroys an enemy and scores', () => {
  let g = quiet()
  g.enemies = [enemy('drone', g.ship.x + 20, g.ship.y)]
  const before = g.score
  for (let i = 0; i < 100 && g.enemies.length > 0; i += 1) g = step(g, DT)
  expect(g.enemies.length).toBe(0)
  expect(g.score).toBeGreaterThan(before)
  expect(g.particles.length).toBeGreaterThan(0)
})

test('a tank takes three hits', () => {
  let g = quiet()
  g.enemies = [enemy('tank', g.ship.x + 30, g.ship.y, 3)]
  g = run(g, 0.5)
  expect(g.enemies[0]!.hp).toBeLessThan(3)
  g = run(g, 2)
  expect(g.enemies.some(e => e.kind === 'tank')).toBe(false)
})

test('a hit costs a life and grants invulnerability for its window', () => {
  let g = quiet()
  g.enemies = [enemy('drone', g.ship.x, g.ship.y)]
  g = step(g, DT)
  expect(g.lives).toBe(LIVES - 1)
  expect(g.inv).toBeGreaterThan(INVULN_S - 0.1)
  expect(g.enemies.length).toBe(0)

  // inside the window a second contact costs nothing
  g.enemies = [enemy('drone', g.ship.x, g.ship.y)]
  g = step(g, DT)
  expect(g.lives).toBe(LIVES - 1)

  // after it a contact does
  g = run(g, INVULN_S + 0.1)
  expect(g.inv).toBe(0)
  g.enemies = [enemy('drone', g.ship.x, g.ship.y)]
  g = step(g, DT)
  expect(g.lives).toBe(LIVES - 2)
})

test('losing the last life ends the run, and a key restarts it after a beat', () => {
  let g = quiet()
  g.lives = 1
  g.enemies = [enemy('drone', g.ship.x, g.ship.y)]
  g = step(g, DT)
  expect(g.over).toBe(true)
  expect(g.lives).toBe(0)
  g = step(g, DT, { any: true })
  expect(g.over).toBe(true)
  g = run(g, 0.6)
  g = step(g, DT, { any: true })
  expect(g.over).toBe(false)
  expect(g.lives).toBe(LIVES)
  expect(g.wave).toBe(1)
})

test('a shield absorbs one hit', () => {
  let g = quiet()
  g.shield = true
  g.enemies = [enemy('drone', g.ship.x, g.ship.y)]
  g = step(g, DT)
  expect(g.lives).toBe(LIVES)
  expect(g.shield).toBe(false)
})

test('the 5th wave is a boss and the 6th wave follows its defeat', () => {
  let g = quiet()
  g.wave = 4
  g = run(g, 0.1)
  expect(g.wave).toBe(5)
  g = run(g, 3)
  const boss = g.enemies.find(e => e.kind === 'boss')!
  expect(boss).toBeDefined()
  expect(boss.maxHp).toBe(BOSS_HP(5))
  expect(g.enemies.filter(e => e.kind !== 'boss').length).toBe(0)

  // finish it with one shot
  boss.hp = 1
  g.shots = [{ x: boss.x, y: boss.y, vx: 0, vy: 0 }]
  const score = g.score
  g = step(g, DT)
  expect(g.enemies.some(e => e.kind === 'boss')).toBe(false)
  expect(g.score).toBeGreaterThan(score + 100)
  g = run(g, 3)
  expect(g.wave).toBe(6)
  expect(g.enemies.some(e => e.kind === 'boss')).toBe(false)
})

test('weapon level never exceeds 3', () => {
  let g = quiet()
  for (let i = 0; i < 8; i += 1) {
    g.pods = [{ x: g.ship.x, y: g.ship.y, kind: 'weapon' }]
    g = step(g, DT)
    expect(g.weapon).toBeLessThanOrEqual(MAX_WEAPON)
  }
  expect(g.weapon).toBe(MAX_WEAPON)
})

test('30 bonuses → at most 2 pods, none spawned overlapping an enemy', () => {
  let g = newGame(100, 50, 3)
  g.toSpawn = 0
  g.gapT = 0
  g.enemies = []
  for (let i = 0; i < 6; i += 1) g.enemies.push(enemy('drone', 60 + i * 6, 8 + i * 7))
  for (let i = 0; i < 30; i += 1) {
    const before = g.pods.length
    g = spawnBonus(g)
    expect(g.pods.length).toBeLessThanOrEqual(MAX_PODS)
    for (const p of g.pods.slice(before)) {
      const b = podBox(p)
      for (const e of g.enemies) expect(overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)).toBe(false)
    }
    // a pod is picked up or leaves now and then, so the cap is exercised both ways
    if (i % 7 === 6) g.pods = []
  }
  expect(g.pods.length).toBeLessThanOrEqual(MAX_PODS)
})

test('pointer steers the ship toward the pointer without teleporting', () => {
  let g = quiet()
  const y0 = g.ship.y
  const target = { x: g.ship.x, y: y0 + 20 }
  g = step(g, DT, { aimTo: target })
  expect(g.ship.y).toBeGreaterThan(y0)
  expect(g.ship.y).toBeLessThan(target.y)
  g = run(g, 2, {})
  expect(Math.abs(g.ship.y - target.y)).toBeLessThan(1)
  // a tap on an arrow takes the wheel back
  const at = g.ship.y
  g = step(g, DT, { dy: -3 })
  expect(g.aim).toBeNull()
  expect(g.ship.y).toBe(at - 3)
})

test('resize clamps the ship and drops off-field entities', () => {
  let g = quiet()
  g.ship = { x: 30, y: 45 }
  g.enemies = [enemy('drone', 90, 40), enemy('drone', 20, 10)]
  g.shots = [{ x: 90, y: 20, vx: 90, vy: 0 }, { x: 10, y: 10, vx: 90, vy: 0 }]
  g.pods = [{ x: 95, y: 30, kind: 'shield' }]
  g.bullets = [{ x: 80, y: 10, vx: -30, vy: 0 }]
  const r = resize(g, 40, 20)
  expect(r.w).toBe(40)
  expect(r.ship.y).toBeLessThanOrEqual(19)
  expect(r.ship.x).toBeLessThanOrEqual(40)
  expect(r.enemies.length).toBe(1)
  expect(r.shots.length).toBe(1)
  expect(r.pods.length).toBe(0)
  expect(r.bullets.length).toBe(0)
})

test('same seed + same inputs → identical state, and a steady run never wanders off', () => {
  const inputs: Input[] = [{ aimTo: { x: 10, y: 30 } }, { dy: -3 }, {}, { dx: 3 }]
  const go = (): Game => {
    let g = newGame(100, 50, 11)
    for (let i = 0; i < 600; i += 1) {
      if (i % 90 === 0) g = spawnBonus(g)
      g = step(g, 0.033, inputs[i % inputs.length]!)
    }

    return g
  }
  expect(go()).toEqual(go())
  const g = go()
  expect(g.enemies.length + g.shots.length).toBeLessThan(80)
  expect(g.bullets.length).toBeLessThanOrEqual(60)
  expect(g.particles.length).toBeLessThanOrEqual(120)
})
