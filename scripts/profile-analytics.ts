#!/usr/bin/env node

/**
 * GitHub Profile Analytics & Performance Measurement
 *
 * Tracks engagement metrics, profile views, and performance indicators
 * for the GitHub profile README and associated content.
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

interface AnalyticsConfig {
  readonly username: string
  readonly apiToken: string | undefined
  readonly cacheDir: string
  readonly reportDir: string
  readonly trackingPeriod: number // days
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
      // Fetch user data
      const user = await this.github.fetchUserProfile(this.config.username)

      // Fetch repositories
      const repositories = (await this.github.getUserRepositories(this.config.username)) as GitHubRepository[]

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

      const metrics: ProfileMetrics = {
        timestamp: new Date().toISOString(),
        profileViews: await this.getProfileViews(),
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
   * Get profile view count (integration with external service)
   */
  private async getProfileViews(): Promise<number> {
    try {
      // This would typically integrate with a service like Google Analytics
      // or a custom tracking solution. For now, we'll use a placeholder.
      const response = await fetch(`https://api.countapi.xyz/get/marcusrbrown/profile-views`)
      const data = (await response.json()) as {value?: number}
      return data.value ?? 0
    } catch {
      this.logger.warn('⚠️  Could not fetch profile views')
      return 0
    }
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
   * Get approximate contribution count
   */
  private async getContributionCount(): Promise<number> {
    try {
      // This is a simplified approach - would typically use GitHub's GraphQL API
      // for more accurate contribution data. For now, return a placeholder.
      return 0
    } catch {
      this.logger.warn('⚠️  Could not fetch contribution count')
      return 0
    }
  }

  /**
   * Load historical metrics data
   */
  private async loadHistoricalData(): Promise<ProfileMetrics[]> {
    try {
      const metricsPath = path.join(this.config.cacheDir, 'metrics-history.json')
      const data = await fs.readFile(metricsPath, 'utf8')
      return JSON.parse(data) as ProfileMetrics[]
    } catch {
      this.logger.info('📝 No historical data found, starting fresh')
      return []
    }
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
   * Save metrics to historical data
   */
  private async saveMetrics(metrics: ProfileMetrics): Promise<void> {
    const historical = await this.loadHistoricalData()
    historical.push(metrics)

    // Keep only last 90 days of data
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const filtered = historical.filter(m => new Date(m.timestamp) > cutoffDate)

    const metricsPath = path.join(this.config.cacheDir, 'metrics-history.json')
    await fs.mkdir(path.dirname(metricsPath), {recursive: true})
    await fs.writeFile(metricsPath, JSON.stringify(filtered, null, 2))
  }

  /**
   * Save analytics report
   */
  private async saveReport(report: AnalyticsReport): Promise<void> {
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
    try {
      const reportFiles = await fs.readdir(this.config.reportDir)
      const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days

      for (const file of reportFiles) {
        if (file.startsWith('analytics-') && file.endsWith('.json')) {
          const timestamp = Number.parseInt(file.replace('analytics-', '').replace('.json', ''), 10)
          if (timestamp < cutoffTime) {
            await fs.unlink(path.join(this.config.reportDir, file))
          }
        }
      }
    } catch {
      this.logger.warn('⚠️  Could not clean up old data files')
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const config: AnalyticsConfig = {
    username: 'marcusrbrown',
    apiToken: process.env.GITHUB_TOKEN,
    cacheDir: path.join(process.cwd(), '.cache'),
    reportDir: path.join(process.cwd(), '.cache', 'analytics'),
    trackingPeriod: 30, // 30 days
  }

  const analytics = new ProfileAnalytics(config)
  const command = process.argv[2] ?? 'track'

  try {
    switch (command) {
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
  } catch (error) {
    console.error('Analytics command failed:', error)
    process.exit(1)
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch(error => {
    console.error('Failed to run analytics:', error)
    process.exit(1)
  })
}

export {ProfileAnalytics, type AnalyticsConfig, type AnalyticsReport, type ProfileMetrics}
