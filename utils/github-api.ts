import type {ContentPath, ContributionsData, Referrer, TrafficClones, TrafficViews} from '@/types/analytics.ts'
import type {SponsorConfig} from '@/types/sponsors.ts'

import type {RestEndpointMethodTypes} from '@octokit/rest'
import process from 'node:process'
import {graphql} from '@octokit/graphql'
import {Octokit} from '@octokit/rest'

/**
 * GitHub API client configuration and utilities
 */
export class GitHubApiClient {
  private readonly octokit: Octokit
  private readonly graphqlClient: typeof graphql
  private readonly config: SponsorConfig

  constructor(config: SponsorConfig) {
    this.config = config
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'marcusrbrown-profile-updater/1.0.0',
      timeouts: {
        request: config.timeoutMs,
      },
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: {method: string; url: string},
          _octokit: Octokit,
          retryCount: number,
        ) => {
          console.warn(
            `Request quota exhausted for request ${options.method} ${options.url}. Retrying after ${retryAfter} seconds. Retry count: ${retryCount}`,
          )
          if (retryCount < 3) {
            console.warn(`Retrying after ${retryAfter} seconds!`)
            return true
          }
          return false
        },
        onSecondaryRateLimit: (retryAfter: number, options: {method: string; url: string}, _octokit: Octokit) => {
          console.warn(
            `Secondary rate limit hit for request ${options.method} ${options.url}. Retrying after ${retryAfter} seconds.`,
          )
          return true
        },
      },
    })

    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${config.githubToken}`,
      },
    })
  }

  /**
   * Create GitHubApiClient from environment variables
   */
  static fromEnvironment(): GitHubApiClient {
    const githubToken = process.env.GITHUB_TOKEN ?? process.env.GITHUB_SPONSORS_TOKEN ?? ''
    if (githubToken.length === 0) {
      throw new Error('GitHub token not found. Please set GITHUB_TOKEN or GITHUB_SPONSORS_TOKEN environment variable.')
    }

    const username = process.env.GITHUB_USERNAME ?? 'marcusrbrown'

    return new GitHubApiClient({
      githubToken,
      username,
      includePrivate: Boolean(process.env.INCLUDE_PRIVATE_SPONSORS ?? 'false'),
      cacheDurationMs: Number.parseInt(process.env.CACHE_DURATION_MS ?? '300000', 10), // 5 minutes default
      timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS ?? '10000', 10), // 10 seconds default
    })
  }

  /**
   * Fetch sponsors data from GitHub Sponsors GraphQL API
   */
  async fetchSponsors() {
    try {
      console.warn(`Fetching sponsors data for user: ${this.config.username}`)

      const query = `
        query($login: String!) {
          user(login: $login) {
            sponsors(first: 100) {
              totalCount
              edges {
                node {
                  ... on User {
                    login
                    name
                    avatarUrl
                    url
                  }
                  ... on Organization {
                    login
                    name
                    avatarUrl
                    url
                  }
                }
              }
            }
            monthlyEstimatedSponsorsIncomeInCents
            sponsorsListing {
              tiers(first: 10, orderBy: {field: MONTHLY_PRICE_IN_CENTS, direction: ASC}) {
                edges {
                  node {
                    id
                    monthlyPriceInCents
                    name
                    description
                    isOneTime
                  }
                }
              }
            }
          }
        }
      `

      const response: {
        user: {
          sponsors: {
            totalCount: number
            edges: {
              node: {
                login: string
                name: string | null
                avatarUrl: string
                url: string
              }
            }[]
          }
          monthlyEstimatedSponsorsIncomeInCents: number
          sponsorsListing: {
            tiers: {
              edges: {
                node: {
                  id: string
                  monthlyPriceInCents: number
                  name: string
                  description: string
                  isOneTime: boolean
                }
              }[]
            }
          }
        }
      } = await this.graphqlClient(query, {
        login: this.config.username,
      })

      console.warn(`Successfully fetched GraphQL sponsors data`)
      return response.user
    } catch (error) {
      console.error('Error fetching sponsors data:', error)
      throw new Error(`Failed to fetch sponsors: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Fetch user profile information
   */
  async fetchUserProfile(username: string = this.config.username) {
    try {
      console.warn(`Fetching user profile for: ${username}`)

      const response = await this.octokit.rest.users.getByUsername({
        username,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching user profile for ${username}:`, error)
      throw new Error(`Failed to fetch user profile: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Test API connectivity and authentication
   */
  async testConnection() {
    try {
      console.warn('Testing GitHub API connection...')

      const response = await this.octokit.rest.users.getAuthenticated()
      console.warn(`Successfully authenticated as: ${response.data.login}`)

      return {
        success: true,
        username: response.data.login,
        scopes: response.headers['x-oauth-scopes']?.split(', ') || [],
      }
    } catch (error) {
      console.error('GitHub API connection test failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Fetch user repositories for technology detection
   */
  async getUserRepositories(username: string = this.config.username) {
    try {
      console.warn(`Fetching repositories for user: ${username}`)

      const response = await this.octokit.rest.repos.listForUser({
        username,
        type: 'owner',
        sort: 'updated',
        per_page: 100,
      })

      console.warn(`Successfully fetched ${response.data.length} repositories`)
      return response.data
    } catch (error) {
      console.error(`Error fetching repositories for ${username}:`, error)
      throw new Error(`Failed to fetch repositories: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get language statistics for a repository
   */
  async getRepositoryLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.rest.repos.listLanguages({
        owner,
        repo,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching languages for ${owner}/${repo}:`, error)
      throw new Error(
        `Failed to fetch repository languages: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Get repository contents (for structure analysis)
   */
  async getRepositoryContents(owner: string, repo: string, path = ''): Promise<{name?: string}[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      })

      // Handle both single file and directory responses
      return Array.isArray(response.data) ? response.data : [response.data]
    } catch {
      // Return empty array if path doesn't exist or is inaccessible
      return []
    }
  }

  /**
   * Get repository commits for commit history analysis
   */
  async getRepositoryCommits(
    owner: string,
    repo: string,
    maxCommits = 100,
  ): Promise<RestEndpointMethodTypes['repos']['listCommits']['response']['data']> {
    try {
      const response = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: Math.min(maxCommits, 100), // GitHub API limit
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching commits for ${owner}/${repo}:`, error)
      throw new Error(`Failed to fetch repository commits: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get rate limit information
   */
  async getRateLimit() {
    try {
      const response = await this.octokit.rest.rateLimit.get()
      return response.data
    } catch (error) {
      console.error('Error fetching rate limit:', error)
      throw new Error(`Failed to fetch rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get repository traffic views for the last 14 days
   * Requires push access to the repository
   */
  async getRepositoryViews(owner: string, repo: string, per: 'day' | 'week' = 'day'): Promise<TrafficViews> {
    try {
      const response = await this.octokit.rest.repos.getViews({
        owner,
        repo,
        per,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching views for ${owner}/${repo}:`, error)
      throw new Error(`Failed to fetch repository views: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get repository clone statistics for the last 14 days
   * Requires push access to the repository
   */
  async getRepositoryClones(owner: string, repo: string, per: 'day' | 'week' = 'day'): Promise<TrafficClones> {
    try {
      const response = await this.octokit.rest.repos.getClones({
        owner,
        repo,
        per,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching clones for ${owner}/${repo}:`, error)
      throw new Error(`Failed to fetch repository clones: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get top 10 referrers for repository over the last 14 days
   * Requires push access to the repository
   */
  async getTopReferrers(owner: string, repo: string): Promise<Referrer[]> {
    try {
      const response = await this.octokit.rest.repos.getTopReferrers({
        owner,
        repo,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching top referrers for ${owner}/${repo}:`, error)
      throw new Error(`Failed to fetch top referrers: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get top 10 popular content paths for repository over the last 14 days
   * Requires push access to the repository
   */
  async getTopPaths(owner: string, repo: string): Promise<ContentPath[]> {
    try {
      const response = await this.octokit.rest.repos.getTopPaths({
        owner,
        repo,
      })

      return response.data
    } catch (error) {
      console.error(`Error fetching top paths for ${owner}/${repo}:`, error)
      throw new Error(`Failed to fetch top paths: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Fetch user contributions data for a specified date range using GraphQL API
   */
  async fetchUserContributions(username: string, from: string, to: string): Promise<ContributionsData> {
    try {
      console.warn(`Fetching contributions for user: ${username} from ${from} to ${to}`)

      const query = `
        query($login: String!, $from: DateTime!, $to: DateTime!) {
          user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
              totalCommitContributions
              totalIssueContributions
              totalPullRequestContributions
              totalPullRequestReviewContributions
              totalRepositoryContributions
              restrictedContributionsCount
              contributionCalendar {
                totalContributions
                weeks {
                  firstDay
                  contributionDays {
                    contributionCount
                    date
                    weekday
                  }
                }
              }
            }
          }
        }
      `

      const response: {
        user: {
          contributionsCollection: ContributionsData
        }
      } = await this.graphqlClient(query, {
        login: username,
        from,
        to,
      })

      console.warn(`Successfully fetched contributions data`)
      return response.user.contributionsCollection
    } catch (error) {
      console.error('Error fetching user contributions:', error)
      throw new Error(`Failed to fetch user contributions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Helper function to create a GitHub API client with default configuration
 */
export function createGitHubClient(config?: Partial<SponsorConfig>): GitHubApiClient {
  const defaultConfig: SponsorConfig = {
    username: 'marcusrbrown',
    githubToken: process.env.GITHUB_TOKEN ?? process.env.GITHUB_SPONSORS_TOKEN ?? '',
    includePrivate: false,
    cacheDurationMs: 300000, // 5 minutes
    timeoutMs: 10000, // 10 seconds
  }

  if (defaultConfig.githubToken.length === 0) {
    throw new Error('GitHub token is required. Please provide it in config or set GITHUB_TOKEN environment variable.')
  }

  return new GitHubApiClient({...defaultConfig, ...config})
}

/**
 * Validate GitHub token has required scopes for sponsors API
 */
export async function validateSponsorScopes(client: GitHubApiClient): Promise<boolean> {
  try {
    const connectionTest = await client.testConnection()
    if (!connectionTest.success) {
      console.error('GitHub API connection failed:', connectionTest.error)
      return false
    }

    const scopes = connectionTest.scopes || []
    const requiredScopes = ['sponsors:read', 'user:read']

    const hasRequiredScopes = requiredScopes.every(
      scope => scopes.includes(scope) || scopes.includes('repo') || scopes.includes('admin:org'),
    )

    if (!hasRequiredScopes) {
      console.error(`Missing required scopes. Required: ${requiredScopes.join(', ')}, Available: ${scopes.join(', ')}`)
      return false
    }

    console.warn('GitHub token has sufficient scopes for sponsors API')
    return true
  } catch (error) {
    console.error('Error validating scopes:', error)
    return false
  }
}
