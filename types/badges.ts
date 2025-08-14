// Badge automation types and interfaces

/**
 * Technology detection source types
 */
export type TechnologySource = 'package.json' | 'repository' | 'commit-history' | 'manual'

/**
 * Badge style configuration following shield.io formats
 */
export type BadgeStyle = 'flat' | 'flat-square' | 'for-the-badge' | 'plastic' | 'social'

/**
 * Technology categories for classification
 */
export type TechnologyCategory =
  | 'language'
  | 'framework'
  | 'library'
  | 'tool'
  | 'platform'
  | 'database'
  | 'cloud'
  | 'ci-cd'
  | 'testing'
  | 'build'
  | 'deployment'
  | 'monitoring'

/**
 * Technology priority levels for badge display ordering
 */
export type TechnologyPriority = 'critical' | 'high' | 'medium' | 'low'

/**
 * Individual technology detected from various sources
 */
export interface DetectedTechnology {
  /** Technology identifier (e.g., 'typescript', 'react', 'node') */
  id: string
  /** Display name for the technology */
  name: string
  /** Technology category classification */
  category: TechnologyCategory
  /** Detection confidence score (0-1) */
  confidence: number
  /** Source where technology was detected */
  source: TechnologySource
  /** Version information if available */
  version?: string
  /** When this technology was first detected */
  firstDetected: string
  /** When this technology was last seen */
  lastSeen: string
  /** Priority level for badge display */
  priority: TechnologyPriority
  /** Usage frequency/importance score */
  usageScore: number
}

/**
 * Badge configuration for shield.io generation
 */
export interface BadgeConfig {
  /** Technology identifier matching DetectedTechnology.id */
  technologyId: string
  /** Badge label text */
  label?: string
  /** Badge message/value text */
  message?: string
  /** Badge color (hex without #, or named color) */
  color?: string
  /** Logo identifier for shield.io */
  logo?: string
  /** Logo color (hex without #, or named color) */
  logoColor?: string
  /** Badge style */
  style: BadgeStyle
  /** Custom shield.io URL parameters */
  customParams?: Record<string, string>
  /** Link URL when badge is clicked */
  linkUrl?: string
  /** Link title/tooltip text */
  linkTitle?: string
  /** Badge reference identifier for markdown links */
  linkRef?: string
}

/**
 * Generated badge with all metadata
 */
export interface GeneratedBadge {
  /** Technology this badge represents */
  technology: DetectedTechnology
  /** Badge configuration used */
  config: BadgeConfig
  /** Generated shield.io URL */
  badgeUrl: string
  /** Markdown badge markup */
  markdownBadge: string
  /** Markdown reference link if applicable */
  markdownLink?: string
  /** Display priority for ordering */
  displayPriority: number
  /** When this badge was generated */
  generatedAt: string
}

/**
 * Technology detection configuration
 */
export interface TechnologyDetectionConfig {
  /** Package.json dependencies to analyze */
  analyzePackageJson: boolean
  /** GitHub repositories to analyze */
  analyzeRepositories: boolean
  /** Commit history analysis depth */
  analyzeCommitHistory: boolean
  /** Maximum commits to analyze */
  maxCommitsToAnalyze: number
  /** GitHub username for repository analysis */
  githubUsername: string
  /** GitHub token for API access */
  githubToken: string
  /** Minimum confidence threshold for inclusion */
  minConfidenceThreshold: number
  /** API timeout in milliseconds */
  timeoutMs: number
}

/**
 * Badge generation configuration
 */
export interface BadgeGenerationConfig {
  /** External badge configuration package */
  externalConfigPackage: string
  /** Default badge style */
  defaultStyle: BadgeStyle
  /** Maximum number of badges to generate */
  maxBadges: number
  /** Minimum usage score for inclusion */
  minUsageScore: number
  /** Technology categories to include */
  includedCategories: TechnologyCategory[]
  /** Technology IDs to exclude */
  excludedTechnologies: string[]
  /** Cache duration in milliseconds */
  cacheDurationMs: number
}

/**
 * Complete badge automation configuration
 */
export interface BadgeAutomationConfig {
  /** Technology detection settings */
  detection: TechnologyDetectionConfig
  /** Badge generation settings */
  generation: BadgeGenerationConfig
  /** Template processing settings */
  template: {
    /** Input template file path */
    templatePath: string
    /** Output file path */
    outputPath: string
    /** Template variable prefix */
    variablePrefix: string
  }
}

/**
 * Cache data structure for technology detection results
 */
export interface BadgeDataCache {
  /** When this cache was created */
  createdAt: string
  /** When this cache expires */
  expiresAt: string
  /** Configuration used for generation */
  config: BadgeAutomationConfig
  /** All detected technologies */
  detectedTechnologies: DetectedTechnology[]
  /** Generated badges */
  generatedBadges: GeneratedBadge[]
  /** Badge statistics */
  stats: BadgeStats
}

/**
 * Badge generation statistics and metrics
 */
export interface BadgeStats {
  /** Total technologies detected */
  totalTechnologies: number
  /** Technologies by category */
  technologiesByCategory: Record<TechnologyCategory, number>
  /** Technologies by source */
  technologiesBySource: Record<TechnologySource, number>
  /** Total badges generated */
  totalBadges: number
  /** Average confidence score */
  averageConfidence: number
  /** Detection coverage by source */
  sourcesCoverage: {
    packageJson: boolean
    repositories: boolean
    commitHistory: boolean
  }
  /** When stats were calculated */
  calculatedAt: string
}

/**
 * External badge configuration from @bfra.me/badge-config
 */
export interface ExternalBadgeConfig {
  /** Technology definitions */
  technologies: Record<
    string,
    {
      name: string
      category: TechnologyCategory
      priority: TechnologyPriority
      badge: Omit<BadgeConfig, 'technologyId'>
    }
  >
  /** Detection rules */
  detectionRules: {
    packageJson: Record<string, string[]> // dependency name -> technology IDs
    repository: Record<string, string[]> // language/topic -> technology IDs
    commitHistory: Record<string, string[]> // file pattern -> technology IDs
  }
  /** Default badge styles */
  defaults: {
    style: BadgeStyle
    colors: Record<TechnologyCategory, string>
    logoColors: Record<string, string>
  }
}

/**
 * Error types for badge automation
 */
export class BadgeAutomationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly source?: string,
  ) {
    super(message)
    this.name = 'BadgeAutomationError'
  }
}

export class TechnologyDetectionError extends BadgeAutomationError {
  constructor(message: string, source?: string) {
    super(message, 'TECHNOLOGY_DETECTION_ERROR', source)
    this.name = 'TechnologyDetectionError'
  }
}

export class BadgeGenerationError extends BadgeAutomationError {
  constructor(message: string, source?: string) {
    super(message, 'BADGE_GENERATION_ERROR', source)
    this.name = 'BadgeGenerationError'
  }
}

export class ConfigurationError extends BadgeAutomationError {
  constructor(message: string, source?: string) {
    super(message, 'CONFIGURATION_ERROR', source)
    this.name = 'ConfigurationError'
  }
}
