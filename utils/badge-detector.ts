import type {RestEndpointMethodTypes} from '@octokit/rest'

import {promises as fs} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'

import type {
  DetectedTechnology,
  ExternalBadgeConfig,
  TechnologyDetectionConfig,
  TechnologyPriority,
} from '@/types/badges.ts'
import {TechnologyDetectionError} from '@/types/badges.ts'
import {GitHubApiClient} from '@/utils/github-api.ts'

type Repository = RestEndpointMethodTypes['repos']['listForUser']['response']['data'][0]

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

      // Apply technology classification and priority scoring
      const classifiedTechnologies = this.classifyTechnologies(mergedTechnologies)

      // Apply badge relevance scoring and filtering
      const filteredTechnologies = this.applyBadgeRelevanceFiltering(classifiedTechnologies)

      // Filter by confidence threshold
      const finalTechnologies = filteredTechnologies.filter(
        (tech: DetectedTechnology) => tech.confidence >= this.config.minConfidenceThreshold,
      )

      console.warn(`✅ Technology detection complete: ${finalTechnologies.length} technologies found`)
      return finalTechnologies
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
        peerDependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
        scripts?: Record<string, string>
        engines?: Record<string, string>
        type?: string
        packageManager?: string
      }

      const technologies: DetectedTechnology[] = []
      const now = new Date().toISOString()
      const externalConfig = await this.loadExternalConfig()

      // Analyze all types of dependencies
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
        ...packageJson.optionalDependencies,
      }

      // Process dependencies
      for (const [dependencyName, version] of Object.entries(allDependencies)) {
        const technologyIds = this.findTechnologyByDependency(dependencyName, externalConfig)
        const isDev = Boolean(packageJson.devDependencies?.[dependencyName])

        for (const technologyId of technologyIds) {
          const techConfig = externalConfig.technologies[technologyId]
          if (techConfig) {
            // Adjust confidence based on dependency type
            let confidence = 0.9 // High confidence for direct dependencies
            if (packageJson.peerDependencies?.[dependencyName] !== undefined) confidence = 0.8
            if (packageJson.optionalDependencies?.[dependencyName] !== undefined) confidence = 0.7
            if (isDev) confidence *= 0.9 // Slightly lower for dev dependencies

            technologies.push({
              id: technologyId,
              name: techConfig.name,
              category: techConfig.category,
              confidence,
              source: 'package.json',
              version,
              firstDetected: now,
              lastSeen: now,
              priority: techConfig.priority,
              usageScore: this.calculateDependencyUsageScore(dependencyName, version, isDev),
            })
          }
        }
      }

      // Analyze scripts for technology indicators
      if (packageJson.scripts) {
        const scriptTechnologies = this.detectTechnologiesFromScripts(packageJson.scripts, externalConfig, now)
        technologies.push(...scriptTechnologies)
      }

      // Analyze engines configuration
      if (packageJson.engines) {
        const engineTechnologies = this.detectTechnologiesFromEngines(packageJson.engines, externalConfig, now)
        technologies.push(...engineTechnologies)
      }

      // Analyze package type and package manager
      if (packageJson.type === 'module') {
        const esmTech = this.createTechnologyFromIndicator(
          'esm',
          'ES Modules',
          'module-system',
          0.8,
          externalConfig,
          now,
        )
        if (esmTech !== null) technologies.push(esmTech)
      }

      if (packageJson.packageManager !== undefined && packageJson.packageManager.trim().length > 0) {
        const packageManagerTech = this.detectPackageManagerTechnology(packageJson.packageManager, externalConfig, now)
        if (packageManagerTech !== null) technologies.push(packageManagerTech)
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
        // Skip forked repositories unless they're actively maintained
        if (
          repo.fork === true &&
          (repo.updated_at === null ||
            repo.updated_at === undefined ||
            new Date(repo.updated_at) < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        ) {
          continue
        }

        // Analyze primary language with usage statistics
        if (repo.language !== null && repo.language !== undefined) {
          const technologyIds = this.findTechnologyByLanguage(repo.language, externalConfig)

          for (const technologyId of technologyIds) {
            const techConfig = externalConfig.technologies[technologyId]
            if (techConfig) {
              technologies.push({
                id: technologyId,
                name: techConfig.name,
                category: techConfig.category,
                confidence: this.calculateLanguageConfidence(repo),
                source: 'repository',
                firstDetected: repo.created_at ?? new Date().toISOString(),
                lastSeen: repo.updated_at ?? new Date().toISOString(),
                priority: techConfig.priority,
                usageScore: this.calculateRepositoryUsageScore(repo, 'language'),
              })
            }
          }
        }

        // Analyze repository topics
        if (repo.topics && repo.topics.length > 0) {
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
                  usageScore: this.calculateRepositoryUsageScore(repo, 'topic'),
                })
              }
            }
          }
        }

        // Analyze repository name and description for technology indicators
        const nameDescTechnologies = await this.analyzeRepositoryNameAndDescription(repo, externalConfig)
        technologies.push(...nameDescTechnologies)

        // Get detailed language statistics if available
        try {
          const languageStats = await this.githubClient.getRepositoryLanguages(this.config.githubUsername, repo.name)
          const languageTechnologies = this.analyzeLanguageStatistics(languageStats, repo, externalConfig)
          technologies.push(...languageTechnologies)
        } catch (error) {
          console.warn(`⚠️ Failed to get language stats for ${repo.name}: ${(error as Error).message}`)
        }

        // Check for specific technology indicators in repository structure
        try {
          const structureTechnologies = await this.analyzeRepositoryStructure(repo, externalConfig)
          technologies.push(...structureTechnologies)
        } catch (error) {
          console.warn(`⚠️ Failed to analyze structure for ${repo.name}: ${(error as Error).message}`)
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
      const repositories = await this.githubClient.getUserRepositories(this.config.githubUsername)
      const technologies: DetectedTechnology[] = []
      const externalConfig = await this.loadExternalConfig()

      console.warn(`📝 Analyzing commits across ${repositories.length} repositories...`)

      // Track technology usage across all repositories
      const technologyUsage = new Map<
        string,
        {
          repoCount: number
          totalCommits: number
          firstSeen: string
          lastSeen: string
          confidence: number
        }
      >()

      for (const repo of repositories.slice(0, 10)) {
        // Limit to avoid rate limits
        if (repo.fork || repo.archived) continue // Skip forks and archived repos

        try {
          // Split owner/repo from full_name for the API call
          const [owner, repoName] = repo.full_name.split('/')
          if (owner === undefined || repoName === undefined || owner.length === 0 || repoName.length === 0) continue

          const commits = await this.githubClient.getRepositoryCommits(
            owner,
            repoName,
            Math.min(this.config.maxCommitsToAnalyze, 30),
          )

          // Analyze commits for technology indicators
          const repoTechnologies = await this.analyzeCommitsForTechnologies(commits, repo, externalConfig)

          // Aggregate technology usage across repositories
          for (const tech of repoTechnologies) {
            const existing = technologyUsage.get(tech.id) || {
              repoCount: 0,
              totalCommits: 0,
              firstSeen: tech.firstDetected,
              lastSeen: tech.lastSeen,
              confidence: 0,
            }

            existing.repoCount += 1
            existing.totalCommits += 1
            existing.confidence = Math.max(existing.confidence, tech.confidence)

            // Update timestamps
            if (tech.firstDetected < existing.firstSeen) {
              existing.firstSeen = tech.firstDetected
            }
            if (tech.lastSeen > existing.lastSeen) {
              existing.lastSeen = tech.lastSeen
            }

            technologyUsage.set(tech.id, existing)
          }
        } catch (repoError) {
          console.warn(`⚠️ Failed to analyze commits for ${repo.full_name}: ${(repoError as Error).message}`)
          continue
        }
      }

      // Convert aggregated usage data to DetectedTechnology objects
      for (const [technologyId, usage] of technologyUsage.entries()) {
        const techConfig = externalConfig.technologies[technologyId]
        if (techConfig) {
          technologies.push({
            id: technologyId,
            name: techConfig.name,
            category: techConfig.category,
            confidence: usage.confidence,
            source: 'commit-history',
            firstDetected: usage.firstSeen,
            lastSeen: usage.lastSeen,
            priority: techConfig.priority,
            usageScore: this.calculateCommitHistoryUsageScore(usage),
          })
        }
      }

      console.warn(`✅ Commit history analysis complete: found ${technologies.length} technologies`)
      return technologies
    } catch (error) {
      console.warn(`⚠️ Failed to analyze commit history: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * Apply technology classification and priority scoring
   */
  private classifyTechnologies(technologies: DetectedTechnology[]): DetectedTechnology[] {
    console.warn('🏷️ Applying technology classification and priority scoring...')

    return technologies.map(tech => {
      // Calculate enhanced priority score based on multiple factors
      const priorityScore = this.calculatePriorityScore(tech)

      // Adjust confidence based on technology category and usage patterns
      const adjustedConfidence = this.adjustConfidenceByCategory(tech)

      // Calculate recency boost for recently used technologies
      const recencyBoost = this.calculateRecencyBoost(tech)

      // Apply classification enhancements
      return {
        ...tech,
        confidence: Math.min(adjustedConfidence + recencyBoost, 1),
        usageScore: Math.max(tech.usageScore, priorityScore),
        priority: this.determineFinalPriority(tech, priorityScore),
      }
    })
  }

  /**
   * Calculate priority score based on usage frequency, recency, and category
   */
  private calculatePriorityScore(tech: DetectedTechnology): number {
    let score = tech.usageScore

    // Boost score based on technology category importance
    switch (tech.category) {
      case 'language':
        score += 0.3 // Languages are fundamental
        break
      case 'framework':
        score += 0.25 // Frameworks are high impact
        break
      case 'platform':
        score += 0.2 // Platforms are infrastructure-level
        break
      case 'database':
        score += 0.15 // Databases are important but specialized
        break
      case 'library':
        score += 0.12 // Libraries are commonly used
        break
      case 'tool':
      case 'build':
        score += 0.1 // Tools and build systems are supporting
        break
      case 'testing':
      case 'ci-cd':
        score += 0.05 // Testing and CI/CD are process-related
        break
      case 'cloud':
      case 'deployment':
      case 'monitoring':
        score += 0.08 // Infrastructure and operations tools
        break
      default:
        score += 0.02 // Minimal boost for other categories
    }

    // Boost based on detection source reliability
    switch (tech.source) {
      case 'package.json':
        score += 0.15 // High reliability
        break
      case 'repository':
        score += 0.1 // Good reliability
        break
      case 'commit-history':
        score += 0.05 // Lower reliability but still valuable
        break
      case 'manual':
        score += 0.2 // Highest reliability if manually specified
        break
    }

    return Math.min(score, 1)
  }

  /**
   * Adjust confidence based on technology category patterns
   */
  private adjustConfidenceByCategory(tech: DetectedTechnology): number {
    let adjustedConfidence = tech.confidence

    // Apply category-specific confidence adjustments
    switch (tech.category) {
      case 'language':
        // Languages detected from repositories are highly reliable
        if (tech.source === 'repository') {
          adjustedConfidence = Math.min(adjustedConfidence + 0.1, 1)
        }
        break
      case 'framework':
      case 'library':
        // Frameworks and libraries in package.json are highly reliable
        if (tech.source === 'package.json') {
          adjustedConfidence = Math.min(adjustedConfidence + 0.15, 1)
        }
        break
      case 'platform':
      case 'database':
        // Infrastructure technologies are typically well-defined
        adjustedConfidence = Math.min(adjustedConfidence + 0.05, 1)
        break
      case 'tool':
      case 'build':
      case 'testing':
      case 'ci-cd':
        // Tools might be less relevant for badges, slight confidence reduction
        adjustedConfidence = Math.max(adjustedConfidence - 0.05, 0.1)
        break
      case 'cloud':
      case 'deployment':
      case 'monitoring':
        // Infrastructure tools are moderately reliable
        break // No adjustment
      default:
        break // No adjustment for unknown categories
    }

    return adjustedConfidence
  }

  /**
   * Calculate recency boost based on when technology was last seen
   */
  private calculateRecencyBoost(tech: DetectedTechnology): number {
    const now = new Date()
    const lastSeen = new Date(tech.lastSeen)
    const daysSinceLastSeen = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)

    // Boost for recently active technologies
    if (daysSinceLastSeen <= 30) {
      return 0.1 // Strong boost for technologies used in last 30 days
    } else if (daysSinceLastSeen <= 90) {
      return 0.05 // Moderate boost for technologies used in last 90 days
    } else if (daysSinceLastSeen <= 365) {
      return 0.02 // Small boost for technologies used in last year
    }

    return 0 // No boost for older technologies
  }

  /**
   * Determine final priority based on calculated scores
   */
  private determineFinalPriority(tech: DetectedTechnology, priorityScore: number): TechnologyPriority {
    // If priority is already critical and scores support it, keep it
    if (tech.priority === 'critical' && priorityScore >= 0.8) {
      return 'critical'
    }

    // Calculate final priority based on combined factors
    const combinedScore = (priorityScore + tech.confidence + tech.usageScore) / 3

    if (combinedScore >= 0.85) {
      return 'critical'
    } else if (combinedScore >= 0.7) {
      return 'high'
    } else if (combinedScore >= 0.5) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  /**
   * Apply badge relevance scoring and filtering to avoid badge spam
   */
  private applyBadgeRelevanceFiltering(technologies: DetectedTechnology[]): DetectedTechnology[] {
    console.warn('🎯 Applying badge relevance filtering...')

    // Step 1: Filter out low-relevance technologies
    const relevantTechnologies = technologies.filter(tech => this.isTechnologyRelevantForBadges(tech))

    // Step 2: Apply diversity filtering to avoid category overload
    const diverseTechnologies = this.applyDiversityFiltering(relevantTechnologies)

    // Step 3: Limit total number of badges based on priority
    const limitedTechnologies = this.limitBadgesByPriority(diverseTechnologies)

    // Step 4: Sort by display priority for consistent ordering
    const sortedTechnologies = this.sortByDisplayPriority(limitedTechnologies)

    console.warn(
      `🎯 Badge filtering complete: ${sortedTechnologies.length} badges selected from ${technologies.length} technologies`,
    )
    return sortedTechnologies
  }

  /**
   * Check if a technology is relevant for badge display
   */
  private isTechnologyRelevantForBadges(tech: DetectedTechnology): boolean {
    // Minimum confidence threshold
    if (tech.confidence < 0.3) return false

    // Minimum usage score threshold
    if (tech.usageScore < 0.2) return false

    // Filter out very old technologies (over 2 years since last seen)
    const now = new Date()
    const lastSeen = new Date(tech.lastSeen)
    const daysSinceLastSeen = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceLastSeen > 730) return false // 2 years

    // Include all critical and high priority technologies
    if (tech.priority === 'critical' || tech.priority === 'high') return true

    // For medium and low priority, apply stricter filtering
    if (tech.priority === 'medium') {
      return tech.confidence >= 0.6 && tech.usageScore >= 0.4
    }

    if (tech.priority === 'low') {
      return tech.confidence >= 0.8 && tech.usageScore >= 0.6
    }

    return true
  }

  /**
   * Apply diversity filtering to prevent badge spam in any single category
   */
  private applyDiversityFiltering(technologies: DetectedTechnology[]): DetectedTechnology[] {
    const maxPerCategory = {
      language: 4, // Allow up to 4 programming languages
      framework: 3, // Allow up to 3 frameworks
      library: 2, // Allow up to 2 major libraries
      platform: 2, // Allow up to 2 platforms
      database: 2, // Allow up to 2 databases
      tool: 3, // Allow up to 3 development tools
      build: 2, // Allow up to 2 build tools
      testing: 1, // Allow up to 1 testing framework
      'ci-cd': 1, // Allow up to 1 CI/CD tool
      cloud: 2, // Allow up to 2 cloud platforms
      deployment: 1, // Allow up to 1 deployment tool
      monitoring: 1, // Allow up to 1 monitoring tool
    }

    const categoryCounts = new Map<string, number>()
    const filteredTechnologies: DetectedTechnology[] = []

    // Sort by priority and confidence to ensure best technologies are selected first
    const sortedTechs = technologies.sort((a, b) => {
      const priorityOrder = {critical: 4, high: 3, medium: 2, low: 1}
      const aPriority = priorityOrder[a.priority] || 0
      const bPriority = priorityOrder[b.priority] || 0

      if (aPriority !== bPriority) return bPriority - aPriority
      return b.confidence - a.confidence
    })

    for (const tech of sortedTechs) {
      const categoryCount = categoryCounts.get(tech.category) ?? 0
      const maxAllowed = maxPerCategory[tech.category as keyof typeof maxPerCategory] || 1

      if (categoryCount < maxAllowed) {
        filteredTechnologies.push(tech)
        categoryCounts.set(tech.category, categoryCount + 1)
      }
    }

    return filteredTechnologies
  }

  /**
   * Limit total number of badges based on priority distribution
   */
  private limitBadgesByPriority(technologies: DetectedTechnology[]): DetectedTechnology[] {
    const maxBadges = 20 // Maximum total badges to avoid overwhelming display

    if (technologies.length <= maxBadges) {
      return technologies
    }

    // Ensure priority distribution: critical > high > medium > low
    const criticalTechs = technologies.filter(t => t.priority === 'critical')
    const highTechs = technologies.filter(t => t.priority === 'high')
    const mediumTechs = technologies.filter(t => t.priority === 'medium')
    const lowTechs = technologies.filter(t => t.priority === 'low')

    const selected: DetectedTechnology[] = []

    // Always include all critical technologies
    selected.push(...criticalTechs)

    // Add high priority technologies until we reach limit
    const remainingSlots = maxBadges - selected.length
    if (remainingSlots > 0) {
      selected.push(...highTechs.slice(0, Math.min(remainingSlots, highTechs.length)))
    }

    // Fill remaining slots with medium priority
    const stillRemaining = maxBadges - selected.length
    if (stillRemaining > 0) {
      selected.push(...mediumTechs.slice(0, Math.min(stillRemaining, mediumTechs.length)))
    }

    // Fill any remaining slots with low priority (rare)
    const finalRemaining = maxBadges - selected.length
    if (finalRemaining > 0) {
      selected.push(...lowTechs.slice(0, Math.min(finalRemaining, lowTechs.length)))
    }

    return selected
  }

  /**
   * Sort technologies by display priority for consistent badge ordering
   */
  private sortByDisplayPriority(technologies: DetectedTechnology[]): DetectedTechnology[] {
    return technologies.sort((a, b) => {
      // Primary sort: priority level
      const priorityOrder = {critical: 4, high: 3, medium: 2, low: 1}
      const aPriority = priorityOrder[a.priority] || 0
      const bPriority = priorityOrder[b.priority] || 0

      if (aPriority !== bPriority) {
        return bPriority - aPriority
      }

      // Secondary sort: category importance
      const categoryOrder = {
        language: 10,
        framework: 9,
        platform: 8,
        database: 7,
        library: 6,
        tool: 5,
        build: 4,
        cloud: 3,
        'ci-cd': 2,
        testing: 2,
        deployment: 1,
        monitoring: 1,
      }
      const aCategoryPriority = categoryOrder[a.category as keyof typeof categoryOrder] || 0
      const bCategoryPriority = categoryOrder[b.category as keyof typeof categoryOrder] || 0

      if (aCategoryPriority !== bCategoryPriority) {
        return bCategoryPriority - aCategoryPriority
      }

      // Tertiary sort: confidence score
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence
      }

      // Final sort: usage score
      return b.usageScore - a.usageScore
    })
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
  private calculateDependencyUsageScore(dependencyName: string, version: string, isDev: boolean): number {
    let score = 0.7 // Base score for dependencies

    // Boost for commonly important packages
    if (dependencyName.includes('react') || dependencyName.includes('vue') || dependencyName.includes('svelte')) {
      score += 0.2
    }

    // Boost for framework/build tools
    if (
      dependencyName.includes('typescript') ||
      dependencyName.includes('webpack') ||
      dependencyName.includes('vite')
    ) {
      score += 0.15
    }

    // Slight penalty for dev dependencies
    if (isDev) {
      score *= 0.95
    }

    // Consider version patterns (major releases indicate active usage)
    if (version && !version.includes('^') && !version.includes('~')) {
      score -= 0.05 // Pinned versions might be less actively maintained
    }

    return Math.min(score, 1)
  }

  /**
   * Detect technologies from package.json scripts
   */
  private detectTechnologiesFromScripts(
    scripts: Record<string, string>,
    config: ExternalBadgeConfig,
    timestamp: string,
  ): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = []

    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      // Analyze script commands for technology indicators
      const scriptTechs = this.analyzeScriptCommand(scriptCommand, config, timestamp)
      technologies.push(...scriptTechs)

      // Analyze script names for technology patterns
      const nameTechs = this.analyzeScriptName(scriptName, config, timestamp)
      technologies.push(...nameTechs)
    }

    return technologies
  }

  /**
   * Analyze a script command for technology indicators
   */
  private analyzeScriptCommand(command: string, config: ExternalBadgeConfig, timestamp: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = []

    // Common script patterns that indicate technologies
    const scriptPatterns = {
      typescript: ['tsc', 'typescript'],
      webpack: ['webpack'],
      vite: ['vite'],
      eslint: ['eslint'],
      prettier: ['prettier'],
      jest: ['jest'],
      vitest: ['vitest'],
      playwright: ['playwright'],
      cypress: ['cypress'],
      docker: ['docker'],
      'next.js': ['next'],
      nuxt: ['nuxt'],
      svelte: ['svelte'],
      astro: ['astro'],
    }

    for (const [technologyId, patterns] of Object.entries(scriptPatterns)) {
      if (patterns.some(pattern => command.includes(pattern))) {
        const tech = this.createTechnologyFromIndicator(technologyId, technologyId, 'tool', 0.7, config, timestamp)
        if (tech !== null) technologies.push(tech)
      }
    }

    return technologies
  }

  /**
   * Analyze a script name for technology patterns
   */
  private analyzeScriptName(scriptName: string, config: ExternalBadgeConfig, timestamp: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = []

    // Script name patterns
    const namePatterns = {
      build: ['build', 'compile'],
      test: ['test', 'spec'],
      dev: ['dev', 'serve', 'start'],
      lint: ['lint', 'check'],
      format: ['format', 'prettier'],
      deploy: ['deploy', 'publish'],
      docker: ['docker'],
    }

    for (const [category, patterns] of Object.entries(namePatterns)) {
      if (patterns.some(pattern => scriptName.includes(pattern))) {
        const tech = this.createTechnologyFromIndicator(category, category, 'workflow', 0.5, config, timestamp)
        if (tech !== null) technologies.push(tech)
      }
    }

    return technologies
  }

  /**
   * Detect technologies from engines configuration
   */
  private detectTechnologiesFromEngines(
    engines: Record<string, string>,
    config: ExternalBadgeConfig,
    timestamp: string,
  ): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = []

    for (const [engineName, version] of Object.entries(engines)) {
      const tech = this.createTechnologyFromIndicator(
        engineName,
        engineName,
        'platform',
        0.9,
        config,
        timestamp,
        version,
      )
      if (tech !== null) technologies.push(tech)
    }

    return technologies
  }

  /**
   * Create a DetectedTechnology from a simple indicator
   */
  private createTechnologyFromIndicator(
    id: string,
    name: string,
    category: string,
    confidence: number,
    config: ExternalBadgeConfig,
    timestamp: string,
    version?: string,
  ): DetectedTechnology | null {
    // Try to find existing technology configuration
    const techConfig = config.technologies[id]
    if (techConfig) {
      return {
        id,
        name: techConfig.name,
        category: techConfig.category,
        confidence,
        source: 'package.json',
        version,
        firstDetected: timestamp,
        lastSeen: timestamp,
        priority: techConfig.priority,
        usageScore: confidence,
      }
    }

    // Create a basic technology entry if not found in config
    return {
      id,
      name,
      category: category as DetectedTechnology['category'],
      confidence,
      source: 'package.json',
      version,
      firstDetected: timestamp,
      lastSeen: timestamp,
      priority: 'medium',
      usageScore: confidence * 0.8, // Slightly lower for unknown technologies
    }
  }

  /**
   * Detect package manager technology
   */
  private detectPackageManagerTechnology(
    packageManager: string,
    config: ExternalBadgeConfig,
    timestamp: string,
  ): DetectedTechnology | null {
    const [manager] = packageManager.split('@')
    if (manager === undefined || manager.trim().length === 0) return null

    return this.createTechnologyFromIndicator(manager, manager, 'tool', 0.8, config, timestamp, packageManager)
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
        // Programming Languages
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
        python: {
          name: 'Python',
          category: 'language',
          priority: 'high',
          badge: {
            label: 'Python',
            color: '3776AB',
            logo: 'python',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        go: {
          name: 'Go',
          category: 'language',
          priority: 'high',
          badge: {
            label: 'Go',
            color: '00ADD8',
            logo: 'go',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        rust: {
          name: 'Rust',
          category: 'language',
          priority: 'high',
          badge: {
            label: 'Rust',
            color: '000000',
            logo: 'rust',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        // Platforms & Runtimes
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
        deno: {
          name: 'Deno',
          category: 'platform',
          priority: 'medium',
          badge: {
            label: 'Deno',
            color: '000000',
            logo: 'deno',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        // Frontend Frameworks
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
        vue: {
          name: 'Vue.js',
          category: 'framework',
          priority: 'high',
          badge: {
            label: 'Vue.js',
            color: '4FC08D',
            logo: 'vue.js',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        nextjs: {
          name: 'Next.js',
          category: 'framework',
          priority: 'high',
          badge: {
            label: 'Next.js',
            color: '000000',
            logo: 'next.js',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        // Build Tools & Bundlers
        vite: {
          name: 'Vite',
          category: 'build',
          priority: 'medium',
          badge: {
            label: 'Vite',
            color: '646CFF',
            logo: 'vite',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        webpack: {
          name: 'Webpack',
          category: 'build',
          priority: 'medium',
          badge: {
            label: 'Webpack',
            color: '8DD6F9',
            logo: 'webpack',
            logoColor: 'black',
            style: 'for-the-badge',
          },
        },
        // Testing Frameworks
        vitest: {
          name: 'Vitest',
          category: 'testing',
          priority: 'medium',
          badge: {
            label: 'Vitest',
            color: '6E9F18',
            logo: 'vitest',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        jest: {
          name: 'Jest',
          category: 'testing',
          priority: 'medium',
          badge: {
            label: 'Jest',
            color: 'C21325',
            logo: 'jest',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        // Development Tools
        eslint: {
          name: 'ESLint',
          category: 'tool',
          priority: 'low',
          badge: {
            label: 'ESLint',
            color: '4B32C3',
            logo: 'eslint',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
        prettier: {
          name: 'Prettier',
          category: 'tool',
          priority: 'low',
          badge: {
            label: 'Prettier',
            color: 'F7B93E',
            logo: 'prettier',
            logoColor: 'black',
            style: 'for-the-badge',
          },
        },
        // Package Managers
        pnpm: {
          name: 'pnpm',
          category: 'tool',
          priority: 'medium',
          badge: {
            label: 'pnpm',
            color: 'F69220',
            logo: 'pnpm',
            logoColor: 'white',
            style: 'for-the-badge',
          },
        },
      },
      detectionRules: {
        packageJson: {
          typescript: ['typescript'],
          '@types/': ['typescript'],
          react: ['react'],
          next: ['nextjs'],
          svelte: ['svelte'],
          vue: ['vue'],
          vite: ['vite'],
          webpack: ['webpack'],
          vitest: ['vitest'],
          jest: ['jest'],
          eslint: ['eslint'],
          prettier: ['prettier'],
          node: ['nodejs'],
          pnpm: ['pnpm'],
        },
        repository: {
          typescript: ['typescript'],
          javascript: ['javascript'],
          python: ['python'],
          go: ['go'],
          rust: ['rust'],
          react: ['react'],
          svelte: ['svelte'],
          vue: ['vue'],
          'node.js': ['nodejs'],
        },
        commitHistory: {
          '.ts': ['typescript'],
          '.tsx': ['typescript', 'react'],
          '.js': ['javascript'],
          '.jsx': ['javascript', 'react'],
          '.svelte': ['svelte'],
          '.vue': ['vue'],
          '.py': ['python'],
          '.go': ['go'],
          '.rs': ['rust'],
          'package.json': ['nodejs'],
          'pnpm-lock.yaml': ['pnpm'],
          'vite.config': ['vite'],
          'webpack.config': ['webpack'],
          'vitest.config': ['vitest'],
          'jest.config': ['jest'],
          '.eslintrc': ['eslint'],
          'eslint.config': ['eslint'],
          '.prettierrc': ['prettier'],
          'prettier.config': ['prettier'],
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

  /**
   * Calculate confidence for language detection based on repository characteristics
   */
  private calculateLanguageConfidence(repo: Repository): number {
    let confidence = 0.8 // Base confidence for primary language

    // Boost confidence for recently updated repositories
    if (repo.updated_at !== null && repo.updated_at !== undefined) {
      const daysSinceUpdate = (Date.now() - new Date(repo.updated_at).getTime()) / (24 * 60 * 60 * 1000)
      if (daysSinceUpdate < 30) confidence += 0.1
      else if (daysSinceUpdate < 90) confidence += 0.05
    }

    // Boost confidence for repositories with activity
    if (repo.stargazers_count !== undefined && repo.stargazers_count > 0) confidence += 0.05
    if (repo.forks_count !== undefined && repo.forks_count > 0) confidence += 0.05

    // Reduce confidence for archived repositories
    if (repo.archived === true) confidence -= 0.2

    return Math.min(confidence, 1)
  }

  /**
   * Calculate usage score for repository-based technology detection
   */
  private calculateRepositoryUsageScore(repo: Repository, detectionType: 'language' | 'topic'): number {
    let score = 0.6 // Base score

    // Boost for repository activity indicators
    if (repo.stargazers_count !== undefined && repo.stargazers_count > 0) {
      score += Math.min(repo.stargazers_count * 0.01, 0.2)
    }
    if (repo.forks_count !== undefined && repo.forks_count > 0) {
      score += Math.min(repo.forks_count * 0.02, 0.15)
    }

    // Boost for recent activity
    if (repo.updated_at !== null && repo.updated_at !== undefined) {
      const daysSinceUpdate = (Date.now() - new Date(repo.updated_at).getTime()) / (24 * 60 * 60 * 1000)
      if (daysSinceUpdate < 30) score += 0.1
      else if (daysSinceUpdate < 90) score += 0.05
    }

    // Different scoring for detection types
    if (detectionType === 'language') {
      score += 0.2 // Primary language is strong indicator
    } else if (detectionType === 'topic') {
      score += 0.1 // Topics are good but less definitive
    }

    // Penalty for archived or forked repositories
    if (repo.archived === true) score -= 0.2
    if (repo.fork === true) score -= 0.1

    return Math.min(score, 1)
  }

  /**
   * Analyze repository name and description for technology indicators
   */
  private async analyzeRepositoryNameAndDescription(
    repo: Repository,
    config: ExternalBadgeConfig,
  ): Promise<DetectedTechnology[]> {
    const technologies: DetectedTechnology[] = []
    const timestamp = repo.updated_at ?? new Date().toISOString()

    // Technology keywords to look for in names and descriptions
    const techKeywords = {
      react: ['react'],
      vue: ['vue', 'vuejs'],
      angular: ['angular'],
      svelte: ['svelte'],
      nodejs: ['node', 'nodejs'],
      typescript: ['typescript', 'ts'],
      javascript: ['javascript', 'js'],
      python: ['python', 'py'],
      go: ['golang', 'go'],
      rust: ['rust'],
      docker: ['docker', 'dockerfile'],
      kubernetes: ['k8s', 'kubernetes'],
      aws: ['aws', 'amazon'],
      gcp: ['gcp', 'google-cloud'],
      azure: ['azure'],
    }

    const textToAnalyze = `${repo.name} ${repo.description ?? ''}`.toLowerCase()

    for (const [technologyId, keywords] of Object.entries(techKeywords)) {
      if (keywords.some(keyword => textToAnalyze.includes(keyword))) {
        const tech = this.createTechnologyFromIndicator(
          technologyId,
          technologyId,
          'framework',
          0.6, // Medium confidence for name/description matches
          config,
          timestamp,
        )
        if (tech !== null) technologies.push(tech)
      }
    }

    return technologies
  }

  /**
   * Analyze detailed language statistics from GitHub API
   */
  private analyzeLanguageStatistics(
    languageStats: Record<string, number>,
    repo: Repository,
    config: ExternalBadgeConfig,
  ): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = []
    const timestamp = repo.updated_at ?? new Date().toISOString()
    const totalBytes = Object.values(languageStats).reduce((sum, bytes) => sum + bytes, 0)

    for (const [language, bytes] of Object.entries(languageStats)) {
      const percentage = totalBytes > 0 ? bytes / totalBytes : 0

      // Only include languages that make up a significant portion
      if (percentage >= 0.05) {
        // At least 5% of the codebase
        const technologyIds = this.findTechnologyByLanguage(language, config)

        for (const technologyId of technologyIds) {
          const techConfig = config.technologies[technologyId]
          if (techConfig) {
            technologies.push({
              id: technologyId,
              name: techConfig.name,
              category: techConfig.category,
              confidence: Math.min(0.8 + percentage * 0.2, 1), // Higher confidence for dominant languages
              source: 'repository',
              firstDetected: repo.created_at ?? timestamp,
              lastSeen: timestamp,
              priority: techConfig.priority,
              usageScore: this.calculateLanguageStatUsageScore(percentage, bytes, repo),
            })
          }
        }
      }
    }

    return technologies
  }

  /**
   * Calculate usage score based on language statistics
   */
  private calculateLanguageStatUsageScore(percentage: number, bytes: number, repo: Repository): number {
    let score = 0.5 + percentage * 0.3 // Base score plus percentage weight

    // Boost for larger codebases
    if (bytes > 10000) score += 0.1
    if (bytes > 100000) score += 0.1

    // Boost for repository activity
    if (repo.stargazers_count !== undefined && repo.stargazers_count > 0) {
      score += Math.min(repo.stargazers_count * 0.005, 0.1)
    }

    return Math.min(score, 1)
  }

  /**
   * Analyze repository structure for technology indicators
   */
  private async analyzeRepositoryStructure(
    repo: Repository,
    config: ExternalBadgeConfig,
  ): Promise<DetectedTechnology[]> {
    const technologies: DetectedTechnology[] = []
    const timestamp = repo.updated_at ?? new Date().toISOString()

    try {
      // Get root directory contents
      const rootContents = await this.githubClient.getRepositoryContents(this.config.githubUsername, repo.name)

      // Check for specific configuration files and directories
      const fileIndicators = {
        'package.json': ['nodejs', 'javascript'],
        'tsconfig.json': ['typescript'],
        Dockerfile: ['docker'],
        'docker-compose.yml': ['docker'],
        'requirements.txt': ['python'],
        'Cargo.toml': ['rust'],
        'go.mod': ['go'],
        'pom.xml': ['java'],
        'build.gradle': ['java'],
        '.github/workflows': ['github-actions'],
        'src/': ['structured-project'],
        'tests/': ['testing'],
        '__tests__/': ['testing'],
        '.eslintrc': ['eslint'],
        'prettier.config': ['prettier'],
        'vite.config': ['vite'],
        'webpack.config': ['webpack'],
        'next.config': ['nextjs'],
        'nuxt.config': ['nuxt'],
        'astro.config': ['astro'],
      }

      for (const item of rootContents) {
        const itemName = typeof item.name === 'string' ? item.name : ''
        if (itemName.length > 0) {
          for (const [pattern, technologyIds] of Object.entries(fileIndicators)) {
            if (typeof itemName === 'string' && (itemName.includes(pattern) || itemName === pattern)) {
              for (const technologyId of technologyIds) {
                const tech = this.createTechnologyFromIndicator(
                  technologyId,
                  technologyId,
                  'tool',
                  0.7, // Good confidence for file-based detection
                  config,
                  timestamp,
                )
                if (tech !== null) technologies.push(tech)
              }
            }
          }
        }
      }

      return technologies
    } catch (error) {
      console.warn(`⚠️ Failed to analyze repository structure for ${repo.name}: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * Analyze commits for technology indicators
   */
  private async analyzeCommitsForTechnologies(
    commits: RestEndpointMethodTypes['repos']['listCommits']['response']['data'],
    _repo: Repository,
    config: ExternalBadgeConfig,
  ): Promise<DetectedTechnology[]> {
    const technologies: DetectedTechnology[] = []
    const techIndicators = new Map<
      string,
      {
        count: number
        firstSeen: string
        lastSeen: string
      }
    >()

    for (const commit of commits) {
      // Analyze commit message for technology keywords
      const messageIndicators = this.analyzeCommitMessage(commit.commit?.message ?? '', config)

      // Analyze file changes in the commit (if available)
      const fileIndicators = this.analyzeCommitFiles(commit, config)

      const allIndicators = [...messageIndicators, ...fileIndicators]

      for (const indicator of allIndicators) {
        const existing = techIndicators.get(indicator.technologyId)
        const commitDate = commit.commit?.author?.date ?? new Date().toISOString()

        if (existing) {
          techIndicators.set(indicator.technologyId, {
            count: existing.count + 1,
            // String comparison for ISO date strings, not numeric - ESLint rule doesn't apply
            // eslint-disable-next-line unicorn/prefer-math-min-max
            firstSeen: commitDate < existing.firstSeen ? commitDate : existing.firstSeen,
            // eslint-disable-next-line unicorn/prefer-math-min-max
            lastSeen: commitDate > existing.lastSeen ? commitDate : existing.lastSeen,
          })
        } else {
          techIndicators.set(indicator.technologyId, {
            count: 1,
            firstSeen: commitDate,
            lastSeen: commitDate,
          })
        }
      }
    }

    // Convert indicators to DetectedTechnology objects
    for (const [technologyId, usage] of techIndicators.entries()) {
      const techConfig = config.technologies[technologyId]
      if (techConfig) {
        // Calculate confidence based on usage frequency
        const confidence = Math.min(0.5 + usage.count * 0.1, 0.9)

        technologies.push({
          id: technologyId,
          name: techConfig.name,
          category: techConfig.category,
          confidence,
          source: 'commit-history',
          firstDetected: usage.firstSeen,
          lastSeen: usage.lastSeen,
          priority: techConfig.priority,
          usageScore: this.calculateCommitTechUsageScore(usage.count, commits.length),
        })
      }
    }

    return technologies
  }

  /**
   * Analyze commit message for technology keywords
   */
  private analyzeCommitMessage(message: string, config: ExternalBadgeConfig): {technologyId: string}[] {
    const indicators: {technologyId: string}[] = []
    const messageLower = message.toLowerCase()

    // Technology keywords that might appear in commit messages
    const commitKeywords = {
      typescript: ['typescript', 'ts', '.ts'],
      javascript: ['javascript', 'js', '.js'],
      react: ['react', 'jsx', '.jsx', 'component'],
      vue: ['vue', 'vuejs', '.vue'],
      svelte: ['svelte', '.svelte'],
      angular: ['angular', '@angular'],
      nodejs: ['node', 'nodejs', 'npm', 'package.json'],
      docker: ['docker', 'dockerfile', 'container'],
      python: ['python', '.py', 'pip'],
      go: ['golang', 'go', '.go'],
      rust: ['rust', 'cargo', '.rs'],
      css: ['css', '.css', 'styles'],
      scss: ['scss', 'sass', '.scss'],
      webpack: ['webpack', 'webpack.config'],
      vite: ['vite', 'vite.config'],
      eslint: ['eslint', '.eslintrc'],
      prettier: ['prettier', '.prettierrc'],
      jest: ['jest', 'test', 'spec'],
      vitest: ['vitest'],
    }

    for (const [technologyId, keywords] of Object.entries(commitKeywords)) {
      if (
        keywords.some(keyword => messageLower.includes(keyword)) && // Check if technology exists in config
        config.technologies[technologyId]
      ) {
        indicators.push({technologyId})
      }
    }

    return indicators
  }

  /**
   * Analyze commit files for technology indicators
   */
  private analyzeCommitFiles(
    commit: RestEndpointMethodTypes['repos']['listCommits']['response']['data'][0],
    config: ExternalBadgeConfig,
  ): {technologyId: string}[] {
    const indicators: {technologyId: string}[] = []

    // If files are available in commit data, analyze file extensions
    if (commit.files && Array.isArray(commit.files)) {
      const fileExtensions = commit.files
        .map(file => {
          const filename = file.filename ?? ''
          const lastDot = filename.lastIndexOf('.')
          return lastDot > 0 ? filename.slice(Math.max(0, lastDot)) : ''
        })
        .filter(ext => ext.length > 0)

      // Map file extensions to technologies
      const extensionMap = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'react',
        '.vue': 'vue',
        '.svelte': 'svelte',
        '.py': 'python',
        '.go': 'go',
        '.rs': 'rust',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'scss',
        '.html': 'html',
        '.json': 'json',
        '.md': 'markdown',
        '.yml': 'yaml',
        '.yaml': 'yaml',
      }

      for (const ext of fileExtensions) {
        const technologyId = extensionMap[ext as keyof typeof extensionMap]
        if (technologyId && config.technologies[technologyId]) {
          indicators.push({technologyId})
        }
      }
    }

    return indicators
  }

  /**
   * Calculate usage score for commit history analysis
   */
  private calculateCommitHistoryUsageScore(usage: {
    repoCount: number
    totalCommits: number
    confidence: number
  }): number {
    let score = 0.4 // Base score for commit history detection

    // Boost for usage across multiple repositories
    score += Math.min(usage.repoCount * 0.1, 0.3)

    // Boost for frequent commits
    score += Math.min(usage.totalCommits * 0.02, 0.2)

    // Factor in confidence
    score += usage.confidence * 0.1

    return Math.min(score, 1)
  }

  /**
   * Calculate usage score for individual commit technology detection
   */
  private calculateCommitTechUsageScore(occurrences: number, totalCommits: number): number {
    const frequency = totalCommits > 0 ? occurrences / totalCommits : 0
    return Math.min(0.3 + frequency * 0.5, 0.8) // Lower max for commit-based detection
  }
}
