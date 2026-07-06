/**
 * ANV-0009 — Tests for the DoctorCheck registry: ordering and category filtering.
 */
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_SORT_ORDER,
  DOCTOR_REGISTRY,
  type DoctorCheckCategory,
  type DoctorCheckContext,
  getChecksByCategory,
  runChecks,
  sortChecksByCategory,
} from '../../../src/commands/cli/doctor-registry.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_CTX: DoctorCheckContext = {
  cwd: '/tmp/fake-cwd',
  home: '/tmp/fake-home',
  anvilHome: '/tmp/fake-home/.anvil',
  inProject: false,
  skipDetail: 'not in a project root — skipped',
  installScope: 'unknown',
}

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

describe('DOCTOR_REGISTRY shape', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(DOCTOR_REGISTRY)).toBe(true)
    expect(DOCTOR_REGISTRY.length).toBeGreaterThan(0)
  })

  it('every entry has required fields', () => {
    for (const check of DOCTOR_REGISTRY) {
      expect(typeof check.id).toBe('string')
      expect(check.id.length).toBeGreaterThan(0)
      expect(typeof check.label).toBe('string')
      expect(typeof check.category).toBe('string')
      expect(typeof check.runner).toBe('function')
    }
  })

  it('no duplicate ids', () => {
    const ids = DOCTOR_REGISTRY.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every category is a known DoctorCheckCategory', () => {
    const knownCategories: DoctorCheckCategory[] = [
      'agent-permission',
      'architecture',
      'capability',
      'commands',
      'content',
      'docs',
      'hooks',
      'installer',
      'models',
      'plugin',
      'release',
    ]
    for (const check of DOCTOR_REGISTRY) {
      expect(knownCategories).toContain(check.category)
    }
  })
})

// ---------------------------------------------------------------------------
// getChecksByCategory
// ---------------------------------------------------------------------------

describe('getChecksByCategory', () => {
  it('returns only checks for the requested category', () => {
    const installerChecks = getChecksByCategory('installer')
    expect(installerChecks.length).toBeGreaterThan(0)
    for (const c of installerChecks) {
      expect(c.category).toBe('installer')
    }
  })

  it('returns empty array for a category with no registered checks', () => {
    // 'docs' has no checks yet in the incremental migration
    const docsChecks = getChecksByCategory('docs')
    expect(docsChecks).toEqual([])
  })

  it('preserves declaration order within a category', () => {
    const installerChecks = getChecksByCategory('installer')
    const ids = installerChecks.map((c) => c.id)
    expect(ids).toEqual([
      'installer/node-version',
      'installer/anvil-version',
      'installer/plugin-json',
      'installer/dev-script-leakage',
    ])
  })

  it('uses the provided registry override', () => {
    const fakeRegistry = [
      {
        id: 'models/test',
        label: 'Test',
        category: 'models' as DoctorCheckCategory,
        runner: () => {},
      },
      {
        id: 'installer/test',
        label: 'Test 2',
        category: 'installer' as DoctorCheckCategory,
        runner: () => {},
      },
    ]
    const result = getChecksByCategory('models', fakeRegistry)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('models/test')
  })
})

// ---------------------------------------------------------------------------
// sortChecksByCategory
// ---------------------------------------------------------------------------

describe('sortChecksByCategory', () => {
  it('sorts checks by CATEGORY_SORT_ORDER', () => {
    const input = [
      {
        id: 'models/x',
        label: 'M',
        category: 'models' as DoctorCheckCategory,
        runner: () => {},
      },
      {
        id: 'installer/x',
        label: 'I',
        category: 'installer' as DoctorCheckCategory,
        runner: () => {},
      },
      {
        id: 'hooks/x',
        label: 'H',
        category: 'hooks' as DoctorCheckCategory,
        runner: () => {},
      },
    ]
    const sorted = sortChecksByCategory(input)
    const categories = sorted.map((c) => c.category)
    expect(categories).toEqual(['installer', 'models', 'hooks'])
  })

  it('stable-sorts within the same category', () => {
    const input = [
      {
        id: 'installer/b',
        label: 'B',
        category: 'installer' as DoctorCheckCategory,
        runner: () => {},
      },
      {
        id: 'installer/a',
        label: 'A',
        category: 'installer' as DoctorCheckCategory,
        runner: () => {},
      },
    ]
    const sorted = sortChecksByCategory(input)
    // Input order preserved within same category
    expect(sorted[0]?.id).toBe('installer/b')
    expect(sorted[1]?.id).toBe('installer/a')
  })

  it('CATEGORY_SORT_ORDER is defined and non-empty', () => {
    expect(Array.isArray(CATEGORY_SORT_ORDER)).toBe(true)
    expect(CATEGORY_SORT_ORDER.length).toBeGreaterThan(0)
    expect(CATEGORY_SORT_ORDER[0]).toBe('installer')
  })

  it('does not mutate the input array', () => {
    const input = [
      {
        id: 'models/x',
        label: 'M',
        category: 'models' as DoctorCheckCategory,
        runner: () => {},
      },
      {
        id: 'installer/x',
        label: 'I',
        category: 'installer' as DoctorCheckCategory,
        runner: () => {},
      },
    ]
    const before = input.map((c) => c.id)
    sortChecksByCategory(input)
    expect(input.map((c) => c.id)).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// runChecks
// ---------------------------------------------------------------------------

describe('runChecks', () => {
  it('runs all checks and collects rows', async () => {
    const checks = [
      {
        id: 'test/a',
        label: 'A',
        category: 'installer' as DoctorCheckCategory,
        runner: (
          _ctx: DoctorCheckContext,
          rows: { name: string; status: 'pass'; detail: string }[],
        ) => {
          rows.push({ name: 'A', status: 'pass', detail: 'ok' })
        },
      },
      {
        id: 'test/b',
        label: 'B',
        category: 'models' as DoctorCheckCategory,
        runner: async (
          _ctx: DoctorCheckContext,
          rows: { name: string; status: 'warn'; detail: string }[],
        ) => {
          rows.push({ name: 'B', status: 'warn', detail: 'missing' })
        },
      },
    ]
    const rows = await runChecks(
      FAKE_CTX,
      checks as Parameters<typeof runChecks>[1],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.name).toBe('A')
    expect(rows[1]?.name).toBe('B')
  })

  it('returns empty array for empty registry', async () => {
    const rows = await runChecks(FAKE_CTX, [])
    expect(rows).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Installer checks integration
// ---------------------------------------------------------------------------

describe('installer checks (integration)', () => {
  it('installer/node-version produces a row', async () => {
    const installerChecks = getChecksByCategory('installer')
    const nodeCheck = installerChecks.find(
      (c) => c.id === 'installer/node-version',
    )
    expect(nodeCheck).toBeDefined()

    const rows: Parameters<typeof runChecks>[1] = []
    await nodeCheck!.runner(FAKE_CTX, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Node.js')
    // Current Node.js should be ≥ 20 in CI
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toMatch(/^v\d+/)
  })
})
