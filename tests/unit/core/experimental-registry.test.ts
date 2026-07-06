/**
 * ANV-0245 — experimental-registry contract tests.
 *
 * Tests:
 *   - list() returns all seeded entries
 *   - get() finds by id; returns undefined for unknown id
 *   - register() adds a new entry at runtime
 *   - register() throws on duplicate id
 *   - register() validates progress range (0-100)
 *   - __resetForTests() restores seed state
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetForTests,
  getExperimentalFeature,
  listExperimentalFeatures,
  registerExperimentalFeature,
} from '../../../src/core/experimental-registry.js'

describe('experimental-registry', () => {
  afterEach(() => {
    __resetForTests()
  })

  describe('listExperimentalFeatures()', () => {
    it('returns 3 seeded entries', () => {
      const features = listExperimentalFeatures()
      expect(features).toHaveLength(3)
    })

    it('seeds include catalog, notepads, extensions', () => {
      const ids = listExperimentalFeatures().map((f) => f.id)
      expect(ids).toContain('catalog')
      expect(ids).toContain('notepads')
      expect(ids).toContain('extensions')
    })

    it('all seeded entries have progress 75 and status inflight', () => {
      for (const feature of listExperimentalFeatures()) {
        expect(feature.progress).toBe(75)
        expect(feature.status).toBe('inflight')
      }
    })

    it('returns a snapshot — mutation does not affect registry', () => {
      const list1 = listExperimentalFeatures()
      list1.push({
        id: 'bogus',
        title: 'Bogus',
        status: 'inflight',
        progress: 0,
        ownerTicket: 'ANV-9999',
      })
      const list2 = listExperimentalFeatures()
      expect(list2).toHaveLength(3)
    })
  })

  describe('getExperimentalFeature()', () => {
    it('finds catalog by id', () => {
      const f = getExperimentalFeature('catalog')
      expect(f).toBeDefined()
      expect(f?.id).toBe('catalog')
    })

    it('returns undefined for unknown id', () => {
      expect(getExperimentalFeature('does-not-exist')).toBeUndefined()
    })
  })

  describe('registerExperimentalFeature()', () => {
    it('adds a new feature to the list', () => {
      registerExperimentalFeature({
        id: 'new-feature',
        title: 'New Feature',
        status: 'inflight',
        progress: 50,
        ownerTicket: 'ANV-9999',
      })
      expect(listExperimentalFeatures()).toHaveLength(4)
      expect(getExperimentalFeature('new-feature')).toBeDefined()
    })

    it('throws on duplicate id', () => {
      expect(() =>
        registerExperimentalFeature({
          id: 'catalog',
          title: 'Catalog Dup',
          status: 'inflight',
          progress: 75,
          ownerTicket: 'ANV-0246',
        }),
      ).toThrow(/duplicate/i)
    })

    it('throws when progress is below 0', () => {
      expect(() =>
        registerExperimentalFeature({
          id: 'bad-progress',
          title: 'Bad',
          status: 'inflight',
          progress: -1,
          ownerTicket: 'ANV-9999',
        }),
      ).toThrow(/progress/i)
    })

    it('throws when progress is above 100', () => {
      expect(() =>
        registerExperimentalFeature({
          id: 'bad-progress-high',
          title: 'Bad',
          status: 'inflight',
          progress: 101,
          ownerTicket: 'ANV-9999',
        }),
      ).toThrow(/progress/i)
    })
  })

  describe('__resetForTests()', () => {
    it('restores the 3 seeded entries after a register', () => {
      registerExperimentalFeature({
        id: 'temp',
        title: 'Temp',
        status: 'inflight',
        progress: 10,
        ownerTicket: 'ANV-9999',
      })
      expect(listExperimentalFeatures()).toHaveLength(4)
      __resetForTests()
      expect(listExperimentalFeatures()).toHaveLength(3)
    })
  })
})
