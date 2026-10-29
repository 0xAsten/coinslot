// page-side list; bots.test.ts keeps it equal to GAMES so the bundle stays free of sims
export const PAGE_GAMES = [
  { id: 'fish-shooter', name: 'FISH SHOOTER' },
  { id: 'brick-breaker', name: 'BRICK BREAKER' },
  { id: 'snake', name: 'SNAKE' },
  { id: 'space-shooter', name: 'SPACE SHOOTER' },
  { id: 'tap-flyer', name: 'TAP FLYER' },
  { id: 'jump-runner', name: 'JUMP RUNNER' },
] as const

export const MARKETPLACE = 'beasaltfish/coinslot'

export function installCommand(id: string): string {
  return `/plugin install ${id} --marketplace ${MARKETPLACE}`
}
