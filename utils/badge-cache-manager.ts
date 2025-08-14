import type {
  BadgeAutomationConfig,
  BadgeDataCache,
  BadgeStats,
  DetectedTechnology,
  GeneratedBadge,
} from '@/types/badges.ts'

import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'
import process from 'node:process'

/**
 * Cache file paths
 */
const CACHE_DIR = join(process.cwd(), '.cache')
const PRIMARY_CACHE_FILE = join(CACHE_DIR, 'badge-data.json')
const BACKUP_CACHE_FILE = join(CACHE_DIR, 'badge-data-backup.json')

/**
 * Badge data cache management following established SponsorDataCache pattern
 */
export class BadgeDataCacheManager {
  /**
   * Load badge data from cache if valid, otherwise return null
   */
  async loadFromCache(): Promise<BadgeDataCache | null> {
    try {
      const data = await fs.readFile(PRIMARY_CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(data) as BadgeDataCache

      // Check if cache is still valid
      const now = new Date()
      const expiresAt = new Date(parsedData.expiresAt)

      if (now <= expiresAt) {
        console.warn('✅ Using valid cached badge data')
        return parsedData
      }

      console.warn('⏰ Badge data cache has expired')
      return null
    } catch (error) {
      console.warn(`⚠️ Failed to load primary cache: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Load from backup cache as fallback
   */
  async loadFromBackupCache(): Promise<BadgeDataCache | null> {
    try {
      const data = await fs.readFile(BACKUP_CACHE_FILE, 'utf-8')
      const parsedData = JSON.parse(data) as BadgeDataCache
      console.warn('📦 Using backup cache data as fallback')
      return parsedData
    } catch {
      console.warn('❌ No backup cache available')
      return null
    }
  }

  /**
   * Save badge data to cache with backup
   */
  async saveToCache(
    config: BadgeAutomationConfig,
    detectedTechnologies: DetectedTechnology[],
    generatedBadges: GeneratedBadge[],
    cacheDurationMs = 300000, // 5 minutes default
  ): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(dirname(PRIMARY_CACHE_FILE), {recursive: true})

      const now = new Date()
      const expiresAt = new Date(now.getTime() + cacheDurationMs)

      const cacheData: BadgeDataCache = {
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        config,
        detectedTechnologies,
        generatedBadges,
        stats: this.calculateStats(detectedTechnologies, generatedBadges),
      }

      // Save to primary cache
      await fs.writeFile(PRIMARY_CACHE_FILE, JSON.stringify(cacheData, null, 2))
      console.warn('💾 Badge data saved to primary cache')

      // Create backup copy
      try {
        await fs.copyFile(PRIMARY_CACHE_FILE, BACKUP_CACHE_FILE)
        console.warn('📋 Badge data backed up to backup cache')
      } catch (backupError) {
        console.warn(`⚠️ Failed to create backup cache: ${(backupError as Error).message}`)
      }
    } catch (error) {
      console.error(`❌ Failed to save badge data to cache: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Generate fallback cache data when all else fails
   */
  generateFallbackCache(config: BadgeAutomationConfig, error?: string): BadgeDataCache {
    const now = new Date()
    const fallbackTechnologies: DetectedTechnology[] = [
      {
        id: 'typescript',
        name: 'TypeScript',
        category: 'language',
        confidence: 1,
        source: 'manual',
        firstDetected: now.toISOString(),
        lastSeen: now.toISOString(),
        priority: 'critical',
        usageScore: 0.9,
      },
    ]

    const fallbackData: BadgeDataCache = {
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(), // 1 hour
      config,
      detectedTechnologies: fallbackTechnologies,
      generatedBadges: [],
      stats: this.calculateStats(fallbackTechnologies, []),
    }

    // Add error context if provided
    if (error !== undefined && error !== null && error.trim() !== '') {
      console.warn(`🚨 Using fallback cache due to: ${error}`)
    }

    return fallbackData
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    try {
      await Promise.allSettled([fs.unlink(PRIMARY_CACHE_FILE), fs.unlink(BACKUP_CACHE_FILE)])
      console.warn('🧹 Badge cache cleared')
    } catch (error) {
      console.warn(`⚠️ Failed to clear cache: ${(error as Error).message}`)
    }
  }

  /**
   * Check if cache exists and is valid
   */
  async isCacheValid(): Promise<boolean> {
    try {
      const data = await this.loadFromCache()
      return data !== null
    } catch {
      return false
    }
  }

  /**
   * Get cache file information
   */
  async getCacheInfo(): Promise<{
    primaryExists: boolean
    backupExists: boolean
    primarySize?: number
    backupSize?: number
    lastModified?: Date
  }> {
    const info = {
      primaryExists: false,
      backupExists: false,
      primarySize: undefined as number | undefined,
      backupSize: undefined as number | undefined,
      lastModified: undefined as Date | undefined,
    }

    try {
      const primaryStat = await fs.stat(PRIMARY_CACHE_FILE)
      info.primaryExists = true
      info.primarySize = primaryStat.size
      info.lastModified = primaryStat.mtime
    } catch {
      // Primary cache doesn't exist
    }

    try {
      const backupStat = await fs.stat(BACKUP_CACHE_FILE)
      info.backupExists = true
      info.backupSize = backupStat.size
    } catch {
      // Backup cache doesn't exist
    }

    return info
  }

  /**
   * Calculate badge statistics
   */
  private calculateStats(detectedTechnologies: DetectedTechnology[], generatedBadges: GeneratedBadge[]): BadgeStats {
    const technologiesByCategory: Record<string, number> = {}
    const technologiesBySource: Record<string, number> = {}

    // Count technologies by category and source
    for (const tech of detectedTechnologies) {
      technologiesByCategory[tech.category] = (technologiesByCategory[tech.category] ?? 0) + 1
      technologiesBySource[tech.source] = (technologiesBySource[tech.source] ?? 0) + 1
    }

    // Calculate average confidence
    const totalConfidence = detectedTechnologies.reduce((sum, tech) => sum + tech.confidence, 0)
    const averageConfidence = detectedTechnologies.length > 0 ? totalConfidence / detectedTechnologies.length : 0

    // Check source coverage
    const sourcesCoverage = {
      packageJson: (technologiesBySource['package.json'] ?? 0) > 0,
      repositories: (technologiesBySource.repository ?? 0) > 0,
      commitHistory: (technologiesBySource['commit-history'] ?? 0) > 0,
    }

    return {
      totalTechnologies: detectedTechnologies.length,
      technologiesByCategory,
      technologiesBySource,
      totalBadges: generatedBadges.length,
      averageConfidence,
      sourcesCoverage,
      calculatedAt: new Date().toISOString(),
    }
  }
}

/**
 * Cache operations following the established pattern from sponsor system
 */
export const badgeDataCache = {
  /**
   * Load badge data from primary cache
   */
  async load(): Promise<BadgeDataCache | null> {
    const manager = new BadgeDataCacheManager()
    return manager.loadFromCache()
  },

  /**
   * Save badge data to cache
   */
  async save(
    config: BadgeAutomationConfig,
    detectedTechnologies: DetectedTechnology[],
    generatedBadges: GeneratedBadge[],
    cacheDurationMs?: number,
  ): Promise<void> {
    const manager = new BadgeDataCacheManager()
    return manager.saveToCache(config, detectedTechnologies, generatedBadges, cacheDurationMs)
  },

  /**
   * Load from backup cache as fallback
   */
  async loadBackup(): Promise<BadgeDataCache | null> {
    const manager = new BadgeDataCacheManager()
    return manager.loadFromBackupCache()
  },

  /**
   * Generate fallback data when all caches fail
   */
  generateFallback(config: BadgeAutomationConfig, error?: string): BadgeDataCache {
    const manager = new BadgeDataCacheManager()
    return manager.generateFallbackCache(config, error)
  },

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    const manager = new BadgeDataCacheManager()
    return manager.clearCache()
  },

  /**
   * Check if cache is valid
   */
  async isValid(): Promise<boolean> {
    const manager = new BadgeDataCacheManager()
    return manager.isCacheValid()
  },

  /**
   * Get cache information
   */
  async info() {
    const manager = new BadgeDataCacheManager()
    return manager.getCacheInfo()
  },
}

/**
 * Create a configured BadgeDataCacheManager instance
 */
export function createBadgeDataCacheManager(): BadgeDataCacheManager {
  return new BadgeDataCacheManager()
}
