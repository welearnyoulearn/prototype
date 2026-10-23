// Builds single-file bundles (prompt + source material) for pasting/attaching to Claude,
// which cannot take many files at once. Output: docs/product/bundles/.
// Run: node scripts/build-doc-bundles.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const F = 'docs/product/features/'
const dossiers = fs.readdirSync(path.join(root, F)).filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('00-')).sort()
const only = (nums) => dossiers.filter((f) => nums.includes(f.slice(0, 2))).map((f) => F + f)

// The prompt is everything below the first '---' line of the prompt file.
const promptBody = (file) => rd(file).split(/\n---\n/).slice(1).join('\n---\n').trim()

function bundle(name, title, promptFile, files) {
  const parts = [
    `# ${title}`,
    '',
    '> **Instructions for Claude:** the PROMPT below is your task. Everything after it (marked SOURCE) is the ONLY source of truth. Do not ask for other files.',
    '',
    '# PART 1 — THE PROMPT',
    '',
    promptBody(promptFile),
    '',
    '---',
    '',
    '# PART 2 — SOURCE MATERIAL',
  ]
  for (const f of files) parts.push('', `<!-- SOURCE FILE: ${f} -->`, '', rd(f).trim(), '', '---')
  const out = path.join(root, 'docs/product/bundles', name)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, parts.join('\n') + '\n')
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`)
}

const FACT = 'docs/product/PRODUCT-FACTBOOK.md'
bundle('INVESTOR-DECK.md', 'WLYL — Investor / Summit Deck (single-file bundle)', 'docs/product/prompts/2-investor-summit-deck.md', [
  F + '00-deck-storyline.md', FACT, F + '00-roles-access-and-plans.md',
  ...only(['08', '13', '14', '10', '09', '06', '03', '19', '12', '21']),
])
bundle('SCHOOL-DECK.md', 'WLYL — School (Client) Demo Deck (single-file bundle)', 'docs/product/prompts/3-school-demo-deck.md', [
  F + '00-deck-storyline.md', FACT, F + '00-roles-access-and-plans.md',
  ...only(dossiers.filter((f) => f !== '21-platform-admin-portal.md').map((f) => f.slice(0, 2))),
])
bundle('DOCUMENTATION.md', 'WLYL — Full Product Documentation (single-file bundle)', 'docs/product/prompts/1-documentation.md', [
  FACT, F + '00-platform-architecture.md', F + '00-roles-access-and-plans.md', ...dossiers.map((f) => F + f),
])
