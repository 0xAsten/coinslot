import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'ci-smoke-bad2',
    title: 'CI Smoke Bad Two',
    command: 'coinslot-ci-smoke-bad2',
    description: 'Open the CI Smoke Bad Two arcade game in a pane',
    opened: 'CI Smoke Bad Two opened. Tap the arrow keys or WASD to steer; p pauses; esc returns to chat.',
  })
}
