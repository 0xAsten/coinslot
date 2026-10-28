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

test('a busy 120×30 field with obstacles and coins stays well inside the 100k-char tree cap', () => {
  let g = newGame(120, 60, 9)
  let worst = 0
  for (let i = 0; i < 1500; i += 1) {
    g = step(g, 1 / 60, {})
    g.over = false
    if (i % 5 === 0) g = spawnBonus(g)
    if (i % 100 === 0) {
      const c = renderCells(g)
      const masked = { ...c, fg: c.fg.map(v => v & 0xe0e0e0), bg: c.bg.map(v => v & 0xe0e0e0) }
      worst = Math.max(worst, toRuns(masked).reduce((n, row) => n + row.length, 0))
    }
  }
  expect(g.obstacles.length).toBeGreaterThan(0)
  expect(worst).toBeGreaterThan(0)
  // each run is ~110 chars of tree; 100k chars is ~800 runs, so keep a margin
  expect(worst).toBeLessThan(600)
})

test('game over paints the banner', () => {
  const g = newGame(60, 30, 2)
  g.over = true
  g.overT = 1
  expect(renderCells(g).ch.join('')).toContain('GAME OVER')
})

test('the HUD names p and esc, and never claims esc pauses', () => {
  const text = renderCells(newGame(120, 30, 2)).ch.join('')
  expect(text).toContain('p pause')
  expect(text).toContain('esc back to chat')
  expect(text).not.toMatch(/esc pause/i)
})
