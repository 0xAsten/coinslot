import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'reef-net',
  component: 'Pane',
  requestId: 'reef-net',
  props: {
    title: 'Reef Net',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the game draws a HUD, spends a coin on a click and takes a bet key (terminal only)', async $ => {
  {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.resize({ columns: 60, rows: 20, in: 'reef' })
    await ui.advance(100)

    const hud = await ui.find({ type: 'Text', text: /bet x1/, in: 'reef' })
    expect(hud).toBeDefined()

    await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'reef' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'reef' })).toBeDefined()
    await ui.key({ key: 'up', in: 'reef' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /bet x2/, in: 'reef' })).toBeDefined()
    await ui.unmount()
  }
})
