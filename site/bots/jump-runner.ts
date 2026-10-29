import { RESTART_AFTER_S, RUN_W, type Game, type Input } from '../../plugins/jump-runner/hooks/sim'

// Jump when the next block is about to arrive; ignore drones.
export function bot(g: Game): Input {
  if (g.over) return { tap: g.overT > RESTART_AFTER_S }
  if (g.jumps !== 0) return {}
  const o = g.obstacles.find(b => b.kind === 'block' && b.x + b.w > g.fx)
  if (!o) return {}
  const ahead = o.x - (g.fx + RUN_W)

  return { tap: ahead <= g.speed * 0.22 }
}
