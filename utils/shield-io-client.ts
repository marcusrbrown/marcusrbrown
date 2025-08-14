import type {BadgeConfig, DetectedTechnology, GeneratedBadge} from '@/types/badges.ts'

import {BadgeGenerationError} from '@/types/badges.ts'

/**
 * Shield.io API client for badge generation with retry logic
 */
export class ShieldIoClient {
  private readonly baseUrl = 'https://img.shields.io/badge'
  private readonly maxRetries = 3
  private readonly baseDelayMs = 1000
  private readonly maxDelayMs = 10000

  /**
   * Generate a shield.io badge URL from badge configuration
   */
  generateBadgeUrl(config: BadgeConfig): string {
    try {
      // Build the base badge URL
      const label = encodeURIComponent(config.label ?? config.technologyId)
      const message = encodeURIComponent(config.message ?? '')
      const color = config.color ?? '007ACC'

      let badgeUrl = `${this.baseUrl}/${label}-${message}-${color}`

      // Add style parameter
      const params = new URLSearchParams()
      params.set('style', config.style)

      // Add logo if specified
      if (config.logo !== undefined && config.logo !== null && config.logo.trim() !== '') {
        params.set('logo', config.logo)
      }

      // Add logo color if specified
      if (config.logoColor !== undefined && config.logoColor !== null && config.logoColor.trim() !== '') {
        params.set('logoColor', config.logoColor)
      }

      // Add custom parameters
      if (config.customParams) {
        for (const [key, value] of Object.entries(config.customParams)) {
          params.set(key, value)
        }
      }

      // Append parameters
      const paramString = params.toString()
      if (paramString) {
        badgeUrl += `?${paramString}`
      }

      return badgeUrl
    } catch (error) {
      throw new BadgeGenerationError(`Failed to generate badge URL: ${(error as Error).message}`, 'url-generation')
    }
  }

  /**
   * Generate markdown badge markup
   */
  generateMarkdownBadge(config: BadgeConfig, badgeUrl: string): string {
    try {
      const altText = `${config.label ?? config.technologyId} badge`
      const title =
        config.linkTitle !== undefined && config.linkTitle !== null && config.linkTitle.trim() !== ''
          ? ` "${config.linkTitle}"`
          : ''

      if (config.linkUrl !== undefined && config.linkUrl !== null && config.linkUrl.trim() !== '') {
        return `[![${altText}](${badgeUrl}${title})](${config.linkUrl})`
      }

      return `![${altText}](${badgeUrl}${title})`
    } catch (error) {
      throw new BadgeGenerationError(
        `Failed to generate markdown badge: ${(error as Error).message}`,
        'markdown-generation',
      )
    }
  }

  /**
   * Generate markdown reference link if needed
   */
  generateMarkdownLink(config: BadgeConfig): string | undefined {
    if (
      config.linkRef !== undefined &&
      config.linkRef !== null &&
      config.linkRef.trim() !== '' &&
      config.linkUrl !== undefined &&
      config.linkUrl !== null &&
      config.linkUrl.trim() !== '' &&
      config.linkTitle !== undefined &&
      config.linkTitle !== null &&
      config.linkTitle.trim() !== ''
    ) {
      return `[${config.linkRef}]: ${config.linkUrl} "${config.linkTitle}"`
    }
    return undefined
  }

  /**
   * Generate a complete badge with all metadata
   */
  generateBadge(technology: DetectedTechnology, config: BadgeConfig): GeneratedBadge {
    try {
      const badgeUrl = this.generateBadgeUrl(config)
      const markdownBadge = this.generateMarkdownBadge(config, badgeUrl)
      const markdownLink = this.generateMarkdownLink(config)

      return {
        technology,
        config,
        badgeUrl,
        markdownBadge,
        markdownLink,
        displayPriority: this.calculateDisplayPriority(technology),
        generatedAt: new Date().toISOString(),
      }
    } catch (error) {
      throw new BadgeGenerationError(
        `Failed to generate badge for ${technology.id}: ${(error as Error).message}`,
        'badge-generation',
      )
    }
  }

  /**
   * Test badge URL accessibility with retry logic
   */
  async testBadgeUrl(badgeUrl: string): Promise<boolean> {
    return this.withRetry(async () => {
      try {
        const response = await fetch(badgeUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })

        return response.ok
      } catch (error) {
        console.warn(`⚠️ Badge URL test failed: ${(error as Error).message}`)
        return false
      }
    }, `Badge URL test: ${badgeUrl}`)
  }

  /**
   * Validate badge configuration
   */
  validateBadgeConfig(config: BadgeConfig): string[] {
    const errors: string[] = []

    if (!config.technologyId?.trim()) {
      errors.push('Technology ID is required')
    }

    if (!config.style) {
      errors.push('Badge style is required')
    }

    if (
      config.linkRef !== undefined &&
      config.linkRef !== null &&
      config.linkRef.trim() !== '' &&
      (config.linkUrl === undefined || config.linkUrl === null || config.linkUrl.trim() === '')
    ) {
      errors.push('Link URL is required when link reference is specified')
    }

    // Validate color format (hex or named color)
    if (
      config.color !== undefined &&
      config.color !== null &&
      config.color.trim() !== '' &&
      !/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[a-z]+)$/i.test(config.color)
    ) {
      errors.push('Invalid color format. Use hex (without #) or named color')
    }

    return errors
  }

  /**
   * Calculate display priority for badge ordering
   */
  private calculateDisplayPriority(technology: DetectedTechnology): number {
    let priority = 0

    // Priority based on technology priority level
    switch (technology.priority) {
      case 'critical':
        priority += 1000
        break
      case 'high':
        priority += 500
        break
      case 'medium':
        priority += 250
        break
      case 'low':
        priority += 100
        break
    }

    // Boost based on confidence
    priority += technology.confidence * 100

    // Boost based on usage score
    priority += technology.usageScore * 50

    return Math.round(priority)
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = this.maxRetries,
  ): Promise<T> {
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

        const delay = Math.min(this.baseDelayMs * 2 ** (attempt - 1), this.maxDelayMs)
        console.warn(`⏳ ${operationName} failed (attempt ${attempt}), retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (lastError) {
      throw lastError
    }

    throw new Error(`Unexpected error in withRetry for ${operationName}`)
  }
}

/**
 * Create a configured ShieldIoClient instance
 */
export function createShieldIoClient(): ShieldIoClient {
  return new ShieldIoClient()
}
