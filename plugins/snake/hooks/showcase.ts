import { DX, DY, type Game, type Input } from './sim'

// Greedy toward the food among the safe non-reversing turns.
function bot(g: Game): Input {
  const head = g.snake[0]
  if (g.over || !head) return { any: g.over }
  const body = g.snake.slice(0, -1)
  const food = g.food ?? head
  let best = g.dir
  let bestD = Infinity
  for (const d of [g.dir, (g.dir + 1) % 4, (g.dir + 3) % 4]) {
    const x = head.x + DX[d]!
    const y = head.y + DY[d]!
    if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) continue
    if (body.some(c => c.x === x && c.y === y)) continue
    const dist = Math.abs(food.x - x) + Math.abs(food.y - y)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }

  return { turns: best !== g.dir ? [best] : [], any: false }
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 8,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
