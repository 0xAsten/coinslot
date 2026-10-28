// Whether the game should be stepping. The Pane's isFocused says the person gave the
// pane the keyboard; a Client has its own focus that a click grants (surface.onKey).
// The two may differ, so a click or key on the Client counts as playing until the
// pane focus comes back or a pause begins.
export type Gate = { focused: boolean; paused: boolean; engaged: boolean }
export const GATE_INITIAL: Gate = { focused: false, paused: false, engaged: false }

export function gateStep(
  g: Gate,
  i: { focused: boolean; paused: boolean; touched: boolean },
): { gate: Gate; active: boolean } {
  let engaged = g.engaged
  if ((i.focused && !g.focused) || (i.paused && !g.paused)) engaged = false
  if (i.touched && !i.paused) engaged = true

  return {
    gate: { focused: i.focused, paused: i.paused, engaged },
    active: !i.paused && (i.focused || engaged),
  }
}
