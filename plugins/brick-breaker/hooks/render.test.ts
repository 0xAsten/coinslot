import { expect, test } from 'claude-code/testing'

import { toRuns } from './shared/cells'
import { renderCells } from './render'
import { MAX_PARTICLES, newGame, step } from './sim'

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

test('a full burst at 120×30 stays well inside the 100k-char tree cap', () => {
  let g = newGame(120, 60, 9)
  g.particles = []
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    g.particles.push({ x: 10 + ((i * 7) % 100), y: 6 + ((i * 3) % 20), vx: 0, vy: 0, life: 0.4, max: 0.8, color: 0xe8484f + i * 0x010203 })
  }
  g = step(g, 0.033, {})
  const c = renderCells(g)
  const masked = { ...c, fg: c.fg.map(v => v & 0xe0e0e0), bg: c.bg.map(v => v & 0xe0e0e0) }
  const runs = toRuns(masked).reduce((n, row) => n + row.length, 0)
  // each run is ~110 chars of tree; 100k chars is ~800 runs, so keep a margin
  expect(runs).toBeLessThan(600)
})
