import { expect, test } from 'claude-code/testing'

import { toRuns } from './shared/cells'
import { renderCells } from './render'
import { newGame, spawnBonus, step } from './sim'

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

test('a busy 120×30 field with pillars and coins stays well inside the 100k-char tree cap', () => {
  let g = newGame(120, 60, 9)
  for (let i = 0; i < 300; i += 1) {
    g = step(g, 1 / 60, {})
    g.y = 30
    g.vy = 0
    g.over = false
    g = spawnBonus(g)
  }
  expect(g.obstacles.length).toBeGreaterThan(2)
  const c = renderCells(g)
  const masked = { ...c, fg: c.fg.map(v => v & 0xe0e0e0), bg: c.bg.map(v => v & 0xe0e0e0) }
  const runs = toRuns(masked).reduce((n, row) => n + row.length, 0)
  // each run is ~110 chars of tree; 100k chars is ~800 runs, so keep a margin
  expect(runs).toBeLessThan(600)
})

test('game over paints the banner', () => {
  const g = newGame(60, 30, 2)
  g.over = true
  g.overT = 1
  expect(renderCells(g).ch.join('')).toContain('GAME OVER')
})
