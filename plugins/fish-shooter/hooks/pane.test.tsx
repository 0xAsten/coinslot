import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'fish-shooter',
  component: 'Pane',
  requestId: 'fish-shooter',
  props: {
    title: 'Fish Shooter',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the game draws a HUD, spends a coin on a click and takes a bet key (terminal only)', async ($, on) => {
  // a fixed sim seed makes the run reproducible
  const store: Record<string, { value: unknown; version: number }> = {
    seed: { value: { shape: 'seed-1', value: 7 }, version: 1 },
  }
  on('state.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (store[e.key]?.version ?? 0) + 1
    store[e.key] = { value: e.value, version }

    return { value: { isSet: true, version } }
  })
  {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.resize({ columns: 60, rows: 20, in: 'game' })
    await ui.advance(100)

    const hud = await ui.find({ type: 'Text', text: /bet x1/, in: 'game' })
    expect(hud).toBeDefined()

    await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'game' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'game' })).toBeDefined()
    await ui.key({ key: 'up', in: 'game' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /bet x2/, in: 'game' })).toBeDefined()
    await ui.unmount()
  }
})
