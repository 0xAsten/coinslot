import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

import { isEnvelope } from './shared/envelope'

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'brick-breaker', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'brick-breaker', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

// Dev frame-time readout switch; unset in play.
const debug = atom({ plugin: 'brick-breaker', key: 'debug' } as const, null as boolean | null, { shape: 'debug-1' })

export function readDebug($: Parameters<typeof read>[0]): Promise<boolean | null> {
  return read($, debug)
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// The shell's envelope { v, g } around the whole run; anything without a field
// the sim reads is no save, and the run starts fresh.
export function parseSave(v: unknown): JsonValue | null {
  if (!isEnvelope(v) || v.g === null || typeof v.g !== 'object') return null
  const g = v.g as Record<string, unknown>
  if (!finite(g.score) || !finite(g.lives) || !finite(g.level) || !finite(g.seed)) return null
  if (!Array.isArray(g.bricks) || !Array.isArray(g.balls) || !Array.isArray(g.capsules) || !Array.isArray(g.particles)) return null
  if (g.padW === undefined || !finite(g.padX) || !finite(g.padW)) return null

  return { v: v.v, g: v.g as JsonValue }
}
