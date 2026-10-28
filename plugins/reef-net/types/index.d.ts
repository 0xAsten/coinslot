// Self-contained: the contract may not import. link mirrors shared/link.ts LinkState;
// save mirrors the Snapshot in hooks/game.tsx; seed is an optional fixed sim seed.
declare module 'claude-code' {
  interface PluginState {
    'reef-net': {
      link: Shaped<{ pause: null | 'done'; bonusSeq: number }>
      seed: Shaped<number | null>
      save: Shaped<{ coins: number; bet: number; caughtCount: number } | null>
    }
  }
}
