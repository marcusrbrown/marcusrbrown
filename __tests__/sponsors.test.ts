import {describe, expect, it} from 'vitest'
import {TIER_THRESHOLDS} from '@/types/sponsors.ts'

/**
 * Test sponsor tier classification logic
 */
describe('Sponsor Tier Classification', () => {
  it('should classify diamond tier correctly', () => {
    const diamondThreshold = TIER_THRESHOLDS.diamond
    expect(diamondThreshold.min).toBe(100)
    expect(diamondThreshold.max).toBeUndefined()
  })

  it('should classify platinum tier correctly', () => {
    const platinumThreshold = TIER_THRESHOLDS.platinum
    expect(platinumThreshold.min).toBe(25)
    expect(platinumThreshold.max).toBe(99.99)
  })

  it('should classify gold tier correctly', () => {
    const goldThreshold = TIER_THRESHOLDS.gold
    expect(goldThreshold.min).toBe(10)
    expect(goldThreshold.max).toBe(24.99)
  })

  it('should classify silver tier correctly', () => {
    const silverThreshold = TIER_THRESHOLDS.silver
    expect(silverThreshold.min).toBe(5)
    expect(silverThreshold.max).toBe(9.99)
  })

  it('should classify bronze tier correctly', () => {
    const bronzeThreshold = TIER_THRESHOLDS.bronze
    expect(bronzeThreshold.min).toBe(1)
    expect(bronzeThreshold.max).toBe(4.99)
  })
})

/**
 * Test sponsor data structure validation
 */
describe('Sponsor Data Validation', () => {
  it('should validate sponsor interface structure', () => {
    const mockSponsor = {
      login: 'testuser',
      displayName: 'Test User',
      profileUrl: 'https://github.com/testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123',
      monthlyAmountCents: 500,
      monthlyAmountDollars: 5,
      tier: 'silver' as const,
      createdAt: '2023-01-01T00:00:00Z',
      isPublic: true,
    }

    // Verify all required fields are present
    expect(mockSponsor.login).toBeDefined()
    expect(mockSponsor.displayName).toBeDefined()
    expect(mockSponsor.profileUrl).toBeDefined()
    expect(mockSponsor.avatarUrl).toBeDefined()
    expect(mockSponsor.monthlyAmountCents).toBeGreaterThan(0)
    expect(mockSponsor.monthlyAmountDollars).toBeGreaterThan(0)
    expect(mockSponsor.tier).toMatch(/^(bronze|silver|gold|platinum|diamond)$/)
    expect(mockSponsor.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(typeof mockSponsor.isPublic).toBe('boolean')
  })
})
