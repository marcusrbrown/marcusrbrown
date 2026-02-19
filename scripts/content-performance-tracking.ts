#!/usr/bin/env tsx

/**
 * Content Performance Tracking System
 *
 * This script implements performance measurement for sponsor pitch optimization,
 * tracking conversion metrics, sponsor acquisition, and content effectiveness.
 *
 * Phase 5 Implementation - TASK-027:
 * Create performance measurement system tracking conversion metrics and sponsor acquisition
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type {
  ConversionEvent,
  ConversionMetrics,
  PerformanceReport,
  SponsorAcquisitionData,
  SponsorData,
} from '@/types/sponsors.ts'

// Performance tracking configuration
const PERFORMANCE_DIR = path.join(process.cwd(), '.cache', 'performance')
const EVENTS_FILE = path.join(PERFORMANCE_DIR, 'conversion-events.json')
const SPONSORS_HISTORY_FILE = path.join(PERFORMANCE_DIR, 'sponsor-history.json')

// Retention periods (in days)
const EVENT_RETENTION_DAYS = 365
const METRICS_RETENTION_DAYS = 90

/**
 * Performance tracking utilities
 */
export class ContentPerformanceTracker {
  /**
   * Initialize performance tracking directories
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(PERFORMANCE_DIR, {recursive: true})
    } catch (error) {
      console.warn('⚠️ Failed to create performance tracking directory:', error)
    }
  }

  /**
   * Load conversion events from storage
   */
  async loadEvents(): Promise<ConversionEvent[]> {
    try {
      const data = await fs.readFile(EVENTS_FILE, 'utf8')
      return JSON.parse(data) as ConversionEvent[]
    } catch {
      return []
    }
  }

  /**
   * Load sponsor acquisition history
   */
  async loadSponsorHistory(): Promise<SponsorAcquisitionData[]> {
    try {
      const data = await fs.readFile(SPONSORS_HISTORY_FILE, 'utf8')
      return JSON.parse(data) as SponsorAcquisitionData[]
    } catch {
      return []
    }
  }

  /**
   * Record a conversion event
   */
  async recordEvent(event: Omit<ConversionEvent, 'timestamp'>): Promise<void> {
    const fullEvent: ConversionEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    }

    try {
      // Load existing events
      const events = await this.loadEvents()
      events.push(fullEvent)

      // Clean up old events
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - EVENT_RETENTION_DAYS)
      const recentEvents = events.filter(e => new Date(e.timestamp) > cutoffDate)

      // Save updated events
      await fs.writeFile(EVENTS_FILE, JSON.stringify(recentEvents, null, 2))
      console.log(`✅ Recorded conversion event: ${event.type}`)
    } catch (error) {
      console.warn('⚠️ Failed to record conversion event:', error)
    }
  }

  /**
   * Track new sponsor acquisition
   */
  async trackSponsorAcquisition(
    newSponsors: SponsorData,
    previousSponsors?: SponsorData,
  ): Promise<SponsorAcquisitionData> {
    const now = new Date().toISOString()

    // Calculate new sponsors
    const newSponsorLogins = new Set(newSponsors.sponsors.map(s => s.login))
    const previousSponsorLogins = new Set(previousSponsors?.sponsors.map(s => s.login) ?? [])

    const addedSponsors = newSponsors.sponsors.filter(s => !previousSponsorLogins.has(s.login))
    const removedSponsors = previousSponsors?.sponsors.filter(s => !newSponsorLogins.has(s.login)) ?? []

    // Calculate funding changes
    const currentTotal = newSponsors.stats.totalMonthlyAmountDollars
    const previousTotal = previousSponsors?.stats.totalMonthlyAmountDollars ?? 0
    const fundingChange = currentTotal - previousTotal

    const acquisitionData: SponsorAcquisitionData = {
      date: now,
      totalSponsors: newSponsors.stats.totalSponsors,
      newSponsorsCount: addedSponsors.length,
      lostSponsorsCount: removedSponsors.length,
      netSponsorChange: addedSponsors.length - removedSponsors.length,
      totalMonthlyFunding: currentTotal,
      fundingChange,
      newSponsors: addedSponsors,
      lostSponsors: removedSponsors,
    }

    // Record acquisition events
    if (addedSponsors.length > 0) {
      await this.recordEvent({
        type: 'sponsor_acquired',
        data: {
          count: addedSponsors.length,
          totalValue: addedSponsors.reduce((sum, s) => sum + s.monthlyAmountDollars, 0),
          sponsors: addedSponsors.map(s => s.login),
        },
      })
    }

    if (removedSponsors.length > 0) {
      await this.recordEvent({
        type: 'sponsor_lost',
        data: {
          count: removedSponsors.length,
          totalValue: removedSponsors.reduce((sum, s) => sum + s.monthlyAmountDollars, 0),
          sponsors: removedSponsors.map(s => s.login),
        },
      })
    }

    // Save to sponsor history
    await this.saveSponsorHistory(acquisitionData)

    return acquisitionData
  }

  /**
   * Calculate conversion metrics
   */
  async calculateMetrics(periodDays = 30): Promise<ConversionMetrics> {
    const events = await this.loadEvents()
    const history = await this.loadSponsorHistory()

    // Filter events for the specified period
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - periodDays)

    const periodEvents = events.filter(e => new Date(e.timestamp) > cutoffDate)
    const periodHistory = history.filter(h => new Date(h.date) > cutoffDate)

    // Calculate metrics
    const totalSponsorEvents = periodEvents.filter(e => e.type === 'sponsor_acquired').length
    const totalProfileViews = periodEvents
      .filter(e => e.type === 'profile_view')
      .reduce((sum, e) => sum + (e.data?.count ?? 1), 0)

    const conversionRate = totalProfileViews > 0 ? (totalSponsorEvents / totalProfileViews) * 100 : 0

    // Calculate funding metrics
    const totalNewFunding = periodHistory.reduce((sum, h) => sum + Math.max(0, h.fundingChange), 0)
    const averageSponsorValue =
      periodHistory.length > 0
        ? periodHistory.reduce((sum, h) => sum + h.totalMonthlyFunding, 0) / periodHistory.length
        : 0

    // Calculate growth rate
    const startOfPeriod = periodHistory[0]?.totalMonthlyFunding ?? 0
    const endOfPeriod = periodHistory.at(-1)?.totalMonthlyFunding ?? startOfPeriod
    const growthRate = startOfPeriod > 0 ? ((endOfPeriod - startOfPeriod) / startOfPeriod) * 100 : 0

    return {
      period: `${periodDays} days`,
      startDate: cutoffDate.toISOString(),
      endDate: new Date().toISOString(),
      conversionRate,
      totalEvents: periodEvents.length,
      sponsorAcquisitions: totalSponsorEvents,
      profileViews: totalProfileViews,
      totalNewFunding,
      averageSponsorValue,
      growthRate,
      eventBreakdown: this.calculateEventBreakdown(periodEvents),
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(periodDays = 30): Promise<PerformanceReport> {
    const metrics = await this.calculateMetrics(periodDays)
    const history = await this.loadSponsorHistory()
    const events = await this.loadEvents()

    // Get recent sponsor data for current state
    const recentHistory = history.slice(-5) // Last 5 data points
    const currentSponsors = recentHistory.at(-1)?.totalSponsors ?? 0

    // Calculate trends
    const sponsorTrend = this.calculateTrend(recentHistory.map(h => h.totalSponsors))
    const fundingTrend = this.calculateTrend(recentHistory.map(h => h.totalMonthlyFunding))

    // Identify top performing content (based on events)
    const contentPerformance = this.analyzeContentPerformance(events)

    return {
      generatedAt: new Date().toISOString(),
      metrics,
      trends: {
        sponsorGrowth: sponsorTrend,
        fundingGrowth: fundingTrend,
      },
      currentState: {
        totalSponsors: currentSponsors,
        totalFunding: recentHistory.at(-1)?.totalMonthlyFunding ?? 0,
      },
      contentPerformance,
      recommendations: this.generateRecommendations(metrics, sponsorTrend, fundingTrend),
    }
  }

  /**
   * Export metrics data for external analysis
   */
  async exportData(format: 'json' | 'csv' = 'json'): Promise<string> {
    const report = await this.generateReport()

    if (format === 'json') {
      return JSON.stringify(report, null, 2)
    }

    // CSV export (simplified)
    const csv = [
      'date,total_sponsors,total_funding,conversion_rate,new_sponsors',
      `${report.generatedAt},${report.currentState.totalSponsors},${report.currentState.totalFunding},${report.metrics.conversionRate},${report.metrics.sponsorAcquisitions}`,
    ].join('\n')

    return csv
  }

  /**
   * Save sponsor acquisition data to history
   */
  private async saveSponsorHistory(data: SponsorAcquisitionData): Promise<void> {
    try {
      const history = await this.loadSponsorHistory()
      history.push(data)

      // Keep only recent history
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - METRICS_RETENTION_DAYS)
      const recentHistory = history.filter(h => new Date(h.date) > cutoffDate)

      await fs.writeFile(SPONSORS_HISTORY_FILE, JSON.stringify(recentHistory, null, 2))
    } catch (error) {
      console.warn('⚠️ Failed to save sponsor history:', error)
    }
  }

  /**
   * Calculate event breakdown
   */
  private calculateEventBreakdown(events: ConversionEvent[]): Record<string, number> {
    const breakdown: Record<string, number> = {}
    events.forEach(event => {
      breakdown[event.type] = (breakdown[event.type] ?? 0) + 1
    })
    return breakdown
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable'

    const start = values[0]
    const end = values.at(-1)

    if (start === undefined || end === undefined) return 'stable'

    const changePercent = start > 0 ? ((end - start) / start) * 100 : 0

    if (changePercent > 5) return 'up'
    if (changePercent < -5) return 'down'
    return 'stable'
  }

  /**
   * Analyze content performance based on events
   */
  private analyzeContentPerformance(events: ConversionEvent[]): Record<string, any> {
    // Group events by content type/source if available
    const performance: Record<string, any> = {
      totalEngagement: events.length,
      conversionEvents: events.filter(e => e.type === 'sponsor_acquired').length,
      viewEvents: events.filter(e => e.type === 'profile_view').length,
    }

    return performance
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    metrics: ConversionMetrics,
    sponsorTrend: 'up' | 'down' | 'stable',
    fundingTrend: 'up' | 'down' | 'stable',
  ): string[] {
    const recommendations: string[] = []

    if (metrics.conversionRate < 1) {
      recommendations.push('Consider optimizing call-to-action placement and messaging')
    }

    if (sponsorTrend === 'down') {
      recommendations.push('Review recent content changes for potential negative impact')
    }

    if (metrics.averageSponsorValue < 10) {
      recommendations.push('Focus on value proposition for higher-tier sponsorships')
    }

    if (fundingTrend === 'stable' && sponsorTrend === 'up') {
      recommendations.push('New sponsors are at lower tiers - consider tier upgrade campaigns')
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is strong - continue current optimization strategies')
    }

    return recommendations
  }
}

/**
 * CLI interface for performance tracking
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const tracker = new ContentPerformanceTracker()

  await tracker.initialize()

  if (args.includes('--help')) {
    console.log(`
Content Performance Tracking CLI

Usage:
  pnpm content:track [options]

Options:
  --report [days]     Generate performance report (default: 30 days)
  --export [format]   Export data (json|csv, default: json)
  --metrics [days]    Show conversion metrics (default: 30 days)
  --help              Show this help message

Examples:
  pnpm content:track --report 7
  pnpm content:track --export csv
  pnpm content:track --metrics 60
`)
    return
  }

  if (args.includes('--report')) {
    const daysIndex = args.indexOf('--report') + 1
    const dayArg = daysIndex < args.length ? args[daysIndex] : '30'
    const days = Number.parseInt(dayArg ?? '30', 10) || 30

    const report = await tracker.generateReport(days)
    console.log('📊 Performance Report')
    console.log('===================')
    console.log(`Period: ${report.metrics.period}`)
    console.log(`Conversion Rate: ${report.metrics.conversionRate.toFixed(2)}%`)
    console.log(`Total Sponsors: ${report.currentState.totalSponsors}`)
    console.log(`Total Funding: $${report.currentState.totalFunding.toFixed(2)}`)
    console.log(`Sponsor Trend: ${report.trends.sponsorGrowth}`)
    console.log(`Funding Trend: ${report.trends.fundingGrowth}`)
    console.log('\nRecommendations:')
    report.recommendations.forEach(rec => console.log(`- ${rec}`))
    return
  }

  if (args.includes('--export')) {
    const formatIndex = args.indexOf('--export') + 1
    const format = (formatIndex < args.length ? args[formatIndex] : 'json') as 'json' | 'csv'

    const data = await tracker.exportData(format)
    const filename = `performance-export-${new Date().toISOString().split('T')[0]}.${format}`

    await fs.writeFile(filename, data)
    console.log(`✅ Exported performance data to ${filename}`)
    return
  }

  if (args.includes('--metrics')) {
    const daysIndex = args.indexOf('--metrics') + 1
    const dayArg = daysIndex < args.length ? args[daysIndex] : '30'
    const days = Number.parseInt(dayArg ?? '30', 10) || 30

    const metrics = await tracker.calculateMetrics(days)
    console.log(`📈 Conversion Metrics (${days} days)`)
    console.log('==============================')
    console.log(`Conversion Rate: ${metrics.conversionRate.toFixed(2)}%`)
    console.log(`Profile Views: ${metrics.profileViews}`)
    console.log(`Sponsor Acquisitions: ${metrics.sponsorAcquisitions}`)
    console.log(`Growth Rate: ${metrics.growthRate.toFixed(2)}%`)
    console.log(`New Funding: $${metrics.totalNewFunding.toFixed(2)}`)
    return
  }

  // Default: show quick metrics
  const metrics = await tracker.calculateMetrics(7)
  console.log('📊 Quick Metrics (7 days)')
  console.log(`Conversion Rate: ${metrics.conversionRate.toFixed(2)}%`)
  console.log(`New Sponsors: ${metrics.sponsorAcquisitions}`)
  console.log(`Growth Rate: ${metrics.growthRate.toFixed(2)}%`)
}

if (import.meta.main) {
  main().catch(console.error)
}
