#!/usr/bin/env node

/**
 * GitHub Profile Analytics & Performance Measurement
 *
 * Tracks engagement metrics, profile views, and performance indicators
 * for the GitHub profile README and associated content.
 *
 * Implementation Status:
 * - Phase 1 (COMPLETE): GitHub API traffic/contributions methods in utils/github-api.ts
 * - Phase 2 (COMPLETE): CLI infrastructure with --verbose, --help, --force-refresh, --dry-run flags
 * - Phase 3 (COMPLETE): withRetry wrapper, GitHub-native analytics integration
 * - Phase 4 (COMPLETE): Multi-layer cache system (ProfileMetricsCache)
 * - Phase 5 (COMPLETE): Logger usage, error handling, graceful degradation
 * - Phase 6 (PENDING): Comprehensive test suite
 *
 * Features:
 * - Profile view tracking and analytics
 * - GitHub API metrics collection
 * - Performance measurement and optimization
 * - Engagement pattern analysis
 * - Report generation for profile optimization
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {GitHubApiClient} from '@/utils/github-api'
import {Logger} from '@/utils/logger'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000

/**
 * Cache configuration
 */
const CACHE_DIR = path.join(process.cwd(), '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'metrics-history.json')
const BACKUP_CACHE_FILE = path.join(CACHE_DIR, 'metrics-history-backup.json')
const DEFAULT_CACHE_DURATION_MS = 3600000 // 1 hour

/**
 * Multi-layer cache system for profile metrics
 */
const ProfileMetricsCache = {
  /**
   * Load cached metrics data if valid
   */
  async load(maxAgeMs: number): Promise<ProfileMetrics[] | null> {
    const logger = Logger.getInstance()
    try {
      await fs.mkdir(CACHE_DIR, {recursive: true})

      const cacheData = await fs.readFile(CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(cacheData) as {metrics: ProfileMetrics[]; fetchedAt: string}

      const cacheAge = Date.now() - new Date(parsedData.fetchedAt).getTime()
      if (cacheAge <= maxAgeMs) {
        logger.success(
          `Using cached metrics data (age: ${Math.round(cacheAge / 1000 / 60)} minutes, ${parsedData.metrics.length} records)`,
        )
        return parsedData.metrics
      }

      logger.warn(
        `Cache expired (age: ${Math.round(cacheAge / 1000 / 60)} minutes, max: ${Math.round(maxAgeMs / 1000 / 60)} minutes)`,
      )
      return null
    } catch (error) {
      logger.debug(`No valid cache found: ${(error as Error).message}`)
      return null
    }
  },

  /**
   * Save metrics data to cache with backup
   */
  async save(metrics: ProfileMetrics[]): Promise<void> {
    const logger = Logger.getInstance()
    try {
      await fs.mkdir(CACHE_DIR, {recursive: true})

      // Create backup of existing cache before overwriting
      try {
        await fs.copyFile(CACHE_FILE, BACKUP_CACHE_FILE)
        logger.debug('Created backup of existing cache')
      } catch {
        // No existing cache to backup, not an error
      }

      const cacheData = {
        metrics,
        fetchedAt: new Date().toISOString(),
      }

      await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8')
      logger.success('Metrics data cached successfully')
    } catch (error) {
      logger.error('Failed to save cache', error as Error)
    }
  },

  /**
   * Load backup cache as fallback
   */
  async loadBackup(): Promise<ProfileMetrics[] | null> {
    const logger = Logger.getInstance()
    try {
      const backupData = await fs.readFile(BACKUP_CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(backupData) as {metrics: ProfileMetrics[]; fetchedAt: string}
      logger.warn('Using backup cache data as fallback')
      return parsedData.metrics
    } catch {
      logger.debug('No backup cache available')
      return null
    }
  },
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  const logger = Logger.getInstance()
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Attempting ${operationName} (attempt ${attempt}/${maxRetries})`)
      return await operation()
    } catch (error) {
      lastError = error as Error
      logger.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`)

      if (attempt < maxRetries) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
        logger.debug(`Retrying ${operationName} in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  logger.error(`${operationName} failed after ${maxRetries} attempts`)
  throw lastError ?? new Error(`${operationName} failed after ${maxRetries} attempts`)
}

/**
 * Parse command-line arguments into CliOptions
 */
function parseArguments(): CliOptions {
  const args = process.argv.slice(2)
  let options: CliOptions = {
    verbose: false,
    help: false,
    forceRefresh: false,
    dryRun: false,
    repos: [],
    period: 365,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    // TypeScript doesn't narrow array access, explicit check required
    if (arg === undefined) continue

    switch (arg) {
      case '--verbose':
      case '-v':
        options = {...options, verbose: true}
        break
      case '--help':
      case '-h':
        options = {...options, help: true}
        break
      case '--force-refresh':
      case '-f':
        options = {...options, forceRefresh: true}
        break
      case '--dry-run':
      case '-d':
        options = {...options, dryRun: true}
        break
      case '--repos':
      case '-r': {
        const reposArg = args[++i]
        if (reposArg !== undefined && !reposArg.startsWith('--')) {
          options = {...options, repos: reposArg.split(',').map(r => r.trim())}
        }
        break
      }
      case '--period':
      case '-p': {
        const periodArg = args[++i]
        if (periodArg !== undefined && !periodArg.startsWith('--')) {
          const periodValue = Number.parseInt(periodArg, 10)
          if (!Number.isNaN(periodValue) && periodValue > 0) {
            options = {...options, period: periodValue}
          }
        }
        break
      }
      default:
        break
    }
  }

  return options
}

/**
 * Display CLI help information
 */
function showHelp(): void {
  const helpText = `
GitHub Profile Analytics - Track and analyze your GitHub profile metrics

Usage:
  pnpm run analytics [command] [options]
  GITHUB_TOKEN=<token> pnpm run analytics [command] [options]

Commands:
  collect    Collect current profile metrics
  report     Generate comprehensive analytics report
  track      Track performance metrics (default)

Options:
  --verbose, -v           Enable verbose logging output
  --help, -h              Display this help information
  --force-refresh, -f     Bypass cache and fetch fresh data
  --dry-run, -d           Preview actions without making changes
  --repos, -r <repos>     Comma-separated list of repos for traffic aggregation
                          Example: --repos "repo1,repo2,repo3"
                          Default: top 5 repositories by stars
  --period, -p <days>     Contribution analysis period in days
                          Example: --period 90
                          Default: 365 days

Examples:
  # Basic usage with default command
  pnpm run analytics

  # Generate detailed report with verbose output
  pnpm run analytics report --verbose

  # Force refresh and collect metrics for specific repos
  pnpm run analytics collect --force-refresh --repos "repo1,repo2"

  # Dry-run mode to preview changes
  pnpm run analytics --dry-run --verbose

  # Analyze contributions for the last 90 days
  pnpm run analytics report --period 90

Required Permissions:
  GITHUB_TOKEN environment variable must be set with the following scopes:
  - read:user              Read user profile information
  - repo (or read:org)     Access repository traffic data (requires push access)
  - read:project           Read project data

Note:
  Traffic API endpoints require push access to repositories. The script will
  gracefully skip repositories where access is insufficient and continue with
  available data.

For more information, see: https://docs.github.com/en/rest/metrics/traffic
`

  const logger = Logger.getInstance()
  logger.info(helpText)
}

interface AnalyticsConfig {
  readonly username: string
  readonly apiToken: string | undefined
  readonly cacheDir: string
  readonly reportDir: string
  readonly trackingPeriod: number
  readonly forceRefresh: boolean
  readonly dryRun: boolean
  readonly targetRepos: string[]
  readonly contributionPeriodDays: number
}

interface ProfileMetrics {
  readonly timestamp: string
  readonly profileViews: number
  readonly followers: number
  readonly following: number
  readonly publicRepos: number
  readonly totalStars: number
  readonly totalForks: number
  readonly contributions: number
  readonly popularRepositories: Repository[]
  readonly engagement: EngagementMetrics
}

interface Repository {
  readonly name: string
  readonly stars: number
  readonly forks: number
  readonly language: string
  readonly lastUpdated: string
  readonly isPrivate: boolean
}

interface EngagementMetrics {
  readonly profileClickThrough: number
  readonly repositoryViews: number
  readonly sponsorPageViews: number
  readonly contactClicks: number
  readonly projectInteractions: number
}

interface AnalyticsReport {
  readonly generatedAt: string
  readonly period: {
    readonly start: string
    readonly end: string
  }
  readonly summary: ProfileMetrics
  readonly trends: TrendAnalysis
  readonly recommendations: string[]
}

interface TrendAnalysis {
  readonly followerGrowth: number
  readonly starGrowth: number
  readonly viewGrowth: number
  readonly engagementRate: number
  readonly popularContent: string[]
}

interface GitHubRepository {
  readonly name: string
  readonly stargazers_count: number
  readonly forks_count: number
  readonly language: string | null
  readonly updated_at: string
  readonly private: boolean
}

interface CliOptions {
  readonly verbose: boolean
  readonly help: boolean
  readonly forceRefresh: boolean
  readonly dryRun: boolean
  readonly repos: string[]
  readonly period: number
}

class ProfileAnalytics {
  private readonly config: AnalyticsConfig
  private readonly github: GitHubApiClient
  private readonly logger: Logger

  constructor(config: AnalyticsConfig) {
    this.config = config

    const githubToken = config.apiToken ?? process.env.GITHUB_TOKEN ?? ''
    if (!githubToken) {
      throw new Error('GitHub token is required')
    }

    this.github = new GitHubApiClient({
      githubToken,
      username: config.username,
      includePrivate: false,
      cacheDurationMs: 300000, // 5 minutes
      timeoutMs: 10000, // 10 seconds
    })
    this.logger = Logger.getInstance()
  }

  /**
   * Collect comprehensive profile metrics
   */
  async collectMetrics(): Promise<ProfileMetrics> {
    this.logger.info('📊 Collecting profile metrics...')

    try {
      // Fetch user data with retry
      const user = await withRetry(async () => this.github.fetchUserProfile(this.config.username), 'fetch user profile')

      // Fetch repositories with retry
      const repositories = (await withRetry(
        async () => this.github.getUserRepositories(this.config.username),
        'fetch user repositories',
      )) as GitHubRepository[]

      // Calculate total stars and forks
      const totalStars = repositories.reduce((sum: number, repo: GitHubRepository) => sum + repo.stargazers_count, 0)
      const totalForks = repositories.reduce((sum: number, repo: GitHubRepository) => sum + repo.forks_count, 0)

      // Get popular repositories (top 10 by stars)
      const popularRepositories: Repository[] = repositories
        .sort((a: GitHubRepository, b: GitHubRepository) => b.stargazers_count - a.stargazers_count)
        .slice(0, 10)
        .map((repo: GitHubRepository) => ({
          name: repo.name,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language ?? 'Unknown',
          lastUpdated: repo.updated_at,
          isPrivate: repo.private,
        }))

      // Collect engagement metrics (simulated for now - would integrate with analytics service)
      const engagement = await this.collectEngagementMetrics()

      // Get contribution count (approximate from recent activity)
      const contributions = await this.getContributionCount()

      // Select repositories for traffic aggregation
      const targetRepos =
        this.config.targetRepos.length > 0
          ? this.config.targetRepos
          : repositories
              .filter(repo => !repo.private)
              .sort((a, b) => b.stargazers_count - a.stargazers_count)
              .slice(0, 5)
              .map(repo => repo.name)

      this.logger.debug(
        `Selected ${targetRepos.length} repositories for traffic aggregation: ${targetRepos.join(', ')}`,
      )

      const metrics: ProfileMetrics = {
        timestamp: new Date().toISOString(),
        profileViews: await this.aggregateRepositoryViews(targetRepos),
        followers: user.followers,
        following: user.following,
        publicRepos: user.public_repos,
        totalStars,
        totalForks,
        contributions,
        popularRepositories,
        engagement,
      }

      this.logger.success('✅ Profile metrics collected successfully')
      return metrics
    } catch (error) {
      this.logger.error('❌ Failed to collect profile metrics', error as Error)
      throw error
    }
  }

  /**
   * Generate analytics report with trends and recommendations
   */
  async generateReport(): Promise<AnalyticsReport> {
    this.logger.info('📈 Generating analytics report...')

    const currentMetrics = await this.collectMetrics()
    const historicalData = await this.loadHistoricalData()
    const trends = this.analyzeTrends(currentMetrics, historicalData)
    const recommendations = this.generateRecommendations(currentMetrics, trends)

    const report: AnalyticsReport = {
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(Date.now() - this.config.trackingPeriod * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      summary: currentMetrics,
      trends,
      recommendations,
    }

    // Save report
    await this.saveReport(report)

    this.logger.success('✅ Analytics report generated')
    return report
  }

  /**
   * Track profile performance metrics over time
   */
  async trackPerformance(): Promise<void> {
    this.logger.info('🎯 Tracking profile performance...')

    const metrics = await this.collectMetrics()
    await this.saveMetrics(metrics)

    // Clean up old data (keep last 90 days)
    await this.cleanupOldData()

    this.logger.success('✅ Performance tracking completed')
  }

  /**
   * Aggregate profile views across specified repositories using GitHub traffic API
   */
  private async aggregateRepositoryViews(repos: string[]): Promise<number> {
    this.logger.debug(`Aggregating views for ${repos.length} repositories`)
    let totalViews = 0
    let successfulRepos = 0

    for (const repo of repos) {
      try {
        const views = await withRetry(
          async () => this.github.getRepositoryViews(this.config.username, repo, 'day'),
          `fetch views for ${repo}`,
        )
        totalViews += views.count
        successfulRepos++
        this.logger.debug(`Repository ${repo}: ${views.count} views (${views.uniques} unique)`)
      } catch (error) {
        this.logger.warn(`⚠️  Skipping ${repo}: ${(error as Error).message}`)
        continue
      }
    }

    if (successfulRepos === 0) {
      this.logger.warn('⚠️  Could not fetch views for any repositories')
      return 0
    }

    this.logger.info(`Aggregated ${totalViews} total views from ${successfulRepos}/${repos.length} repositories`)
    return totalViews
  }

  /**
   * Collect engagement metrics from various sources
   */
  private async collectEngagementMetrics(): Promise<EngagementMetrics> {
    // Placeholder implementation - would integrate with analytics services
    return {
      profileClickThrough: 0,
      repositoryViews: 0,
      sponsorPageViews: 0,
      contactClicks: 0,
      projectInteractions: 0,
    }
  }

  /**
   * Get contribution count using GitHub GraphQL API
   */
  private async getContributionCount(): Promise<number> {
    try {
      const to = new Date()
      const from = new Date(to.getTime() - this.config.contributionPeriodDays * 24 * 60 * 60 * 1000)

      this.logger.debug(
        `Fetching contributions from ${from.toISOString()} to ${to.toISOString()} (${this.config.contributionPeriodDays} days)`,
      )

      const contributions = await withRetry(
        async () => this.github.fetchUserContributions(this.config.username, from.toISOString(), to.toISOString()),
        'fetch user contributions',
      )

      const totalContributions = contributions.contributionCalendar.totalContributions
      this.logger.debug(`Total contributions: ${totalContributions}`)

      return totalContributions
    } catch (error) {
      this.logger.warn(`⚠️  Could not fetch contribution count: ${(error as Error).message}`)
      return 0
    }
  }

  /**
   * Load historical metrics data with multi-layer cache fallback
   */
  private async loadHistoricalData(): Promise<ProfileMetrics[]> {
    // Bypass cache if force-refresh is enabled
    if (this.config.forceRefresh) {
      this.logger.info('Force refresh enabled - bypassing cache')
      return []
    }

    // Try primary cache
    const cached = await ProfileMetricsCache.load(DEFAULT_CACHE_DURATION_MS)
    if (cached !== null) {
      return cached
    }

    // Try backup cache as fallback
    const backup = await ProfileMetricsCache.loadBackup()
    if (backup !== null) {
      return backup
    }

    // No cache available, return empty array
    this.logger.info('No cached metrics data available, starting fresh')
    return []
  }

  /**
   * Analyze trends in profile metrics
   */
  private analyzeTrends(current: ProfileMetrics, historical: ProfileMetrics[]): TrendAnalysis {
    if (historical.length === 0) {
      return {
        followerGrowth: 0,
        starGrowth: 0,
        viewGrowth: 0,
        engagementRate: 0,
        popularContent: current.popularRepositories.slice(0, 3).map(repo => repo.name),
      }
    }

    const previous = historical.at(-1)
    if (!previous) {
      return {
        followerGrowth: 0,
        starGrowth: 0,
        viewGrowth: 0,
        engagementRate: 0,
        popularContent: current.popularRepositories.slice(0, 3).map(repo => repo.name),
      }
    }

    const followerGrowth =
      previous.followers > 0 ? ((current.followers - previous.followers) / previous.followers) * 100 : 0
    const starGrowth =
      previous.totalStars > 0 ? ((current.totalStars - previous.totalStars) / previous.totalStars) * 100 : 0
    const viewGrowth =
      previous.profileViews > 0 ? ((current.profileViews - previous.profileViews) / previous.profileViews) * 100 : 0

    return {
      followerGrowth: Math.round(followerGrowth * 100) / 100,
      starGrowth: Math.round(starGrowth * 100) / 100,
      viewGrowth: Math.round(viewGrowth * 100) / 100,
      engagementRate: this.calculateEngagementRate(current),
      popularContent: current.popularRepositories.slice(0, 5).map(repo => repo.name),
    }
  }

  /**
   * Calculate engagement rate based on various metrics
   */
  private calculateEngagementRate(metrics: ProfileMetrics): number {
    const totalInteractions = metrics.totalStars + metrics.totalForks + metrics.followers
    const rate = (totalInteractions / Math.max(metrics.profileViews, 1)) * 100
    return Math.round(rate * 100) / 100
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(metrics: ProfileMetrics, trends: TrendAnalysis): string[] {
    const recommendations: string[] = []

    if (trends.followerGrowth < 5) {
      recommendations.push('Consider increasing community engagement and content sharing')
    }

    if (trends.starGrowth < 10) {
      recommendations.push('Focus on creating more valuable open source projects')
    }

    if (trends.engagementRate < 2) {
      recommendations.push('Optimize profile content and project descriptions for better engagement')
    }

    if (metrics.popularRepositories.length < 5) {
      recommendations.push('Develop more public projects to showcase diverse skills')
    }

    recommendations.push('Continue maintaining active contribution patterns')
    recommendations.push('Keep profile README updated with latest achievements')

    return recommendations
  }

  /**
   * Save metrics to historical data using cache system
   */
  private async saveMetrics(metrics: ProfileMetrics): Promise<void> {
    if (this.config.dryRun) {
      this.logger.info('Dry-run mode: Would save metrics to cache')
      this.logger.debug(`Metrics to save: ${JSON.stringify(metrics, null, 2)}`)
      return
    }

    const historical = await this.loadHistoricalData()
    historical.push(metrics)

    // Keep only last 90 days of data
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const filtered = historical.filter(m => new Date(m.timestamp) > cutoffDate)

    await ProfileMetricsCache.save(filtered)
  }

  /**
   * Save analytics report
   */
  private async saveReport(report: AnalyticsReport): Promise<void> {
    if (this.config.dryRun) {
      this.logger.info('Dry-run mode: Would save analytics report')
      this.logger.debug(`Report summary: ${report.summary.followers} followers, ${report.summary.totalStars} stars`)
      return
    }

    const reportPath = path.join(this.config.reportDir, `analytics-${Date.now()}.json`)
    await fs.mkdir(path.dirname(reportPath), {recursive: true})
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

    // Also save as latest report
    const latestPath = path.join(this.config.reportDir, 'latest-analytics.json')
    await fs.writeFile(latestPath, JSON.stringify(report, null, 2))
  }

  /**
   * Clean up old data files
   */
  private async cleanupOldData(): Promise<void> {
    if (this.config.dryRun) {
      this.logger.info('Dry-run mode: Would clean up old analytics data')
      return
    }

    try {
      const reportFiles = await fs.readdir(this.config.reportDir)
      const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days
      let deletedCount = 0

      for (const file of reportFiles) {
        if (file.startsWith('analytics-') && file.endsWith('.json')) {
          const timestamp = Number.parseInt(file.replace('analytics-', '').replace('.json', ''), 10)
          if (timestamp < cutoffTime) {
            try {
              await fs.unlink(path.join(this.config.reportDir, file))
              deletedCount++
              this.logger.debug(`Deleted old file: ${file}`)
            } catch (error) {
              this.logger.warn(`Could not delete old file ${file}: ${(error as Error).message}`)
            }
          }
        }
      }

      if (deletedCount > 0) {
        this.logger.success(`Cleaned up ${deletedCount} old analytics files`)
      }
    } catch (error) {
      this.logger.warn(`Could not read report directory: ${(error as Error).message}`)
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const options = parseArguments()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  const logger = Logger.getInstance()
  logger.setVerbose(options.verbose)

  if (options.verbose) {
    logger.info('🔧 Running in verbose mode')
    logger.debug(`CLI Options: ${JSON.stringify(options, null, 2)}`)
  }

  if (options.dryRun) {
    logger.info('🔍 Dry-run mode enabled - no files will be modified')
  }

  const config: AnalyticsConfig = {
    username: 'marcusrbrown',
    apiToken: process.env.GITHUB_TOKEN,
    cacheDir: path.join(process.cwd(), '.cache'),
    reportDir: path.join(process.cwd(), '.cache', 'analytics'),
    trackingPeriod: 30,
    forceRefresh: options.forceRefresh,
    dryRun: options.dryRun,
    targetRepos: options.repos,
    contributionPeriodDays: options.period,
  }

  const analytics = new ProfileAnalytics(config)
  const command = process.argv[2] ?? 'track'

  // Support flags before commands: `pnpm run analytics --verbose` defaults to 'track'
  const actualCommand = command.startsWith('--') || command.startsWith('-') ? 'track' : command

  try {
    switch (actualCommand) {
      case 'collect':
        await analytics.collectMetrics()
        break
      case 'report':
        await analytics.generateReport()
        break
      case 'track':
      default:
        await analytics.trackPerformance()
        break
    }
    process.exit(0)
  } catch (error) {
    logger.error('Analytics command failed', error as Error)
    process.exit(1)
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch(error => {
    const logger = Logger.getInstance()
    logger.error('Failed to run analytics', error as Error)
    process.exit(1)
  })
}

export {ProfileAnalytics, type AnalyticsConfig, type AnalyticsReport, type ProfileMetrics}
