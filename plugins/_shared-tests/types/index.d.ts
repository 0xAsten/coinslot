// Self-contained: the contract may not import. Mirrors shared/link.ts LinkState;
// save is the shell's { v, g } envelope around the dummy game's state.
declare module 'claude-code' {
  interface PluginState {
    '_shared-tests': {
      link: Shaped<{ pause: null | 'done'; bonusSeq: number }>
      seed: Shaped<number | null>
      save: Shaped<JsonValue | null>
    }
  }
}
