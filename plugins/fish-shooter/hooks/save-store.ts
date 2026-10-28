import { atom, read, update } from 'claude-code'

export type Snap = { coins: number; bet: number; caughtCount: number }

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'fish-shooter', key: 'save' } as const, null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<Snap | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], snap: Snap): Promise<Snap | null> {
  return update($, save, () => snap)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'fish-shooter', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}
