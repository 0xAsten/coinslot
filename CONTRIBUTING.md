# Contributing to Coin Slot

Coin Slot is a wall of original arcade games that run inside Claude Code while it works. You can add one, and you don't have to write the code yourself: your coding agent does.

## How

1. **Fork the repo** (`beasaltfish/coinslot`).
2. **Paste the prompt into your agent** (Claude Code, or any coding agent that can run shell commands). The prompt is also on the Coin Slot site, under "Make a game", with a copy button; replace `<YOUR NAME>` with the name you want on the game:

   > Build an original arcade game for Coin Slot (github.com/beasaltfish/coinslot). Fork the repo, read AGENTS.md at its root, and follow it to add one game. Use "<YOUR NAME>" as the author in plugin.json. Run the checks it lists until they pass, then open a pull request to beasaltfish/coinslot.

3. **Your agent opens a pull request.**
4. **After review, your game joins the wall.**

## What review looks for

- **Fun.** It is worth playing for a minute while Claude works, and it pauses cleanly.
- **Originality.** Your own idea, names and art. No trademarked names, characters or look-alikes, and no 1:1 clones of famous games.
- **Safety.** Games are pure logic: no network, no files, no clock. Automated checks screen this, and a maintainer reads the diff by hand.
- **Footage.** The preview loop on the wall comes from a bot playing your game; it has to show real, lively play.

## What happens when it merges

Your game is listed on the site's wall and in the Claude Code marketplace, with your name as the author. Anyone can then install it with `/plugin install <id> --marketplace beasaltfish/coinslot`.

## License

Contributions are MIT licensed, like the rest of the repo. By opening a pull request you agree to that.

## Technical rules

Agents and humans: all rules, the file whitelist and the checks to run are in [AGENTS.md](AGENTS.md).

## For the maintainer

CI screens PRs with `--no-types` (the engine types are not in the repo). Before merging, run `bun scripts/check-contribution.ts --root <pr checkout> <base>` locally with the types in `vendor/`, review the diff by hand, then run the PR's tests in an isolated environment (a throwaway container or VM), never on a machine with credentials.
