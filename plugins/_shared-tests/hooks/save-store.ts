import { atom, read, update } from 'claude-code'
import type { JsonValue } from 'claude-code'

// Literal plugin/key atoms, as link-apply.ts: shared/hooks-pane.tsx imports this file.
const save = atom({ plugin: '_shared-tests', key: 'save' } as const, null as JsonValue | null, { shape: 'save-1' })
const seed = atom({ plugin: '_shared-tests', key: 'seed' } as const, null as number | null, { shape: 'seed-1' })

export function readSave($: Parameters<typeof read>[0]): Promise<JsonValue | null> {
  return read($, save)
}

export function writeSave($: Parameters<typeof update>[0], v: JsonValue): Promise<JsonValue | null> {
  return update($, save, () => v)
}

export function readSeed($: Parameters<typeof read>[0]): Promise<number | null> {
  return read($, seed)
}

// The shell's envelope: { v, g }. Anything else is no save.
export function parseSave(v: unknown): JsonValue | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as { v?: unknown; g?: unknown }
  if (o.v !== 1 || o.g === undefined) return null

  return v as JsonValue
}
