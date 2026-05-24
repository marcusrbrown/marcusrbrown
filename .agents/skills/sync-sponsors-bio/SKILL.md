---
name: sync-sponsors-bio
description: Use when SPONSORME.md changes and the public GitHub Sponsors profile bio (the "Introduction" field at github.com/sponsors/marcusrbrown) is now out of sync. GitHub's API has no updateSponsorsListing mutation, so this skill drives an authenticated headless browser session (cookies persisted to ~/.config/agent-browser-states/github.json) to paste the markdown into the dashboard textarea, click "Update profile", and verify the save via GraphQL. Fully autonomous + headless by default; pass --dry-run to fill without submitting.
license: MIT
metadata:
  author: marcusrbrown
  version: "0.2"
  origin: ".ai/plan/feature-sponsors-bio-sync-1.md (Blocked → solved via authenticated browser automation with persisted state)"
allowed-tools: Bash, Read, agent-browser
---

# Sync Sponsors Bio

## Overview

GitHub's API does **not** expose an `updateSponsorsListing` mutation — only `createSponsorsListing` (which rejects existing profiles with "marcusrbrown already has a GitHub Sponsors profile"). Verified by experiment 2025-12-13 and reconfirmed 2026-05-24.

This skill works around that gap by driving the GitHub Sponsors dashboard form headlessly via `agent-browser`, using GitHub session cookies persisted to a JSON file. The skill:

- **Runs fully headless** by default (no visible browser window).
- **Authenticates from a persisted state file** that survives Chrome For Testing process death — no interactive re-login is required on every run.
- **Submits autonomously** — `SPONSORME.md` is the canonical source of truth; the script pastes it, clicks "Update profile", and polls GraphQL until the live bio matches.

Marcus's account, Marcus's content, Marcus's choice to automate the publish step. The TOS concern that applies to bulk-scraping or rate-limit gaming does not apply to a single user publishing their own bio from their own content with their own credentials.

## When to Use

- After editing `templates/SPONSORME.tpl.md` and regenerating `SPONSORME.md`
- After Fro Bot's autoheal report flags drift between `SPONSORME.md` and the live sponsors profile
- Periodically (every 1-2 months) to keep messaging current
- After major sponsor pitch revisions

## When NOT to Use

- For other GitHub Sponsors profiles you don't own — auth state is scoped to the logged-in user

## Prerequisites

- `agent-browser` ≥ 0.27.0 installed (`which agent-browser`). The skill uses `eval --stdin`, `--state` (cookie/storage persistence), and `state save`/`state load` — all available in 0.27.0+. Verify with `agent-browser eval --help | grep -- --stdin`.
- `gh` CLI installed and authenticated (used for pre-flight idempotence check + post-save verification via GraphQL).
- One-time GitHub auth state saved to `~/.config/agent-browser-states/github.json` (one-time setup below; override with `SPONSORS_BIO_STATE_PATH`).
- `SPONSORME.md` exists and is current (run `pnpm sponsors:update` first if unsure).

## Workflow

### Step 1: One-time auth state setup

Do this exactly once per machine, or whenever GitHub invalidates the saved cookies (typically weeks/months later).

```bash
# Kill any existing daemon first (--headed is silently ignored if a daemon is already running)
agent-browser close --all

# Launch headed Chrome For Testing at github.com/login
agent-browser --engine chrome --headed open https://github.com/login
```

**Log in manually** in the Chrome For Testing window that pops up — handles 2FA, SSO, OAuth, security keys, passkeys, whatever flow you prefer. Wait until you're fully landed on github.com as your logged-in self.

Then save the authenticated state to disk:

```bash
mkdir -p ~/.config/agent-browser-states
agent-browser state save ~/.config/agent-browser-states/github.json
```

You should see `✓ State saved to /Users/.../github.json`. Inspect the file — it must contain `user_session` and `__Host-user_session_same_site` cookies; if those are missing, the login flow didn't complete and you need to retry.

You can now `agent-browser close --all` and even quit Chrome For Testing entirely — the state survives in the JSON file.

### Step 2: Run the sync script

From the repo root:

```bash
pnpm sponsors:bio:sync
```

That's it. The script:

1. Verifies prerequisites: `agent-browser`, `gh auth status`, state file exists.
2. Reads `SPONSORME.md` and runs sanity checks (min 500 bytes, no unresolved template tokens like `{{`, `<%`, `TODO_`).
3. **Pre-flight idempotence:** Queries GitHub GraphQL for the live `sponsorsListing.fullDescription`. If it already matches the source (normalized), exits 0 without touching the browser. (This is why dirty unsaved browser state from prior failures can never cause silent no-ops.)
4. Bootstraps an agent-browser daemon with `--state ~/.config/agent-browser-states/github.json`, navigates to `https://github.com/sponsors/marcusrbrown/dashboard/profile`.
5. Verifies the dashboard loaded (not redirected to `/login`, title isn't "Page not found"). If session is dead, prints clear re-auth instructions and exits 1.
6. Locates the bio textarea via stable selector `#sponsors_profile_full_description`.
7. Saves the existing dashboard content to `.cache/sponsors-bio.before.md` (audit trail only — NOT used for the idempotence decision).
8. Fills the textarea via `nativeSetter` + `input`/`change` dispatch (wrapped in IIFE so `const` declarations don't collide across eval calls).
9. Re-snapshots and verifies the textarea content exactly matches the source (normalized for `\r\n` → `\n`). Mismatch → exit 1, content diff written to `.cache/sponsors-bio.after.md`.
10. Clicks the `Update profile` submit input. Selector is scoped precisely: there are 3 submitters in the same form ("Load more", "Save", "Update profile") and the script targets by exact `.value` match. Ambiguous, disabled, or missing buttons exit 1.
11. Polls GraphQL for up to 30s (2s interval). Success when normalized live content === normalized source. Timeout writes `.cache/sponsors-bio.live.md` and exits 1.

### Optional flags

- `pnpm sponsors:bio:sync --dry-run` — fill the textarea but skip the submit + verify. Useful for testing changes. Still mutates the headless DOM, but the GraphQL-based idempotence in step 3 makes that safe to leave behind.
- `pnpm sponsors:bio:sync --headed` — opens a visible Chrome For Testing window for visual debugging. Daemon must NOT already be running for this to take effect (`agent-browser close --all` first).

### Environment overrides

- `SPONSORS_BIO_STATE_PATH=/path/to/your/auth.json pnpm sponsors:bio:sync` — use a different state file (e.g., one stored in a password manager or KMS-decrypted at runtime).

## Critical Gotchas (Discovered Empirically — Don't Repeat These)

### ❌ DO NOT use the clipboard API for the paste

`agent-browser clipboard write` requires OS-level window focus on the browser. In a headless/background agent context, this fails with `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Document is not focused.`

✅ **DO** use `agent-browser eval --stdin` with a `nativeSetter` + `dispatchEvent('input')` payload, wrapped in an IIFE.

### ❌ DO NOT wrap textarea reads in `JSON.stringify(...)` inside the eval payload

agent-browser already JSON-encodes every eval return value as the wire format. Wrapping in `JSON.stringify` on the browser side double-encodes, and `JSON.parse` once gives back a JSON-string-literal containing `\n` two-char sequences instead of real newlines. The script's exact-equality verification will then always fail.

✅ **DO** return the raw textarea string from the eval expression and `JSON.parse` once on the Node side.

### ❌ DO NOT use top-level `const` declarations in multi-call eval scripts

agent-browser reuses the page's JS execution context across eval invocations. A second eval that declares `const ta = ...` will throw `SyntaxError: Identifier 'ta' has already been declared`.

✅ **DO** wrap each eval payload in an IIFE: `(() => { const ta = ...; return ...; })()`.

### ❌ DO NOT pass `--state` on every agent-browser invocation

agent-browser silently ignores `--state` (and `--headed`, and `--engine`) after the daemon is already running — printing only a warning. The script tracks a `daemonBootstrapped` flag and passes `--state` only on the first call per run.

### ❌ DO NOT use `--session-name` as the source of auth truth

`--session-name` triggers auto-save/restore of state to `~/.agent-browser/sessions/<name>-default.json`, but the lifecycle is fragile: explicit `close --all` calls can flush stale state before auth completes, leaving you with a saved file that has `logged_in: "no"` and no `user_session` cookie. The persisted state file under your control (`--state /path/to/file.json`) is the durable contract.

✅ **DO** use `--state $STATE_PATH` and treat that file as the auth artifact.

### ❌ DO NOT click a submit button by index or by selector-without-label

There are at least three `type=submit` elements in the dashboard form: `Load more` (a pagination button), `Save` (saves a different sub-section), and `Update profile` (the one we want). Selecting any of them by index would silently submit the wrong action.

✅ **DO** scope by `.value === "Update profile"` within the textarea's parent `<form>`. The script returns structured diagnostics (`FORM_NOT_FOUND`, `SUBMIT_NOT_FOUND`, `SUBMIT_AMBIGUOUS:N`, `SUBMIT_DISABLED`) so failures surface clearly.

### ❌ DO NOT compare textarea content for equality without normalizing newlines

Browsers normalize `\n` to `\r\n` when reading back `textarea.value`. A naive string equality check will always fail. The script normalizes both sides via `replaceAll('\r\n', '\n').trim()` before comparing.

### ❌ DO NOT use the DOM textarea value as the basis for idempotence

If a prior `--dry-run` or failed submit left the dashboard textarea with unsaved new content, a DOM-based idempotence check would falsely report "already in sync" and exit without publishing. The script uses **GraphQL live content** (`sponsorsListing.fullDescription`) as the source of truth.

## Recovery Procedures

### Session expired (script reports "Session lost" or `gh` shows login redirect)

The auth state cookies have expired (this happens after weeks/months). Re-do Step 1: open headed Chrome, log in manually, `agent-browser state save`. State file is overwritten in place.

### Script exits with `SUBMIT_NOT_FOUND` or `SUBMIT_AMBIGUOUS:N`

GitHub may have renamed/restructured the dashboard buttons. Open the dashboard manually, inspect the new submit element, update `SUBMIT_BUTTON_LABEL` in `scripts/sync.ts` (and `references/dashboard-selectors.md`).

### Script exits with `Textarea ... not found`

Either GitHub renamed the field ID (rare — Rails form helpers have kept `<model>_<attribute>` stable since ≥2024) or the session is silently degraded. Try a fresh `agent-browser state save` first. If still failing, inspect the dashboard manually and update `TEXTAREA_SELECTOR` in `scripts/sync.ts`.

### GraphQL verification times out after 30s

Submit succeeded but live content didn't propagate / didn't exactly match. `.cache/sponsors-bio.live.md` contains the live content for diffing against `.cache/sponsors-bio.md`. Visit the dashboard manually to confirm — sometimes GitHub adds invisible transformations (trailing whitespace, link expansion) that a future version of the normalizer should handle.

### Script fails before reaching the fill step

`SPONSORME.md` content is already saved to `.cache/sponsors-bio.md` (step 2 writes before any browser work). You can manually paste from there into the dashboard as a fallback.

## What This Skill Does NOT Do

- ❌ No transformation of SPONSORME.md content (identity copy; source IS canonical)
- ❌ No update to the `shortDescription` field (only `fullDescription` / Introduction). Short description has different formatting rules and is mostly static — out of scope.
- ❌ No CI scheduling. You invoke it locally. Designed for human-initiated cadence, not cron — partly because the auth state file shouldn't live in CI without a secrets-management story, and partly because publishing a bio is a low-frequency operation.

## Origin

This skill resolves the long-standing blocker documented in `.ai/plan/feature-sponsors-bio-sync-1.md` (status: Blocked → Resolved). The plan's Section 9 originally rejected browser automation as "Strategy D" citing TOS concerns; those concerns apply to **scraping, scaled automated interactions, or gaming GitHub's systems** — not to a single user publishing their own bio content from their own credentials.

See also:

- `.ai/docs/github-sponsors-api-experiment-2025-12-13.md` — empirical confirmation of the API gap
- Issue #635 (closed) — original API research findings

## References

- `scripts/sync.ts` — the script
- `references/dashboard-selectors.md` — current known DOM selectors with last-verified dates (update after any selector change)
