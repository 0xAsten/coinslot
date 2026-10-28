// Self-contained: the contract may not import. Mirrors shared/link.ts LinkState.
declare module 'claude-code' {
  interface PluginState {
    '_shared-tests': { link: Shaped<{ pause: null | 'done' | 'needs-you'; bonusSeq: number }> }
  }
}
