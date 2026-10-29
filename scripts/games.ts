import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Cells } from '../shared/cells'

export type GameMeta = { id: string; name: string; author: string }

export type GameEntry = GameMeta & {
  seed: number
  // seconds simulated before recording starts
  warmupS: number
  start(w: number, h: number, seed: number): unknown
  // bot input + step in one call
  tick(g: unknown, dt: number): unknown
  render(g: unknown): Cells
  progress(g: unknown): number
  over(g: unknown): boolean
}

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'))

// Marketplace order is the game order.
export function readGameMetas(root: string): GameMeta[] {
  const market = readJson(join(root, '.claude-plugin', 'marketplace.json'))
  return market.plugins.map((p: { name: string }): GameMeta => {
    const id = p.name
    const author = readJson(join(root, 'plugins', id, '.claude-plugin', 'plugin.json')).author?.name
    if (typeof author !== 'string' || !author.trim()) throw new Error(`${id}: plugin.json needs author.name`)
    return { id, name: id.toUpperCase().replaceAll('-', ' '), author: author.trim() }
  })
}

export async function loadGames(root: string): Promise<GameEntry[]> {
  const entries: GameEntry[] = []
  for (const meta of readGameMetas(root)) {
    const dir = join(root, 'plugins', meta.id, 'hooks')
    const sim = await import(join(dir, 'sim.ts'))
    const render = await import(join(dir, 'render.ts'))
    const { SHOWCASE: s } = await import(join(dir, 'showcase.ts'))
    entries.push({
      ...meta,
      seed: s.seed,
      warmupS: s.warmupS,
      start: (w, h, seed) => sim.newGame(w, h, seed),
      tick: (g, dt) => sim.step(g, dt, s.bot(g)),
      render: g => render.renderCells(g),
      progress: g => s.progress(g),
      over: g => s.over(g),
    })
  }
  return entries
}
