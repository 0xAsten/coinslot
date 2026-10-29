import { FLY_H, OBST_W, RESTART_AFTER_S, type Game, type Input } from './sim'

// Flap whenever the flyer sinks below the next gap's centre.
function bot(g: Game): Input {
  if (g.over) return { tap: g.overT > RESTART_AFTER_S }
  const p = g.obstacles.find(o => o.x + OBST_W > g.fx)
  if (!p) return {}
  const centre = p.gapY + p.gapH / 2

  return { tap: g.vy >= 0 && g.y + FLY_H > centre + 2 }
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
