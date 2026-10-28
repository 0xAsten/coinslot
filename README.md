# Coin Slot

Original terminal mini-games, each a Claude Code mod that runs in a pane beside the chat.

## Install

```
/plugin install reef-net --marketplace beasaltfish/coinslot
```

(Placeholder: the repository slug is not final and reef-net is not published yet.)

## Development

```
bun run bundle   # copy shared/*.ts into plugins/*/hooks/shared/
bun run check    # bundle --check, validate, tsc, test for every plugin
```

Engine types are not committed; run `scripts/vendor-types.sh <path-to-claude-code.d.ts>` once per Claude Code build.
