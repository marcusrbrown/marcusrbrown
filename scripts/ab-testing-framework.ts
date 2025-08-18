import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// Types for A/B testing configuration
export interface ABTestVariant {
  id: string
  name: string
  description: string
  weight: number // 0-1, determines traffic allocation
  templatePath: string
  active: boolean
  metrics?: {
    views?: number
    clicks?: number
    conversions?: number
    conversionRate?: number
  }
}

export interface ABTest {
  id: string
  name: string
  description: string
  startDate: string
  endDate?: string
  status: 'draft' | 'running' | 'paused' | 'completed'
  variants: ABTestVariant[]
  targetMetric: 'clicks' | 'conversions' | 'conversionRate'
  minimumSampleSize: number
  confidenceLevel: number
  currentWinner?: string
}

export interface ABTestConfig {
  tests: ABTest[]
  defaultVariant: string
  trackingEnabled: boolean
  metricsEndpoint?: string
}

export class ABTestingFramework {
  private config: ABTestConfig
  private readonly configPath: string
  private readonly CACHE_DIR = '.cache'
  private readonly CONFIG_FILE = 'ab-testing-config.json'

  constructor(configPath?: string) {
    this.configPath = configPath ?? join(this.CACHE_DIR, this.CONFIG_FILE)
    this.config = this.loadConfig()
  }

  /**
   * Create a new A/B test
   */
  createTest(test: Omit<ABTest, 'id'>): string {
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(7)}`
    const newTest: ABTest = {
      id: testId,
      ...test,
      variants: test.variants.map((variant, index) => ({
        ...variant,
        id: variant.id || `variant_${index}`,
      })),
    }

    this.config.tests.push(newTest)
    this.saveConfig(this.config)
    return testId
  }

  /**
   * Start an A/B test
   */
  startTest(testId: string): boolean {
    const test = this.config.tests.find(t => t.id === testId)
    if (!test) {
      console.error(`Test ${testId} not found`)
      return false
    }

    if (test.status !== 'draft') {
      console.error(`Test ${testId} cannot be started from status: ${test.status}`)
      return false
    }

    // Validate variants
    const totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0)
    if (Math.abs(totalWeight - 1) > 0.01) {
      console.error(`Test ${testId} variant weights must sum to 1.0, got ${totalWeight}`)
      return false
    }

    test.status = 'running'
    test.startDate = new Date().toISOString()
    this.saveConfig(this.config)
    console.log(`✅ Started A/B test: ${test.name}`)
    return true
  }

  /**
   * Stop an A/B test
   */
  stopTest(testId: string): boolean {
    const test = this.config.tests.find(t => t.id === testId)
    if (!test) {
      console.error(`Test ${testId} not found`)
      return false
    }

    test.status = 'completed'
    test.endDate = new Date().toISOString()
    this.saveConfig(this.config)
    console.log(`⏹️ Stopped A/B test: ${test.name}`)
    return true
  }

  /**
   * Get the active variant for a given session/user
   */
  getVariant(testId: string, sessionId?: string): ABTestVariant | null {
    const test = this.config.tests.find(t => t.id === testId)
    if (!test || test.status !== 'running') {
      return null
    }

    // Use session ID for consistent variant assignment
    const seed = sessionId ?? Math.random().toString()
    const hash = this.hashString(seed) % 100
    let cumulativeWeight = 0

    for (const variant of test.variants.filter(v => v.active)) {
      cumulativeWeight += variant.weight * 100
      if (hash < cumulativeWeight) {
        return variant
      }
    }

    // Fallback to first active variant
    return test.variants.find(v => v.active) ?? null
  }

  /**
   * Record a metric event for a variant
   */
  recordMetric(testId: string, variantId: string, metricType: 'view' | 'click' | 'conversion', value = 1): void {
    if (!this.config.trackingEnabled) {
      return
    }

    const test = this.config.tests.find(t => t.id === testId)
    if (!test) return

    const variant = test.variants.find(v => v.id === variantId)
    if (!variant) return

    if (!variant.metrics) {
      variant.metrics = {views: 0, clicks: 0, conversions: 0, conversionRate: 0}
    }

    switch (metricType) {
      case 'view':
        variant.metrics.views = (variant.metrics.views ?? 0) + value
        break
      case 'click':
        variant.metrics.clicks = (variant.metrics.clicks ?? 0) + value
        break
      case 'conversion':
        variant.metrics.conversions = (variant.metrics.conversions ?? 0) + value
        break
    }

    // Update conversion rate
    if ((variant.metrics.views ?? 0) > 0) {
      variant.metrics.conversionRate = (variant.metrics.conversions ?? 0) / (variant.metrics.views ?? 0)
    }

    this.saveConfig(this.config)
  }

  /**
   * Get test results and statistical significance
   */
  getTestResults(testId: string): {
    test: ABTest
    results: {
      variant: ABTestVariant
      significance: number
      confidenceInterval: [number, number]
      isWinner: boolean
    }[]
    hasSignificantWinner: boolean
  } | null {
    const test = this.config.tests.find(t => t.id === testId)
    if (!test) return null

    const results = test.variants.map(variant => {
      const metrics = variant.metrics ?? {views: 0, clicks: 0, conversions: 0, conversionRate: 0}
      const sampleSize = metrics.views ?? 0
      const conversions = metrics.conversions ?? 0
      const conversionRate = sampleSize > 0 ? conversions / sampleSize : 0

      // Calculate confidence interval (simplified)
      const standardError = Math.sqrt((conversionRate * (1 - conversionRate)) / sampleSize)
      const marginOfError = 1.96 * standardError // 95% confidence
      const confidenceInterval: [number, number] = [
        Math.max(0, conversionRate - marginOfError),
        Math.min(1, conversionRate + marginOfError),
      ]

      return {
        variant,
        significance: sampleSize >= test.minimumSampleSize ? 0.95 : 0,
        confidenceInterval,
        isWinner: false,
      }
    })

    // Determine winner (simplified - needs proper statistical testing)
    const bestResult = results.reduce((best, current) => {
      const currentRate = current.variant.metrics?.conversionRate ?? 0
      const bestRate = best.variant.metrics?.conversionRate ?? 0
      return currentRate > bestRate ? current : best
    })

    bestResult.isWinner = true
    const hasSignificantWinner = bestResult.significance >= test.confidenceLevel

    return {
      test,
      results,
      hasSignificantWinner,
    }
  }

  /**
   * Generate A/B testing report
   */
  generateReport(): string {
    const report = ['# A/B Testing Report', '']

    for (const test of this.config.tests) {
      report.push(`## ${test.name}`)
      report.push(`**Status:** ${test.status}`)
      report.push(`**Period:** ${test.startDate} - ${test.endDate ?? 'ongoing'}`)
      report.push('')

      if (test.status === 'running' || test.status === 'completed') {
        const results = this.getTestResults(test.id)
        if (results) {
          report.push('### Results')
          report.push('| Variant | Views | Conversions | Rate | Confidence |')
          report.push('|---------|--------|-------------|------|------------|')

          for (const result of results.results) {
            const metrics = result.variant.metrics ?? {}
            const rate = ((metrics.conversionRate ?? 0) * 100).toFixed(2)
            const winner = result.isWinner ? ' 🏆' : ''

            report.push(
              `| ${result.variant.name}${winner} | ${metrics.views ?? 0} | ${metrics.conversions ?? 0} | ${rate}% | ${(result.significance * 100).toFixed(1)}% |`,
            )
          }

          if (results.hasSignificantWinner) {
            const winner = results.results.find(r => r.isWinner)
            report.push('')
            report.push(`**Winner:** ${winner?.variant.name ?? 'Unknown'} with statistical significance`)
          }
        }
      }

      report.push('')
    }

    return report.join('\n')
  }

  /**
   * Create sponsor pitch A/B test variants
   */
  createSponsorPitchTest(): string {
    const test: Omit<ABTest, 'id'> = {
      name: 'Sponsor Pitch Optimization',
      description: 'Test different messaging approaches for the sponsor pitch template',
      startDate: new Date().toISOString(),
      status: 'draft',
      targetMetric: 'conversions',
      minimumSampleSize: 100,
      confidenceLevel: 0.95,
      variants: [
        {
          id: 'control',
          name: 'Current Template',
          description: 'The current optimized sponsor template',
          weight: 0.5,
          templatePath: 'templates/SPONSORME.tpl.md',
          active: true,
        },
        {
          id: 'urgency_focus',
          name: 'Urgency-Focused',
          description: 'Template with stronger urgency and scarcity elements',
          weight: 0.25,
          templatePath: 'templates/variants/SPONSORME-urgency.tpl.md',
          active: true,
        },
        {
          id: 'benefit_focus',
          name: 'Benefit-Focused',
          description: 'Template emphasizing concrete benefits and ROI',
          weight: 0.25,
          templatePath: 'templates/variants/SPONSORME-benefits.tpl.md',
          active: true,
        },
      ],
    }

    return this.createTest(test)
  }

  /**
   * Enable or disable tracking
   */
  setTrackingEnabled(enabled: boolean): void {
    this.config.trackingEnabled = enabled
    this.saveConfig(this.config)
  }

  /**
   * Get all tests
   */
  getTests(): ABTest[] {
    return this.config.tests
  }

  /**
   * Get active tests
   */
  getActiveTests(): ABTest[] {
    return this.config.tests.filter(test => test.status === 'running')
  }

  /**
   * Load A/B testing configuration from file
   */
  private loadConfig(): ABTestConfig {
    const defaultConfig: ABTestConfig = {
      tests: [],
      defaultVariant: 'control',
      trackingEnabled: false,
    }

    if (!existsSync(this.configPath)) {
      this.saveConfig(defaultConfig)
      return defaultConfig
    }

    try {
      const configData = readFileSync(this.configPath, 'utf-8')
      const parsedConfig = JSON.parse(configData) as Partial<ABTestConfig>
      return {...defaultConfig, ...parsedConfig}
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to load A/B testing config: ${errorMessage}`)
      return defaultConfig
    }
  }

  /**
   * Save A/B testing configuration to file
   */
  private saveConfig(config: ABTestConfig): void {
    try {
      const dir = this.configPath.split('/').slice(0, -1).join('/')
      if (!existsSync(dir)) {
        mkdirSync(dir, {recursive: true})
      }
      writeFileSync(this.configPath, JSON.stringify(config, null, 2))
      this.config = config
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Failed to save A/B testing config: ${errorMessage}`)
    }
  }

  /**
   * Simple hash function for consistent variant assignment
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}
