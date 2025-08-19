import {promises as fs} from 'node:fs'
import {join} from 'node:path'
import process from 'node:process'
import type {
  DetectedTechnology,
  ExternalBadgeConfig,
  TechnologyDetectionConfig,
  TechnologyPriority,
  TechnologySource,
} from '@/types/badges.ts'
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
      const repositories = await this.githubClient.getUserRepositories(this.config.githubUsername)
      const technologies: DetectedTechnology[] = []
      const externalConfig = await this.loadExternalConfig()
      const fileExtensionCounts = new Map<
        string,
        {count: number; firstSeen: string; lastSeen: string; repos: Set<string>}
      >()

      console.warn(`📝 Analyzing commits across ${repositories.length} repositories...`)

      for (const repo of repositories.slice(0, 10)) {
        // Limit to avoid rate limits
        if (repo.fork || repo.archived) continue // Skip forks and archived repos

        try {
          const commits = await this.githubClient.getRepositoryCommits(repo.full_name, {
            per_page: Math.min(this.config.maxCommitsToAnalyze, 30),
          })

          for (const commit of commits) {
            if (commit.commit.tree === null || commit.commit.tree === undefined) continue

            try {
              // Get commit files to analyze extensions
              const commitDetail = await this.githubClient.getCommit(repo.full_name, commit.sha)

              if (commitDetail.files !== null && commitDetail.files !== undefined) {
                for (const file of commitDetail.files) {
                  if (file.filename === null || file.filename === undefined || file.filename.length === 0) continue

                  const extension = this.getFileExtension(file.filename)
                  if (extension !== null && extension.length > 0) {
                    const commitDate = commit.commit.committer?.date ?? new Date().toISOString()
                    const existing = fileExtensionCounts.get(extension) || {
                      count: 0,
                      firstSeen: commitDate,
                      lastSeen: commitDate,
                      repos: new Set<string>(),
                    }

                    existing.count += file.changes || 1
                    existing.repos.add(repo.full_name)
                    if (commit.commit.committer?.date !== null && commit.commit.committer?.date !== undefined) {
                      if (commit.commit.committer.date < existing.firstSeen) {
                        existing.firstSeen = commit.commit.committer.date
                      }
                      if (commit.commit.committer.date > existing.lastSeen) {
                        existing.lastSeen = commit.commit.committer.date
                      }
                    }

                    fileExtensionCounts.set(extension, existing)
                  }
                }
              }
            } catch {
              // Skip individual commit errors to avoid breaking the entire analysis
              continue
            }
          }
        } catch (repoError) {
          console.warn(`⚠️ Failed to analyze commits for ${repo.full_name}: ${(repoError as Error).message}`)
          continue
        }
      }

      // Convert file extensions to technologies
      for (const [extension, data] of fileExtensionCounts.entries()) {
        const technologyIds = this.findTechnologyByFileExtension(extension, externalConfig)

        for (const technologyId of technologyIds) {
          const techConfig = externalConfig.technologies[technologyId]
          if (techConfig) {
            // Calculate confidence based on usage across repositories and commit frequency
            const repoCount = data.repos.size
            const changeCount = data.count
            const confidence = Math.min(0.6 + repoCount * 0.1 + Math.log10(changeCount + 1) * 0.1, 0.9)

            technologies.push({
              id: technologyId,
              name: techConfig.name,
              category: techConfig.category,
              confidence,
              source: 'commit-history',
              firstDetected: data.firstSeen,
              lastSeen: data.lastSeen,
              priority: techConfig.priority,
              usageScore: this.calculateCommitUsageScore(data.count, repoCount),
            })
          }
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
      const maxAllowed = maxPerCategory[tech.category] || 1

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
      const aCategoryPriority = categoryOrder[a.category] || 0
      const bCategoryPriority = categoryOrder[b.category] || 0

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
   * Find technology IDs by file extension
   */
  private findTechnologyByFileExtension(extension: string, config: ExternalBadgeConfig): string[] {
    const matchingTechnologies: string[] = []

    for (const [pattern, technologyIds] of Object.entries(config.detectionRules.commitHistory)) {
      if (extension === pattern || pattern.includes(extension)) {
        matchingTechnologies.push(...technologyIds)
      }
    }

    return matchingTechnologies
  }

  /**
   * Extract file extension from filename
   */
  private getFileExtension(filename: string): string | null {
    const parts = filename.split('.')
    if (parts.length < 2) return null

    const extension = `.${parts.at(-1)}`

    // Handle special cases for known technology file patterns
    if (filename.endsWith('.tsx')) return '.tsx'
    if (filename.endsWith('.jsx')) return '.jsx'
    if (filename.endsWith('.ts')) return '.ts'
    if (filename.endsWith('.js')) return '.js'
    if (filename.endsWith('.svelte')) return '.svelte'
    if (filename.endsWith('.vue')) return '.vue'
    if (filename.endsWith('.py')) return '.py'
    if (filename.endsWith('.go')) return '.go'
    if (filename.endsWith('.rs')) return '.rs'
    if (filename.endsWith('.php')) return '.php'
    if (filename.endsWith('.rb')) return '.rb'
    if (filename.endsWith('.java')) return '.java'
    if (filename.endsWith('.cpp') || filename.endsWith('.cxx') || filename.endsWith('.cc')) return '.cpp'
    if (filename.endsWith('.c')) return '.c'
    if (filename.endsWith('.cs')) return '.cs'
    if (filename.endsWith('.dart')) return '.dart'
    if (filename.endsWith('.kt') || filename.endsWith('.kts')) return '.kt'
    if (filename.endsWith('.swift')) return '.swift'
    if (filename.endsWith('.scala')) return '.scala'
    if (filename.endsWith('.r')) return '.r'
    if (filename.endsWith('.m')) return '.m'
    if (filename.endsWith('.lua')) return '.lua'

    return extension
  }

  /**
   * Calculate usage score for commit-based technology detection
   */
  private calculateCommitUsageScore(changeCount: number, repoCount: number): number {
    // Base score
    let score = 0.4

    // Boost for high change count (logarithmic scaling)
    score += Math.min(Math.log10(changeCount + 1) * 0.1, 0.3)

    // Boost for being used across multiple repositories
    score += Math.min(repoCount * 0.05, 0.3)

    return Math.min(score, 1)
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
}
