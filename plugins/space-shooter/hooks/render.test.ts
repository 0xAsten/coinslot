import { expect, test } from 'claude-code/testing'

import { toRuns } from './shared/cells'
import { renderCells } from './render'
import { MAX_BULLETS, MAX_PARTICLES, newGame, step } from './sim'
import type { Enemy } from './sim'

for (const [cols, rows] of [
  [40, 10],
  [120, 30],
] as const) {
  test(`render returns cols × rows cells at ${cols}×${rows}`, () => {
    const g = newGame(cols, rows * 2, 5)
    const c = renderCells(g)
    expect(c.cols).toBe(cols)
    expect(c.rows).toBe(rows)
    expect(c.ch.length).toBe(cols * rows)
    expect(c.fg.length).toBe(cols * rows)
    expect(c.bg.length).toBe(cols * rows)
  })
}

test('a busy boss scene at 120×30 stays well inside the 100k-char tree cap', () => {
  let g = newGame(120, 60, 9)
  g.wave = 5
  g.weapon = 3
  g.shield = true
  g.toSpawn = 0
  g.gapT = 0
  const kinds = ['drone', 'wavey', 'tank', 'gunner'] as const
  g.enemies = [{ kind: 'boss', x: 108, y: 30, y0: 30, vx: 0, hp: 30, maxHp: 30, w: 12, h: 8, ph: 0, fireT: 1, hitT: 0.05 }]
  for (let i = 0; i < 10; i += 1) {
    const e: Enemy = { kind: kinds[i % 4]!, x: 40 + i * 7, y: 8 + ((i * 11) % 44), y0: 20, vx: 0, hp: 2, maxHp: 2, w: 5, h: 3, ph: i, fireT: 9, hitT: 0 }
    g.enemies.push(e)
  }
  for (let i = 0; i < MAX_BULLETS; i += 1) g.bullets.push({ x: 30 + ((i * 13) % 85), y: 4 + ((i * 7) % 52), vx: -30, vy: 0 })
  for (let i = 0; i < 12; i += 1) g.shots.push({ x: 10 + i * 6, y: 20 + (i % 3) * 3, vx: 90, vy: 0 })
  g.pods = [{ x: 70, y: 25, kind: 'weapon' }, { x: 80, y: 40, kind: 'shield' }]
  for (let i = 0; i < MAX_PARTICLES; i += 1) g.particles.push({ x: 20 + ((i * 7) % 90), y: 6 + ((i * 3) % 50), vx: 0, vy: 0, life: 0.4, max: 0.8, color: 0xff8030 + i * 0x010203 })
  g = step(g, 0.001, {})
  const c = renderCells(g)
  const masked = { ...c, fg: c.fg.map(v => v & 0xe0e0e0), bg: c.bg.map(v => v & 0xe0e0e0) }
  const runs = toRuns(masked).reduce((n, row) => n + row.length, 0)
  // each run is ~110 chars of tree; 100k chars is ~800 runs, so keep a margin
  expect(runs).toBeLessThan(600)
})
