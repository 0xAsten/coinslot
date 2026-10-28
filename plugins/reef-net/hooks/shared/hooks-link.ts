import type { On } from 'claude-code'

// Each plugin provides hooks/link-apply.ts: `update($, link, change)` has to be
// spelled with a literal plugin/key atom in a file of the plugin itself, and the
// engine's scan refuses $ passed on through a parameter. An import is allowed.
import { applyLink } from '../link-apply'

import { onResume, onToolCall, onTurnComplete, onTurnStart } from './link'
import type { LinkState } from './link'

// Observe only: every hook returns next(e) untouched, and `.catch` hands a
// failed hook back to the engine so a bug here can never block a tool.
// tool.check is deliberately not wired: the probe showed `ask` fires for
// calls that never prompt anyone (docs/probe-findings.md).
export function registerClaudeLink(on: On, opts: { title: string; paneId: string }): void {
  on('turn.start', async ($, e, next) => {
    await applyLink($, s => onTurnStart(s, e.agentId))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // Pause and notify only for a game the person actually has open: a closed pane
    // has nothing to pause, and a notification for it would be noise.
    if (e.agentId !== undefined || !(await $.ui.panes()).some(p => p.id === opts.paneId && p.isPlaced)) return next(e)
    let before: LinkState['pause'] = null
    const after = await applyLink($, s => {
      before = s.pause

      return onTurnComplete(s, e.agentId)
    })
    if (before === null && after.pause !== null) {
      try {
        await $.ui.notify('Claude is done', { title: opts.title })
      } catch {
        // an unsent or failing notification never matters to the game
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    // AskUserQuestion no longer pauses: the engine hides the pane while the dialog is
    // up, so a needs-you overlay would only greet the person after they answered.
    await applyLink($, onToolCall)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.message', async ($, e, next) => {
    const data = e.data as { type?: unknown } | null
    if (data !== null && typeof data === 'object' && data.type === 'resume') {
      await applyLink($, onResume)
    }

    return next(e)
  }).catch(($, e, next) => next(e))
}
