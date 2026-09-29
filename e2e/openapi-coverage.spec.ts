import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Keeps the API docs (DOCS/openapi.json, served at /api-docs) from silently going stale.
// Every exported HTTP method of every app/api/**/route.ts must be documented — and every documented
// operation must still exist in code. No server needed.
//
// When this fails after you add or change a route: add/update the operation in DOCS/openapi.json
// (tag, who can call, checks, parameters/body, responses, x-source-file), bump info.version.

const ROOT = path.resolve(__dirname, '..')
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return routeFiles(full)
    return e.name === 'route.ts' ? [full] : []
  })
}

// /…/app/api/foo/[id]/route.ts  →  /api/foo/{id}    (param names don't matter, only their position)
const urlOf = (file: string) =>
  '/' + path.relative(path.join(ROOT, 'app'), path.dirname(file)).split(path.sep).join('/')
    .replace(/\[\.\.\.(\w+)\]/g, '{}').replace(/\[(\w+)\]/g, '{}')
const normalize = (u: string) => u.replace(/\{[^}]+\}/g, '{}')

function codeOperations(): Set<string> {
  const ops = new Set<string>()
  for (const file of routeFiles(path.join(ROOT, 'app', 'api'))) {
    const src = fs.readFileSync(file, 'utf8')
    const found = new Set<string>()
    for (const m of src.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) found.add(m[1].toLowerCase())
    for (const g of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const m of g[1].matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)) found.add(m[1].toLowerCase())
    for (const method of found) ops.add(`${method} ${urlOf(file)}`)
  }
  return ops
}

function specOperations(): Set<string> {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'DOCS', 'openapi.json'), 'utf8')) as { paths: Record<string, Record<string, unknown>> }
  const ops = new Set<string>()
  for (const [url, item] of Object.entries(spec.paths)) for (const m of METHODS) if (item[m]) ops.add(`${m} ${normalize(url)}`)
  return ops
}

test.describe('API docs stay in step with the code', () => {
  test('every API route method is documented in DOCS/openapi.json', () => {
    const spec = specOperations()
    const missing = [...codeOperations()].filter(o => !spec.has(normalize(o))).sort()
    expect(missing, `Undocumented routes — add them to DOCS/openapi.json:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  test('nothing in DOCS/openapi.json documents a route that no longer exists', () => {
    const code = new Set([...codeOperations()].map(normalize))
    const stale = [...specOperations()].filter(o => !code.has(o)).sort()
    expect(stale, `Documented but not in code — remove from DOCS/openapi.json:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  test('every operation has the fields the docs viewer relies on', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'DOCS', 'openapi.json'), 'utf8')) as {
      tags: { name: string }[]; paths: Record<string, Record<string, { tags?: string[]; summary?: string; operationId?: string; responses?: object }>>
    }
    const tags = new Set(spec.tags.map(t => t.name))
    const seenIds = new Set<string>()
    const problems: string[] = []
    for (const [url, item] of Object.entries(spec.paths)) for (const m of METHODS) {
      const o = item[m]
      if (!o) continue
      const at = `${m.toUpperCase()} ${url}`
      if (!o.summary) problems.push(`${at}: no summary`)
      if (!o.responses || Object.keys(o.responses).length === 0) problems.push(`${at}: no responses`)
      if (!o.tags?.length || o.tags.some(t => !tags.has(t))) problems.push(`${at}: missing or unknown tag`)
      if (!o.operationId) problems.push(`${at}: no operationId`)
      else if (seenIds.has(o.operationId)) problems.push(`${at}: duplicate operationId ${o.operationId}`)
      else seenIds.add(o.operationId)
    }
    expect(problems).toEqual([])
  })
})
