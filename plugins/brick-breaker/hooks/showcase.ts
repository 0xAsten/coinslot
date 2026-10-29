import type { Game, Input } from './sim'

// Track the lowest descending ball; launch whenever one is stuck.
function bot(g: Game): Input {
  let target = g.balls[0]
  let low = -Infinity
  for (const b of g.balls) {
    if (b.vy > 0 && b.y > low) {
      low = b.y
      target = b
    }
  }

  return { padTo: target ? target.x : g.padX, launch: true, any: g.over }
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
