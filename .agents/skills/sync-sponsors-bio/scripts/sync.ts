#!/usr/bin/env tsx
/**
 * sync-sponsors-bio: drive an authenticated agent-browser session to paste
 * SPONSORME.md into the GitHub Sponsors profile dashboard's "Introduction"
 * (fullDescription) textarea. STOPS before clicking "Update profile" — human
 * reviews and commits the save themselves.
 *
 * See ../SKILL.md for full workflow + empirical gotchas this script avoids.
 */

import {execSync, spawnSync} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// Constants — change these if GitHub redesigns the dashboard
const SPONSORME_PATH = path.resolve(process.cwd(), 'SPONSORME.md')
const CACHE_PATH = path.resolve(process.cwd(), '.cache', 'sponsors-bio.md')
const DASHBOARD_URL = 'https://github.com/sponsors/marcusrbrown/dashboard/profile'
const SESSION_NAME = 'github'
const TEXTAREA_SELECTOR = '#sponsors_profile_full_description'

const log = {
  info: (msg: string) => console.log(`▶ ${msg}`),
  ok: (msg: string) => console.log(`✓ ${msg}`),
  warn: (msg: string) => console.warn(`⚠ ${msg}`),
  err: (msg: string) => console.error(`✗ ${msg}`),
  step: (n: number, msg: string) => console.log(`\n━━━ Step ${n}: ${msg} ━━━`),
}

function ab(args: string[], opts: {capture?: boolean; allowFailure?: boolean} = {}): string {
  const result = spawnSync('agent-browser', ['--session-name', SESSION_NAME, ...args], {
    encoding: 'utf-8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.status !== 0 && !opts.allowFailure) {
    log.err(`agent-browser ${args.join(' ')} exited ${result.status}`)
    if (opts.capture) {
      log.err(`stderr: ${result.stderr}`)
    }
    process.exit(result.status ?? 1)
  }
  return result.stdout?.trim() ?? ''
}

async function main() {
  log.step(1, 'Verify prerequisites')

  // Tool check
  try {
    execSync('command -v agent-browser', {stdio: 'ignore'})
    log.ok('agent-browser found')
  } catch {
    log.err('agent-browser not installed. See https://agentskills.io/skills/agent-browser')
    process.exit(1)
  }

  // Read SPONSORME.md
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

  log.step(2, 'Write audit copy to .cache/sponsors-bio.md')
  await fs.mkdir(path.dirname(CACHE_PATH), {recursive: true})
  await fs.writeFile(CACHE_PATH, content, 'utf-8')
  log.ok(`Wrote ${CACHE_PATH} (fallback for manual paste if automation fails)`)

  log.step(3, 'Verify github session is authenticated')
  // Open dashboard with saved session
  ab(['open', DASHBOARD_URL])
  const title = ab(['get', 'title'], {capture: true})
  log.info(`Page title: "${title}"`)

  const url = ab(['get', 'url'], {capture: true})
  log.info(`Current URL: ${url}`)

  // If we got redirected to login, abort with clear message
  if (url.includes('github.com/login') || title.toLowerCase().includes('sign in')) {
    log.err('Session expired or missing. Re-run auth setup:')
    log.err('  agent-browser --session-name github close')
    log.err('  agent-browser --engine chrome --headed --session-name github open https://github.com/login')
    log.err('  # Log in manually in the browser window')
    log.err('  # Then re-run this script')
    process.exit(1)
  }

  if (!url.includes('/sponsors/') || !url.includes('/dashboard/profile')) {
    log.err(`Unexpected URL after navigation: ${url}`)
    log.err(`Expected to land on ${DASHBOARD_URL}`)
    log.err('GitHub may have changed the dashboard URL structure. See SKILL.md "Recovery Procedures".')
    process.exit(1)
  }
  log.ok('Dashboard loaded — session authenticated')

  log.step(4, 'Locate the bio textarea via stable CSS selector')
  // Use eval to confirm the textarea exists before fill
  const exists = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}') !== null`], {capture: true})
  if (exists.trim() !== 'true') {
    log.err(`Textarea ${TEXTAREA_SELECTOR} not found on page.`)
    log.err('GitHub may have changed the field ID. Inspect the page and update TEXTAREA_SELECTOR.')
    log.err(`Fallback: manually paste from ${CACHE_PATH} into the dashboard.`)
    process.exit(1)
  }
  log.ok(`Textarea ${TEXTAREA_SELECTOR} found`)

  log.step(5, 'Capture existing textarea content (so changes are auditable)')
  // Get current value before overwrite (audit trail in case Marcus had unsaved edits)
  const beforeContent = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}').value`], {capture: true})
  const beforePath = path.resolve(process.cwd(), '.cache', 'sponsors-bio.before.md')
  await fs.writeFile(beforePath, beforeContent, 'utf-8')
  log.ok(`Saved pre-fill content to ${beforePath} (${beforeContent.length} bytes)`)

  if (beforeContent.trim() === content.trim()) {
    log.warn('Existing dashboard content already matches SPONSORME.md. No update needed.')
    log.warn('Browser session left open if you want to verify visually.')
    process.exit(0)
  }

  log.step(6, 'Fill textarea with SPONSORME.md content')
  // Use eval+dispatchEvent rather than `fill @ref` because:
  // 1. We have a stable CSS selector (no need for ref lookup)
  // 2. Multi-line bash escaping is brittle for 30KB markdown
  // 3. eval can JSON.stringify the content for safe embedding
  // Note: must dispatch 'input' event so React/Stimulus controllers pick up the change
  const fillScript = `
const ta = document.querySelector('${TEXTAREA_SELECTOR}');
const newValue = ${JSON.stringify(content)};
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
nativeSetter.call(ta, newValue);
ta.dispatchEvent(new Event('input', { bubbles: true }));
ta.dispatchEvent(new Event('change', { bubbles: true }));
'filled: ' + ta.value.length + ' chars';
`.trim()

  // Pipe the script through stdin to avoid shell escaping the 30KB markdown
  const result = spawnSync('agent-browser', ['--session-name', SESSION_NAME, 'eval', '--stdin'], {
    encoding: 'utf-8',
    input: fillScript,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    log.err(`Fill failed: ${result.stderr}`)
    process.exit(result.status ?? 1)
  }
  log.ok(`Fill result: ${result.stdout.trim()}`)

  log.step(7, 'Verify content landed (with fresh snapshot to refresh tree)')
  // CRITICAL: must re-snapshot before any get/eval verification — accessibility tree is stale otherwise
  ab(['snapshot', '-i'], {capture: true, allowFailure: true})
  const afterContent = ab(['eval', `document.querySelector('${TEXTAREA_SELECTOR}').value`], {capture: true})

  // Note on the character-count check below:
  // Browsers normalize textarea content — \n in the source markdown gets converted to \r\n
  // when read back via .value. So afterContent.length will typically be LARGER than
  // content.length by roughly (number of newlines) characters (~600+ for a 30KB markdown
  // file). That's expected and not a failure. Only flag a mismatch if afterContent is
  // SHORTER than expected, which indicates truncation or fill failure.
  if (afterContent.length < content.length - 10) {
    // Allow tiny shell-escape rounding; >10 char diff is real failure
    log.warn(
      `Verification mismatch: expected ≥${content.length} chars, got ${afterContent.length} — content may be truncated`,
    )
    log.warn(`Inspect the browser visually and confirm the textarea contents.`)
    log.warn(`Fallback content is at ${CACHE_PATH} if you need to paste manually.`)
  } else {
    const inflation = afterContent.length - content.length
    log.ok(
      `Verified: textarea now contains ${afterContent.length} chars${
        inflation > 0
          ? String.raw` (${inflation} chars longer than source due to browser \r\n normalization — normal)`
          : ''
      }`,
    )
  }

  log.step(8, 'STOP — human review required')
  console.log('')
  console.log('🟢 Bio content has been pasted into the dashboard form.')
  console.log('')
  console.log('Next steps (MANUAL):')
  console.log('  1. The headed browser window is still open at the populated form')
  console.log('  2. Visually verify the markdown renders correctly')
  console.log('  3. Optionally click GitHub\'s "Preview" tab to see rendered output')
  console.log('  4. Click "Update profile" to save')
  console.log('')
  console.log('When done:')
  console.log('  agent-browser --session-name github close')
  console.log('')
  console.log(`Audit files:`)
  console.log(`  - Source:   ${SPONSORME_PATH}`)
  console.log(`  - Pasted:   ${CACHE_PATH}`)
  console.log(`  - Previous: ${beforePath}`)
}

main().catch(error => {
  log.err(`Unexpected error: ${error instanceof Error ? error.stack : error}`)
  process.exit(1)
})
