import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

import { isEnvelope } from './shared/envelope'

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'snake', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'snake', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

// Dev frame-time readout switch; unset in play.
const debug = atom({ plugin: 'snake', key: 'debug' } as const, null as boolean | null, { shape: 'debug-1' })

export function readDebug($: Parameters<typeof read>[0]): Promise<boolean | null> {
  return read($, debug)
}

// --- parseSave: game-specific below ---
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// The shell's envelope { v, g } around the whole run; anything without a field
// the sim reads is no save, and the run starts fresh.
export function parseSave(v: unknown): JsonValue | null {
  if (!isEnvelope(v) || v.g === null || typeof v.g !== 'object') return null
  const g = v.g as Record<string, unknown>
  if (!finite(g.score) || !finite(g.seed) || !finite(g.gw) || !finite(g.gh) || !finite(g.dir)) return null
  if (!Array.isArray(g.snake) || g.snake.length === 0 || !Array.isArray(g.bonuses) || !Array.isArray(g.queue)) return null
  if (g.food !== null && (typeof g.food !== 'object' || g.food === undefined)) return null

  return { v: v.v, g: v.g as JsonValue }
}
