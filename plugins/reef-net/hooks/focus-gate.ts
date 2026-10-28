// Whether the game should be stepping. The Pane's isFocused says the person gave the
// pane the keyboard; a Client has its own focus that a click grants (surface.onKey).
// Live evidence: a click on the Client makes the Pane's isFocused go false. So input
// on the Client means "focused" until a pause, or until the pane loses focus with no
// Client input near it (the person moved on, rather than clicked into the game).
export type Gate = { focused: boolean; paused: boolean; engaged: boolean; idle: number }
export const GATE_INITIAL: Gate = { focused: false, paused: false, engaged: false, idle: 1000 }

// A click and the props update that follows it can land a few ticks apart.
export const TOUCH_GRACE_TICKS = 15

export function gateStep(
  g: Gate,
  i: { focused: boolean; paused: boolean; touched: boolean },
): { gate: Gate; active: boolean } {
  let engaged = g.engaged
  const idle = i.touched ? 0 : Math.min(1000, g.idle + 1)
  if (i.paused && !g.paused) engaged = false
  if (g.focused && !i.focused && idle > TOUCH_GRACE_TICKS) engaged = false
  if (i.touched && !i.paused) engaged = true

  return {
    gate: { focused: i.focused, paused: i.paused, engaged, idle },
    active: !i.paused && (i.focused || engaged),
  }
}
