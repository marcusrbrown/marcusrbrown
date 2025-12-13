/**
 * GitHub Traffic and Contributions API types
 */

/**
 * Repository traffic view data
 */
export interface TrafficViews {
  count: number
  uniques: number
  views: TrafficDataPoint[]
}

/**
 * Repository clone data
 */
export interface TrafficClones {
  count: number
  uniques: number
  clones: TrafficDataPoint[]
}

/**
 * Individual traffic data point with timestamp
 */
export interface TrafficDataPoint {
  timestamp: string
  count: number
  uniques: number
}

/**
 * Top referrer source for repository traffic
 */
export interface Referrer {
  referrer: string
  count: number
  uniques: number
}

/**
 * Popular content path in repository
 */
export interface ContentPath {
  path: string
  title: string
  count: number
  uniques: number
}

/**
 * User contributions data from GitHub GraphQL API
 */
export interface ContributionsData {
  totalCommitContributions: number
  totalIssueContributions: number
  totalPullRequestContributions: number
  totalPullRequestReviewContributions: number
  totalRepositoryContributions: number
  restrictedContributionsCount: number
  contributionCalendar: ContributionCalendar
}

/**
 * Contribution calendar with weekly breakdown
 */
export interface ContributionCalendar {
  totalContributions: number
  weeks: ContributionWeek[]
}

/**
 * Weekly contribution data
 */
export interface ContributionWeek {
  contributionDays: ContributionDay[]
  firstDay: string
}

/**
 * Daily contribution data
 */
export interface ContributionDay {
  contributionCount: number
  date: string
  weekday: number
}
