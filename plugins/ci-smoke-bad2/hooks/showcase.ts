import { type Game, type Input } from './sim'

// Head for the nearest coin along the longer axis.
function bot(g: Game): Input {
  let best: { x: number; y: number } | undefined
  let bestD = Infinity
  for (const c of g.coins) {
    const d = Math.abs(c.x - g.x) + Math.abs(c.y - g.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  if (best === undefined) return {}
  const dx = best.x - g.x
  const dy = best.y - g.y
  const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : dy >= 0 ? 2 : 0

  return dir !== g.dir ? { dir } : {}
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
