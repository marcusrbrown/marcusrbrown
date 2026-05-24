---
name: sync-sponsors-bio
description: Use when SPONSORME.md changes and the public GitHub Sponsors profile bio (the "Introduction" field at github.com/sponsors/marcusrbrown) is now out of sync. GitHub's API has no updateSponsorsListing mutation, so this skill drives an authenticated browser session to paste the markdown into the dashboard textarea, then stops before saving so Marcus can review and click "Update profile" himself.
license: MIT
metadata:
  author: marcusrbrown
  version: "0.1"
  origin: ".ai/plan/feature-sponsors-bio-sync-1.md (Blocked → solved via authenticated browser automation)"
allowed-tools: Bash, Read, agent-browser
---

# Sync Sponsors Bio

## Overview

GitHub's API does **not** expose an `updateSponsorsListing` mutation — only `createSponsorsListing` (which rejects existing profiles with "marcusrbrown already has a GitHub Sponsors profile"). Verified by experiment 2025-12-13 and reconfirmed 2026-05-24.

This skill works around that gap by driving the dashboard form in an **authenticated browser session** Marcus owns. The skill is human-in-the-loop by design: it fills the textarea, then **stops before saving** so Marcus reviews and clicks "Update profile" himself. That distinction matters — unattended automation of GitHub Sponsors profile updates would violate GitHub's TOS, but driving Marcus's own authenticated session as a fancier copy-paste tool does not.

## When to Use

- After editing `templates/SPONSORME.tpl.md` and regenerating `SPONSORME.md`
- After Fro Bot's autoheal report flags drift between `SPONSORME.md` and the live sponsors profile
- Periodically (every 1-2 months) to keep messaging current
- After major sponsor pitch revisions (tier changes, new value props)

## When NOT to Use

- For routine 6-hour automation cycles — this requires human review, defeats the purpose of automating it
- Without an active terminal session — the skill opens a headed browser and stops for human action
- For other GitHub Sponsors profiles you don't own — auth is scoped to the logged-in user

## Prerequisites

- `agent-browser` ≥ 0.27.0 installed (`which agent-browser`). The skill relies on `eval --stdin` for safe injection of the 30KB markdown payload; this flag is present in 0.27.0+. Verify with `agent-browser eval --help | grep -- --stdin`.
- One-time GitHub session saved as `--session-name github` (skill prompts for setup on first run)
- `SPONSORME.md` exists and is current (run `pnpm sponsors:update` first if unsure)
- Terminal session with display access for the headed browser

## Workflow

### Step 1: Verify prerequisites

```bash
# Tool check
command -v agent-browser >/dev/null || { echo "agent-browser missing — see https://agentskills.io/skills/agent-browser"; exit 1; }

# Session check — does a saved github session already exist?
agent-browser --session-name github open https://github.com/settings/profile >/dev/null 2>&1 && \
  agent-browser --session-name github get title | grep -qiE "(profile|marcusrbrown)" && \
  echo "✓ github session active" || \
  echo "✗ github session expired or missing — see Auth Setup below"
```

### Step 2: One-time auth setup (skip if session already active)

```bash
# Launch headed browser to github.com/login
agent-browser --engine chrome --headed --session-name github open https://github.com/login
```

**Stop here.** Marcus logs in manually in the browser window (handles 2FA, SSO, OAuth via whatever flow he prefers). When prompted, confirm login is complete.

Then verify:

```bash
agent-browser --session-name github open https://github.com/sponsors/marcusrbrown/dashboard/profile
agent-browser --session-name github get title
# Should contain "Sponsorship" or "Profile", NOT redirect to login
```

The `github` session is now saved to `~/.agent-browser/sessions/` and reusable across runs until GitHub invalidates cookies (typically weeks).

### Step 3: Run the sync script

From the repo root:

```bash
pnpm sponsors:bio:sync
```

The script does the following — see `scripts/sync.ts` for source:

1. Reads `SPONSORME.md` from repo root
2. Writes a copy to `.cache/sponsors-bio.md` for audit trail
3. Opens the dashboard at `https://github.com/sponsors/marcusrbrown/dashboard/profile` in the saved `github` session
4. Verifies the page loaded (not redirected to login)
5. Locates the bio textarea via stable CSS selector `#sponsors_profile_full_description`
6. Pastes the SPONSORME.md content into the textarea via `agent-browser fill`
7. Takes a fresh snapshot to verify content landed correctly
8. **Stops without clicking "Update profile"** — leaves the headed browser open

### Step 4: Marcus reviews and saves

Marcus is now sitting in front of an open browser tab showing the populated form:

1. Visually verify the markdown rendered correctly in the textarea
2. Click GitHub's "Preview" tab if available, to see the rendered output
3. Click "Update profile" to commit

The skill does not perform this action. This is the agent-native safety boundary — every consequential save requires explicit human approval.

### Step 5: Cleanup

```bash
agent-browser --session-name github close
```

The session cookies remain saved for next run.

## Critical Gotchas (Discovered Empirically — Don't Repeat These)

### ❌ DO NOT use the clipboard API for the paste

`agent-browser clipboard write` requires OS-level window focus on the browser. In a headless/background agent context, this fails with:

```text
NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Document is not focused.
```

✅ **DO** use `agent-browser fill @ref "$content"` with the markdown read into a bash variable. Handles 684+ lines of markdown perfectly.

### ❌ DO NOT verify with `get text` immediately after `fill`

The accessibility-tree refs are cached. After `fill`, `get text` will return the **stale** previous value. You'll waste 10+ minutes debugging "why didn't fill work?" when it actually did.

✅ **DO** take a fresh `snapshot` after `fill` before any verification:

```bash
agent-browser --session-name github fill @e61 "$content"
agent-browser --session-name github snapshot -i   # Refresh tree
agent-browser --session-name github get text @e61  # Now returns the new value
```

### ❌ DO NOT use accessibility-tree refs (`@e61`) across script runs

The ref numbers are session-scoped and change every snapshot. The accessibility tree also calls this field `"Introduction Introduction"` (yes, doubled) which is brittle to lookup by text.

✅ **DO** use the stable CSS selector `#sponsors_profile_full_description` directly. The script uses `agent-browser find` / `eval` patterns rather than refs.

### ❌ DO NOT attempt `--auto-connect` to Marcus's existing Chrome

Marcus does not run Chrome with `--remote-debugging-port` enabled by default. Auto-connect will fail immediately.

✅ **DO** use `--session-name github` from the start. Cookies + localStorage persist across runs.

### ❌ DO NOT click "Update profile" automatically

The skill's value is the safe human-review-before-save boundary. If you script the save click, you've reproduced the TOS violation the original `feature-sponsors-bio-sync-1.md` plan rejected as Strategy D.

✅ **DO** leave the headed browser open at the populated form and exit successfully. Marcus reviews and commits.

## Recovery Procedures

### Session expired (login redirect appears)

```bash
agent-browser --session-name github close
# Re-run auth setup (Step 2)
```

### Daemon stuck in headless state ("--headed ignored: daemon already running")

If `agent-browser` is already running in the background (e.g., from a prior headless session), the `--headed` flag is silently ignored — meaning Step 2's auth-setup browser never opens visibly. Symptoms: the command returns quickly with no visible browser window, but subsequent `open` commands still hit the unauthenticated state.

Fix: kill the daemon first, then retry auth setup:

```bash
agent-browser close
agent-browser --session-name github close   # belt-and-suspenders — close session-scoped daemon too
agent-browser --engine chrome --headed --session-name github open https://github.com/login
# Browser window now opens; Marcus logs in
```

### Selector changed (GitHub UI update)

The dashboard uses Rails form helpers — the field ID `sponsors_profile_full_description` follows their `<model>_<attribute>` convention and has been stable. If GitHub redesigns the dashboard:

1. Open the dashboard manually
2. Right-click the bio textarea → Inspect
3. Note the new `id` attribute
4. Update the selector constant in `scripts/sync.ts`

### Script fails before reaching the fill step

`SPONSORME.md` content is in `.cache/sponsors-bio.md` already (the script wrote it before browser ops). You can manually paste from there into the dashboard as a fallback.

### "Auto-saved draft" exists in the textarea

GitHub auto-saves drafts in some forms. If the textarea isn't empty when the script reaches it, the `fill` operation overwrites the draft. If you want to preserve a manual edit, capture the existing content before running the script.

## What This Skill Does NOT Do

- ❌ No auto-save (human review boundary)
- ❌ No scheduling (must be manually invoked)
- ❌ No transformation of SPONSORME.md content (identity copy; the source IS the canonical bio)
- ❌ No update to the `shortDescription` field (only `fullDescription` / Introduction). Short description is a separate field with different formatting rules — out of scope for v0.1.
- ❌ No diff check before push (Marcus visually reviews instead of script comparing)

## Origin

This skill resolves the long-standing blocker documented in `.ai/plan/feature-sponsors-bio-sync-1.md` (status: Blocked → solved). The plan rejected browser automation as Strategy D citing TOS concerns. The reframing this skill embodies: **unattended automation** of GitHub Sponsors profile updates would violate TOS, but **human-initiated, authenticated, supervised browser interaction** is no different from a fancier copy-paste tool and does not.

See also:

- `.ai/docs/github-sponsors-api-experiment-2025-12-13.md` — empirical confirmation of the API gap
- Issue #635 (closed) — original API research findings

## References

- `scripts/sync.ts` — the script that does the heavy lifting
- `references/dashboard-selectors.md` — current known DOM selectors with last-verified dates (update this after any selector change)
