import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'fish-shooter', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'fish-shooter', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// The shell's envelope { v: 1, g } around the purse; anything else is no save.
export function parseSave(v: unknown): JsonValue | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as { v?: unknown; g?: unknown }
  if (o.v !== 1 || o.g === null || typeof o.g !== 'object') return null
  const { coins, bet, caughtCount } = o.g as Record<string, unknown>
  if (!finite(coins) || !finite(bet) || !finite(caughtCount)) return null

  return { v: 1, g: { coins, bet, caughtCount } }
}
