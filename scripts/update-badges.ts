#!/usr/bin/env tsx

/**
 * Badge Template Update Script
 *
 * This script processes the BADGES.tpl.md template file and replaces
 * dynamic placeholders with automatically generated technology badges
 * based on detected technologies from package.json, repositories, and commit history.
 *
 * Phase 3 Implementation Tasks:
 * - TASK-013: Create scripts/update-badges.ts main processing script
 * - TASK-014: Implement template variable replacement and badge insertion
 * - TASK-015: Add support for custom badge configurations and overrides
 */

import type {BadgeAutomationConfig, BadgeDataCache, DetectedTechnology, GeneratedBadge} from '@/types/badges.ts'
import type {BadgeOptions} from '@bfra.me/badge-config'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {BadgeDataCacheManager} from '@/utils/badge-cache-manager.ts'
import {BadgeConfigLoader} from '@/utils/badge-config-loader.ts'
import {BadgeDetector} from '@/utils/badge-detector.ts'
import {createShieldIoClient} from '@/utils/shield-io-client.ts'

// File paths
const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'BADGES.tpl.md')
const OUTPUT_PATH = path.join(process.cwd(), 'BADGES.md')
const CACHE_DIR = path.join(process.cwd(), '.cache')

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000

// CLI configuration
interface CliOptions {
  verbose: boolean
  help: boolean
  forceRefresh: boolean
  dryRun: boolean
  fetchOnly: boolean
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(operation: () => Promise<T>, operationName: string, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.warn(`🔄 ${operationName} (attempt ${attempt}/${maxRetries})`)
      }
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
 * Load badge data from cache or generate new data
 */
async function loadBadgeData(options: CliOptions): Promise<BadgeDataCache> {
  const cacheManager = new BadgeDataCacheManager()

  try {
    // Check if force refresh is requested or cache is invalid
    if (options.forceRefresh) {
      if (options.verbose) {
        console.log('🔄 Force refresh requested, generating new badge data...')
      }

      const generatedData = await generateBadgeData(options)
      return generatedData
    }

    // Layer 1: Try to load from primary cache
    if (options.verbose) {
      console.log('🔍 Checking primary cache...')
    }

    const cachedData = await cacheManager.loadFromCache()
    if (cachedData) {
      if (options.verbose) {
        console.log(`✅ Loaded badge data from primary cache: ${cachedData.generatedBadges.length} badges`)
      }
      return cachedData
    }

    // Layer 2: Try to load from backup cache
    if (options.verbose) {
      console.log('🔍 Primary cache invalid, checking backup cache...')
    }

    const backupData = await cacheManager.loadFromBackupCache()
    if (backupData) {
      if (options.verbose) {
        console.log(`📦 Loaded badge data from backup cache: ${backupData.generatedBadges.length} badges`)
      }
      return backupData
    }

    // Layer 3: Generate new data as last resort
    if (options.verbose) {
      console.log('🔄 No cache available, generating new badge data...')
    }

    const newData = await generateBadgeData(options)
    return newData
  } catch (error) {
    console.warn(`❌ Failed to load cached badge data: ${(error as Error).message}`)

    // Layer 4: Final fallback - try backup cache once more
    try {
      const emergencyData = await cacheManager.loadFromBackupCache()
      if (emergencyData) {
        console.warn('🚑 Using emergency backup cache data')
        return emergencyData
      }
    } catch (backupError) {
      console.warn(`❌ Emergency backup also failed: ${(backupError as Error).message}`)
    }

    // Layer 5: Absolute fallback - generate minimal fallback data
    console.warn('🚨 All cache layers failed, generating fallback data...')
    const automationConfig = await getAutomationConfig()
    return cacheManager.generateFallbackCache(automationConfig, (error as Error).message)
  }
}

/**
 * Get custom badge configuration overrides
 */
function getCustomBadgeOverrides(): Record<string, Partial<BadgeOptions>> {
  // This function can be extended to read from environment variables,
  // configuration files, or other sources for custom badge overrides

  const overrides: Record<string, Partial<BadgeOptions>> = {}

  // Example: Override TypeScript badge to use 'for-the-badge' style
  // and custom colors matching the existing BADGES.md
  overrides.typescript = {
    style: 'for-the-badge',
    color: '#007ACC',
    logoColor: 'white',
  }

  // Example: Add custom badge for Raspberry Pi if detected
  overrides.raspberrypi = {
    label: 'Raspberry Pi',
    style: 'for-the-badge',
    color: '#C51A4A',
    logo: 'Raspberry-Pi',
  }

  // Example: Svelte with custom styling
  overrides.svelte = {
    style: 'for-the-badge',
    color: '#31A8FF',
    logoColor: 'white',
  }

  // Example: GitHub Actions with custom styling
  overrides.githubactions = {
    label: 'GitHub Actions',
    style: 'for-the-badge',
    color: '#2671E5',
    logoColor: 'white',
  }

  return overrides
}

/**
 * Generate fresh badge data from technology detection
 */
async function generateBadgeData(options: CliOptions): Promise<BadgeDataCache> {
  try {
    if (options.verbose) {
      console.log('🔍 Detecting technologies...')
    }

    // Initialize badge detector and config loader
    const detector = BadgeDetector.fromEnvironment()
    const configLoader = new BadgeConfigLoader()
    const shieldClient = createShieldIoClient()

    // Apply custom badge overrides if any
    const customOverrides = getCustomBadgeOverrides()
    if (Object.keys(customOverrides).length > 0) {
      configLoader.addCustomOverrides(customOverrides)
      if (options.verbose) {
        console.log(`🎨 Applied ${Object.keys(customOverrides).length} custom badge overrides`)
      }
    }

    // Detect technologies from all sources
    const technologies = await withRetry(async () => detector.detectTechnologies(), 'Technology detection')
    if (options.verbose) {
      console.log(`📦 Detected ${technologies.length} technologies`)
    }

    // Filter technologies based on confidence and basic criteria
    const filteredTechnologies = technologies.filter(
      (tech: DetectedTechnology) =>
        tech.confidence >= 0.7 && // Minimum confidence threshold
        tech.usageScore >= 0.5, // Minimum usage score
    )

    if (options.verbose) {
      console.log(`✅ Filtered to ${filteredTechnologies.length} technologies for badge generation`)
    }

    // Generate badge configurations
    const badgeConfigs = await withRetry(
      async () => configLoader.generateBadgeConfigs(filteredTechnologies),
      'Badge configuration generation',
    )

    // Generate badges for each configuration
    const generatedBadges: GeneratedBadge[] = []
    for (let i = 0; i < Math.min(badgeConfigs.length, filteredTechnologies.length); i++) {
      try {
        const technology = filteredTechnologies[i]
        const config = badgeConfigs[i]

        if (config && technology) {
          const badge = shieldClient.generateBadge(technology, config)
          generatedBadges.push(badge)

          if (options.verbose) {
            console.log(`🏷️ Generated badge for ${technology.name}`)
          }
        }
      } catch (error) {
        const techName = filteredTechnologies[i]?.name ?? 'unknown'
        console.warn(`⚠️ Failed to generate badge for ${techName}: ${(error as Error).message}`)
      }
    }

    // Sort badges by display priority (highest first)
    generatedBadges.sort((a, b) => b.displayPriority - a.displayPriority)

    // Apply maximum badge limit
    const maxBadges = 20 // Default limit
    const limitedBadges = generatedBadges.slice(0, maxBadges)

    if (options.verbose && generatedBadges.length > maxBadges) {
      console.log(`✂️ Limited to ${maxBadges} badges (from ${generatedBadges.length})`)
    }

    // Get automation config for cache
    const automationConfig = await getAutomationConfig()

    // Save to cache
    const cacheManager = new BadgeDataCacheManager()
    await cacheManager.saveToCache(
      automationConfig,
      technologies,
      limitedBadges,
      24 * 60 * 60 * 1000, // 24 hours
    )

    if (options.verbose) {
      console.log(`💾 Saved badge data to cache`)
    }

    // Calculate statistics for return value
    const stats = calculateBadgeStats(technologies, limitedBadges)

    // Create cache data structure for return
    const cacheData: BadgeDataCache = {
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      config: automationConfig,
      detectedTechnologies: technologies,
      generatedBadges: limitedBadges,
      stats,
    }

    return cacheData
  } catch (error) {
    throw new Error(`Failed to generate badge data: ${(error as Error).message}`)
  }
}

/**
 * Calculate badge statistics
 */
function calculateBadgeStats(technologies: DetectedTechnology[], badges: GeneratedBadge[]) {
  const stats = {
    totalTechnologies: technologies.length,
    technologiesByCategory: {} as Record<string, number>,
    technologiesBySource: {} as Record<string, number>,
    totalBadges: badges.length,
    averageConfidence: 0,
    sourcesCoverage: {
      packageJson: false,
      repositories: false,
      commitHistory: false,
    },
    calculatedAt: new Date().toISOString(),
  }

  // Count by category
  for (const tech of technologies) {
    const categoryCount = stats.technologiesByCategory[tech.category] ?? 0
    stats.technologiesByCategory[tech.category] = categoryCount + 1

    const sourceCount = stats.technologiesBySource[tech.source] ?? 0
    stats.technologiesBySource[tech.source] = sourceCount + 1
  }

  // Calculate average confidence
  if (technologies.length > 0) {
    stats.averageConfidence = technologies.reduce((sum, tech) => sum + tech.confidence, 0) / technologies.length
  }

  // Check source coverage
  stats.sourcesCoverage.packageJson = technologies.some(tech => tech.source === 'package.json')
  stats.sourcesCoverage.repositories = technologies.some(tech => tech.source === 'repository')
  stats.sourcesCoverage.commitHistory = technologies.some(tech => tech.source === 'commit-history')

  return stats
}

/**
 * Get automation configuration
 */
async function getAutomationConfig(): Promise<BadgeAutomationConfig> {
  const githubToken = process.env.GITHUB_TOKEN ?? ''
  const githubUsername = process.env.GITHUB_USERNAME ?? 'marcusrbrown'

  return {
    detection: {
      analyzePackageJson: true,
      analyzeRepositories: true,
      analyzeCommitHistory: true,
      maxCommitsToAnalyze: 100,
      githubUsername,
      githubToken,
      minConfidenceThreshold: 0.7,
      timeoutMs: 10000,
    },
    generation: {
      externalConfigPackage: '@bfra.me/badge-config',
      defaultStyle: 'for-the-badge',
      maxBadges: 20,
      minUsageScore: 0.5,
      includedCategories: ['language', 'framework', 'library', 'tool', 'platform'],
      excludedTechnologies: [],
      cacheDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    },
    template: {
      templatePath: TEMPLATE_PATH,
      outputPath: OUTPUT_PATH,
      variablePrefix: '{{{',
    },
  }
}

/**
 * Process template and generate output
 */
async function processTemplate(badgeData: BadgeDataCache, options: CliOptions): Promise<string> {
  try {
    if (options.verbose) {
      console.log(`📄 Processing template: ${TEMPLATE_PATH}`)
    }

    // Read template file
    const template = await fs.readFile(TEMPLATE_PATH, 'utf-8')

    // Generate categorized badge content
    const categorizedBadges = categorizeBadges(badgeData.generatedBadges)
    const badgeContent = generateBadgeContent(badgeData.generatedBadges)
    const linkReferences = generateLinkReferences(badgeData.generatedBadges)

    // Replace template variables
    const output = template
      .replace('{{{LANGUAGE_BADGES}}}', generateCategoryBadges(categorizedBadges.language))
      .replace('{{{FRAMEWORK_BADGES}}}', generateCategoryBadges(categorizedBadges.framework))
      .replace('{{{TOOL_BADGES}}}', generateCategoryBadges(categorizedBadges.tool))
      .replace('{{{PLATFORM_BADGES}}}', generateCategoryBadges(categorizedBadges.platform))
      .replace('{{{BADGE_CONTENT}}}', badgeContent)
      .replace('{{{LINK_REFERENCES}}}', linkReferences)

    if (options.verbose) {
      console.log(`✅ Template processed successfully`)
      console.log(`📊 Categories populated:`)
      console.log(`   Languages: ${categorizedBadges.language.length}`)
      console.log(`   Frameworks: ${categorizedBadges.framework.length}`)
      console.log(`   Tools: ${categorizedBadges.tool.length}`)
      console.log(`   Platforms: ${categorizedBadges.platform.length}`)
    }

    return output
  } catch (error) {
    throw new Error(`Failed to process template: ${(error as Error).message}`)
  }
}

/**
 * Calculate proficiency level based on technology metadata
 */
function calculateProficiencyLevel(technology: DetectedTechnology): {
  level: 'expert' | 'advanced' | 'intermediate' | 'learning'
  emoji: string
  years: string
} {
  const firstDetected = new Date(technology.firstDetected)
  const now = new Date()
  const yearsExperience = (now.getTime() - firstDetected.getTime()) / (1000 * 60 * 60 * 24 * 365)

  // Consider both usage score and years of experience
  const usageWeight = technology.usageScore * 0.7 // 70% weight on usage
  const timeWeight = Math.min(yearsExperience / 5, 1) * 0.3 // 30% weight on time, capped at 5 years
  const combinedScore = usageWeight + timeWeight

  let level: 'expert' | 'advanced' | 'intermediate' | 'learning'
  let emoji: string
  let years: string

  if (combinedScore > 0.8 && yearsExperience > 3) {
    level = 'expert'
    emoji = '🟢'
    years = `${Math.round(yearsExperience)}+ years`
  } else if (combinedScore > 0.6 && yearsExperience > 1.5) {
    level = 'advanced'
    emoji = '🔵'
    years = `${Math.round(yearsExperience)} years`
  } else if (combinedScore > 0.3 && yearsExperience > 0.5) {
    level = 'intermediate'
    emoji = '🟡'
    years = `${Math.round(yearsExperience * 10) / 10} years`
  } else {
    level = 'learning'
    emoji = '⚪'
    years = 'Learning'
  }

  return {level, emoji, years}
}

/**
 * Generate enhanced badge with proficiency indicators
 */
function generateEnhancedBadge(badge: GeneratedBadge): string {
  const proficiency = calculateProficiencyLevel(badge.technology)

  // Add proficiency indicator to badge style
  const enhancedBadge = badge.markdownBadge.replace(
    /style=([^&]+)/,
    `style=$1&labelColor=${getProficiencyColor(proficiency.level)}`,
  )

  return enhancedBadge
}

/**
 * Get color for proficiency level
 */
function getProficiencyColor(level: 'expert' | 'advanced' | 'intermediate' | 'learning'): string {
  switch (level) {
    case 'expert':
      return '2ea043' // Green
    case 'advanced':
      return '0969da' // Blue
    case 'intermediate':
      return 'bf8700' // Yellow
    case 'learning':
      return '656d76' // Gray
    default:
      return '656d76'
  }
}

/**
 * Categorize badges by technology type for enhanced template support
 */
function categorizeBadges(badges: GeneratedBadge[]): {
  language: GeneratedBadge[]
  framework: GeneratedBadge[]
  tool: GeneratedBadge[]
  platform: GeneratedBadge[]
} {
  const categorized = {
    language: [] as GeneratedBadge[],
    framework: [] as GeneratedBadge[],
    tool: [] as GeneratedBadge[],
    platform: [] as GeneratedBadge[],
  }

  for (const badge of badges) {
    switch (badge.technology.category) {
      case 'language':
        categorized.language.push(badge)
        break
      case 'framework':
      case 'library':
        categorized.framework.push(badge)
        break
      case 'tool':
      case 'build':
      case 'ci-cd':
      case 'testing':
      case 'deployment':
      case 'monitoring':
        categorized.tool.push(badge)
        break
      case 'platform':
      case 'cloud':
      case 'database':
        categorized.platform.push(badge)
        break
      default:
        // Default to tools for uncategorized technologies
        categorized.tool.push(badge)
    }
  }

  // Sort each category by usage score (descending)
  for (const category of Object.values(categorized)) {
    category.sort((a, b) => b.technology.usageScore - a.technology.usageScore)
  }

  return categorized
}

/**
 * Generate badge content for a specific category
 */
function generateCategoryBadges(badges: GeneratedBadge[]): string {
  if (badges.length === 0) {
    return '<!-- No badges in this category -->'
  }

  return badges
    .map((badge, index) => {
      const spacing = index === 0 ? '' : ' '
      const enhancedBadge = generateEnhancedBadge(badge)
      return `${spacing}${enhancedBadge}`
    })
    .join('')
}

/**
 * Generate badge content line with proper spacing
 */
function generateBadgeContent(badges: GeneratedBadge[]): string {
  if (badges.length === 0) {
    return '<!-- No badges generated - technology detection may have failed -->'
  }

  return badges
    .map((badge, index) => {
      const spacing = index === 0 ? '' : ' '
      return `${spacing}${badge.markdownBadge}`
    })
    .join('')
}

/**
 * Generate markdown reference links
 */
function generateLinkReferences(badges: GeneratedBadge[]): string {
  const links = badges.map(badge => badge.markdownLink).filter((link): link is string => link !== undefined)

  return links.length > 0 ? links.join('\n') : ''
}

/**
 * Write output to file
 */
async function writeOutput(content: string, options: CliOptions): Promise<void> {
  try {
    if (options.dryRun) {
      console.log('🔍 Dry run mode - would write to:', OUTPUT_PATH)
      if (options.verbose) {
        console.log('Generated content:')
        console.log(content)
      }
      return
    }

    await fs.writeFile(OUTPUT_PATH, content, 'utf-8')
    console.log(`✅ Updated badges: ${OUTPUT_PATH}`)
  } catch (error) {
    throw new Error(`Failed to write output: ${(error as Error).message}`)
  }
}

/**
 * Parse CLI arguments
 */
function parseArguments(): CliOptions {
  const args = process.argv.slice(2)

  return {
    verbose: args.includes('--verbose'),
    help: args.includes('--help'),
    forceRefresh: args.includes('--force-refresh'),
    dryRun: args.includes('--dry-run'),
    fetchOnly: args.includes('--fetch-only'),
  }
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Badge Update Script

Usage: update-badges.ts [options]

Options:
  --verbose         Show detailed output
  --help           Show this help message
  --force-refresh  Force refresh badge data (ignore cache)
  --dry-run        Show what would be generated without writing files
  --fetch-only     Only fetch and cache badge data, skip template processing

Environment Variables:
  GITHUB_TOKEN     GitHub personal access token (required)
  GITHUB_USERNAME  GitHub username (default: marcusrbrown)

Examples:
  update-badges.ts
  update-badges.ts --verbose
  update-badges.ts --force-refresh --verbose
  update-badges.ts --dry-run --verbose
  update-badges.ts --fetch-only --verbose
`)
}

/**
 * Main script execution
 */
async function main(): Promise<void> {
  try {
    const options = parseArguments()

    if (options.help) {
      showHelp()
      return
    }

    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, {recursive: true})

    if (options.verbose) {
      console.log('🚀 Starting badge automation...')
    }

    // Load or generate badge data
    const badgeData = await loadBadgeData(options)

    // If fetch-only mode, stop here
    if (options.fetchOnly) {
      if (options.verbose) {
        console.log(`
📊 Badge Data Fetched:
   Total Technologies: ${badgeData.stats.totalTechnologies}
   Generated Badges: ${badgeData.stats.totalBadges}
   Average Confidence: ${(badgeData.stats.averageConfidence * 100).toFixed(1)}%

📈 Source Coverage:
   Package.json: ${badgeData.stats.sourcesCoverage.packageJson ? '✅' : '❌'}
   Repositories: ${badgeData.stats.sourcesCoverage.repositories ? '✅' : '❌'}
   Commit History: ${badgeData.stats.sourcesCoverage.commitHistory ? '✅' : '❌'}
        `)
      }
      console.log('💾 Badge data fetched and cached successfully!')
      return
    }

    // Process template
    const output = await processTemplate(badgeData, options)

    // Write output
    await writeOutput(output, options)

    if (options.verbose) {
      console.log(`
📊 Badge Statistics:
   Total Technologies: ${badgeData.stats.totalTechnologies}
   Generated Badges: ${badgeData.stats.totalBadges}
   Average Confidence: ${(badgeData.stats.averageConfidence * 100).toFixed(1)}%

📈 Source Coverage:
   Package.json: ${badgeData.stats.sourcesCoverage.packageJson ? '✅' : '❌'}
   Repositories: ${badgeData.stats.sourcesCoverage.repositories ? '✅' : '❌'}
   Commit History: ${badgeData.stats.sourcesCoverage.commitHistory ? '✅' : '❌'}
      `)
    }

    console.log('🎉 Badge automation completed successfully!')
  } catch (error) {
    console.error('❌ Badge automation failed:', (error as Error).message)
    console.error('Stack trace:', (error as Error).stack)
    process.exit(1)
  }
}

// Run script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
}

export {main as updateBadges}
