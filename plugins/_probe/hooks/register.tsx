import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ProbeEntry } from '../types'

const PANE = 'probe'
const log = atom({ plugin: '_probe', key: 'log' } as const, [], { shape: 'probe-1' })

function add(
  $: Parameters<typeof update>[0],
  event: string,
  detail: string,
  agentId?: string,
) {
  const entry: ProbeEntry = { t: Date.now(), event, detail }
  if (agentId !== undefined) entry.agentId = agentId

  return update($, log, list => [...list, entry].slice(-30))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'probe', description: 'Open the linkage probe pane' })

    return next(e)
  })

  on('command.run', { command: 'probe' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Probe', focus: true, rows: 20 })

    return { text: 'Probe opened.' }
  })

  on('turn.start', async ($, e, next) => {
    await add($, 'turn.start', e.text.slice(0, 40), e.agentId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    await add($, 'turn.complete', e.reason, e.agentId)
    $.ui.toast(`probe: turn.complete ${e.agentId ?? 'main'}`)
    if (e.agentId === undefined) {
      const sent = await $.ui.notify('probe: turn complete')
      await add($, 'ui.notify', sent.isSent ? `sent via ${sent.channel}` : `not sent: ${sent.reason}`)
    }

    return out
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'allow') {
      await add($, 'tool.check', `${e.tool} -> ${verdict.decision}`, e.agentId)
    }

    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    await add($, 'tool.call', e.tool, e.agentId)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.focus', async ($, e, next) => {
    await add($, 'ui.focus', `${e.component}/${e.requestId} ${e.element ?? '(engine stop)'} by ${e.origin}`)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)

      return <Text>Probe needs a terminal or desktop pane.</Text>
    }
    const { Box, Client } = $.ui.resolve(e)
    const entries = await read($, log)
    const width = Math.max(20, e.props.bodyColumns)
    const height = Math.max(8, Math.min(e.props.scroll.bodyRows, 26))

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Client
          key="p"
          module="./probe.tsx"
          width={width}
          height={height}
          props={{ log: entries, focused: e.props.isFocused }}
        />
      </Box>
    )
  })
}
