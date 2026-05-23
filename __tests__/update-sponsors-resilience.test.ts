import fs from 'node:fs/promises'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {loadSponsorData} from '../scripts/update-sponsors.ts'

// vi.mock is hoisted by vitest's transform — these run before any imports at runtime.
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
  },
}))

vi.mock('../scripts/content-performance-tracking.ts', () => ({
  ContentPerformanceTracker: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    trackSponsorAcquisition: vi.fn().mockResolvedValue({newSponsorsCount: 0, lostSponsorsCount: 0, fundingChange: 0}),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    calculateMetrics: vi
      .fn()
      .mockResolvedValue({totalEvents: 0, conversionRate: 0, sponsorAcquisitions: 0, growthRate: 0}),
  })),
}))

describe('update-sponsors resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadSponsorData', () => {
    it('returns fallback zero-sponsor data when cache file is missing (ENOENT) without throwing', async () => {
      const enoentError = Object.assign(new Error('ENOENT: no such file or directory'), {code: 'ENOENT'})
      vi.mocked(fs.readFile).mockRejectedValue(enoentError)

      const result = await loadSponsorData()

      expect(result.sponsors).toEqual([])
      expect(result.stats.totalSponsors).toBe(0)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error?.length).toBeGreaterThan(0)
    })

    it('returns fallback zero-sponsor data when cache file is malformed JSON without throwing', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ this is not valid json !!!')

      const result = await loadSponsorData()

      expect(result.sponsors).toEqual([])
      expect(result.stats.totalSponsors).toBe(0)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error?.length).toBeGreaterThan(0)
    })

    it('returns fallback zero-sponsor data when cache file has success:false marker without throwing', async () => {
      const failedCache = JSON.stringify({
        sponsors: [],
        stats: {
          totalSponsors: 0,
          totalMonthlyAmountCents: 0,
          totalMonthlyAmountDollars: 0,
          tierBreakdown: {},
          lastUpdated: new Date().toISOString(),
        },
        goals: [],
        fetchedAt: new Date().toISOString(),
        success: false,
        error: 'GitHub API rate limit exceeded',
      })
      vi.mocked(fs.readFile).mockResolvedValue(failedCache)

      const result = await loadSponsorData()

      expect(result.sponsors).toEqual([])
      expect(result.stats.totalSponsors).toBe(0)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error?.length).toBeGreaterThan(0)
    })
  })
})
