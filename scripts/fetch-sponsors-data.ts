#!/usr/bin/env tsx

/**
 * GitHub Sponsors Data Fetcher
 *
 * This script fetches sponsor data from the GitHub Sponsors API,
 * processes it into structured format with tier classification,
 * calculates funding goals progress, generates impact metrics,
 * and implements caching and error handling.
 *
 * Phase 2 Implementation Tasks:
 * - TASK-007: Create scripts/fetch-sponsors-data.ts to retrieve sponsorship information
 * - TASK-008: Implement sponsor tier classification and recognition logic
 * - TASK-009: Add funding goals calculation and progress tracking algorithms
 * - TASK-010: Create impact metrics calculation (total funding, active sponsors, etc.)
 * - TASK-011: Implement data caching mechanism to reduce API calls
 * - TASK-012: Add comprehensive error handling and retry logic for API failures
 */

import type {
  FundingGoal,
  GitHubSponsorNode,
  ProcessedSponsor,
  SponsorData,
  SponsorStats,
  SponsorTier,
} from '@/types/sponsors.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

import process from 'node:process'
import {DEFAULT_FUNDING_GOALS, TIER_THRESHOLDS} from '@/types/sponsors.ts'
import {GitHubApiClient} from '@/utils/github-api.ts'

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'sponsors-data.json')
const BACKUP_CACHE_FILE = path.join(CACHE_DIR, 'sponsors-data-backup.json')

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000

/**
 * Cache management utilities
 */
const SponsorDataCache = {
  /**
   * Load cached sponsor data if valid
   */
  async load(maxAgeMs: number): Promise<SponsorData | null> {
    try {
      await fs.mkdir(CACHE_DIR, {recursive: true})

      const cacheData = await fs.readFile(CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(cacheData) as SponsorData

      const cacheAge = Date.now() - new Date(parsedData.fetchedAt).getTime()
      if (cacheAge <= maxAgeMs) {
        console.warn(`✅ Using cached sponsor data (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`)
        return parsedData
      }

      console.warn(
        `❌ Cache expired (age: ${Math.round(cacheAge / 1000 / 60)} minutes, max: ${Math.round(maxAgeMs / 1000 / 60)} minutes)`,
      )
      return null
    } catch {
      console.warn('📂 No valid cache found, will fetch fresh data')
      return null
    }
  },

  /**
   * Save sponsor data to cache with backup
   */
  async save(data: SponsorData): Promise<void> {
    try {
      await fs.mkdir(CACHE_DIR, {recursive: true})

      // Create backup of existing cache
      try {
        await fs.copyFile(CACHE_FILE, BACKUP_CACHE_FILE)
      } catch {
        // Backup creation failed, but not critical
      }

      await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8')
      console.warn('💾 Sponsor data cached successfully')
    } catch (error) {
      console.error('❌ Failed to save cache:', error)
    }
  },

  /**
   * Load backup cache as fallback
   */
  async loadBackup(): Promise<SponsorData | null> {
    try {
      const backupData = await fs.readFile(BACKUP_CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(backupData) as SponsorData
      console.warn('📦 Using backup cache data as fallback')
      return parsedData
    } catch {
      console.warn('❌ No backup cache available')
      return null
    }
  },
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(operation: () => Promise<T>, operationName: string, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.warn(`🔄 ${operationName} (attempt ${attempt}/${maxRetries})`)
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxRetries) {
        console.error(`❌ ${operationName} failed after ${maxRetries} attempts:`, lastError.message)
        throw lastError
      }

      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
      console.warn(`⏳ ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error(`Unexpected error in withRetry for ${operationName}`)
}

/**
 * TASK-008: Classify sponsor tier based on monthly amount
 * Note: Since GitHub API doesn't provide individual sponsor amounts directly,
 * we'll estimate tiers based on available sponsorship tier data
 */
function classifySponsorTier(monthlyAmountDollars: number): SponsorTier {
  for (const [tier, threshold] of Object.entries(TIER_THRESHOLDS)) {
    if (
      monthlyAmountDollars >= threshold.min &&
      (threshold.max === undefined || monthlyAmountDollars <= threshold.max)
    ) {
      return tier as SponsorTier
    }
  }

  // Default to bronze for any amount >= $1
  return 'bronze'
}

/**
 * TASK-008: Process raw sponsor data into structured format
 * Since individual amounts aren't available, we'll distribute sponsors across tiers
 * based on the available tier information and estimated averages
 */
function processSponsors(
  sponsorNodes: GitHubSponsorNode[],
  availableTiers: {monthlyPriceInCents: number; name: string}[],
  totalMonthlyIncomeCents: number,
): ProcessedSponsor[] {
  const processedSponsors: ProcessedSponsor[] = []

  // If we have tier information, distribute sponsors accordingly
  if (availableTiers.length > 0 && sponsorNodes.length > 0) {
    // Calculate average contribution per sponsor
    const avgContributionCents = Math.floor(totalMonthlyIncomeCents / sponsorNodes.length)

    sponsorNodes.forEach((sponsor, index) => {
      // Distribute tiers - use actual tier data when available, otherwise estimate
      let monthlyAmountCents = avgContributionCents

      // For a more realistic distribution, assign higher amounts to earlier sponsors
      // This is an estimation since actual amounts aren't available
      if (index < availableTiers.length && availableTiers[index]) {
        monthlyAmountCents = availableTiers[index].monthlyPriceInCents
      }

      const monthlyAmountDollars = monthlyAmountCents / 100
      const tier = classifySponsorTier(monthlyAmountDollars)

      processedSponsors.push({
        login: sponsor.login,
        displayName: sponsor.name ?? sponsor.login,
        profileUrl: sponsor.url,
        avatarUrl: sponsor.avatarUrl,
        monthlyAmountCents,
        monthlyAmountDollars,
        tier,
        createdAt: new Date().toISOString(), // Estimation - actual data not available
        isPublic: true, // Assumption since they appear in the sponsors list
      })
    })
  }

  return processedSponsors
}

/**
 * TASK-010: Calculate comprehensive sponsor statistics
 */
function calculateSponsorStats(sponsors: ProcessedSponsor[]): SponsorStats {
  const totalSponsors = sponsors.length
  const totalMonthlyAmountCents = sponsors.reduce((sum, sponsor) => sum + sponsor.monthlyAmountCents, 0)
  const totalMonthlyAmountDollars = totalMonthlyAmountCents / 100

  // Initialize tier breakdown
  const tierBreakdown: SponsorStats['tierBreakdown'] = {
    bronze: {count: 0, totalAmountCents: 0, totalAmountDollars: 0},
    silver: {count: 0, totalAmountCents: 0, totalAmountDollars: 0},
    gold: {count: 0, totalAmountCents: 0, totalAmountDollars: 0},
    platinum: {count: 0, totalAmountCents: 0, totalAmountDollars: 0},
    diamond: {count: 0, totalAmountCents: 0, totalAmountDollars: 0},
  }

  // Calculate tier breakdown
  sponsors.forEach(sponsor => {
    tierBreakdown[sponsor.tier].count++
    tierBreakdown[sponsor.tier].totalAmountCents += sponsor.monthlyAmountCents
    tierBreakdown[sponsor.tier].totalAmountDollars += sponsor.monthlyAmountDollars
  })

  return {
    totalSponsors,
    totalMonthlyAmountCents,
    totalMonthlyAmountDollars,
    tierBreakdown,
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * TASK-009: Calculate funding goals progress based on current income
 */
function calculateFundingGoals(totalMonthlyIncomeDollars: number): FundingGoal[] {
  return DEFAULT_FUNDING_GOALS.map((goal, index) => {
    const progressPercentage = Math.min(Math.round((totalMonthlyIncomeDollars / goal.targetAmountDollars) * 100), 100)

    return {
      id: `goal-${index + 1}`,
      title: goal.title,
      description: goal.description,
      targetAmountDollars: goal.targetAmountDollars,
      progressPercentage,
      isActive: goal.isActive && progressPercentage < 100,
      priority: goal.priority,
    }
  })
}

/**
 * Create fallback sponsor data when API fails
 */
function createFallbackData(error: string): SponsorData {
  console.warn('🚨 Creating fallback sponsor data due to API failure')

  return {
    sponsors: [],
    stats: {
      totalSponsors: 0,
      totalMonthlyAmountCents: 0,
      totalMonthlyAmountDollars: 0,
      tierBreakdown: Object.keys(TIER_THRESHOLDS).reduce(
        (acc, tier) => {
          acc[tier as SponsorTier] = {count: 0, totalAmountCents: 0, totalAmountDollars: 0}
          return acc
        },
        {} as SponsorStats['tierBreakdown'],
      ),
      lastUpdated: new Date().toISOString(),
    },
    goals: DEFAULT_FUNDING_GOALS.map((goal, index) => ({
      id: `goal-${index + 1}`,
      title: goal.title,
      description: goal.description,
      targetAmountDollars: goal.targetAmountDollars,
      progressPercentage: 0,
      isActive: goal.isActive,
      priority: goal.priority,
    })),
    fetchedAt: new Date().toISOString(),
    success: false,
    error,
  }
}

/**
 * TASK-007: Main sponsor data fetching function
 * Orchestrates all the Phase 2 functionality with comprehensive error handling
 */
export async function fetchSponsorsData(
  client?: GitHubApiClient,
  options: {
    forceRefresh?: boolean
    cacheDurationMs?: number
  } = {},
): Promise<SponsorData> {
  const {forceRefresh = false, cacheDurationMs = 300000} = options // 5 minutes default

  console.warn('🚀 Starting sponsor data fetch...')

  // TASK-011: Check cache first unless force refresh is requested
  if (!forceRefresh) {
    const cachedData = await SponsorDataCache.load(cacheDurationMs)
    if (cachedData) {
      return cachedData
    }
  }

  // Initialize GitHub client if not provided
  const apiClient = client || GitHubApiClient.fromEnvironment()

  try {
    // TASK-012: Test API connection with retry logic
    const connectionTest = await withRetry(async () => apiClient.testConnection(), 'GitHub API connection test')

    if (!connectionTest.success) {
      throw new Error(`GitHub API authentication failed: ${connectionTest.error}`)
    }

    // TASK-007: Fetch sponsor data with retry logic
    const sponsorData = await withRetry(async () => apiClient.fetchSponsors(), 'GitHub Sponsors API fetch')

    // Extract data from GraphQL response
    const sponsorNodes = sponsorData.sponsors.edges.map(edge => edge.node)
    const totalMonthlyIncomeCents = sponsorData.monthlyEstimatedSponsorsIncomeInCents || 0
    const availableTiers = sponsorData.sponsorsListing?.tiers?.edges?.map(edge => edge.node) ?? []

    console.warn(
      `📊 Raw data: ${sponsorNodes.length} sponsors, $${totalMonthlyIncomeCents / 100}/month estimated income`,
    )

    // TASK-008: Process sponsors with tier classification
    const processedSponsors = processSponsors(sponsorNodes, availableTiers, totalMonthlyIncomeCents)

    // TASK-010: Calculate comprehensive statistics
    const stats = calculateSponsorStats(processedSponsors)

    // TASK-009: Calculate funding goals progress
    const goals = calculateFundingGoals(stats.totalMonthlyAmountDollars)

    const result: SponsorData = {
      sponsors: processedSponsors,
      stats,
      goals,
      fetchedAt: new Date().toISOString(),
      success: true,
    }

    // TASK-011: Cache the successful result
    await SponsorDataCache.save(result)

    console.warn('✅ Sponsor data fetch completed successfully')
    console.warn(`📈 Summary: ${stats.totalSponsors} sponsors, $${stats.totalMonthlyAmountDollars}/month`)

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Sponsor data fetch failed:', errorMessage)

    // TASK-012: Try to use backup cache as fallback
    const backupData = await SponsorDataCache.loadBackup()
    if (backupData) {
      return {
        ...backupData,
        success: false,
        error: `API failed, using backup data: ${errorMessage}`,
        fetchedAt: new Date().toISOString(),
      }
    }

    // TASK-012: Return fallback data if no cache available
    return createFallbackData(errorMessage)
  }
}

/**
 * CLI execution when run directly
 */
async function main() {
  try {
    const forceRefresh = process.argv.includes('--force-refresh')
    const verbose = process.argv.includes('--verbose')

    if (verbose) {
      console.warn('🔧 Running in verbose mode')
    }

    const sponsorData = await fetchSponsorsData(undefined, {forceRefresh})

    if (verbose) {
      console.log(JSON.stringify(sponsorData, null, 2))
    } else {
      console.log('Sponsor Data Summary:')
      console.log(`  Success: ${sponsorData.success}`)
      console.log(`  Total Sponsors: ${sponsorData.stats.totalSponsors}`)
      console.log(`  Monthly Income: $${sponsorData.stats.totalMonthlyAmountDollars}`)
      console.log(`  Active Goals: ${sponsorData.goals.filter(g => g.isActive).length}`)

      if (sponsorData.error !== undefined && sponsorData.error.length > 0) {
        console.log(`  Error: ${sponsorData.error}`)
      }

      console.log('\nFunding Goals Progress:')
      sponsorData.goals.forEach(goal => {
        const status = goal.isActive ? '🎯' : goal.progressPercentage >= 100 ? '✅' : '⏸️'
        console.log(`  ${status} ${goal.title}: ${goal.progressPercentage}% ($${goal.targetAmountDollars})`)
      })

      console.log('\nTier Breakdown:')
      Object.entries(sponsorData.stats.tierBreakdown).forEach(([tier, data]) => {
        if (data.count > 0) {
          console.log(`  ${tier}: ${data.count} sponsors ($${data.totalAmountDollars})`)
        }
      })
    }
  } catch (error) {
    console.error('❌ Script execution failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
