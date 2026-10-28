import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'reef-net',
  component: 'Pane',
  requestId: 'reef-net',
  surface: 'terminal',
  props: {
    title: 'Reef Net',
    isFocused: true,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type Store = Record<string, { value: unknown; version: number }>

function wire(on: (event: any, fn: (...a: any[]) => any) => void, link?: { pause: null | 'done' | 'needs-you'; bonusSeq: number }) {
  const store: Store = {}
  if (link) store.link = { value: { shape: 'link-1', value: link }, version: 1 }
  on('state.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (store[e.key]?.version ?? 0) + 1
    store[e.key] = { value: e.value, version }

    return { value: { isSet: true, version } }
  })
  const link_ = (): { pause: null | 'done' | 'needs-you'; bonusSeq: number } =>
    (store.link?.value as { value: { pause: null | 'done' | 'needs-you'; bonusSeq: number } }).value
  const save_ = () => (store.save?.value as { value: unknown } | undefined)?.value

  return { store, link: link_, save: save_ }
}

const idle = { pause: null, bonusSeq: 0 } as const

test('unfocused props stop the tick', async ($, on) => {
  wire(on, idle)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false } })
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  const a = JSON.stringify(await ui.drawn({ in: 'reef' }))
  await ui.advance(1000)
  expect(JSON.stringify(await ui.drawn({ in: 'reef' }))).toBe(a)

  await ui.redraw({ ...PANE.props, isFocused: true })
  await ui.advance(1000)
  expect(JSON.stringify(await ui.drawn({ in: 'reef' }))).not.toBe(a)
  await ui.unmount()
})

test('pause props draw the overlay copy', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /CLAUDE IS DONE · ESC TO RETURN/, in: 'reef' })).toBeDefined()
  await ui.unmount()

  h.store.link = { value: { shape: 'link-1', value: { pause: 'needs-you', bonusSeq: 0 } }, version: 2 }
  const ui2 = await $.ui.mount(PANE)
  await ui2.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui2.advance(100)
  expect(await ui2.find({ type: 'Text', text: /CLAUDE NEEDS YOU · ESC TO RETURN/, in: 'reef' })).toBeDefined()
  await ui2.unmount()
})

test('bonusSeq +2 spawns two golden fish', async ($, on) => {
  const h = wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  const before = JSON.stringify(await ui.drawn({ in: 'reef' }))
  expect(before).not.toContain('"golden"')

  h.store.link = { value: { shape: 'link-1', value: { pause: null, bonusSeq: 2 } }, version: 2 }
  await ui.redraw()
  await ui.advance(1500)
  // the golden fish body colour (quantized) only appears with a golden fish on screen
  expect(JSON.stringify(await ui.drawn({ in: 'reef' }))).toContain('#e0e0a0')
  await ui.unmount()
})

// the full copy is 42 characters, so a 40-column region shows it cut at the edge
test('a 40x10 region shows the size notice, then a 70x20 resize resumes with coins kept', async ($, on) => {
  wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'reef' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'reef' })).toBeDefined()

  await ui.resize({ columns: 40, rows: 10, in: 'reef' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /Make the terminal wider or/, in: 'reef' })).toBeDefined()

  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  expect(await ui.find({ type: 'Text', text: /¢ 199/, in: 'reef' })).toBeDefined()
  await ui.unmount()
})

test('a click while paused posts resume', async ($, on) => {
  const h = wire(on, { pause: 'done', bonusSeq: 0 })
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'reef' })
  await ui.advance(100)
  expect(h.link().pause).toBe(null)
  await ui.unmount()
})

test('remount restores coins, bet and caught count', async ($, on) => {
  const h = wire(on, idle)
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui.advance(100)
  await ui.key({ key: 'up', in: 'reef' })
  await ui.advance(100)
  await ui.pointer({ type: 'down', x: 30, y: 8, button: 'left', in: 'reef' })
  await ui.advance(1500)
  const saved = h.save() as { coins: number; bet: number; caughtCount: number }
  expect(saved.bet).toBe(2)
  expect(saved.coins).toBeLessThan(200)
  await ui.unmount()

  // the engine remounts the Client with a fresh instance and the stored snapshot
  h.store.save = { value: { shape: 'save-1', value: { coins: 321, bet: 4, caughtCount: 7 } }, version: 9 }
  const ui2 = await $.ui.mount(PANE)
  await ui2.resize({ columns: 70, rows: 20, in: 'reef' })
  await ui2.advance(100)
  expect(await ui2.find({ type: 'Text', text: /¢ 321.*bet x4/, in: 'reef' })).toBeDefined()
  await ui2.unmount()
})
