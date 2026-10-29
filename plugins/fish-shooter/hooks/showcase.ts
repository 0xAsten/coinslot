import { cannonPos, type Game, type Input } from './sim'

// Aim at the most valuable live creature (ties: nearest the cannon), fire non-stop.
function bot(g: Game): Input {
  const c = cannonPos(g)
  let best: Game['creatures'][number] | undefined
  let bestD = Infinity
  for (const f of g.creatures) {
    if (f.caught) continue
    const d = Math.hypot(f.x - c.x, f.y - c.y)
    if (!best || f.value > best.value || (f.value === best.value && d < bestD)) {
      best = f
      bestD = d
    }
  }
  const input: Input = { fire: true, bet: 1, refill: g.coins < g.bet }
  if (best) input.aimTo = { x: best.x, y: best.y }

  return input
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.caughtCount,
  over: (g: Game): boolean => false,
}
