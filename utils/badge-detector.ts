import type {
  DetectedTechnology,
  ExternalBadgeConfig,
  TechnologyDetectionConfig,
  TechnologySource,
} from '@/types/badges.ts'

import {promises as fs} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

import {TechnologyDetectionError} from '@/types/badges.ts'
import {GitHubApiClient} from '@/utils/github-api.ts'

/**
 * Technology detection utilities for automated badge generation
 */
export class BadgeDetector {
  private readonly config: TechnologyDetectionConfig
  private readonly githubClient: GitHubApiClient
  private externalConfig: ExternalBadgeConfig | null = null

  constructor(config: TechnologyDetectionConfig) {
    this.config = config
    this.githubClient = new GitHubApiClient({
      githubToken: config.githubToken,
      username: config.githubUsername,
      includePrivate: false,
      cacheDurationMs: config.timeoutMs,
      timeoutMs: config.timeoutMs,
    })
  }

  /**
   * Create BadgeDetector from environment variables
   */
  static fromEnvironment(): BadgeDetector {
    const githubToken = process.env.GITHUB_TOKEN ?? ''
    if (githubToken.length === 0) {
      throw new TechnologyDetectionError(
        'GitHub token not found. Please set GITHUB_TOKEN environment variable.',
        'environment',
      )
    }

    const username = process.env.GITHUB_USERNAME ?? 'marcusrbrown'

    return new BadgeDetector({
      analyzePackageJson: Boolean(process.env.ANALYZE_PACKAGE_JSON ?? 'true'),
      analyzeRepositories: Boolean(process.env.ANALYZE_REPOSITORIES ?? 'true'),
      analyzeCommitHistory: Boolean(process.env.ANALYZE_COMMIT_HISTORY ?? 'true'),
      maxCommitsToAnalyze: Number.parseInt(process.env.MAX_COMMITS_TO_ANALYZE ?? '100', 10),
      githubUsername: username,
      githubToken,
      minConfidenceThreshold: Number.parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD ?? '0.6'),
      timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS ?? '10000', 10),
    })
  }

  /**
   * Load external badge configuration
   */
  async loadExternalConfig(): Promise<ExternalBadgeConfig> {
    if (this.externalConfig) {
      return this.externalConfig
    }

    try {
      // TODO: Load from @bfra.me/badge-config package when available
      // For now, use a default configuration
      this.externalConfig = this.getDefaultExternalConfig()
      return this.externalConfig
    } catch (error) {
      throw new TechnologyDetectionError(
        `Failed to load external badge configuration: ${(error as Error).message}`,
        'external-config',
      )
    }
  }

  /**
   * Detect all technologies from configured sources
   */
  async detectTechnologies(): Promise<DetectedTechnology[]> {
    console.warn('🔍 Starting comprehensive technology detection...')

    const detectedTechnologies: DetectedTechnology[] = []

    // Load external configuration
    await this.loadExternalConfig()

    try {
      // Package.json analysis
      if (this.config.analyzePackageJson) {
        console.warn('📦 Analyzing package.json dependencies...')
        const packageTechnologies = await this.detectFromPackageJson()
        detectedTechnologies.push(...packageTechnologies)
      }

      // Repository analysis
      if (this.config.analyzeRepositories) {
        console.warn('🏗️ Analyzing GitHub repositories...')
        const repositoryTechnologies = await this.detectFromRepositories()
        detectedTechnologies.push(...repositoryTechnologies)
      }

      // Commit history analysis
      if (this.config.analyzeCommitHistory) {
        console.warn('📝 Analyzing commit history...')
        const commitTechnologies = await this.detectFromCommitHistory()
        detectedTechnologies.push(...commitTechnologies)
      }

      // Merge and deduplicate technologies
      const mergedTechnologies = this.mergeDuplicateTechnologies(detectedTechnologies)

      // Filter by confidence threshold
      const filteredTechnologies = mergedTechnologies.filter(
        tech => tech.confidence >= this.config.minConfidenceThreshold,
      )

      console.warn(`✅ Technology detection complete: ${filteredTechnologies.length} technologies found`)
      return filteredTechnologies
    } catch (error) {
      throw new TechnologyDetectionError(`Technology detection failed: ${(error as Error).message}`, 'detection')
    }
  }

  /**
   * Detect technologies from package.json dependencies
   */
  private async detectFromPackageJson(): Promise<DetectedTechnology[]> {
    try {
      const packageJsonPath = join(process.cwd(), 'package.json')
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }

      const technologies: DetectedTechnology[] = []
      const now = new Date().toISOString()
      const externalConfig = await this.loadExternalConfig()

      // Analyze dependencies and devDependencies
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }

      for (const [dependencyName, version] of Object.entries(allDependencies)) {
        const technologyIds = this.findTechnologyByDependency(dependencyName, externalConfig)

        for (const technologyId of technologyIds) {
          const techConfig = externalConfig.technologies[technologyId]
          if (techConfig) {
            technologies.push({
              id: technologyId,
              name: techConfig.name,
              category: techConfig.category,
              confidence: 0.9, // High confidence for package.json dependencies
              source: 'package.json',
              version,
              firstDetected: now,
              lastSeen: now,
              priority: techConfig.priority,
              usageScore: this.calculateUsageScore(dependencyName, 'package.json'),
            })
          }
        }
      }

      return technologies
    } catch (error) {
      console.warn(`⚠️ Failed to analyze package.json: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * Detect technologies from GitHub repositories
   */
  private async detectFromRepositories(): Promise<DetectedTechnology[]> {
    try {
      const repositories = await this.githubClient.getUserRepositories(this.config.githubUsername)
      const technologies: DetectedTechnology[] = []
      const externalConfig = await this.loadExternalConfig()

      for (const repo of repositories) {
        // Analyze primary language
        if (repo.language !== null && repo.language !== undefined) {
          const technologyIds = this.findTechnologyByLanguage(repo.language, externalConfig)

          for (const technologyId of technologyIds) {
            const techConfig = externalConfig.technologies[technologyId]
            if (techConfig) {
              technologies.push({
                id: technologyId,
                name: techConfig.name,
                category: techConfig.category,
                confidence: 0.8, // Good confidence for primary language
                source: 'repository',
                firstDetected: repo.created_at ?? new Date().toISOString(),
                lastSeen: repo.updated_at ?? new Date().toISOString(),
                priority: techConfig.priority,
                usageScore: this.calculateUsageScore(repo.language, 'repository'),
              })
            }
          }
        }

        // Analyze repository topics
        if (repo.topics) {
          for (const topic of repo.topics) {
            const technologyIds = this.findTechnologyByTopic(topic, externalConfig)

            for (const technologyId of technologyIds) {
              const techConfig = externalConfig.technologies[technologyId]
              if (techConfig) {
                technologies.push({
                  id: technologyId,
                  name: techConfig.name,
                  category: techConfig.category,
                  confidence: 0.7, // Medium confidence for topics
                  source: 'repository',
                  firstDetected: repo.created_at ?? new Date().toISOString(),
                  lastSeen: repo.updated_at ?? new Date().toISOString(),
                  priority: techConfig.priority,
                  usageScore: this.calculateUsageScore(topic, 'repository'),
                })
              }
            }
          }
        }
      }

      return technologies
    } catch (error) {
      console.warn(`⚠️ Failed to analyze repositories: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * Detect technologies from commit history analysis
   */
  private async detectFromCommitHistory(): Promise<DetectedTechnology[]> {
    try {
      // This is a simplified implementation
      // In a full implementation, this would analyze commit files and patterns
      console.warn('📝 Commit history analysis not yet implemented - returning empty results')
      return []
    } catch (error) {
      console.warn(`⚠️ Failed to analyze commit history: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * Find technology IDs by dependency name
   */
  private findTechnologyByDependency(dependencyName: string, config: ExternalBadgeConfig): string[] {
    const matchingTechnologies: string[] = []

    for (const [pattern, technologyIds] of Object.entries(config.detectionRules.packageJson)) {
      if (dependencyName.includes(pattern) || pattern === dependencyName) {
        matchingTechnologies.push(...technologyIds)
      }
    }

    return matchingTechnologies
  }

  /**
   * Find technology IDs by repository language
   */
  private findTechnologyByLanguage(language: string, config: ExternalBadgeConfig): string[] {
    const matchingTechnologies: string[] = []

    for (const [pattern, technologyIds] of Object.entries(config.detectionRules.repository)) {
      if (language.toLowerCase().includes(pattern.toLowerCase()) || pattern.toLowerCase() === language.toLowerCase()) {
        matchingTechnologies.push(...technologyIds)
      }
    }

    return matchingTechnologies
  }

  /**
   * Find technology IDs by repository topic
   */
  private findTechnologyByTopic(topic: string, config: ExternalBadgeConfig): string[] {
    return this.findTechnologyByLanguage(topic, config) // Use same logic as language
  }

  /**
   * Calculate usage score for a technology
   */
  private calculateUsageScore(_identifier: string, source: TechnologySource): number {
    // Simple scoring algorithm - can be enhanced
    let score = 0.5 // Base score

    // Boost score based on source reliability
    switch (source) {
      case 'package.json':
        score += 0.3
        break
      case 'repository':
        score += 0.2
        break
      case 'commit-history':
        score += 0.1
        break
      case 'manual':
        score += 0.4
        break
    }

    return Math.min(score, 1)
  }

  /**
   * Merge duplicate technologies from different sources
   */
  private mergeDuplicateTechnologies(technologies: DetectedTechnology[]): DetectedTechnology[] {
    const merged = new Map<string, DetectedTechnology>()

    for (const tech of technologies) {
      const existing = merged.get(tech.id)

      if (existing) {
        // Merge duplicate technology entries
        merged.set(tech.id, {
          ...existing,
          confidence: Math.max(existing.confidence, tech.confidence),
          // String comparison, not numeric - ESLint rule doesn't apply
          // eslint-disable-next-line unicorn/prefer-math-min-max
          lastSeen: tech.lastSeen > existing.lastSeen ? tech.lastSeen : existing.lastSeen,
          usageScore: Math.max(existing.usageScore, tech.usageScore),
          version: tech.version ?? existing.version,
        })
      } else {
        merged.set(tech.id, tech)
      }
    }

    return Array.from(merged.values())
  }

  /**
   * Get default external configuration (fallback)
   */
  private getDefaultExternalConfig(): ExternalBadgeConfig {
    return {
      technologies: {
        typescript: {
          name: 'TypeScript',
          category: 'language',
          priority: 'critical',
          badge: {
            label: 'TypeScript',
            color: '007ACC',
            logo: 'typescript',
            logoColor: 'white',
            style: 'for-the-badge',
            linkUrl: 'https://www.typescriptlang.org/',
            linkTitle: 'TypeScript: Typed JavaScript at Any Scale.',
            linkRef: 'ts',
          },
        },
        javascript: {
          name: 'JavaScript',
          category: 'language',
          priority: 'critical',
          badge: {
            label: 'JavaScript',
            color: 'F7DF1E',
            logo: 'javascript',
            logoColor: 'black',
            style: 'for-the-badge',
          },
        },
        nodejs: {
          name: 'Node.js',
          category: 'platform',
          priority: 'high',
          badge: {
            label: 'Node.js',
            color: '339933',
            logo: 'node.js',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        react: {
          name: 'React',
          category: 'framework',
          priority: 'high',
          badge: {
            label: 'React',
            color: '61DAFB',
            logo: 'react',
            logoColor: 'black',
            style: 'for-the-badge',
          },
        },
        svelte: {
          name: 'Svelte',
          category: 'framework',
          priority: 'high',
          badge: {
            label: 'Svelte',
            color: 'FF3E00',
            logo: 'svelte',
            logoColor: 'white',
            style: 'for-the-badge',
            linkUrl: 'https://svelte.dev/',
            linkTitle: 'Svelte • Cybernetically enhanced web apps',
            linkRef: 'sv',
          },
        },
      },
      detectionRules: {
        packageJson: {
          typescript: ['typescript'],
          '@types/': ['typescript'],
          react: ['react'],
          svelte: ['svelte'],
          node: ['nodejs'],
        },
        repository: {
          typescript: ['typescript'],
          javascript: ['javascript'],
          react: ['react'],
          svelte: ['svelte'],
          'node.js': ['nodejs'],
        },
        commitHistory: {
          '.ts': ['typescript'],
          '.js': ['javascript'],
          '.jsx': ['react'],
          '.tsx': ['react', 'typescript'],
          '.svelte': ['svelte'],
        },
      },
      defaults: {
        style: 'for-the-badge',
        colors: {
          language: '007ACC',
          framework: '61DAFB',
          library: '4CAF50',
          tool: 'FF9800',
          platform: '9C27B0',
          database: '795548',
          cloud: '2196F3',
          'ci-cd': '607D8B',
          testing: '8BC34A',
          build: 'FF5722',
          deployment: '3F51B5',
          monitoring: 'E91E63',
        },
        logoColors: {
          light: 'white',
          dark: 'black',
        },
      },
    }
  }
}
