import process from 'node:process'

import {createGitHubClient} from '@/utils/github-api.js'
import {describe, expect, it} from 'vitest'

/**
 * Test GitHub API client configuration
 */
describe('GitHub API Client', () => {
  it('should create client with default configuration', () => {
    // Set environment variable for test
    process.env.GITHUB_TOKEN = 'test-token'

    const client = createGitHubClient()
    expect(client).toBeDefined()
    expect(client).toBeInstanceOf(Object)

    // Clean up
    delete process.env.GITHUB_TOKEN
  })

  it('should throw error when no GitHub token is provided', () => {
    // Ensure no token is set
    delete process.env.GITHUB_TOKEN
    delete process.env.GITHUB_SPONSORS_TOKEN

    expect(() => createGitHubClient()).toThrow('GitHub token is required')
  })

  it('should accept partial configuration override', () => {
    process.env.GITHUB_TOKEN = 'test-token'

    const client = createGitHubClient({
      username: 'customuser',
      timeoutMs: 5000,
    })

    expect(client).toBeDefined()

    // Clean up
    delete process.env.GITHUB_TOKEN
  })
})
