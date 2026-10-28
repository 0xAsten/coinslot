# Coin Slot

Original terminal mini-games, each a Claude Code mod that runs in a pane beside the chat.

## Install

### Fish Shooter

```
/plugin install fish-shooter --marketplace beasaltfish/coinslot
```

The first time, Claude Code asks `Add marketplace?` for `github:beasaltfish/coinslot`: answer `y`, then pick a scope (user scope is listed first). The mod is active in that session right away.

From a shell the same install is:

```
claude plugin install fish-shooter --marketplace beasaltfish/coinslot
```

Open the game with `/fish-shooter`.

### Brick Breaker

```
/plugin install brick-breaker --marketplace beasaltfish/coinslot
```

The first time, Claude Code asks `Add marketplace?` for `github:beasaltfish/coinslot`: answer `y`, then pick a scope (user scope is listed first). The mod is active in that session right away.

From a shell the same install is:

```
claude plugin install brick-breaker --marketplace beasaltfish/coinslot
```

Open the game with `/brick-breaker`.

### Snake

```
/plugin install snake --marketplace beasaltfish/coinslot
```

The first time, Claude Code asks `Add marketplace?` for `github:beasaltfish/coinslot`: answer `y`, then pick a scope (user scope is listed first). The mod is active in that session right away.

From a shell the same install is:

```
claude plugin install snake --marketplace beasaltfish/coinslot
```

Open the game with `/snake`.

System notifications need a notification channel configured in Claude Code (`preferredNotifChannel`).

## Development

```
bun run bundle   # copy shared/*.ts into plugins/*/hooks/shared/
bun run check    # bundle --check, validate, tsc, test for every plugin
```

Engine types are not committed; run `scripts/vendor-types.sh <path-to-claude-code.d.ts>` once per Claude Code build.
