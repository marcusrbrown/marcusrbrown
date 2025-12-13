---
goal: Refactor profile-analytics.ts with GitHub-native analytics, CLI infrastructure, and production robustness
version: 1.0
date_created: 2025-12-12
last_updated: 2025-12-12
owner: marcusrbrown
status: 'In Progress'
tags:
  - refactor
  - analytics
  - github-api
  - cli
---

# Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

Refactor [scripts/profile-analytics.ts](../../scripts/profile-analytics.ts) to replace external analytics services with GitHub-native REST traffic APIs and GraphQL contributions data. Implement standard CLI infrastructure (--verbose, --help, --force-refresh, --dry-run), add `withRetry` wrapper with exponential backoff, establish multi-layer cache system, fix Logger consistency, add graceful degradation, and create comprehensive tests.

## 1. Requirements & Constraints

- **REQ-001**: Replace `countapi.xyz` profile views with aggregated GitHub repository traffic data via REST API
- **REQ-002**: Implement `getContributionCount()` using GitHub GraphQL `ContributionsCollection` API
- **REQ-003**: Add traffic analytics methods to `GitHubApiClient`: views, clones, referrers, paths
- **REQ-004**: Implement standard CLI flags: `--verbose`, `--help`, `--force-refresh`, `--dry-run`
- **REQ-005**: Add `withRetry<T>()` wrapper with exponential backoff (3 retries, 1s-10s delay)
- **REQ-006**: Implement multi-layer cache: primary → backup → fallback data
- **REQ-007**: Use `Logger.getInstance()` consistently, remove all `console.*` calls
- **REQ-008**: Create comprehensive test suite in `__tests__/profile-analytics.test.ts`
- **SEC-001**: GitHub traffic endpoints require repository `admin:read` scope - document in help text
- **CON-001**: Traffic API only available for repos where user has push access
- **CON-002**: Traffic data limited to last 14 days per GitHub API constraints
- **CON-003**: GraphQL contributions API requires date range parameters (from/to)
- **GUD-001**: Follow patterns from [fetch-sponsors-data.ts](../../scripts/fetch-sponsors-data.ts) for CLI and cache structure
- **GUD-002**: Follow [self-explanatory-code-commenting.instructions.md] - minimal comments explaining WHY not WHAT
- **PAT-001**: Use exponential backoff formula: `delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)`
- **PAT-002**: Exit code 0 on success, 1 on failure for CI/CD integration

## 2. Implementation Steps

### Implementation Phase 1: Extend GitHubApiClient with Analytics Methods

- GOAL-001: Add GitHub REST traffic and GraphQL contributions methods to [utils/github-api.ts](../../utils/github-api.ts)

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Add `getRepositoryViews(owner: string, repo: string, per?: 'day' \| 'week'): Promise<TrafficViews>` method using `GET /repos/{owner}/{repo}/traffic/views` | ✅ | 2025-12-12 |
| TASK-002 | Add `getRepositoryClones(owner: string, repo: string, per?: 'day' \| 'week'): Promise<TrafficClones>` method using `GET /repos/{owner}/{repo}/traffic/clones` | ✅ | 2025-12-12 |
| TASK-003 | Add `getTopReferrers(owner: string, repo: string): Promise<Referrer[]>` method using `GET /repos/{owner}/{repo}/traffic/popular/referrers` | ✅ | 2025-12-12 |
| TASK-004 | Add `getTopPaths(owner: string, repo: string): Promise<ContentPath[]>` method using `GET /repos/{owner}/{repo}/traffic/popular/paths` | ✅ | 2025-12-12 |
| TASK-005 | Add `fetchUserContributions(username: string, from: string, to: string): Promise<ContributionsData>` GraphQL method using `User.contributionsCollection` query | ✅ | 2025-12-12 |
| TASK-006 | Add TypeScript interfaces for traffic/contributions response types in [types/analytics.ts](../../types/analytics.ts) | ✅ | 2025-12-12 |

### Implementation Phase 2: Add CLI Infrastructure to profile-analytics.ts

- GOAL-002: Implement standard CLI patterns matching [fetch-sponsors-data.ts](../../scripts/fetch-sponsors-data.ts) conventions

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | Add `CliOptions` interface with `verbose`, `help`, `forceRefresh`, `dryRun`, `repos`, `period` properties | ✅ | 2025-12-12 |
| TASK-008 | Implement `parseArguments(): CliOptions` function to parse `process.argv` | ✅ | 2025-12-12 |
| TASK-009 | Implement `showHelp(): void` function with usage examples and flag documentation including token scope requirements | ✅ | 2025-12-12 |
| TASK-010 | Update `main()` to use `parseArguments()`, call `showHelp()` when `--help` flag present | ✅ | 2025-12-12 |
| TASK-011 | Pass `verbose` option to `Logger.getInstance().setVerbose()` at startup | ✅ | 2025-12-12 |

### Implementation Phase 3: Implement withRetry and Update Metrics Collection

- GOAL-003: Add retry logic and replace external API calls with GitHub-native analytics

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-012 | Add constants `MAX_RETRIES = 3`, `BASE_DELAY_MS = 1000`, `MAX_DELAY_MS = 10000` | ✅ | 2025-12-12 |
| TASK-013 | Implement `withRetry<T>(operation, operationName, maxRetries): Promise<T>` with exponential backoff and Logger integration | ✅ | 2025-12-12 |
| TASK-014 | Replace `getProfileViews()` with `aggregateRepositoryViews(repos: string[]): Promise<number>` that sums traffic across specified repos using `withRetry` | ✅ | 2025-12-12 |
| TASK-015 | Replace `getContributionCount()` placeholder with implementation using `GitHubApiClient.fetchUserContributions()` wrapped in `withRetry` | ✅ | 2025-12-12 |
| TASK-016 | Wrap `collectMetrics()` API calls (`fetchUserProfile`, `getUserRepositories`) with `withRetry` | ✅ | 2025-12-12 |
| TASK-017 | Add `--repos` flag parsing to specify which repositories to aggregate traffic from (default: top 5 by stars) | ✅ | 2025-12-12 |
| TASK-018 | Add `--period` flag for contribution date range (default: 365 days) | ✅ | 2025-12-12 |

### Implementation Phase 4: Establish Multi-Layer Cache System

- GOAL-004: Create `ProfileMetricsCache` object following [fetch-sponsors-data.ts](../../scripts/fetch-sponsors-data.ts) cache patterns

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | Add `CACHE_FILE` and `BACKUP_CACHE_FILE` constants for `metrics-history.json` and `metrics-history-backup.json` | | |
| TASK-020 | Implement `ProfileMetricsCache.load(maxAgeMs): Promise<ProfileMetrics[] \| null>` with expiration checking | | |
| TASK-021 | Implement `ProfileMetricsCache.save(data): Promise<void>` with backup creation before write | | |
| TASK-022 | Implement `ProfileMetricsCache.loadBackup(): Promise<ProfileMetrics[] \| null>` as fallback | | |
| TASK-023 | Update `loadHistoricalData()` to use `ProfileMetricsCache.load()` with fallback chain: cache → backup → empty array | | |
| TASK-024 | Update `saveMetrics()` to use `ProfileMetricsCache.save()` | | |
| TASK-025 | Add `--force-refresh` flag handling to bypass cache in `loadHistoricalData()` | | |

### Implementation Phase 5: Fix Logger Usage and Error Handling

- GOAL-005: Replace all `console.*` calls with `Logger` methods and implement graceful degradation

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-026 | Replace all `console.warn/error/log` calls in `ProfileAnalytics` class with `this.logger.info/warn/error/success/debug` | | |
| TASK-027 | Update `cleanupOldData()` to log specific errors: "Could not read report directory" vs "Could not delete old file {filename}" instead of generic warning | | |
| TASK-028 | Add `--dry-run` flag handling to `saveMetrics()`, `saveReport()`, `cleanupOldData()` - log actions without writing files | | |
| TASK-029 | Update `aggregateRepositoryViews()` to handle repos where user lacks push access - log warning and skip, continue with remaining repos | | |
| TASK-030 | Ensure `main()` exits with code 0 on success, code 1 on failure | | |

### Implementation Phase 6: Create Comprehensive Test Suite

- GOAL-006: Add test coverage for all analytics functionality in [__tests__/profile-analytics.test.ts](../../__tests__/profile-analytics.test.ts)

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-031 | Create test file with Vitest imports and mock data structures for `ProfileMetrics`, `EngagementMetrics`, `TrendAnalysis` | | |
| TASK-032 | Add tests for `withRetry()`: successful operation, retry on failure, max retries exceeded | | |
| TASK-033 | Add tests for `ProfileMetricsCache`: load fresh cache, load expired cache returns null, save creates backup, loadBackup fallback | | |
| TASK-034 | Add tests for `analyzeTrends()`: growth calculations, empty historical data handling, engagement rate calculation | | |
| TASK-035 | Add tests for `generateRecommendations()`: low growth triggers recommendations, sufficient growth shows maintenance tips | | |
| TASK-036 | Add tests for CLI parsing: `--verbose`, `--help`, `--force-refresh`, `--dry-run`, `--repos`, `--period` flags | | |
| TASK-037 | Add tests for traffic aggregation: sum views across repos, handle missing repos gracefully, handle API errors | | |

## 3. Alternatives

- **ALT-001**: Use GitHub Pages analytics instead of repository traffic - rejected because this repo does not have GitHub Pages configured and traffic API provides more granular data
- **ALT-002**: Keep `countapi.xyz` as secondary data source - rejected due to unreliability and external dependency; GitHub-native data is more accurate and sustainable
- **ALT-003**: Implement custom analytics tracking via GitHub Actions artifacts - rejected as overly complex; repository traffic API provides sufficient metrics
- **ALT-004**: Use only GraphQL for all data - rejected because traffic endpoints are REST-only in GitHub API

## 4. Dependencies

- **DEP-001**: `@octokit/rest` - Already installed, provides REST API traffic endpoints
- **DEP-002**: `@octokit/graphql` - Already installed, provides GraphQL contributions queries
- **DEP-003**: `vitest` - Already installed, test runner for new test suite
- **DEP-004**: GitHub PAT with `admin:read` scope for traffic endpoints (existing `GITHUB_TOKEN` may need scope upgrade)

## 5. Files

- **FILE-001**: [utils/github-api.ts](../../utils/github-api.ts) - Add traffic and contributions methods (TASK-001 through TASK-005)
- **FILE-002**: [types/analytics.ts](../../types/analytics.ts) - New file for traffic/contributions type definitions (TASK-006)
- **FILE-003**: [scripts/profile-analytics.ts](../../scripts/profile-analytics.ts) - Main refactoring target (TASK-007 through TASK-030)
- **FILE-004**: [__tests__/profile-analytics.test.ts](../../__tests__/profile-analytics.test.ts) - New test file (TASK-031 through TASK-037)

## 6. Testing

- **TEST-001**: Unit tests for `withRetry()` function covering success, retry, and failure scenarios
- **TEST-002**: Unit tests for `ProfileMetricsCache` object covering load, save, backup, and expiration
- **TEST-003**: Unit tests for `analyzeTrends()` with various historical data scenarios
- **TEST-004**: Unit tests for `generateRecommendations()` with different metric profiles
- **TEST-005**: Unit tests for CLI argument parsing with all flag combinations
- **TEST-006**: Integration tests for traffic aggregation with mocked GitHub API responses
- **TEST-007**: Run full test suite: `pnpm test` to verify all existing tests still pass
- **TEST-008**: Manual testing: `GITHUB_TOKEN=$(gh auth token) pnpm run analytics --verbose` to verify output

## 7. Risks & Assumptions

- **RISK-001**: GitHub traffic API requires push access to repositories - may limit which repos can be tracked; mitigation: graceful degradation with logging
- **RISK-002**: Traffic data only available for last 14 days - limits historical trend analysis; mitigation: document limitation, aggregate daily to maximize data capture
- **RISK-003**: GraphQL contributions query may require specific token scopes - mitigation: test with existing token, document required scopes in help text
- **ASSUMPTION-001**: Existing `GITHUB_TOKEN` has sufficient scopes for traffic endpoints; if not, user will need to create new PAT
- **ASSUMPTION-002**: Top 5 repositories by stars are representative of overall profile engagement
- **ASSUMPTION-003**: 365-day default for contributions period provides meaningful trend data

## 8. Related Specifications / Further Reading

- [GitHub REST API: Repository Traffic](https://docs.github.com/en/rest/metrics/traffic)
- [GitHub GraphQL API: ContributionsCollection](https://docs.github.com/en/graphql/reference/objects#contributionscollection)
- [fetch-sponsors-data.ts](../../scripts/fetch-sponsors-data.ts) - Reference implementation for CLI and cache patterns
- [badge-cache-manager.ts](../../utils/badge-cache-manager.ts) - Reference implementation for cache management
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) - Repository coding standards and patterns
