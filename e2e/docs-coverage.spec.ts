import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Guard: every Platform Admin feature has a doc, and generated docs are current.
const root = process.cwd()
const featuresSrc = fs.readFileSync(path.join(root, 'lib/features.ts'), 'utf8')
const block = featuresSrc.slice(featuresSrc.indexOf('export const ALL_FEATURES'), featuresSrc.indexOf('export const CATEGORY_ORDER'))
const keys = [...block.matchAll(/\{\s*key:\s*'([^']+)'/g)].map(m => m[1])
const map = JSON.parse(fs.readFileSync(path.join(root, 'wiki/features/feature-map.json'), 'utf8')) as Record<string, { doc: string; ui: string[] }>

test.describe('Product docs coverage', () => {
  test('every feature key has a map entry and an existing doc', () => {
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) {
      expect(map[k], `feature-map.json has no entry for "${k}"`).toBeTruthy()
      expect(fs.existsSync(path.join(root, map[k].doc)), `doc for "${k}" is missing`).toBe(true)
    }
  })

  test('generated docs are up to date and screens call existing routes', () => {
    expect(() => execFileSync('node', ['scripts/product-docs.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow()
  })
})
