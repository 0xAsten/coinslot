import type { On } from 'claude-code'

// Each plugin provides these two next to hooks/shared/: atoms need literal plugin/key
// in the plugin's own files, and the engine's scan refuses $ passed as a parameter.
import { applyLink, readLink } from '../link-apply'
import { parseSave, readSave, readSeed, writeSave } from '../save-store'

import { registerClaudeLink } from './hooks-link'
import { onResume } from './link'

export type PaneOpts = { pane: string; title: string; command: string; description: string; opened?: string }

// Everything a game's register.tsx has in common: its command, the pane that hosts
// ./game.tsx, the save the shell posts, and the link hooks.
export function registerGamePane(on: On, opts: PaneOpts): void {
  registerClaudeLink(on, { title: opts.title, paneId: opts.pane })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: opts.command, description: opts.description })

    return next(e)
  })

  on('command.run', { command: opts.command }, async $ => {
    // the person just chose to play: a pause left from the last turn is stale
    await applyLink($, onResume)
    await $.ui.open({ id: opts.pane, title: opts.title, focus: true, rows: 28 })

    return { text: opts.opened ?? `${opts.title} opened. Click the pane to play; esc returns to chat.` }
  })

  on('ui.message', { data: { type: 'save' } }, async ($, e, next) => {
    const d = e.data as { type?: unknown; save?: unknown } | null
    const save = d !== null && typeof d === 'object' ? parseSave(d.save) : null
    if (save !== null) await writeSave($, save)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: opts.pane }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)

      return <Text>Coin Slot runs in the terminal.</Text>
    }
    const { Box, Client } = $.ui.resolve(e)
    const link = await readLink($)
    const saved = await readSave($)
    const seed = await readSeed($)
    // inline panes fit their tree, so a percentage height collapses to the placeholder
    const width = Math.max(20, e.props.bodyColumns)
    const height = Math.max(8, Math.min(e.props.scroll.bodyRows, 26))

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Client
          key="game"
          module="../game.tsx"
          width={width}
          height={height}
          props={{
            pause: link.pause,
            bonusSeq: link.bonusSeq,
            ...(saved ? { save: saved } : {}),
            ...(seed !== null ? { seed } : {}),
          }}
        />
      </Box>
    )
  })
}
