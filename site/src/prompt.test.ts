import { expect, test } from 'bun:test'
import { NAME_PLACEHOLDER, PROMPT } from './prompt'

test('the prompt is the agreed text with the literal placeholder', () => {
  expect(NAME_PLACEHOLDER).toBe('<YOUR NAME>')
  expect(PROMPT).toBe(
    'Build an original arcade game for Coin Slot (github.com/beasaltfish/coinslot). Fork the repo, read AGENTS.md at its root, and follow it to add one game. Use "<YOUR NAME>" as the author in plugin.json. Run the checks it lists until they pass, then open a pull request to beasaltfish/coinslot.',
  )
})
