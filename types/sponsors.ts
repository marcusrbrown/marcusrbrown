// GitHub Sponsors API types and interfaces

/**
 * Individual sponsor information from GitHub GraphQL API
 */
export interface GitHubSponsorNode {
  login: string
  name: string | null
  avatarUrl: string
  url: string
}

/**
 * Sponsor tier classification based on monthly contribution amount
 */
export type SponsorTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

/**
 * Processed sponsor data for template rendering
 */
export interface ProcessedSponsor {
  /** GitHub username */
  login: string
  /** Display name or username fallback */
  displayName: string
  /** Profile URL */
  profileUrl: string
  /** Avatar URL */
  avatarUrl: string
  /** Monthly contribution amount in cents */
  monthlyAmountCents: number
  /** Monthly contribution amount in dollars */
  monthlyAmountDollars: number
  /** Assigned tier based on contribution amount */
  tier: SponsorTier
  /** Date when sponsorship started */
  createdAt: string
  /** Whether sponsor allows public visibility */
  isPublic: boolean
}

/**
 * Sponsor statistics and metrics
 */
export interface SponsorStats {
  /** Total number of active sponsors */
  totalSponsors: number
  /** Total monthly recurring revenue in cents */
  totalMonthlyAmountCents: number
  /** Total monthly recurring revenue in dollars */
  totalMonthlyAmountDollars: number
  /** Breakdown by tier */
  tierBreakdown: Record<
    SponsorTier,
    {
      count: number
      totalAmountCents: number
      totalAmountDollars: number
    }
  >
  /** Date when stats were last updated */
  lastUpdated: string
}

/**
 * Funding goal configuration
 */
export interface FundingGoal {
  /** Goal identifier */
  id: string
  /** Goal title/name */
  title: string
  /** Goal description */
  description: string
  /** Target amount in dollars */
  targetAmountDollars: number
  /** Current progress percentage (0-100) */
  progressPercentage: number
  /** Whether goal is currently active */
  isActive: boolean
  /** Priority order for display */
  priority: number
}

/**
 * Complete sponsor data for template processing
 */
export interface SponsorData {
  /** Processed list of sponsors */
  sponsors: ProcessedSponsor[]
  /** Aggregated statistics */
  stats: SponsorStats
  /** Active funding goals */
  goals: FundingGoal[]
  /** When data was fetched */
  fetchedAt: string
  /** Whether data fetch was successful */
  success: boolean
  /** Error message if fetch failed */
  error?: string
}

/**
 * Conversion event types for performance tracking
 */
export interface ConversionEvent {
  /** Event type identifier */
  type: 'profile_view' | 'sponsor_acquired' | 'sponsor_lost' | 'content_updated' | 'cta_clicked'
  /** Event timestamp */
  timestamp: string
  /** Additional event data */
  data?: {
    count?: number
    value?: number
    source?: string
    sponsors?: string[]
    [key: string]: any
  }
}

/**
 * Conversion metrics for performance analysis
 */
export interface ConversionMetrics {
  /** Analysis period description */
  period: string
  /** Period start date */
  startDate: string
  /** Period end date */
  endDate: string
  /** Conversion rate percentage */
  conversionRate: number
  /** Total tracked events */
  totalEvents: number
  /** Number of sponsor acquisitions */
  sponsorAcquisitions: number
  /** Number of profile views */
  profileViews: number
  /** Total new funding acquired */
  totalNewFunding: number
  /** Average sponsor contribution value */
  averageSponsorValue: number
  /** Growth rate percentage */
  growthRate: number
  /** Breakdown of events by type */
  eventBreakdown: Record<string, number>
}

/**
 * Sponsor acquisition tracking data
 */
export interface SponsorAcquisitionData {
  /** Date of data point */
  date: string
  /** Total sponsor count */
  totalSponsors: number
  /** Number of new sponsors */
  newSponsorsCount: number
  /** Number of lost sponsors */
  lostSponsorsCount: number
  /** Net change in sponsors */
  netSponsorChange: number
  /** Total monthly funding amount */
  totalMonthlyFunding: number
  /** Change in funding amount */
  fundingChange: number
  /** Details of new sponsors */
  newSponsors: ProcessedSponsor[]
  /** Details of lost sponsors */
  lostSponsors: ProcessedSponsor[]
}

/**
 * Performance report for sponsor pitch optimization
 */
export interface PerformanceReport {
  /** Report generation timestamp */
  generatedAt: string
  /** Conversion metrics */
  metrics: ConversionMetrics
  /** Growth trends */
  trends: {
    sponsorGrowth: 'up' | 'down' | 'stable'
    fundingGrowth: 'up' | 'down' | 'stable'
  }
  /** Current state snapshot */
  currentState: {
    totalSponsors: number
    totalFunding: number
  }
  /** Content performance analysis */
  contentPerformance: Record<string, any>
  /** Optimization recommendations */
  recommendations: string[]
}

/**
 * Configuration for sponsor data fetching
 */
export interface SponsorConfig {
  /** GitHub username to fetch sponsors for */
  username: string
  /** GitHub personal access token with sponsors:read scope */
  githubToken: string
  /** Whether to include private sponsors */
  includePrivate: boolean
  /** Cache duration in milliseconds */
  cacheDurationMs: number
  /** API request timeout in milliseconds */
  timeoutMs: number
}

/**
 * Tier classification thresholds in dollars per month
 */
export const TIER_THRESHOLDS: Record<SponsorTier, {min: number; max?: number}> = {
  bronze: {min: 1, max: 4.99},
  silver: {min: 5, max: 9.99},
  gold: {min: 10, max: 24.99},
  platinum: {min: 25, max: 99.99},
  diamond: {min: 100},
} as const

/**
 * Default funding goals configuration
 */
export const DEFAULT_FUNDING_GOALS: Omit<FundingGoal, 'id'>[] = [
  {
    title: 'Coffee Fund',
    description: 'Support my daily coding fuel ☕',
    targetAmountDollars: 50,
    progressPercentage: 0,
    isActive: true,
    priority: 1,
  },
  {
    title: 'Open Source Maintenance',
    description: 'Dedicated time for maintaining and improving open source projects',
    targetAmountDollars: 200,
    progressPercentage: 0,
    isActive: true,
    priority: 2,
  },
  {
    title: 'Development Tools & Services',
    description: 'Premium tools and cloud services for better development experience',
    targetAmountDollars: 100,
    progressPercentage: 0,
    isActive: true,
    priority: 3,
  },
] as const
