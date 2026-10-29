import type { Game, Input } from '../../plugins/brick-breaker/hooks/sim'

// Track the lowest descending ball; launch whenever one is stuck.
export function bot(g: Game): Input {
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
