import { expect, test } from 'bun:test'
import { GAMES } from './index'

const DT = 1 / 30
const TICKS = 300

for (const e of GAMES) {
  test(`${e.id} plays lively`, () => {
    let g = e.start(56, 56, e.seed)
    for (let i = 0; i < Math.round(e.warmupS / DT); i++) g = e.tick(g, DT)
    const p0 = e.progress(g)
    let overTicks = 0
    for (let i = 0; i < TICKS; i++) {
      g = e.tick(g, DT)
      if (e.over(g)) overTicks++
    }
    expect(overTicks / TICKS).toBeLessThan(0.1)
    expect(e.progress(g)).toBeGreaterThan(p0)
    const c = e.render(g)
    expect(c.cols === 56 && c.rows === 28).toBe(true)
  })
}
