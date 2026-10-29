// Self-contained: the contract may not import. link mirrors shared/link.ts LinkState;
// save is the shell's { v, g } envelope around the Game in hooks/sim.ts; seed is an optional fixed sim seed.
declare module 'claude-code' {
  interface PluginState {
    'ci-smoke-bad': {
      link: Shaped<{ pause: null | 'done'; bonusSeq: number }>
      seed: Shaped<number | null>
      debug: Shaped<boolean | null>
      save: Shaped<JsonValue | null>
    }
  }
}
