import type { Register } from 'claude-code'

import { applyLink, readLink } from './link-apply'
import { readSave, readSeed, writeSave } from './save-store'
import { registerClaudeLink } from './shared/hooks-link'
import { onResume } from './shared/link'

const PANE = 'reef-net'
const TITLE = 'Reef Net'

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const register: Register = on => {
  registerClaudeLink(on, { title: TITLE, paneId: PANE })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'reef',
      description: 'Open the Reef Net arcade game in a pane',
    })

    return next(e)
  })

  on('command.run', { command: 'reef' }, async $ => {
    // the person just chose to play: a pause left from the last turn is stale
    await applyLink($, onResume)
    await $.ui.open({ id: PANE, title: TITLE, focus: true, rows: 28 })

    return { text: 'Reef Net opened. Click the pane to aim; esc returns to chat.' }
  })

  on('ui.message', { data: { type: 'save' } }, async ($, e, next) => {
    const d = e.data as { type?: unknown; save?: Record<string, unknown> } | null
    if (d !== null && typeof d === 'object' && d.save && typeof d.save === 'object') {
      const { coins, bet, caughtCount } = d.save
      if (finite(coins) && finite(bet) && finite(caughtCount)) {
        await writeSave($, { coins, bet, caughtCount })
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
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
          key="reef"
          module="./game.tsx"
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
