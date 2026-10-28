import { expect, test } from 'claude-code/testing'

import { LINK_SHAPE } from './shared/link'

const PANE = {
  plugin: 'fish-shooter',
  component: 'Pane',
  requestId: 'fish-shooter',
  surface: 'terminal',
  props: {
    title: 'Fish Shooter',
    isFocused: true,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type Store = Record<string, { value: unknown; version: number }>

function wire(on: (event: any, fn: (...a: any[]) => any) => void, link?: { pause: null | 'done'; bonusSeq: number }) {
  // a fixed sim seed: the run is reproducible
  const store: Store = { seed: { value: { shape: 'seed-1', value: 7 }, version: 1 } }
  if (link) store.link = { value: { shape: LINK_SHAPE, value: link }, version: 1 }
  on('state.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (store[e.key]?.version ?? 0) + 1
    store[e.key] = { value: e.value, version }

    return { value: { isSet: true, version } }
  })
  const link_ = (): { pause: null | 'done'; bonusSeq: number } =>
    (store.link?.value as { value: { pause: null | 'done'; bonusSeq: number } }).value
  const save_ = () => (store.save?.value as { value: unknown } | undefined)?.value

  return { store, link: link_, save: save_ }
}

const idle = { pause: null, bonusSeq: 0 } as const

const game = async (ui: { drawn: (s: { in: string }) => Promise<unknown> }) =>
  JSON.stringify(await ui.drawn({ in: 'game' }))

test('a pause stops the tick and playing resumes it', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  const a = await game(ui)
  await ui.advance(1000)
  expect(await game(ui)).toBe(a)

  h.store.link = { value: { shape: LINK_SHAPE, value: idle }, version: 2 }
  await ui.redraw()
  await ui.advance(1000)
  expect(await game(ui)).not.toBe(a)
  await ui.unmount()
})

test('opening the pane clears a stale done pause', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: { command: 'fish-shooter' } }))
  await $.command.run({ command: 'fish-shooter', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(h.link().pause).toBe(null)
})

test('pause props draw the overlay copy', async ($, on) => {
  wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /CLAUDE IS DONE · ESC TO RETURN/, in: 'game' })).toBeDefined()
  await ui.unmount()
})

test('bonusSeq +2 spawns two golden fish', async ($, on) => {
  const h = wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  const before = JSON.stringify(await ui.drawn({ in: 'game' }))
  expect(before).not.toContain('"golden"')

  h.store.link = { value: { shape: LINK_SHAPE, value: { pause: null, bonusSeq: 2 } }, version: 2 }
  await ui.redraw()
  await ui.advance(1500)
  expect(await ui.find({ type: 'Text', text: /✦ BONUS/, in: 'game' })).toBeDefined()
  await ui.unmount()
})

test('a 70x8 region shows the size notice, then a 70x13 resize resumes with coins kept', async ($, on) => {
  wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'game' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'game' })).toBeDefined()

  await ui.resize({ columns: 70, rows: 8, in: 'game' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /Make the terminal wider or/, in: 'game' })).toBeDefined()

  await ui.resize({ columns: 70, rows: 13, in: 'game' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'game' })).toBeDefined()
  await ui.unmount()
})

test('a click while paused posts resume', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'game' })
  await ui.advance(100)
  expect(h.link().pause).toBe(null)
  await ui.unmount()
})

test('remount restores coins, bet and caught count', async ($, on) => {
  const h = wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  await ui.key({ key: 'up', in: 'game' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'game' })
  await ui.advance(1500)
  const saved = h.save() as { coins: number; bet: number; caughtCount: number }
  expect(saved.bet).toBe(2)
  expect(saved.coins).toBe(198)
  await ui.unmount()

  // the engine remounts the Client with a fresh instance and the stored snapshot
  h.store.save = { value: { shape: 'save-1', value: { coins: 321, bet: 4, caughtCount: 7 } }, version: 9 }
  const ui2 = await $.ui.mount(PANE)
  await ui2.resize({ columns: 70, rows: 20, in: 'game' })
  await ui2.advance(100)
  expect(await ui2.find({ type: 'Text', text: /¢ 321.*bet x4/, in: 'game' })).toBeDefined()
  await ui2.unmount()
})

test('a key while paused posts resume', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  await ui.key({ key: 'escape', in: 'game' })
  await ui.advance(100)
  expect(h.link().pause).toBe('done')
  await ui.key({ key: ' ', in: 'game' })
  await ui.advance(100)
  expect(h.link().pause).toBe(null)
  await ui.unmount()
})

test('ui.message resume clears the pause a turn end set', async ($, on) => {
  const h = wire(on, idle)
  on('ui.panes', () => ({ value: [{ id: 'fish-shooter', title: 'Fish Shooter', isShown: true, isFocused: false, isPlaced: true }] }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(h.link().pause).toBe('done')

  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'game' })
  await ui.advance(100)
  expect(h.link().pause).toBe(null)
  await ui.unmount()
})
