import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'ci-smoke-bad',
    title: 'CI Smoke Bad',
    command: 'coinslot-ci-smoke-bad',
    description: 'Open the CI Smoke Bad arcade game in a pane',
    opened: 'CI Smoke Bad opened. Tap the arrow keys or WASD to steer; p pauses; esc returns to chat.',
  })
}
