import { atom, read, update } from 'claude-code'

import { LINK_INITIAL } from './shared/link'
import type { LinkState } from './shared/link'

// The per-plugin half of shared/hooks-link.ts: the atom needs literal plugin/key.
const link = atom({ plugin: 'reef-net', key: 'link' } as const, LINK_INITIAL, { shape: 'link-1' })

export function applyLink($: Parameters<typeof update>[0], change: (s: LinkState) => LinkState): Promise<LinkState> {
  return update($, link, change)
}

export function readLink($: Parameters<typeof read>[0]): Promise<LinkState> {
  return read($, link)
}
