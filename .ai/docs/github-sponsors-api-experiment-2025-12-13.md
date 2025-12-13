# GitHub Sponsors API Experiment - createSponsorsListing Test

**Date**: December 13, 2025  
**Experimenter**: Marcus R. Brown  
**Purpose**: Test whether `createSponsorsListing` mutation can update existing sponsors profile bios  
**Related**: [Issue #635](https://github.com/marcusrbrown/marcusrbrown/issues/635), [Implementation Plan](../plan/feature-sponsors-bio-sync-1.md)

---

## Experiment Overview

This experiment tests the hypothesis that GitHub's `createSponsorsListing` GraphQL mutation might be capable of updating existing sponsors profile descriptions, despite documentation suggesting it's only for profile creation.

## Methodology

### 1. Initial State Verification

**Query**: Retrieve current sponsors listing
```graphql
query {
  viewer {
    login
    sponsorsListing {
      id
      fullDescription
      shortDescription
      name
      slug
    }
  }
}
```

**Result**: ✅ Successfully retrieved existing profile
```json
{
  "data": {
    "viewer": {
      "login": "marcusrbrown",
      "sponsorsListing": {
        "id": "MDE1OlNwb25zb3JzTGlzdGluZzE1NzA0",
        "fullDescription": "<!--markdownlint-disable-->\n### 👋🏽\n#### Thanks for reading!...",
        "shortDescription": "👋🏽 I'm Marcus and I love contributing to Open Source!...",
        "name": "sponsors-marcusrbrown",
        "slug": "sponsors-marcusrbrown"
      }
    }
  }
}
```

### 2. Schema Investigation

**Query**: Examine `createSponsorsListing` input parameters
```graphql
query {
  __type(name: "CreateSponsorsListingInput") {
    name
    inputFields {
      name
      type { name kind }
      description
    }
  }
}
```

**Result**: ✅ Schema retrieved successfully

**Available Input Fields**:
- `clientMutationId`: String (optional) - Client mutation identifier
- `sponsorableLogin`: String (optional) - Organization username to create profile for
- `fiscalHostLogin`: String (optional) - Fiscal host organization username
- `fiscallyHostedProjectProfileUrl`: String (optional) - Profile URL on fiscal host website
- `billingCountryOrRegionCode`: SponsorsCountryOrRegionCode (required without fiscal host)
- `residenceCountryOrRegionCode`: SponsorsCountryOrRegionCode (required for individual)
- `contactEmail`: String (optional) - Contact email for profile
- **`fullDescription`**: String (optional) - **Main profile description (GitHub-flavored Markdown)**

**Key Finding**: `fullDescription` parameter exists and accepts Markdown, suggesting it's the field for bio content.

### 3. Authentication Requirements

**Initial Attempt**: Failed with insufficient scopes error
```json
{
  "errors": [{
    "type": "INSUFFICIENT_SCOPES",
    "message": "Your token has not been granted the required scopes to execute this query. The 'createSponsorsListing' field requires one of the following scopes: ['user', 'admin:org']"
  }]
}
```

**Resolution**: ✅ Refreshed GitHub CLI authentication with `user` scope
```bash
gh auth refresh -s user
```

### 4. Update Attempt

**Mutation**: Attempt to update existing profile via `createSponsorsListing`
```graphql
mutation {
  createSponsorsListing(input: {
    fullDescription: "# 🧪 Experimental Update Test\n\nThis is a controlled experiment to test if `createSponsorsListing` can update an existing GitHub Sponsors profile.\n\n**Test Date**: 2025-12-13\n**Purpose**: Verify API capabilities for profile bio synchronization feature\n\n---\n\n_If you see this message, the experiment succeeded!_"
  }) {
    sponsorsListing {
      id
      fullDescription
      name
      slug
    }
  }
}
```

**Result**: ❌ **MUTATION REJECTED**
```json
{
  "data": {
    "createSponsorsListing": null
  },
  "errors": [{
    "type": "UNPROCESSABLE",
    "path": ["createSponsorsListing"],
    "locations": [{"line": 3, "column": 3}],
    "message": "marcusrbrown already has a GitHub Sponsors profile"
  }]
}
```

### 5. Post-Experiment Verification

**Query**: Verify profile remained unchanged
```bash
gh api graphql -f query='query { viewer { sponsorsListing { id fullDescription } } }'
```

**Result**: ✅ Profile unchanged - still contains original content
- ID: `MDE1OlNwb25zb3JzTGlzdGluZzE1NzA0` (same)
- Content: Original markdown preserved (starts with "<!--markdownlint-disable-->")

### 6. Available Sponsors Mutations Survey

**Query**: List all sponsor-related mutations in GraphQL schema
```graphql
query {
  __schema {
    mutationType {
      fields {
        name
        description
      }
    }
  }
}
```

**Result**: ✅ Complete list of available mutations:

| Mutation | Description | Update Capability |
|----------|-------------|-------------------|
| `cancelSponsorship` | Cancel an active sponsorship | ❌ Not for bio |
| **`createSponsorsListing`** | Create a GitHub Sponsors profile | ❌ **Create only** |
| `createSponsorsTier` | Create a new payment tier | ❌ Not for bio |
| `createSponsorship` | Start/reactivate sponsorship | ❌ Not for bio |
| `createSponsorships` | Bulk sponsorship creation | ❌ Not for bio |
| `publishSponsorsTier` | Publish draft tier | ❌ Not for bio |
| `retireSponsorsTier` | Retire payment tier | ❌ Not for bio |
| `updatePatreonSponsorability` | Toggle Patreon integration | ❌ Not for bio |
| `updateSponsorshipPreferences` | Change sponsorship visibility/email | ❌ Not for bio |

**Critical Finding**: ❌ **NO `updateSponsorsListing` mutation exists**

---

## Experiment Conclusions

### Primary Findings

1. **✅ CONFIRMED**: `createSponsorsListing` is **strictly for profile creation only**
   - Mutation explicitly rejects attempts to use it on existing profiles
   - Error message: "marcusrbrown already has a GitHub Sponsors profile"
   - No override parameters or flags to force update behavior

2. **✅ CONFIRMED**: No `updateSponsorsListing` mutation exists in GitHub's GraphQL API
   - Comprehensive schema search found 9 sponsor-related mutations
   - None provide update capability for profile descriptions/bios
   - This is not an oversight but an intentional API design limitation

3. **✅ CONFIRMED**: `fullDescription` field exists but cannot be updated programmatically
   - Field accepts GitHub-flavored Markdown
   - Can only be set during initial profile creation
   - No API mechanism to modify after creation

4. **✅ CONFIRMED**: Authentication scope requirements
   - `user` or `admin:org` scope required for `createSponsorsListing`
   - Even with proper scopes, update attempts are rejected
   - Scope sufficiency is not the blocker (API limitation is)

### API Design Analysis

GitHub's Sponsors API appears intentionally designed to:
- Allow programmatic profile **creation** (one-time setup)
- **Prevent** programmatic profile **modification** (requires manual updates)
- Separate listing management (create/delete) from content updates (manual only)

This design likely serves to:
1. Prevent automated spam or inappropriate content updates
2. Ensure profile owners manually review and approve all bio changes
3. Maintain quality control over public-facing sponsors profiles
4. Reduce API abuse vectors for sensitive financial/donation profiles

### Implications for Feature Implementation

**Original Feature Goal**: Automate synchronization of SPONSORME.md → GitHub Sponsors bio

**Blocker Confirmed**: 
- ❌ Cannot be implemented with current GitHub API
- ❌ `createSponsorsListing` does not support updates
- ❌ No alternative API endpoints exist
- ❌ No undocumented or hidden update mechanisms found

**Status**: Feature implementation **BLOCKED** pending GitHub API improvements

---

## Experimental Evidence Summary

| Test | Expected Result | Actual Result | Status |
|------|----------------|---------------|--------|
| Retrieve existing listing | Get current profile data | ✅ Success | PASS |
| Schema inspection | Find update parameters | ✅ Found `fullDescription` field | PASS |
| Authentication with user scope | Enable mutation access | ✅ Access granted | PASS |
| Attempt profile update | Update bio content | ❌ Rejected: "already has profile" | **FAIL** |
| Verify no schema changes | Profile remains unchanged | ✅ Original content preserved | PASS |
| Search for update mutation | Find `updateSponsorsListing` | ❌ Does not exist | **FAIL** |

**Overall Result**: ❌ **Experiment confirms API limitation - automated bio updates NOT possible**

---

## Recommendations

### Immediate Actions
1. ✅ Update [Implementation Plan](../plan/feature-sponsors-bio-sync-1.md) status to "Blocked"
2. ✅ Document findings in [Issue #635](https://github.com/marcusrbrown/marcusrbrown/issues/635)
3. ⏭️ Implement **Alternative Strategy A**: Manual update workflow with generated content
4. ⏭️ Create content generation scripts that output bio-ready text

### Long-term Strategy
1. Submit GitHub feature request for `updateSponsorsListing` mutation
2. Monitor GitHub API changelog for future additions
3. Revisit implementation plan if API support becomes available
4. Consider community engagement to gauge demand for this feature

### Alternative Approaches
- **Strategy A** (Recommended): Generate bio content to `.cache/sponsors-bio-generated.txt` for manual copy-paste
- **Strategy B**: Submit GitHub feature request and monitor API updates
- **Strategy C**: Investigate GitHub CLI for additional capabilities (unlikely)
- **Strategy D**: Browser automation (rejected - fragile, TOS violation)

---

## References

- [GitHub Issue #635 - API Research Findings](https://github.com/marcusrbrown/marcusrbrown/issues/635)
- [Implementation Plan - Sponsors Bio Sync](../plan/feature-sponsors-bio-sync-1.md)
- [GitHub GraphQL API - createSponsorsListing](https://docs.github.com/en/graphql/reference/mutations#createsponsorsListing)
- [GitHub Sponsors Documentation](https://docs.github.com/en/sponsors)

---

## Experiment Artifacts

### Files Generated
- `/tmp/sponsors-listing-query.json` - Initial listing retrieval
- `/tmp/create-sponsors-listing-schema.json` - Input schema documentation
- `/tmp/create-sponsors-listing-attempt.json` - Insufficient scopes error
- `/tmp/create-sponsors-listing-test.json` - Update rejection error
- `.ai/docs/github-sponsors-api-experiment-2025-12-13.md` - This document

### Commands Used
```bash
# Authentication
gh auth status
gh auth refresh -s user

# Query existing listing
gh api graphql -f query='query { viewer { login sponsorsListing { id fullDescription shortDescription name slug } } }'

# Schema inspection
gh api graphql -f query='query { __type(name: "CreateSponsorsListingInput") { name inputFields { name type { name kind } description } } }'

# Update attempt
gh api graphql -f query='mutation { createSponsorsListing(input: { fullDescription: "..." }) { sponsorsListing { id fullDescription name slug } } }'

# Mutation survey
gh api graphql -f query='query { __schema { mutationType { fields { name description } } } }' --jq '.data.__schema.mutationType.fields[] | select(.name | contains("sponsor"))'
```

---

**Experiment Conducted By**: Marcus R. Brown (@marcusrbrown)  
**Date**: December 13, 2025  
**Conclusion**: ❌ **Automated sponsors bio updates are NOT possible with GitHub's current API**
