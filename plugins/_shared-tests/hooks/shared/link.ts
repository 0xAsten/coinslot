export type Pause = null | 'done' | 'needs-you'
export type LinkState = { pause: Pause; bonusSeq: number }

export const LINK_INITIAL: LinkState = { pause: null, bonusSeq: 0 }

// Only main turns (no agentId) pause; a subagent finishing never does.
export function onTurnComplete(s: LinkState, agentId?: string): LinkState {
  if (agentId !== undefined) return s
  return s.pause === 'needs-you' ? s : { ...s, pause: 'done' }
}

export function onAsk(s: LinkState): LinkState {
  return s.pause === 'needs-you' ? s : { ...s, pause: 'needs-you' }
}

export function onToolCall(s: LinkState): LinkState {
  return { ...s, bonusSeq: s.bonusSeq + 1 }
}

export function onResume(s: LinkState): LinkState {
  return s.pause === null ? s : { ...s, pause: null }
}

export function onTurnStart(s: LinkState, agentId?: string): LinkState {
  return agentId !== undefined ? s : onResume(s)
}
