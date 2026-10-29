import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

import { isEnvelope } from './shared/envelope'

// A Client is dropped and rebuilt whenever a dialog opens and closes, so the run
// lives here and comes back through props. Literal plugin/key, as link-apply.ts.
const save = atom({ plugin: 'ci-smoke-bad2', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

// Optional fixed RNG seed for tests and the showcase recorder; unset in play.
const seed = atom({ plugin: 'ci-smoke-bad2', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

// Dev frame-time readout switch; unset in play.
const debug = atom({ plugin: 'ci-smoke-bad2', key: 'debug' } as const, null as boolean | null, { shape: 'debug-1' })

export function readDebug($: Parameters<typeof read>[0]): Promise<boolean | null> {
  return read($, debug)
}

// --- parseSave: game-specific below ---
// Return the envelope when it holds every field your sim reads, else null (a fresh run).
// While this returns null nothing is saved; see another game's save-store.ts for the shape.
export function parseSave(v: unknown): JsonValue | null {
  void v

  return null
}
