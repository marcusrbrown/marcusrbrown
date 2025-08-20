# GitHub Copilot Instructions

## Repository Purpose

This is Marcus R. Brown's GitHub profile repository featuring automated content generation, A/B testing frameworks, badge automation, and sponsorship tracking. It updates every 6 hours via scheduled workflows and serves as both a professional showcase and an advanced development environment with strict quality standards.

## Package Management

- **pnpm only**: Package manager is enforced via `preinstall` script - never use npm or yarn
- **Workspace setup**: Uses pnpm workspace with specific overrides in `pnpm-workspace.yaml`
- **Bootstrap command**: Use `pnpm bootstrap` for initial setup, not `pnpm install`

## Configuration Strategy

- **External configs**: All tooling configs extend from `@bfra.me/*` packages rather than inline configuration
- **ESLint**: Simply exports from `@bfra.me/eslint-config` in `eslint.config.ts`
- **Prettier**: References `@bfra.me/prettier-config/120-proof` in package.json
- **TypeScript**: Extends `@bfra.me/tsconfig` configurations
- **Badge configs**: Technology badges use `@bfra.me/badge-config` for external configuration

## Development Workflow

- **Composite commands**: Use `pnpm fix` which runs both `fix:markdown` and `fix:eslint` in sequence
- **Pre-commit hooks**: Automatically run via simple-git-hooks and lint-staged
- **Lint command**: Runs both markdownlint-cli2 and eslint together
- **Testing**: Use `pnpm test` (Vitest with `@/` alias for root imports)
- **Template system**: All `.md` files generated from `templates/*.tpl.md` - edit templates, not the generated files
- **Template pipeline**: Templates → Scripts → Generated files (e.g., `SPONSORME.tpl.md` → `update-sponsors.ts` → `SPONSORME.md`)
- **Key workflows**: `pnpm sponsors:fetch` → `pnpm sponsors:update` and `pnpm badges:fetch` → `pnpm badges:update`

## CLI Script Patterns

- **Standard flags**: All scripts support `--verbose`, `--help`, `--force-refresh`, `--dry-run`, and `--fetch-only` where applicable
- **Emoji logging**: Use Logger class with emoji prefixes (✅❌📦🚀💡⚠️🔍) for consistent output
- **Error handling**: Scripts use `withRetry()` with exponential backoff (3 retries, 1s-10s delay)
- **Cache-first approach**: Check cache before API calls, graceful fallback to backup cache on failures
- **Exit codes**: Scripts exit with code 1 on failures, 0 on success for CI/CD integration
- **Path aliasing**: Use `@/` imports for root-relative paths (configured in vitest.config.ts)

## Automation Systems

### Badge Automation
- **Badge detection**: `BadgeDetector` scans package.json, repos, and commit history for technologies
- **Badge generation**: `update-badges.ts` processes `BADGES.tpl.md` with detected tech badges
- **Cache management**: `BadgeDataCacheManager` handles performance optimization and fallbacks
- **Commands**: `pnpm badges:fetch` (detection only) → `pnpm badges:update` (full generation)

### A/B Testing Framework
- **Content optimization**: `ABTestingFramework` manages content variant testing
- **CLI interface**: `pnpm ab-test create-sponsor-test|start|stop|status` for managing tests
- **Performance tracking**: `content-performance-tracking.ts` monitors conversion metrics
- **Mobile testing**: `mobile-responsiveness-tester.ts` validates cross-device compatibility
- **Template variants**: Store test variants in `templates/variants/` directory

### Content Strategy
- **AI-driven approach**: `.ai/docs/` contains research-backed content frameworks and persona analysis
- **Professional positioning**: Content strategy matrices for different career stages and roles
- **Messaging hierarchy**: Value proposition frameworks and emotional story arcs
- **Template system**: Support for multiple variants (`SPONSORME-benefits.tpl.md`, `SPONSORME-urgency.tpl.md`)

## Profile-Specific Patterns

- **Automated updates**: `.github/workflows/update-profile.yaml` runs every 6 hours to refresh profile content
- **Badge management**: `BADGES.md` contains technology badges using specific shield.io formats
- **Sponsorship content**: `SPONSORME.md` contains GitHub sponsorship pitch with specific formatting
- **AI integration**: `.ai/**` directories are excluded from markdown linting for AI tooling compatibility
- **Template variants**: Support A/B testing with multiple template versions for conversion optimization

## Testing Infrastructure

- **Test runner**: Vitest with `@/` path alias for root imports and Node environment
- **Test commands**: `pnpm test` (run once), `pnpm test:watch` (watch mode), `pnpm test:ui` (UI interface)
- **Coverage areas**: Badge automation, GitHub API utilities, logging system, sponsor data processing
- **File structure**: Tests in `__tests__/` directory matching source file names

## GitHub Sponsors Integration

- **Sponsor data fetching**: `scripts/fetch-sponsors-data.ts` implements comprehensive GitHub Sponsors API integration
- **Testing command**: Use `GITHUB_TOKEN=$(gh auth token) pnpm sponsors:fetch` for testing (requires `gh` CLI)
- **Caching system**: Sponsor data is cached in `.cache/sponsors-data.json` to reduce API calls (5-minute default)
- **Multi-layer cache**: Primary cache + backup cache + fallback data for maximum reliability
- **Tier classification**: Automatically classifies sponsors into bronze/silver/gold/platinum/diamond tiers
- **Funding goals**: Tracks progress against predefined funding targets with percentage calculations
- **Impact metrics**: Generates comprehensive statistics including total funding, sponsor counts, and tier breakdowns
- **Error handling**: Robust retry logic with exponential backoff and graceful fallback to cached data
- **CLI modes**: Supports `--verbose` for detailed JSON output and `--force-refresh` to bypass cache
- **Data pipeline**: API fetch → tier processing → stats calculation → cache storage → template processing

## File Structure

- `templates/`: Contains template files for generating profile content
- `scripts/`: TypeScript automation scripts for sponsor data processing and profile updates
- `types/`: TypeScript type definitions for sponsor data structures
- `utils/`: Shared utilities including GitHub API client
- `.cache/`: Generated sponsor data cache (gitignored)
- `.github/actions/setup/`: Custom pnpm setup action with optimized caching
- **External dependencies**: Most configurations live in external packages, keep this pattern

## Error Handling Patterns

- **Retry mechanism**: All API calls use `withRetry()` with exponential backoff (1s→3s→9s delays)
- **Graceful degradation**: Scripts fall back to backup cache, then fallback data on failures
- **Cache backup strategy**: Primary cache → backup cache → generated fallback with error context
- **Logging conventions**: Use Logger class with emoji prefixes (✅❌📦🚀💡⚠️🔍) for consistent output

## GitHub Actions

- **Custom setup action**: Use `.github/actions/setup` for consistent pnpm environment
- **Concurrency groups**: All workflows use proper concurrency control to prevent conflicts
- **Scheduled updates**: Profile updates happen automatically, manual changes to README.md may be overwritten
