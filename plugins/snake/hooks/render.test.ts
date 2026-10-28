import { expect, test } from 'claude-code/testing'

import { toRuns } from './shared/cells'
import { renderCells } from './render'
import { newGame } from './sim'

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

test('a very long snake with bonuses at 120×30 stays well inside the 100k-char tree cap', () => {
  const g = newGame(120, 60, 9)
  // a serpentine through the whole grid
  g.snake = []
  for (let y = 0; y < g.gh; y += 1) {
    for (let k = 0; k < g.gw; k += 1) g.snake.push({ x: y % 2 === 0 ? g.gw - 1 - k : k, y: g.gh - 1 - y })
  }
  g.snake = g.snake.slice(0, 600)
  g.food = null
  g.bonuses = []
  const c = renderCells(g)
  const masked = { ...c, fg: c.fg.map(v => v & 0xe0e0e0), bg: c.bg.map(v => v & 0xe0e0e0) }
  const runs = toRuns(masked).reduce((n, row) => n + row.length, 0)
  // each run is ~110 chars of tree; 100k chars is ~800 runs, so keep a margin
  expect(runs).toBeLessThan(600)
})
