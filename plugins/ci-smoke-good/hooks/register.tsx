import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'ci-smoke-good',
    title: 'CI Smoke Good',
    command: 'coinslot-ci-smoke-good',
    description: 'Open the CI Smoke Good arcade game in a pane',
    opened: 'CI Smoke Good opened. Tap the arrow keys or WASD to steer; p pauses; esc returns to chat.',
  })
}
