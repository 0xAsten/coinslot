import type { Game, Input } from '../../plugins/space-shooter/hooks/sim'

// Sit under the lowest enemy; sidestep bullets that are about to hit.
export function bot(g: Game): Input {
  let target: Game['enemies'][number] | undefined
  for (const e of g.enemies) if (!target || e.y > target.y) target = e
  let x = target ? target.x : g.w / 2
  const near = g.bullets.find(b => Math.abs(b.x - g.ship.x) <= 4 && b.y < g.ship.y && g.ship.y - b.y <= 12)
  if (near) x = g.ship.x + (near.x >= g.ship.x ? -8 : 8)

  return { aimTo: { x, y: target ? target.y : g.ship.y }, any: g.over }
}
