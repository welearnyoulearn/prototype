#!/usr/bin/env node
// Keeps the product documentation honest and up to date.
//
//   node scripts/product-docs.mjs            regenerate everything derived from the code
//   node scripts/product-docs.mjs --check    exit 1 if anything derived is out of date (used by the e2e guard)
//   node scripts/product-docs.mjs --since 2026-09-01   also print merged changes since a date (for "update my deck" prompts)
//
// What it derives (never hand-edit these blocks):
//   • wiki/features/CATALOG.md ............ every Platform-Admin feature (lib/features.ts) → its doc + code evidence
//   • the <!-- AUTO:evidence --> block in every feature doc
//   • the <!-- AUTO:catalog --> / <!-- AUTO:plans --> / <!-- AUTO:stats --> blocks in docs/product/PRODUCT-FACTBOOK.md
// "Code evidence" = the screens of a feature are read, every /api/... route they call is looked up on disk,
// and a screen that calls a route that does not exist is flagged (that screen 404s at runtime).
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const CHECK = process.argv.includes('--check')
const sinceIdx = process.argv.indexOf('--since')
const SINCE = sinceIdx > -1 ? process.argv[sinceIdx + 1] : null

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = p => fs.existsSync(path.join(ROOT, p))
let stale = []

function write(p, content) {
  const abs = path.join(ROOT, p)
  const old = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
  if (old === content) return
  if (CHECK) { stale.push(p); return }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  console.log('updated', p)
}

// ── catalog from lib/features.ts ───────────────────────────────────────────
const featuresSrc = read('lib/features.ts')
const catalog = [...featuresSrc.matchAll(/\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)',\s*category:\s*'([^']+)',\s*portals:\s*\[([^\]]*)\]\s*\}/g)]
  .map(m => ({ key: m[1], label: m[2], category: m[3], portals: [...m[4].matchAll(/'([^']+)'/g)].map(x => x[1]) }))
// Sanity: every `{ key: '…' …}` entry of ALL_FEATURES must have been parsed (guards against a formatting change hiding a feature).
const allFeaturesBlock = featuresSrc.slice(featuresSrc.indexOf('export const ALL_FEATURES'), featuresSrc.indexOf('export const CATEGORY_ORDER'))
const declared = (allFeaturesBlock.match(/\{\s*key:\s*'/g) ?? []).length
if (catalog.length === 0 || catalog.length !== declared) throw new Error(`could not parse lib/features.ts: parsed ${catalog.length} of ${declared} features`)

const map = JSON.parse(read('wiki/features/feature-map.json'))

// ── code evidence ──────────────────────────────────────────────────────────
function filesUnder(rel) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [rel]
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(e => {
    const child = path.posix.join(rel, e.name)
    return e.isDirectory() ? filesUnder(child) : /\.(tsx?|ts)$/.test(e.name) ? [child] : []
  })
}

function normalizeUrl(raw) {
  const clean = raw.split('?')[0].replace(/\/+$/, '')
  const segs = clean.split('/').filter(Boolean).map(s => (s.includes('${') ? (s.startsWith('${') ? '{}' : s.slice(0, s.indexOf('${'))) : s))
  return '/' + segs.join('/')
}

function routeFile(url) {
  const segs = url.split('/').filter(Boolean)          // ['api','foo','{}']
  const walk = (dir, i) => {
    if (i === segs.length) return fs.existsSync(path.join(dir, 'route.ts')) ? path.join(dir, 'route.ts') : null
    const s = segs[i]
    if (s === '{}') {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith('[')) { const r = walk(path.join(dir, e.name), i + 1); if (r) return r }
      return null
    }
    const next = path.join(dir, s)
    return fs.existsSync(next) && fs.statSync(next).isDirectory() ? walk(next, i + 1) : null
  }
  return walk(path.join(ROOT, 'app'), 0)
}

const methodsOf = file => [...new Set([...fs.readFileSync(file, 'utf8').matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]))].sort()

function evidence(entry) {
  const uiFiles = entry.ui.flatMap(filesUnder)
  const missingUi = entry.ui.filter(u => !exists(u))
  const urls = new Set(entry.extraApi ?? [])
  for (const f of uiFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const m of src.matchAll(/['"`](\/api\/[A-Za-z0-9_\-/${}.[\]]+)/g)) {
      const u = normalizeUrl(m[1])
      if (u !== '/api' && u.split('/').length >= 3) urls.add(u)
    }
  }
  const present = [], missing = []
  for (const u of [...urls].sort()) {
    const rf = routeFile(u)
    if (rf) present.push({ url: u, methods: methodsOf(rf) }); else missing.push(u)
  }
  return { uiFiles, missingUi, present, missing }
}

const AUTO = (name, body) => `<!-- AUTO:${name}:start (generated by scripts/product-docs.mjs — do not edit by hand) -->\n${body}\n<!-- AUTO:${name}:end -->`
function replaceBlock(text, name, body) {
  const re = new RegExp(`<!-- AUTO:${name}:start[^>]*-->[\\s\\S]*?<!-- AUTO:${name}:end -->`)
  return re.test(text) ? text.replace(re, () => AUTO(name, body)) : null
}

function evidenceMarkdown(key, ev, entry) {
  const lines = ['**Code evidence** — checked against the repository on every run of `node scripts/product-docs.mjs`.', '']
  lines.push('Screens: ' + (ev.uiFiles.length ? ev.uiFiles.slice(0, 12).map(f => '`' + f + '`').join(', ') + (ev.uiFiles.length > 12 ? ` (+${ev.uiFiles.length - 12} more)` : '') : '_none found_'))
  if (ev.missingUi.length) lines.push('', '⚠ Screens listed in feature-map.json that do not exist: ' + ev.missingUi.map(u => '`' + u + '`').join(', '))
  lines.push('', 'API routes these screens call (all exist):')
  lines.push(ev.present.length ? ev.present.map(r => `- \`${r.methods.join('/') || '—'}\` ${r.url}`).join('\n') : '- _none_')
  if (ev.missing.length) {
    lines.push('', '**⚠ Backend missing on `dev`** — the screens call these routes but no `route.ts` exists, so these calls return 404:')
    lines.push(ev.missing.map(u => `- ${u}`).join('\n'))
  } else {
    lines.push('', '✅ Every API route the screens call exists.')
  }
  return lines.join('\n')
}

// ── per-feature docs + CATALOG ─────────────────────────────────────────────
const rows = []
const evByKey = {}
for (const f of catalog) {
  const entry = map[f.key]
  if (!entry) { stale.push(`feature-map.json has no entry for "${f.key}" (add it, then create ${'wiki/features/' + f.key + '.md'})`); continue }
  const ev = evidence(entry)
  evByKey[f.key] = ev
  if (!exists(entry.doc)) { stale.push(`missing doc ${entry.doc} for feature "${f.key}"`); }
  else {
    const text = read(entry.doc)
    const next = replaceBlock(text, 'evidence:' + f.key, evidenceMarkdown(f.key, ev, entry))
    if (next === null) stale.push(`${entry.doc} has no <!-- AUTO:evidence:${f.key}:start --> block`)
    else write(entry.doc, next)
  }
  rows.push({ ...f, entry, ev })
}
for (const key of Object.keys(map)) if (!key.startsWith('_') && !catalog.some(f => f.key === key)) stale.push(`feature-map.json lists "${key}" which is not in lib/features.ts`)

const health = ev => (ev.missing.length || ev.missingUi.length ? `⚠ ${ev.missing.length} route${ev.missing.length === 1 ? '' : 's'} missing` : '✅ all routes exist')
const catalogTable = [
  '| Feature (Platform Admin → features) | Category | Portals | Doc | Code evidence |',
  '|---|---|---|---|---|',
  ...rows.map(r => `| **${r.label}** (\`${r.key}\`) | ${r.category} | ${r.portals.join(', ')} | [${path.posix.basename(r.entry.doc)}](${path.posix.relative('wiki/features', r.entry.doc)}) | ${health(r.ev)} |`),
].join('\n')

const unlisted = Object.entries(map._unlisted ?? {}).filter(([k]) => k !== '_readme').map(([k, e]) => ({ k, e, ev: evidence(e) }))
const unlistedTable = [
  '| Part of the product (not a feature switch) | Doc | Code evidence |', '|---|---|---|',
  ...unlisted.map(u => `| ${u.k} | [${path.posix.basename(u.e.doc)}](${path.posix.relative('wiki/features', u.e.doc)}) | ${health(u.ev)}${u.ev.missing.length ? ': ' + u.ev.missing.slice(0, 4).map(x => '`' + x + '`').join(', ') + (u.ev.missing.length > 4 ? ' …' : '') : ''} |`),
].join('\n')

const broken = rows.filter(r => r.ev.missing.length)
write('wiki/features/CATALOG.md', `# Feature catalog (generated)

> Generated by \`node scripts/product-docs.mjs\` from \`lib/features.ts\` (the Platform Admin feature config) and the code. **Do not edit by hand** — edit the feature docs, \`feature-map.json\`, or the code.

Every feature a school can be switched on for has exactly one doc below. "Code evidence" is computed: the feature's screens are read and every \`/api/...\` route they call is looked up on disk. ⚠ means a screen calls a route that does not exist on \`dev\` (that call returns 404), so the feature cannot be shown as fully working.

## Platform Admin features (${rows.length})

${catalogTable}

## Other parts of the product

${unlistedTable}

## Needs attention (${broken.length} feature${broken.length === 1 ? '' : 's'} with missing backend routes)

${broken.length ? broken.map(r => `- **${r.label}** — missing: ${r.ev.missing.map(u => '`' + u + '`').join(', ')}`).join('\n') : '_None._'}
`)

// ── factbook blocks ────────────────────────────────────────────────────────
const FACTBOOK = 'docs/product/PRODUCT-FACTBOOK.md'
if (exists(FACTBOOK)) {
  let fb = read(FACTBOOK)
  const put = (name, body) => { const n = replaceBlock(fb, name, body); if (n === null) stale.push(`${FACTBOOK} has no AUTO:${name} block`); else fb = n }

  put('catalog', `Generated from \`lib/features.ts\` + code evidence. **A ⚠ row must not be presented as a working feature.**\n\n${catalogTable}\n\n${unlistedTable}`)

  const seeds = [...read('lib/db.ts').matchAll(/\('(basic|standard|premium)',\s*'([^']+)',\s*(\d+),\s*(\d+),\s*([\d.]+),\s*(true|false),\s*(true|false),\s*(true|false)\)/g)]
  const seen = new Set()
  const plans = seeds.filter(m => !seen.has(m[1]) && seen.add(m[1])).map(m => `| ${m[2]} | ${m[3]} | ${m[4]} | ${m[5]} | ${m[6]} | ${m[7]} |`)
  put('plans', `| Plan | Seeded monthly price (unit/currency undefined in code) | Included WhatsApp msgs | Overage rate | Online payments flag | WhatsApp flag |\n|---|---|---|---|---|---|\n${plans.join('\n')}`)

  if (!CHECK) {
    const git = c => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
    const files = git('git ls-files').split('\n').filter(Boolean)
    const ts = files.filter(f => /\.(ts|tsx)$/.test(f))
    const loc = ts.reduce((n, f) => { try { return n + fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length } catch { return n } }, 0)
    const dbSrc = read('lib/db.ts')
    const tables = new Set([...dbSrc.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1])).size
    const routeFiles = files.filter(f => /^app\/api\/.*route\.ts$/.test(f))
    const ops = routeFiles.reduce((n, f) => n + methodsOf(f).length, 0)
    const specs = files.filter(f => /^e2e\/.*\.spec\.ts$/.test(f)).length
    put('stats', `Generated ${new Date().toISOString().slice(0, 10)} from commit \`${git('git rev-parse --short HEAD')}\`.\n\n- TypeScript files: **${ts.length}** · lines: **${loc.toLocaleString('en-IN')}**\n- Database tables: **${tables}**\n- API route files: **${routeFiles.length}** · operations (GET/POST/PUT/PATCH/DELETE): **${ops}**\n- End-to-end test suites: **${specs}**\n- Platform-Admin features: **${rows.length}** (${rows.length - broken.length} with every backend route present, ${broken.length} with missing routes)`)
  }
  write(FACTBOOK, fb)
}

// ── optional: what changed since a date (for "update my deck/docs" prompts) ─
if (SINCE && !CHECK) {
  const log = execSync(`git log origin/dev --since="${SINCE}" --no-merges --format="- %s (%h, %ad)" --date=short`, { cwd: ROOT, encoding: 'utf8' })
  console.log(`\nChanges on dev since ${SINCE}:\n${log || '(none)'}`)
}

if (stale.length) {
  console.error((CHECK ? 'Product docs are out of date:\n' : 'Problems found:\n') + stale.map(s => '  - ' + s).join('\n'))
  console.error('\nFix: run `node scripts/product-docs.mjs`, and create any missing feature doc from wiki/features/_template.md.')
  process.exit(1)
}
console.log(CHECK ? 'Product docs are up to date.' : 'Product docs generated.')
