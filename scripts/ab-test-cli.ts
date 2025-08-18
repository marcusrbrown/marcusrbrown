#!/usr/bin/env tsx

import process from 'node:process'
import {ABTestingFramework} from './ab-testing-framework.js'

async function runABTestCLI(): Promise<void> {
  const framework = new ABTestingFramework()
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === undefined || command === null || command.trim() === '') {
    showHelp()
    return
  }

  switch (command) {
    case 'create-sponsor-test': {
      const testId = framework.createSponsorPitchTest()
      console.log(`✅ Created sponsor pitch A/B test: ${testId}`)
      break
    }

    case 'start': {
      const testId = args[1]
      if (testId === undefined || testId === null || testId.trim() === '') {
        console.error('❌ Usage: start <test-id>')
        process.exit(1)
      }
      const success = framework.startTest(testId)
      if (!success) {
        process.exit(1)
      }
      break
    }

    case 'stop': {
      const testId = args[1]
      if (testId === undefined || testId === null || testId.trim() === '') {
        console.error('❌ Usage: stop <test-id>')
        process.exit(1)
      }
      const success = framework.stopTest(testId)
      if (!success) {
        process.exit(1)
      }
      break
    }

    case 'status': {
      const tests = framework.getTests()
      if (tests.length === 0) {
        console.log('📊 No A/B tests found')
        return
      }

      console.table(
        tests.map(t => ({
          ID: t.id,
          Name: t.name,
          Status: t.status,
          Variants: t.variants.length,
          Started: t.startDate.split('T')[0],
        })),
      )
      break
    }

    case 'report': {
      const report = framework.generateReport()
      console.log(report)
      break
    }

    case 'track': {
      framework.setTrackingEnabled(true)
      console.log('✅ A/B testing tracking enabled')
      break
    }

    case 'help':
    default: {
      showHelp()
      break
    }
  }
}

function showHelp(): void {
  console.log(`
🧪 A/B Testing Framework Commands:

create-sponsor-test  Create a new sponsor pitch A/B test
start <test-id>      Start running an A/B test
stop <test-id>       Stop a running A/B test
status               Show all A/B tests and their status
report               Generate detailed A/B testing report
track                Enable tracking for A/B tests
help                 Show this help message

Examples:
  pnpm ab-test create-sponsor-test
  pnpm ab-test start test_12345
  pnpm ab-test report
`)
}

// Run CLI
runABTestCLI().catch(error => {
  console.error('❌ CLI Error:', error)
  process.exit(1)
})
