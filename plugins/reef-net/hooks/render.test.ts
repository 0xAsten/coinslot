import { expect, test } from 'claude-code/testing'

import { renderCells } from './render'
import { newGame, spawnBonus } from './sim'
import type { Game } from './sim'

function withGolden(): Game {
  let g = newGame(80, 60, 7)
  g.spawning = false
  g.creatures = []
  g = spawnBonus(g)
  const gold = g.creatures[0]!
  gold.x = 20
  gold.y = 20
  gold.ang = 0
  gold.speed = 0

  return g
}

// the cells around the fish at (20, 20): columns 14..26, cell rows 7..13
function around(g: Game) {
  const c = renderCells(g, false)
  const seen: number[] = []
  for (let y = 7; y <= 13; y += 1) {
    for (let x = 14; x <= 26; x += 1) {
      seen.push(c.fg[y * c.cols + x]!, c.bg[y * c.cols + x]!)
    }
  }

  return seen
}

test('bonus fish draws white cells on alternate phases', () => {
  const g = withGolden()
  g.t = 0
  const a = around(g)
  g.t = 0.3
  const b = around(g)
  const n = (list: number[], color: number) => list.filter(v => v === color).length
  // the body is the only large patch of either colour; scenery adds a few stray cells
  expect(n(a, 0xffd61f)).toBeGreaterThan(n(b, 0xffd61f) + 8)
  expect(n(b, 0xffffff)).toBeGreaterThan(n(a, 0xffffff) + 8)
})

test('HUD shows BONUS after a spawn', () => {
  const g = withGolden()
  const row0 = (x: Game) => renderCells(x, false).ch.slice(0, 80).join('')
  expect(row0(g)).toContain('✦ BONUS')
  expect(row0(newGame(80, 60, 7))).not.toContain('BONUS')
})
