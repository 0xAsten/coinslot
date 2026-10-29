import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

import { isEnvelope } from './shared/envelope'

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'jump-runner', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'jump-runner', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

// Dev frame-time readout switch; unset in play.
const debug = atom({ plugin: 'jump-runner', key: 'debug' } as const, null as boolean | null, { shape: 'debug-1' })

export function readDebug($: Parameters<typeof read>[0]): Promise<boolean | null> {
  return read($, debug)
}

// --- parseSave: game-specific below ---
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const rec = (e: unknown): e is Record<string, unknown> => e !== null && typeof e === 'object' && !Array.isArray(e)

// The shell's envelope { v, g } around the whole run; anything without a field
// the sim reads is no save, and the run starts fresh.
export function parseSave(v: unknown): JsonValue | null {
  if (!isEnvelope(v) || !rec(v.g)) return null
  const g = v.g
  const nums = ['score', 'seed', 'w', 'h', 'y', 'vy', 'fx', 'overT', 't', 'pulse', 'dist', 'bonusPts', 'speed', 'jumps', 'airT', 'nextX']
  if (!nums.every(k => finite(g[k])) || typeof g.over !== 'boolean') return null
  if (!Array.isArray(g.obstacles) || !Array.isArray(g.bonuses)) return null
  // a bad entry would throw inside step on the next frame, so every one is checked here
  const obstacles = g.obstacles.every(
    e => rec(e) && (e.kind === 'block' || e.kind === 'drone') && finite(e.x) && finite(e.w) && finite(e.h),
  )
  const coins = g.bonuses.every(e => rec(e) && finite(e.x) && finite(e.y))
  if (!obstacles || !coins) return null

  return { v: v.v, g: v.g as JsonValue }
}
