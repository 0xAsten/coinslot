// @host-only: mounts the dummy game, which only the _shared-tests plugin carries.
import { expect, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { LINK_SHAPE } from './link'

const PANE = {
  plugin: '_shared-tests',
  component: 'Pane',
  requestId: 'game',
  surface: 'terminal',
  props: {
    title: 'Shared tests',
    isFocused: true,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type Store = Record<string, { value: unknown; version: number }>
type Link = { pause: null | 'done'; bonusSeq: number }

function wire(on: (event: any, fn: (...a: any[]) => any) => void, opts: { save?: unknown; link?: Link } = {}) {
  const store: Store = { seed: { value: { shape: 'seed-1', value: 7 }, version: 1 } }
  if (opts.save !== undefined) store.save = { value: { shape: 'save-1', value: opts.save }, version: 1 }
  if (opts.link) store.link = { value: { shape: LINK_SHAPE, value: opts.link }, version: 1 }
  const saves: unknown[] = []
  on('state.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (store[e.key]?.version ?? 0) + 1
    store[e.key] = { value: e.value, version }
    if (e.key === 'save') saves.push((e.value as { value: unknown }).value)

    return { value: { isSet: true, version } }
  })
  const link = (): Link => (store.link?.value as { value: Link }).value

  return { store, saves, link }
}

type Ui = Mounted<'terminal'>

const frame = async (ui: Ui) => JSON.stringify(await ui.drawn({ in: 'game' }))
const has = async (ui: Ui, text: RegExp) => (await ui.find({ type: 'Text', text, in: 'game' })) !== undefined
const open = async ($: any, cols = 70, rows = 20) => {
  const ui: Ui = await $.ui.mount(PANE)
  await ui.resize({ columns: cols, rows, in: 'game' })
  await ui.advance(100)

  return ui
}
const press = async (ui: Ui, key: string) => {
  await ui.key({ key, in: 'game' })
  await ui.advance(100)
}

test('fresh mount with start policy waits for a key', async ($, on) => {
  wire(on)
  const ui = await open($)
  expect(await has(ui, /PRESS ANY KEY TO START/)).toBe(true)
  const a = await frame(ui)
  await ui.advance(1000)
  expect(await frame(ui)).toBe(a)

  await press(ui, 'x')
  await ui.advance(100)
  expect(await frame(ui)).not.toBe(a)
  expect(await has(ui, /PRESS ANY KEY TO START/)).toBe(false)
  await ui.unmount()
})

test('escape pauses and any key resumes', async ($, on) => {
  wire(on)
  const ui = await open($)
  await press(ui, 'x')
  await press(ui, 'escape')
  expect(await has(ui, /PAUSED · PRESS ANY KEY/)).toBe(true)
  const a = await frame(ui)
  await ui.advance(1000)
  expect(await frame(ui)).toBe(a)

  await press(ui, 'x')
  await ui.advance(100)
  expect(await has(ui, /PAUSED/)).toBe(false)
  expect(await frame(ui)).not.toBe(a)
  await ui.unmount()
})

test('idle pause after idleMs without input', async ($, on) => {
  wire(on)
  const ui = await open($)
  await press(ui, 'x')
  await ui.advance(3100)
  expect(await has(ui, /PAUSED · PRESS ANY KEY/)).toBe(true)
  await ui.unmount()

  const busy = await open($)
  await press(busy, 'x')
  for (let i = 0; i < 6; i++) {
    await busy.advance(1000)
    await press(busy, 'x')
  }
  expect(await has(busy, /PAUSED/)).toBe(false)
  await busy.unmount()
})

test('a remount with a save comes back paused with that state', async ($, on) => {
  wire(on, { save: { v: 1, g: { counter: 42, x: 3, w: 70, h: 40, frozen: false, last: '-', clicks: 0 } } })
  const ui = await open($)
  expect(await has(ui, /PAUSED · PRESS ANY KEY/)).toBe(true)
  expect(await has(ui, /counter 42\b/)).toBe(true)
  await press(ui, 'x')
  await ui.advance(200)
  expect(await has(ui, /counter (4[3-9]|5[0-9])\b/)).toBe(true)
  await ui.unmount()
})

for (const [name, bad] of [['another version', { v: 0, g: {} }], ['garbage', 'garbage']] as const) {
  test(`a save from ${name} is ignored`, async ($, on) => {
    wire(on, { save: bad })
    const ui = await open($)
    expect(await has(ui, /PRESS ANY KEY TO START/)).toBe(true)
    expect(await has(ui, /counter 0\b/)).toBe(true)
    await ui.unmount()
  })
}

test('resize keeps the run', async ($, on) => {
  wire(on)
  const ui = await open($, 70, 20)
  await press(ui, 'x')
  await ui.advance(500)
  expect(await has(ui, /counter 1[0-9]\b/)).toBe(true)

  await ui.resize({ columns: 120, rows: 30, in: 'game' })
  await ui.advance(500)
  expect(await has(ui, /counter (2[0-9]|3[0-9])\b/)).toBe(true)

  await ui.resize({ columns: 40, rows: 10, in: 'game' })
  await ui.advance(500)
  expect(await has(ui, /counter ([3-9][0-9])\b/)).toBe(true)

  await ui.resize({ columns: 39, rows: 10, in: 'game' })
  await ui.advance(100)
  expect(await has(ui, /Make the terminal wider or/)).toBe(true)
  await ui.resize({ columns: 70, rows: 20, in: 'game' })
  await ui.advance(100)
  expect(await has(ui, /counter \d+/)).toBe(true)
  await ui.unmount()
})

test('done outranks a local hold and a key resumes both', async ($, on) => {
  const h = wire(on, {
    save: { v: 1, g: { counter: 5, x: 1, w: 70, h: 40, frozen: false, last: '-', clicks: 0 } },
    link: { pause: 'done', bonusSeq: 0 },
  })
  const ui = await open($)
  expect(await has(ui, /CLAUDE IS DONE · ESC TO RETURN/)).toBe(true)
  expect(await has(ui, /PAUSED/)).toBe(false)

  await press(ui, 'x')
  expect(h.link().pause).toBe(null)
  h.store.link = { value: { shape: LINK_SHAPE, value: { pause: null, bonusSeq: 0 } }, version: 9 }
  await ui.redraw()
  await ui.advance(200)
  expect(await has(ui, /DONE|PAUSED/)).toBe(false)
  await ui.unmount()
})

test('save is posted every 30 ticks only when it changed', async ($, on) => {
  const h = wire(on)
  const ui = await open($)
  await press(ui, 'x')
  expect(h.saves.length).toBe(0)
  await ui.advance(1100)
  expect(h.saves.length).toBe(1)
  for (let i = 0; i < 3; i++) {
    await ui.advance(900) // keys keep the idle pause away
    await ui.key({ key: 'x', in: 'game' })
  }
  // ~82 more ticks, one post per 30
  expect(h.saves.length).toBeGreaterThanOrEqual(3)
  expect(h.saves.length).toBeLessThanOrEqual(5)
  expect(h.saves[0]).toMatchObject({ v: 1, g: { counter: expect.any(Number) } })

  await press(ui, 'f') // the dummy freezes: its state stops changing
  await ui.advance(200)
  const n = h.saves.length
  for (let i = 0; i < 3; i++) {
    await ui.advance(900)
    await ui.key({ key: 'x', in: 'game' })
  }
  expect(h.saves.length).toBe(n)
  await ui.unmount()
})

test('a hold saves once on entering it and spawns no bonus until resume', async ($, on) => {
  const h = wire(on)
  const ui = await open($)
  await press(ui, 'x')
  await ui.advance(200)
  await press(ui, 'escape')
  await ui.advance(100)
  const n = h.saves.length
  expect(n).toBeGreaterThan(0)
  await ui.advance(2000)
  expect(h.saves.length).toBe(n)

  h.store.link = { value: { shape: LINK_SHAPE, value: { pause: null, bonusSeq: 2 } }, version: 9 }
  await ui.redraw()
  await ui.advance(500)
  expect(await has(ui, /bonus 0\b/)).toBe(true)
  await press(ui, 'x')
  await ui.advance(200)
  expect(await has(ui, /bonus 2\b/)).toBe(true)
  await ui.unmount()
})
