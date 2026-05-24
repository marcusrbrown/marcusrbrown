#!/usr/bin/env tsx
/**
 * sync-sponsors-bio: drive an authenticated agent-browser session to paste
 * SPONSORME.md into the GitHub Sponsors profile dashboard's "Introduction"
 * (fullDescription) textarea, submit the form, and verify the save via
 * GraphQL. Runs fully headless and autonomous by default.
 *
 * See ../SKILL.md for full workflow + empirical gotchas this script avoids.
 *
 * Flags:
 *   --dry-run       Fill the textarea but do NOT click "Update profile".
 *                   Useful for previewing the diff before publishing.
 *   --headed        Open a visible Chrome window during the run (debugging).
 *                   Default is headless.
 */

import {execSync, spawnSync} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// Constants — change these if GitHub redesigns the dashboard
const SPONSORME_PATH = path.resolve(process.cwd(), 'SPONSORME.md')
const CACHE_DIR = path.resolve(process.cwd(), '.cache')
const CACHE_PATH = path.resolve(CACHE_DIR, 'sponsors-bio.md')
const BEFORE_PATH = path.resolve(CACHE_DIR, 'sponsors-bio.before.md')
const AFTER_PATH = path.resolve(CACHE_DIR, 'sponsors-bio.after.md')
const LIVE_PATH = path.resolve(CACHE_DIR, 'sponsors-bio.live.md')
const DASHBOARD_URL = 'https://github.com/sponsors/marcusrbrown/dashboard/profile'
// State file persists cookies independent of Chrome For Testing process death.
// Env override lets users put it elsewhere (e.g., 1Password vault).
const STATE_PATH =
  process.env.SPONSORS_BIO_STATE_PATH !== undefined && process.env.SPONSORS_BIO_STATE_PATH.length > 0
    ? path.resolve(process.env.SPONSORS_BIO_STATE_PATH)
    : path.join(process.env.HOME ?? '', '.config', 'agent-browser-states', 'github.json')
const TEXTAREA_SELECTOR = '#sponsors_profile_full_description'
const SUBMIT_BUTTON_LABEL = 'Update profile'
const GITHUB_USER = 'marcusrbrown'
const MIN_CONTENT_BYTES = 500
const SUSPICIOUS_TOKENS = ['{{', '}}', '<%', '%>', 'TODO_', 'PLACEHOLDER_']
const VERIFY_DEADLINE_MS = 30_000
const VERIFY_POLL_INTERVAL_MS = 2_000

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const HEADED = args.has('--headed')

// Tracks whether we've already bootstrapped the daemon with --state on this run.
// agent-browser silently ignores --state after the daemon is running; pass it
// only on the first invocation per run.
let daemonBootstrapped = false

const log = {
  info: (msg: string) => console.log(`▶ ${msg}`),
  ok: (msg: string) => console.log(`✓ ${msg}`),
  warn: (msg: string) => console.warn(`⚠ ${msg}`),
  err: (msg: string) => console.error(`✗ ${msg}`),
  step: (n: number, msg: string) => console.log(`\n━━━ Step ${n}: ${msg} ━━━`),
}

function normalizeBioContent(s: string): string {
  return s.replaceAll('\r\n', '\n').trim()
}

// agent-browser eval returns JSON-encoded values on stdout. For string-returning
// eval calls, parse once to get the bare string. Falls back to raw on parse error.
function safeParseJsonString(raw: string, label: string): string {
  try {
    const parsed: unknown = JSON.parse(raw.trim())
    return typeof parsed === 'string' ? parsed : raw.trim()
  } catch {
    log.warn(`Could not JSON-parse ${label} from agent-browser; using raw output`)
    return raw.trim()
  }
}

function ab(
  abArgs: string[],
  opts: {capture?: boolean; allowFailure?: boolean; input?: string; noTrim?: boolean} = {},
): string {
  // Only pass --state on the FIRST invocation — agent-browser ignores it
  // (with a warning) once a daemon is running. Subsequent calls inherit.
  const baseArgs: string[] = []
  if (!daemonBootstrapped) {
    baseArgs.push('--state', STATE_PATH)
    if (HEADED) baseArgs.push('--headed', '--engine', 'chrome')
    daemonBootstrapped = true
  }
  const result = spawnSync('agent-browser', [...baseArgs, ...abArgs], {
    encoding: 'utf-8',
    input: opts.input,
    stdio: opts.capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.status !== 0 && !opts.allowFailure) {
    log.err(`agent-browser ${abArgs.join(' ')} exited ${result.status}`)
    if (opts.capture) log.err(`stderr: ${result.stderr}`)
    process.exit(result.status ?? 1)
  }
  const out = result.stdout ?? ''
  return opts.noTrim ? out : out.trim()
}

function fetchLiveBio(): string {
  const result = spawnSync(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query={ user(login: "${GITHUB_USER}") { sponsorsListing { fullDescription } } }`,
      '--jq',
      '.data.user.sponsorsListing.fullDescription',
    ],
    {encoding: 'utf-8'},
  )
  if (result.status !== 0) {
    // Non-zero exit means auth or network failure. Return empty so the caller
    // can distinguish "fetch failed" from "empty bio" — but log the stderr so
    // the failure isn't completely silent.
    const stderr = (result.stderr ?? '').trim()
    if (stderr.length > 0) {
      log.warn(`gh GraphQL exited ${result.status ?? '?'} while fetching live bio: ${stderr}`)
    } else {
      log.warn(`gh GraphQL exited ${result.status ?? '?'} while fetching live bio (no stderr)`)
    }
    return ''
  }
  return (result.stdout ?? '').trim()
}

async function main() {
  log.step(1, 'Verify prerequisites')

  try {
    execSync('command -v agent-browser', {stdio: 'ignore'})
    log.ok('agent-browser found')
  } catch {
    log.err('agent-browser not installed. See https://agentskills.io/skills/agent-browser')
    process.exit(1)
  }

  try {
    execSync('command -v gh', {stdio: 'ignore'})
    execSync('gh auth status', {stdio: 'ignore'})
    log.ok('gh CLI found and authenticated')
  } catch {
    log.err('gh CLI missing or not authenticated. Run `gh auth login` first.')
    process.exit(1)
  }

  // Persisted state file must exist before we attempt browser work. Without it,
  // there's no way to authenticate headlessly.
  try {
    await fs.access(STATE_PATH)
    const stateStats = await fs.stat(STATE_PATH)
    log.ok(`agent-browser state file found: ${STATE_PATH} (${stateStats.size} bytes)`)
  } catch {
    log.err(`agent-browser state file missing: ${STATE_PATH}`)
    log.err('One-time auth setup required:')
    log.err('  agent-browser close --all')
    log.err('  agent-browser --engine chrome --headed open https://github.com/login')
    log.err('  # Log in manually in the Chrome For Testing window (handles 2FA/SSO)')
    log.err('  # When you reach github.com logged in, run:')
    log.err(`  agent-browser state save ${STATE_PATH}`)
    log.err('  # Then re-run this script. State persists across Chrome restarts.')
    process.exit(1)
  }

  let content: string
  try {
    content = await fs.readFile(SPONSORME_PATH, 'utf-8')
    log.ok(`Read ${SPONSORME_PATH} (${content.length} bytes, ${content.split('\n').length} lines)`)
  } catch (error) {
    log.err(`Failed to read SPONSORME.md: ${(error as Error).message}`)
    log.err('Run `pnpm sponsors:update` first to regenerate it.')
    process.exit(1)
  }

  if (content.length === 0) {
    log.err('SPONSORME.md is empty. Aborting.')
    process.exit(1)
  }

  // Pre-submit sanity gate
  if (content.length < MIN_CONTENT_BYTES) {
    log.err(
      `Refusing to publish: SPONSORME.md is only ${content.length} bytes (minimum ${MIN_CONTENT_BYTES}). Something probably broke template generation.`,
    )
    process.exit(1)
  }
  const foundToken = SUSPICIOUS_TOKENS.find(t => content.includes(t))
  if (foundToken !== undefined) {
    log.err(`Refusing to publish: SPONSORME.md contains unresolved template token "${foundToken}".`)
    log.err('Run `pnpm sponsors:update` to regenerate it.')
    process.exit(1)
  }
  log.ok('SPONSORME.md passed sanity checks')

  // BLOCKER 1: Idempotence via GraphQL live content — before touching the browser
  log.info('Checking live bio via GraphQL for idempotence...')
  const liveBioNow = fetchLiveBio()
  if (liveBioNow.length > 0 && normalizeBioContent(liveBioNow) === normalizeBioContent(content)) {
    log.ok('Live bio already matches SPONSORME.md — nothing to do.')
    process.exit(0)
  }
  if (liveBioNow.length > 0) {
    log.info(
      `Live bio differs from source (live: ${liveBioNow.length} bytes, source: ${content.length} bytes) — proceeding`,
    )
  } else {
    log.warn('Could not fetch live bio via GraphQL (will proceed with browser automation)')
  }

  log.step(2, 'Write audit copy to .cache/sponsors-bio.md')
  await fs.mkdir(CACHE_DIR, {recursive: true})
  await fs.writeFile(CACHE_PATH, content, 'utf-8')
  log.ok(`Wrote ${CACHE_PATH} (manual-paste fallback if automation fails)`)

  log.step(3, 'Verify github session is authenticated')
  ab(['open', DASHBOARD_URL], {capture: true})
  const url = ab(['get', 'url'], {capture: true})
  const title = ab(['get', 'title'], {capture: true})
  log.info(`URL: ${url}`)
  log.info(`Title: "${title}"`)

  // Auth-failure signals (in order of specificity):
  //  - URL redirected to /login
  //  - Title contains "sign in" or "page not found" (the dashboard returns 404 to unauthed users)
  //  - URL doesn't match the dashboard path we asked for
  //  - The bio textarea is missing from the page (most reliable signal — auth-OR-structure failure)
  const titleLower = title.toLowerCase()
  const looksLikeLogin = url.includes('github.com/login') || titleLower.includes('sign in')
  const looksLike404 = titleLower.includes('page not found')
  const wrongUrl = !url.includes('/sponsors/') || !url.includes('/dashboard/profile')

  if (looksLikeLogin || looksLike404) {
    log.err(`Session lost (page title: "${title}").`)
    log.err('Persisted auth state cookies have expired or been invalidated. Re-auth required:')
    log.err('  agent-browser close --all')
    log.err('  agent-browser --engine chrome --headed open https://github.com/login')
    log.err('  # Log in manually in the headed browser, then:')
    log.err(`  agent-browser state save ${STATE_PATH}`)
    log.err('  # Then re-run this script. State survives Chrome process death.')
    process.exit(1)
  }
  if (wrongUrl) {
    log.err(`Unexpected URL after navigation: ${url}`)
    log.err('GitHub may have changed the dashboard URL structure. See SKILL.md "Recovery Procedures".')
    process.exit(1)
  }
  log.ok('Dashboard loaded — session authenticated')

  log.step(4, 'Locate the bio textarea via stable CSS selector')
  const exists = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}') !== null`], {capture: true})
  if (exists.trim() !== 'true') {
    // Textarea missing on a URL that looked correct is usually a stealth-auth-failure
    // (GitHub serving a degraded page), more rarely a real selector change. Surface both.
    log.err(`Textarea ${TEXTAREA_SELECTOR} not found on page (title: "${title}").`)
    log.err('Most likely: session is partially expired and GitHub is serving a degraded page.')
    log.err('Less likely: GitHub renamed the field. Re-auth first:')
    log.err('  agent-browser close --all')
    log.err('  agent-browser --engine chrome --headed open https://github.com/login')
    log.err('  # Log in manually, then:')
    log.err(`  agent-browser state save ${STATE_PATH}`)
    log.err('  # Then re-run this script.')
    log.err(`If re-auth doesn't fix it, inspect the page and update TEXTAREA_SELECTOR in scripts/sync.ts.`)
    log.err(`Manual paste fallback: paste from ${CACHE_PATH} into the dashboard.`)
    process.exit(1)
  }
  log.ok(`Textarea ${TEXTAREA_SELECTOR} found`)

  log.step(5, 'Capture existing textarea content (audit trail only)')
  // agent-browser eval ALREADY JSON-encodes its return value as the wire format.
  // Returning the raw textarea string lets us JSON.parse() once to recover newlines.
  // (Wrapping in JSON.stringify on the browser side double-encodes — don't do it.)
  const beforeRaw = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}').value`], {
    capture: true,
    noTrim: true,
  })
  const beforeContent = safeParseJsonString(beforeRaw, 'pre-fill textarea snapshot')
  await fs.writeFile(BEFORE_PATH, beforeContent, 'utf-8')
  log.ok(`Saved pre-fill audit snapshot to ${BEFORE_PATH} (${beforeContent.length} bytes)`)
  log.info('Note: idempotence decision was made via GraphQL, not this DOM snapshot.')

  log.step(6, 'Fill textarea with SPONSORME.md content')
  // Use eval+nativeSetter+dispatchEvent because:
  // 1. Stable CSS selector (no need for ref lookup)
  // 2. JSON.stringify safely embeds the 30KB markdown
  // 3. Must dispatch 'input' so React/Stimulus controllers see the change
  // 4. Wrap in IIFE — agent-browser reuses the eval context across calls,
  //    so top-level `const` declarations would leak and collide on later evals.
  const fillScript = `
(() => {
  const ta = document.querySelector('${TEXTAREA_SELECTOR}');
  const newValue = ${JSON.stringify(content)};
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSetter.call(ta, newValue);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  return 'filled: ' + ta.value.length + ' chars';
})()
`.trim()
  // agent-browser eval returns JSON-encoded strings (e.g. `"filled: 3424 chars"`).
  // Parse once to recover the plain string.
  const fillResultRaw = ab(['eval', '--stdin'], {capture: true, input: fillScript})
  const fillResult = safeParseJsonString(fillResultRaw, 'fill result')
  log.ok(`Fill result: ${fillResult}`)

  log.step(7, 'Verify content landed (exact equality check)')
  ab(['snapshot', '-i'], {capture: true, allowFailure: true})
  // agent-browser eval already JSON-encodes its return value — do NOT wrap in
  // JSON.stringify on the browser side or we'd double-encode.
  const afterRaw = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}').value`], {
    capture: true,
    noTrim: true,
  })
  const afterContent = safeParseJsonString(afterRaw, 'post-fill textarea snapshot')

  // BLOCKER 2: Exact equality gate (normalized)
  if (normalizeBioContent(afterContent) !== normalizeBioContent(content)) {
    await fs.writeFile(AFTER_PATH, afterContent, 'utf-8')
    log.err('Verification failed: textarea content does not exactly match source after fill.')
    log.err(`  diff ${BEFORE_PATH} ${AFTER_PATH}`)
    log.err(`  diff ${CACHE_PATH} ${AFTER_PATH}`)
    process.exit(1)
  }
  const inflation = afterContent.length - content.length
  log.ok(
    `Verified: textarea exactly matches source (${afterContent.length} chars)${
      inflation > 0 ? String.raw` (${inflation} chars longer: browser \r\n normalization, normal)` : ''
    }`,
  )

  if (DRY_RUN) {
    log.step(8, 'DRY RUN — textarea filled but NOT submitted')
    // BLOCKER 4: Warn about dirty-state hazard; idempotence is GraphQL-based so safe to leave
    log.warn('Dashboard form was filled but NOT submitted. Reload the page or run again to publish.')
    log.warn('Pass without --dry-run to publish.')
    process.exit(0)
  }

  log.step(8, 'Submit form (click "Update profile")')
  // Scope the click precisely: the "Update profile" submit input lives in
  // the same form as the textarea. There are also "Save" and "Load more"
  // submit buttons in the same form; click() on the wrong one would submit
  // different data. We MUST target by value.
  // Returns structured diagnostics for each failure mode.
  // Wrap in IIFE so `const` declarations don't collide with earlier eval calls
  // (agent-browser reuses the page's JS execution context across invocations).
  const submitScript = `
(() => {
  const ta = document.querySelector('${TEXTAREA_SELECTOR}');
  const form = ta ? ta.closest('form') : null;
  if (!form) return 'FORM_NOT_FOUND';
  const candidates = Array.from(form.querySelectorAll('input[type=submit], button[type=submit]'));
  const matches = candidates.filter(b => ((b.value || b.textContent || '').trim()) === ${JSON.stringify(SUBMIT_BUTTON_LABEL)});
  if (matches.length === 0) return 'SUBMIT_NOT_FOUND';
  if (matches.length > 1) return 'SUBMIT_AMBIGUOUS:' + matches.length;
  if (matches[0].disabled) return 'SUBMIT_DISABLED';
  matches[0].click();
  return 'SUBMIT_CLICKED:' + (matches[0].value || matches[0].textContent || '').trim();
})()
`.trim()
  const submitResultRaw = ab(['eval', '--stdin'], {capture: true, input: submitScript})
  const submitResult = safeParseJsonString(submitResultRaw, 'submit result')

  if (submitResult === 'FORM_NOT_FOUND') {
    log.err('Could not locate the form containing the bio textarea.')
    log.err('GitHub may have restructured the dashboard. See SKILL.md "Recovery Procedures".')
    // BLOCKER 4: textarea was filled but not submitted
    log.warn('Dashboard form was filled but NOT submitted. Reload the page or run again to publish.')
    process.exit(1)
  }
  if (submitResult === 'SUBMIT_NOT_FOUND') {
    log.err(`Could not locate "${SUBMIT_BUTTON_LABEL}" submit button in the form.`)
    log.err('GitHub may have renamed/restructured the dashboard buttons.')
    // BLOCKER 4: textarea was filled but not submitted
    log.warn('Dashboard form was filled but NOT submitted. Reload the page or run again to publish.')
    process.exit(1)
  }
  if (submitResult.startsWith('SUBMIT_AMBIGUOUS:')) {
    const count = submitResult.split(':')[1]
    log.err(`Found ${count} buttons matching "${SUBMIT_BUTTON_LABEL}" — ambiguous, refusing to click.`)
    log.warn('Dashboard form was filled but NOT submitted. Reload the page or run again to publish.')
    process.exit(1)
  }
  if (submitResult === 'SUBMIT_DISABLED') {
    log.err(`"${SUBMIT_BUTTON_LABEL}" button is disabled — form may not have registered the change.`)
    log.warn('Dashboard form was filled but NOT submitted. Reload the page or run again to publish.')
    process.exit(1)
  }
  log.ok(`Form submitted: ${submitResult}`)

  log.step(9, 'Verify save via GitHub GraphQL (polling up to 30s)')
  const start = Date.now()
  let liveContent = ''
  let verified = false
  while (Date.now() - start < VERIFY_DEADLINE_MS) {
    liveContent = fetchLiveBio()
    if (liveContent && normalizeBioContent(liveContent) === normalizeBioContent(content)) {
      log.ok(`Live sponsors profile bio now matches SPONSORME.md (${liveContent.length} chars).`)
      log.ok(`Visible at https://github.com/sponsors/${GITHUB_USER}`)
      verified = true
      break
    }
    await sleep(VERIFY_POLL_INTERVAL_MS)
  }

  if (!verified) {
    // BLOCKER 3: exit non-zero on mismatch/failure
    if (liveContent) {
      log.err('GraphQL verification timed out after 30s; live content does not match source.')
      log.err('Save MAY have succeeded but verification did not converge. Visit dashboard manually.')
      await fs.writeFile(LIVE_PATH, liveContent, 'utf-8')
      log.err(`  diff ${CACHE_PATH} ${LIVE_PATH}`)
    } else {
      log.err('gh GraphQL verification failed — could not fetch live bio.')
      log.err(`Visit ${DASHBOARD_URL} to confirm manually.`)
      await fs.mkdir(CACHE_DIR, {recursive: true})
      await fs.writeFile(LIVE_PATH, liveContent, 'utf-8')
    }
    process.exit(1)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(error => {
  log.err(`Unexpected error: ${error instanceof Error ? error.stack : error}`)
  process.exit(1)
})
