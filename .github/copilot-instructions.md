# GitHub Copilot Instructions

## Repository Purpose

This is Marcus R. Brown's GitHub profile repository that automatically updates his profile page every 6 hours via scheduled workflows. It serves both as a professional showcase and a development environment with strict tooling standards.

## Package Management

- **pnpm only**: Package manager is enforced via `preinstall` script - never use npm or yarn
- **Workspace setup**: Uses pnpm workspace with specific overrides in `pnpm-workspace.yaml`
- **Bootstrap command**: Use `pnpm bootstrap` for initial setup, not `pnpm install`

## Configuration Strategy

- **External configs**: All tooling configs extend from `@bfra.me/*` packages rather than inline configuration
- **ESLint**: Simply exports from `@bfra.me/eslint-config` in `eslint.config.ts`
- **Prettier**: References `@bfra.me/prettier-config/120-proof` in package.json
- **TypeScript**: Extends `@bfra.me/tsconfig` configurations

## Development Workflow

- **Composite commands**: Use `pnpm fix` which runs both `fix:markdown` and `fix:eslint` in sequence
- **Pre-commit hooks**: Automatically run via simple-git-hooks and lint-staged
- **Lint command**: Runs both markdownlint-cli2 and eslint together
- **Template system**: README.md is generated from `templates/README.tpl.md` - edit templates, not the main README
- **Template pipeline**: Templates → Scripts → Generated files (`SPONSORME.tpl.md` → `update-sponsors.ts` → `SPONSORME.md`)
- **Key scripts**: `pnpm sponsors:fetch` (data collection) → `pnpm sponsors:update` (template processing)

## CLI Script Patterns

- **Common flags**: All scripts support `--verbose` for detailed output and `--help` for usage info
- **Error handling**: Scripts use consistent retry logic with exponential backoff (3 retries, 1s-10s delay)
- **Cache-first approach**: Check cache before API calls, graceful fallback to backup cache on failures
- **Exit codes**: Scripts exit with code 1 on failures, 0 on success for CI/CD integration

## Profile-Specific Patterns

- **Automated updates**: `.github/workflows/update-profile.yaml` runs every 6 hours to refresh profile content
- **Badge management**: `BADGES.md` contains technology badges using specific shield.io formats
- **Sponsorship content**: `SPONSORME.md` contains GitHub sponsorship pitch with specific formatting
- **AI integration**: `.ai/**` directories are excluded from markdown linting for AI tooling compatibility

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
- **Logging conventions**: Use `console.warn()` for info, `console.error()` for failures with emoji prefixes (✅❌📦🚀)

## GitHub Actions

- **Custom setup action**: Use `.github/actions/setup` for consistent pnpm environment
- **Concurrency groups**: All workflows use proper concurrency control to prevent conflicts
- **Scheduled updates**: Profile updates happen automatically, manual changes to README.md may be overwritten
