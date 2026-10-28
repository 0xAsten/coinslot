// Self-contained: the contract may not import. link mirrors shared/link.ts LinkState;
// save mirrors the Snapshot in hooks/game.tsx.
declare module 'claude-code' {
  interface PluginState {
    'reef-net': {
      link: Shaped<{ pause: null | 'done' | 'needs-you'; bonusSeq: number }>
      save: Shaped<{ coins: number; bet: number; caughtCount: number } | null>
    }
  }
}
