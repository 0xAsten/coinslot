import { RESTART_AFTER_S, RUN_W, type Game, type Input } from './sim'

// Jump when the next block is about to arrive; ignore drones.
function bot(g: Game): Input {
  if (g.over) return { tap: g.overT > RESTART_AFTER_S }
  if (g.jumps !== 0) return {}
  const o = g.obstacles.find(b => b.kind === 'block' && b.x + b.w > g.fx)
  if (!o) return {}
  const ahead = o.x - (g.fx + RUN_W)

  return { tap: ahead <= g.speed * 0.22 }
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
