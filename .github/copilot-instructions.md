# GitHub Copilot Instructions

## Repository Purpose

Marcus R. Brown's GitHub profile repository featuring automated sponsor tracking, badge automation, A/B testing frameworks, and content generation. Updates every 6 hours via scheduled workflows.

## Quick Reference

| Task | Command |
|------|---------|
| Initial setup | `pnpm bootstrap` |
| Run tests | `pnpm test` |
| Fix all linting | `pnpm fix` |
| Fetch sponsor data | `GITHUB_TOKEN=$(gh auth token) pnpm sponsors:fetch` |
| Update sponsors | `pnpm sponsors:update` |
| Fetch badges | `pnpm badges:fetch` |
| Update badges | `pnpm badges:update` |

## Package Management

**pnpm only** - enforced via `preinstall` script. Never use npm or yarn.

```bash
pnpm bootstrap    # Initial setup (not pnpm install)
pnpm fix          # Runs fix:markdown then fix:eslint
pnpm lint         # Runs markdownlint-cli2, tsc --noEmit, and eslint
```

## External Configuration Pattern

All tooling configs extend from `@bfra.me/*` packages - keep configs minimal:

- **ESLint**: Extends `@bfra.me/eslint-config` in [../eslint.config.ts](../eslint.config.ts)
- **Prettier**: References `@bfra.me/prettier-config/120-proof` in package.json
- **TypeScript**: Extends `@bfra.me/tsconfig` in [../tsconfig.json](../tsconfig.json)
- **Badges**: Uses `@bfra.me/badge-config` for technology badge configuration

## Template System (Critical)

**Never edit generated `.md` files directly** - edit templates instead:

| Template | Generated File |
|----------|----------------|
| `templates/SPONSORME.tpl.md` | `SPONSORME.md` |
| `templates/BADGES.tpl.md` | `BADGES.md` |
| `templates/README.tpl.md` | `README.md` |

Template variants for A/B testing live in `templates/variants/`.

## Path Aliasing

Use `@/` imports for root-relative paths throughout the codebase:

```typescript
import {SponsorData} from '@/types/sponsors.ts'
import {GitHubApiClient} from '@/utils/github-api.ts'
import {logger} from '@/utils/logger.ts'
```

Configured in [../tsconfig.json](../tsconfig.json) and [../vitest.config.ts](../vitest.config.ts).

## Script Patterns

### Logger Usage

Use the singleton `Logger` class from [../utils/logger.ts](../utils/logger.ts):

```typescript
import {logger} from '@/utils/logger.ts'

logger.info('Processing...')    // 💡 [timestamp] Processing...
logger.success('Done!')         // ✅ [timestamp] Done!
logger.warn('Warning')          // ⚠️ [timestamp] Warning
logger.error('Failed', error)   // ❌ [timestamp] Failed
logger.debug('Details')         // 🔍 [timestamp] Details (verbose only)
```

### Standard CLI Flags

Scripts support: `--verbose`, `--help`, `--force-refresh`, `--dry-run`, `--fetch-only`

### Error Handling

Use retry logic with exponential backoff (3 retries, 1s-10s delay):

```typescript
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10000
```

Cache hierarchy: primary cache → backup cache → fallback data

## Type Definitions

Key interfaces in [../types/sponsors.ts](../types/sponsors.ts):

- `ProcessedSponsor` - Individual sponsor with tier classification
- `SponsorStats` - Aggregate metrics and tier breakdowns
- `SponsorTier` - `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'`

Key interfaces in [../types/badges.ts](../types/badges.ts):

- `DetectedTechnology` - Technology with confidence score and source
- `BadgeConfig` - Shield.io badge configuration
- `TechnologyCategory` - Classification (language, framework, tool, etc.)

## Testing

Vitest with `@/` path alias in Node environment:

```bash
pnpm test           # Run once
pnpm test:watch     # Watch mode
pnpm test:ui        # Interactive UI
```

Tests in `__tests__/` directory match source file names.

## GitHub Actions

- **Custom setup**: Use `.github/actions/setup` for consistent pnpm environment
- **Concurrency**: All workflows use `concurrency` groups to prevent conflicts
- **Schedule**: Profile updates run every 6 hours via `.github/workflows/update-profile.yaml`

## Key Utilities

| Utility | Purpose |
|---------|---------|
| [../utils/github-api.ts](../utils/github-api.ts) | Octokit REST + GraphQL client with rate limiting |
| [../utils/logger.ts](../utils/logger.ts) | Singleton logger with emoji prefixes |
| [../utils/badge-detector.ts](../utils/badge-detector.ts) | Technology detection from repos and packages |
| [../utils/badge-cache-manager.ts](../utils/badge-cache-manager.ts) | Badge data caching with fallbacks |

## AI Content Strategy

`.ai/docs/` contains content strategy research (excluded from linting):

- Sponsor personas and messaging hierarchy
- Value propositions and emotional story arcs
- Copywriting guidelines for sponsorship content
