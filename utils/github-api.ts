import type {SponsorConfig} from '@/types/sponsors.ts'

import process from 'node:process'
import {graphql} from '@octokit/graphql'
import {Octokit} from '@octokit/rest'

/**
 * GitHub API client configuration and utilities
 */
export class GitHubApiClient {
  private octokit: Octokit
  private graphqlClient: typeof graphql
  private config: SponsorConfig

  constructor(config: SponsorConfig) {
    this.config = config
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'marcusrbrown-profile-updater/1.0.0',
      timeouts: {
        request: config.timeoutMs,
      },
      throttle: {
        onRateLimit: (retryAfter: number, options: any, _octokit: Octokit, retryCount: number) => {
          console.warn(
            `Request quota exhausted for request ${options.method} ${options.url}. Retrying after ${retryAfter} seconds. Retry count: ${retryCount}`,
          )
          if (retryCount < 3) {
            console.warn(`Retrying after ${retryAfter} seconds!`)
            return true
          }
          return false
        },
        onSecondaryRateLimit: (retryAfter: number, options: any, _octokit: Octokit) => {
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
   * Create GitHub API client from environment variables
   */
  static fromEnvironment(): GitHubApiClient {
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_SPONSORS_TOKEN
    if (!githubToken) {
      throw new Error('GitHub token not found. Please set GITHUB_TOKEN or GITHUB_SPONSORS_TOKEN environment variable.')
    }

    const username = process.env.GITHUB_USERNAME || 'marcusrbrown'

    const config: SponsorConfig = {
      username,
      githubToken,
      includePrivate: process.env.INCLUDE_PRIVATE_SPONSORS === 'true',
      cacheDurationMs: Number.parseInt(process.env.CACHE_DURATION_MS || '300000', 10), // 5 minutes default
      timeoutMs: Number.parseInt(process.env.API_TIMEOUT_MS || '10000', 10), // 10 seconds default
    }

    return new GitHubApiClient(config)
  }
}

/**
 * Helper function to create a GitHub API client with default configuration
 */
export function createGitHubClient(config?: Partial<SponsorConfig>): GitHubApiClient {
  const defaultConfig: SponsorConfig = {
    username: 'marcusrbrown',
    githubToken: process.env.GITHUB_TOKEN || process.env.GITHUB_SPONSORS_TOKEN || '',
    includePrivate: false,
    cacheDurationMs: 300000, // 5 minutes
    timeoutMs: 10000, // 10 seconds
  }

  if (!defaultConfig.githubToken) {
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
