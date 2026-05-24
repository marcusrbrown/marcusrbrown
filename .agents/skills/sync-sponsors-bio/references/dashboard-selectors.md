# GitHub Sponsors Dashboard — Known Selectors

Reference for the DOM selectors used by `scripts/sync.ts`. Update this after any GitHub UI change that requires touching `TEXTAREA_SELECTOR` in the script.

## Current Selectors (last verified: 2026-05-24)

- **`#sponsors_profile_full_description`** — the "Introduction" / `fullDescription` textarea. Rails form helper convention: `<model>_<attribute>`. Stable since ≥2024. This is the field the sync script writes to.
- **"Update profile" submit input** — `<input type="submit" value="Update profile">` inside the same form as `#sponsors_profile_full_description`. The script locates it by `value` match (NOT by index) because the form contains at least 3 submitters: `Load more` (pagination), `Save` (different sub-section), and `Update profile` (the one we want). v0.2+ clicks this autonomously after exact-equality verification of the textarea content. Selector logic returns structured diagnostics on failure: `FORM_NOT_FOUND`, `SUBMIT_NOT_FOUND`, `SUBMIT_AMBIGUOUS:N`, `SUBMIT_DISABLED`, or `SUBMIT_CLICKED:<label>`.

## Accessibility Tree Names (for reference only — don't lookup by text)

- "Introduction Introduction" — the a11y name for the Introduction textarea (yes, the word is doubled — GitHub a11y quirk, brittle to lookup by text)

**Always prefer CSS selectors over a11y refs.** The `@eN` refs change every snapshot and the a11y names can be doubled/quirky.

## Out-of-Scope Fields (for v0.1)

These fields exist in the same dashboard form but the current sync skill does NOT touch them:

- **`#sponsors_profile_short_description`** (likely) — short description. Separate field with own formatting rules (1-line) — different transform from SPONSORME.md.
- **`#sponsors_profile_contact_email`** (likely) — contact email. Not in SPONSORME.md; rarely changes.
- **Sponsor goals / tiers** — different form sections, out of bio sync scope.

## Verification Procedure

When updating selectors after a UI change:

1. Run the script manually until it fails at the textarea lookup
2. Open the dashboard at `https://github.com/sponsors/marcusrbrown/dashboard/profile` in a regular browser
3. Right-click the "Introduction" field → Inspect Element
4. Note the `id` attribute on the `<textarea>` element
5. Update `TEXTAREA_SELECTOR` in `scripts/sync.ts`
6. Update the "Current Selectors" section above with the new value + today's date

## History

- **2026-05-24** — `#sponsors_profile_full_description` confirmed via @designer's RED-phase baseline test (the accessibility tree returned `@e61 "Introduction Introduction"` and DOM inspection confirmed the underlying `id`). Also confirmed `<input type="submit" value="Update profile">` lives in the same form alongside `Load more` and `Save` submit buttons.
- **2025-12-13** — Original 2025-12-13 sponsors API experiment did NOT inspect the DOM (only the GraphQL schema)
