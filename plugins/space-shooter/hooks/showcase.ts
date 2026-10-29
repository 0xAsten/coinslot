import type { Game, Input } from './sim'

// Sit under the lowest enemy; sidestep bullets that are about to hit.
function bot(g: Game): Input {
  let target: Game['enemies'][number] | undefined
  for (const e of g.enemies) if (!target || e.y > target.y) target = e
  let x = target ? target.x : g.w / 2
  const near = g.bullets.find(b => Math.abs(b.x - g.ship.x) <= 4 && b.y < g.ship.y && g.ship.y - b.y <= 12)
  if (near) x = g.ship.x + (near.x >= g.ship.x ? -8 : 8)

  // stay below the enemy rows: 12 px under the target, never above 60% of the field
  const floor = g.h * 0.6
  const y = target ? Math.max(target.y + 12, floor) : Math.max(g.ship.y, floor)

  return { aimTo: { x, y: Math.min(y, g.h - 3) }, any: g.over }
}

// What the showcase recorder needs: a fixed seed, a warmup, the bot, and two gauges.
export const SHOWCASE = {
  seed: 1,
  warmupS: 1,
  bot,
  progress: (g: Game): number => g.score,
  over: (g: Game): boolean => g.over,
}
