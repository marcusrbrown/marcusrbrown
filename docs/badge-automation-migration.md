# Badge Automation Migration Guide

This guide walks you through migrating from manual badge management to the automated badge system implemented in Phase 5 of the Badge Automation project.

## Overview

The automated badge system:

- **Detects technologies** from package.json dependencies, GitHub repositories, and commit history
- **Generates consistent badges** using shield.io with standardized formatting
- **Updates automatically** every 6 hours via GitHub Actions workflow
- **Caches data** to minimize API calls and improve performance
- **Provides fallback** mechanisms for reliability

## Prerequisites

### Required Environment Variables

1. **GitHub Personal Access Token**

   ```bash
   export GITHUB_TOKEN="your_github_token_here"
   ```

   - Required scopes: `repo` (for repository analysis)
   - Used for GitHub API access to analyze repositories and commit history

2. **GitHub Username** (optional)

   ```bash
   export GITHUB_USERNAME="your_username"
   ```

   - Defaults to `marcusrbrown` if not specified
   - Used to determine which repositories to analyze

### Dependencies

The automation system requires:

- `@bfra.me/badge-config` package for external badge configurations
- `@octokit/rest` and `@octokit/types` for GitHub API integration
- Node.js 18+ for TypeScript execution

## Migration Steps

### Step 1: Backup Current BADGES.md

Before migrating, save your current badge configuration:

```bash
cp BADGES.md BADGES.md.backup
```

### Step 2: Test Badge Detection

Run the system in dry-run mode to preview what will be generated:

```bash
# Test technology detection only
pnpm badges:fetch --dry-run --verbose

# Test full badge generation without writing files
pnpm badges:update --dry-run --verbose
```

Review the output to ensure:

- Technologies are detected correctly
- Badge configurations match your preferences
- No critical technologies are missing

### Step 3: Create Badge Template

The automation system uses `templates/BADGES.tpl.md` as the source template. Create this file with your desired structure:

```markdown
<!-- templates/BADGES.tpl.md -->
# Technology Badges

## Current Technologies

{{{BADGE_CONTENT}}}

## Reference Links

{{{LINK_REFERENCES}}}

<!-- This file is auto-generated. Do not edit BADGES.md directly. -->
```

**Template Variables:**

- `{{{BADGE_CONTENT}}}` - Replaced with generated badge markdown
- `{{{LINK_REFERENCES}}}` - Replaced with reference links for badges

### Step 4: Configure Custom Badge Overrides

If you need custom badge styling, modify the `getCustomBadgeOverrides()` function in `scripts/update-badges.ts`:

```javascript
function getCustomBadgeOverrides() {
  const overrides = {}

  // Example: Custom TypeScript badge
  overrides.typescript = {
    style: 'for-the-badge',
    color: '#007ACC',
    logoColor: 'white',
  }

  // Example: Add custom badge for specific technology
  overrides.raspberrypi = {
    label: 'Raspberry Pi',
    style: 'for-the-badge',
    color: '#C51A4A',
    logo: 'Raspberry-Pi',
  }

  return overrides
}
```

### Step 5: Test Badge Generation

Generate badges without writing to files:

```bash
# Force refresh to get latest data
pnpm badges:update --force-refresh --dry-run --verbose
```

Compare the output with your current `BADGES.md` to ensure quality.

### Step 6: Enable Automation

Once satisfied with the output, run the automation for real:

```bash
# Generate and save badges
pnpm badges:update --force-refresh --verbose
```

This will:

1. Detect technologies from all configured sources
2. Generate badge configurations
3. Create shield.io badge URLs
4. Process the template
5. Write the final `BADGES.md`

### Step 7: Verify Workflow Integration

The automation is already integrated into `.github/workflows/update-profile.yaml`. The workflow will:

1. **Fetch badge data** via `pnpm badges:fetch`
2. **Update badge template** via `pnpm badges:update`
3. **Commit changes** automatically every 6 hours

Verify the workflow runs correctly by checking recent Actions runs.

## Configuration Options

### Technology Detection

The system analyzes:

#### Package.json Dependencies

- `dependencies` and `devDependencies`
- Scripts and engines configuration
- Confidence based on dependency type

#### GitHub Repositories

- Repository languages and frameworks
- Repository topics and descriptions
- File structure analysis

#### Commit History

- Recent commit messages and file changes
- Technology usage patterns over time
- Confidence based on recency and frequency

### Badge Filtering

Technologies are included based on:

- **Confidence threshold**: Minimum 0.7 (70%)
- **Usage score**: Minimum 0.5 (50%)
- **Category inclusion**: Configurable category filter
- **Technology exclusion**: Explicit exclusion list

### Cache Management

The system implements multi-layer caching:

1. **Primary cache**: `.cache/badge-data.json` (24-hour expiration)
2. **Backup cache**: `.cache/badge-data-backup.json` (fallback)
3. **Fallback data**: Generated minimal badges on complete failure

## Troubleshooting

### Technology Not Detected

If an expected technology isn't appearing:

1. **Check confidence scores** with `--verbose` flag
2. **Verify package.json dependencies** include the technology
3. **Add manual override** in `getCustomBadgeOverrides()`
4. **Check exclusion list** in badge configuration

### Badge Styling Issues

For badge appearance problems:

1. **Review custom overrides** in the update script
2. **Check shield.io documentation** for valid parameters
3. **Test individual badge URLs** manually
4. **Verify color codes** are valid hex values

### API Rate Limiting

If you encounter rate limiting:

1. **Check GitHub token permissions** and rate limits
2. **Reduce analysis scope** by limiting commits analyzed
3. **Use cache more aggressively** by extending cache duration
4. **Implement retry delays** in API calls

### Cache Issues

For cache-related problems:

1. **Clear cache** by deleting `.cache/badge-*.json` files
2. **Force refresh** with `--force-refresh` flag
3. **Check cache permissions** and directory access
4. **Verify cache expiration** logic

## Rollback Process

If you need to revert to manual badge management:

### Step 1: Restore Manual BADGES.md

```bash
# Restore from backup
cp BADGES.md.backup BADGES.md

# Or recreate manually
rm BADGES.md
# Edit manually with your preferred badges
```

### Step 2: Remove Workflow Integration

Edit `.github/workflows/update-profile.yaml` and remove these lines:

```yaml
- name: Fetch badge data
  run: pnpm badges:fetch
  env:
    GITHUB_TOKEN: ${{ secrets.GH_SPONSORS_TOKEN }}
  continue-on-error: true

- name: Update BADGES.md from template
  run: pnpm badges:update
  continue-on-error: true
```

### Step 3: Remove Template File

```bash
rm templates/BADGES.tpl.md
```

## Maintenance

### Regular Tasks

**Monthly:**

- Review detected technologies for accuracy
- Update custom badge overrides as needed
- Check badge display on GitHub profile

**Quarterly:**

- Update `@bfra.me/badge-config` package
- Review and update technology exclusion list
- Optimize detection algorithms based on new patterns

**As Needed:**

- Add custom overrides for new technologies
- Adjust confidence thresholds based on results
- Update badge styling to match design changes

### Monitoring

Watch for:

- **API rate limiting** in workflow logs
- **Technology detection accuracy** in generated badges
- **Cache hit rates** for performance optimization
- **Badge URL failures** due to shield.io changes

## Getting Help

If you encounter issues during migration:

1. **Run with verbose logging**: Add `--verbose` to all commands
2. **Check workflow logs**: Review GitHub Actions execution details
3. **Test incrementally**: Use `--dry-run` for safe testing
4. **Review documentation**: Consult shield.io and GitHub API docs
5. **Examine error messages**: Most issues include helpful error context

## Advanced Configuration

### Custom Technology Detection

To add detection for technologies not automatically identified:

1. **Extend package.json analysis** in `badge-detector.ts`
2. **Add commit message patterns** for technology identification
3. **Include repository topic analysis** for framework detection
4. **Implement custom scoring algorithms** for confidence calculation

### External Configuration

The system uses `@bfra.me/badge-config` for badge definitions. To modify:

1. **Update external package** with new badge configurations
2. **Override locally** using custom overrides function
3. **Submit contributions** to the badge configuration package
4. **Test thoroughly** before deploying changes

---

## Summary

The automated badge system provides:

- ✅ **Consistent badge formatting** across all technologies
- ✅ **Automatic technology detection** from multiple sources
- ✅ **Reliable caching and fallback** mechanisms
- ✅ **Integrated workflow automation** every 6 hours
- ✅ **Comprehensive testing and validation** tools

Follow this guide carefully to ensure a smooth migration from manual to automated badge management.
