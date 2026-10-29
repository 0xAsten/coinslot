import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadGames } from './games'

const DT = 1 / 30
const TICKS = 300
const root = resolve(import.meta.dir, '..')

for (const e of await loadGames(root)) {
  test(`${e.id} plays lively`, () => {
    let g = e.start(56, 56, e.seed)
    for (let i = 0; i < Math.round(e.warmupS / DT); i++) g = e.tick(g, DT)
    const p0 = e.progress(g)
    let overTicks = 0
    for (let i = 0; i < TICKS; i++) {
      g = e.tick(g, DT)
      if (e.over(g)) overTicks++
    }
    expect(overTicks / TICKS, `${e.id}: over too often`).toBeLessThan(0.1)
    expect(e.progress(g), `${e.id}: no progress`).toBeGreaterThan(p0)
    const c = e.render(g)
    expect(c.cols === 56 && c.rows === 28, `${e.id}: bad frame size`).toBe(true)
  })
}
