import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'space-shooter',
  component: 'Pane',
  requestId: 'space-shooter',
  props: {
    title: 'Space Shooter',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('opens on PRESS ANY KEY TO START, a key starts play, HUD shows score and lives', async ($, on) => {
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

    expect(await ui.find({ type: 'Text', text: /PRESS ANY KEY TO START/, in: 'game' })).toBeDefined()

    await ui.key({ key: 'x', in: 'game' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /PRESS ANY KEY TO START/, in: 'game' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /SCORE 0/, in: 'game' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /♥♥♥/, in: 'game' })).toBeDefined()

    // auto-fire: the ship needs no key to shoot, and the run goes on
    await ui.advance(1000)
    expect(await ui.find({ type: 'Text', text: /SCORE \d+/, in: 'game' })).toBeDefined()
    await ui.unmount()
  }
})
