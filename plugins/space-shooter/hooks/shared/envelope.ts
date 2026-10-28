// The save envelope the shell writes: { v: version, g: game state }. Only the shape is
// checked here; the shell compares the version against the game's own `saveV`.
export function isEnvelope(v: unknown): v is { v: number; g: unknown } {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as { v?: unknown; g?: unknown }

  return typeof o.v === 'number' && o.g !== undefined
}
