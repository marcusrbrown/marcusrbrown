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

## Profile-Specific Patterns

- **Automated updates**: `.github/workflows/update-profile.yaml` runs every 6 hours to refresh profile content
- **Badge management**: `BADGES.md` contains technology badges using specific shield.io formats
- **Sponsorship content**: `SPONSORME.md` contains GitHub sponsorship pitch with specific formatting
- **AI integration**: `.ai/**` directories are excluded from markdown linting for AI tooling compatibility

## File Structure

- `templates/`: Contains template files for generating profile content
- `.github/actions/setup/`: Custom pnpm setup action with optimized caching
- **External dependencies**: Most configurations live in external packages, keep this pattern

## GitHub Actions

- **Custom setup action**: Use `.github/actions/setup` for consistent pnpm environment
- **Concurrency groups**: All workflows use proper concurrency control to prevent conflicts
- **Scheduled updates**: Profile updates happen automatically, manual changes to README.md may be overwritten
