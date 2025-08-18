#!/usr/bin/env tsx

/**
 * Mobile Responsiveness and Readability Tester
 *
 * This script tests mobile responsiveness and readability across different
 * devices and GitHub interfaces for the optimized sponsor pitch content.
 *
 * Phase 5 Implementation - TASK-029:
 * Test mobile responsiveness and readability across different devices and GitHub interfaces
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// File paths
const SPONSORME_PATH = path.join(process.cwd(), 'SPONSORME.md')
const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'SPONSORME.tpl.md')
const TEST_RESULTS_PATH = path.join(process.cwd(), '.cache', 'mobile-test-results.json')

// Mobile testing configuration
const MOBILE_BREAKPOINTS = {
  mobile: {width: 360, name: 'Mobile (360px)'},
  mobileLarge: {width: 414, name: 'Mobile Large (414px)'},
  tablet: {width: 768, name: 'Tablet (768px)'},
  desktop: {width: 1024, name: 'Desktop (1024px)'},
} as const

// Content analysis criteria
interface ContentAnalysis {
  lineLength: {
    maxLength: number
    averageLength: number
    longLines: number
    recommendation: string
  }
  headingStructure: {
    h1Count: number
    h2Count: number
    h3Count: number
    isValid: boolean
    recommendation: string
  }
  listFormatting: {
    totalLists: number
    nestedLists: number
    isOptimal: boolean
    recommendation: string
  }
  linkDensity: {
    totalLinks: number
    externalLinks: number
    density: number
    isOptimal: boolean
    recommendation: string
  }
  readability: {
    paragraphCount: number
    averageParagraphLength: number
    isOptimal: boolean
    recommendation: string
  }
  mobileOptimization: {
    hasLongCodeBlocks: boolean
    hasWideElements: boolean
    isOptimized: boolean
    recommendation: string
  }
}

interface TestResult {
  breakpoint: string
  analysis: ContentAnalysis
  issues: string[]
  recommendations: string[]
  score: number
}

interface MobileTestReport {
  timestamp: string
  file: string
  results: TestResult[]
  overallScore: number
  criticalIssues: string[]
  improvements: string[]
}

/**
 * Mobile responsiveness and readability tester
 */
export class MobileResponsivenessTester {
  /**
   * Analyze content for mobile readability
   */
  async analyzeContent(content: string): Promise<ContentAnalysis> {
    const lines = content.split('\n')
    const words = content.split(/\s+/)
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)

    // Line length analysis
    const lineLengths = lines.map(line => line.length)
    const maxLength = Math.max(...lineLengths)
    const averageLength = lineLengths.reduce((sum, len) => sum + len, 0) / lineLengths.length
    const longLines = lineLengths.filter(len => len > 80).length

    // Heading structure analysis
    const h1Count = (content.match(/^# /gm) || []).length
    const h2Count = (content.match(/^## /gm) || []).length
    const h3Count = (content.match(/^### /gm) || []).length

    // List formatting analysis
    const totalLists = (content.match(/^[-*+] /gm) || []).length + (content.match(/^\d+\. /gm) || []).length
    const nestedLists = (content.match(/^ {2}[-*+] /gm) || []).length + (content.match(/^ {2}\d+\. /gm) || []).length

    // Link analysis
    const linkMatches = content.match(/\[[^\]]+\]\([^)]+\)/g) || []
    const totalLinks = linkMatches.length
    const externalLinks = linkMatches.filter(link => link.includes('http')).length
    const linkDensity = totalLinks / words.length

    // Readability analysis
    const paragraphLengths = paragraphs.map(p => p.split(/\s+/).length)
    const averageParagraphLength = paragraphLengths.reduce((sum, len) => sum + len, 0) / paragraphLengths.length

    // Mobile optimization checks
    const hasLongCodeBlocks =
      content.includes('```') && content.split('```').some(block => block.split('\n').some(line => line.length > 60))
    const hasWideElements =
      content.includes('|') || // Tables
      content.includes('<img') || // Images without responsive attributes
      maxLength > 100 // Very long lines

    return {
      lineLength: {
        maxLength,
        averageLength,
        longLines,
        recommendation:
          longLines > 5 ? 'Consider breaking long lines for mobile readability' : 'Line lengths are mobile-friendly',
      },
      headingStructure: {
        h1Count,
        h2Count,
        h3Count,
        isValid: h1Count === 1 && h2Count > 0,
        recommendation:
          h1Count === 1
            ? h2Count === 0
              ? 'Add H2 headings for better structure'
              : 'Heading structure is optimal'
            : 'Use exactly one H1 heading',
      },
      listFormatting: {
        totalLists,
        nestedLists,
        isOptimal: totalLists > 0 && nestedLists < totalLists * 0.5,
        recommendation:
          totalLists === 0 ? 'Consider using lists for better mobile scanning' : 'List formatting is mobile-friendly',
      },
      linkDensity: {
        totalLinks,
        externalLinks,
        density: linkDensity,
        isOptimal: linkDensity > 0.01 && linkDensity < 0.05,
        recommendation:
          linkDensity > 0.05
            ? 'Reduce link density for better mobile UX'
            : linkDensity < 0.01
              ? 'Consider adding more relevant links'
              : 'Link density is optimal',
      },
      readability: {
        paragraphCount: paragraphs.length,
        averageParagraphLength,
        isOptimal: averageParagraphLength > 15 && averageParagraphLength < 50,
        recommendation:
          averageParagraphLength > 50
            ? 'Break long paragraphs for mobile readability'
            : averageParagraphLength < 15
              ? 'Consider combining short paragraphs'
              : 'Paragraph length is optimal for mobile',
      },
      mobileOptimization: {
        hasLongCodeBlocks,
        hasWideElements,
        isOptimized: !hasLongCodeBlocks && !hasWideElements,
        recommendation: hasWideElements
          ? 'Optimize wide elements for mobile screens'
          : hasLongCodeBlocks
            ? 'Consider responsive code block formatting'
            : 'Content is well-optimized for mobile',
      },
    }
  }

  /**
   * Test content across different breakpoints
   */
  async testBreakpoints(content: string): Promise<TestResult[]> {
    const results: TestResult[] = []

    for (const [key, breakpoint] of Object.entries(MOBILE_BREAKPOINTS)) {
      const analysis = await this.analyzeContent(content)
      const issues: string[] = []
      const recommendations: string[] = []

      // Evaluate based on breakpoint
      if (key === 'mobile' || key === 'mobileLarge') {
        // Mobile-specific checks
        if (analysis.lineLength.longLines > 3) {
          issues.push('Too many long lines for mobile screens')
          recommendations.push('Break long lines into shorter segments')
        }

        if (analysis.mobileOptimization.hasWideElements) {
          issues.push('Content contains elements that may overflow on mobile')
          recommendations.push('Ensure all content fits within mobile viewport')
        }

        if (analysis.readability.averageParagraphLength > 40) {
          issues.push('Paragraphs too long for mobile reading')
          recommendations.push('Break paragraphs into smaller chunks')
        }
      }

      // Universal checks
      if (!analysis.headingStructure.isValid) {
        issues.push('Heading structure not optimal for accessibility')
        recommendations.push(analysis.headingStructure.recommendation)
      }

      if (!analysis.linkDensity.isOptimal) {
        issues.push('Link density not optimal for mobile interaction')
        recommendations.push(analysis.linkDensity.recommendation)
      }

      // Calculate score (0-100)
      let score = 100
      score -= issues.length * 10 // Deduct 10 points per issue
      score -= analysis.lineLength.longLines * 2 // Deduct 2 points per long line
      score = Math.max(0, Math.min(100, score))

      results.push({
        breakpoint: breakpoint.name,
        analysis,
        issues,
        recommendations,
        score,
      })
    }

    return results
  }

  /**
   * Generate mobile testing report
   */
  async generateReport(filePath: string): Promise<MobileTestReport> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const results = await this.testBreakpoints(content)

      // Calculate overall score
      const overallScore = results.reduce((sum, result) => sum + result.score, 0) / results.length

      // Collect critical issues (appearing in multiple breakpoints)
      const allIssues = results.flatMap(r => r.issues)
      const issueFrequency = allIssues.reduce(
        (freq, issue) => {
          freq[issue] = (freq[issue] ?? 0) + 1
          return freq
        },
        {} as Record<string, number>,
      )

      const criticalIssues = Object.entries(issueFrequency)
        .filter(([_, count]) => count >= 2)
        .map(([issue]) => issue)

      // Collect improvement suggestions
      const allRecommendations = results.flatMap(r => r.recommendations)
      const uniqueImprovements = [...new Set(allRecommendations)]

      return {
        timestamp: new Date().toISOString(),
        file: path.basename(filePath),
        results,
        overallScore,
        criticalIssues,
        improvements: uniqueImprovements,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to generate mobile test report: ${errorMessage}`)
    }
  }

  /**
   * Save test results to cache
   */
  async saveResults(report: MobileTestReport): Promise<void> {
    try {
      await fs.mkdir(path.dirname(TEST_RESULTS_PATH), {recursive: true})
      await fs.writeFile(TEST_RESULTS_PATH, JSON.stringify(report, null, 2))
    } catch (error) {
      console.warn('⚠️ Failed to save test results:', error)
    }
  }

  /**
   * Compare with previous test results
   */
  async loadPreviousResults(): Promise<MobileTestReport | null> {
    try {
      const data = await fs.readFile(TEST_RESULTS_PATH, 'utf-8')
      return JSON.parse(data) as MobileTestReport
    } catch {
      return null
    }
  }

  /**
   * Generate GitHub-specific optimization recommendations
   */
  generateGitHubOptimizations(report: MobileTestReport): string[] {
    const optimizations: string[] = []

    // GitHub-specific recommendations
    if (report.overallScore < 80) {
      optimizations.push("Consider using GitHub's mobile preview to test changes")
    }

    if (report.criticalIssues.some(issue => issue.includes('wide'))) {
      optimizations.push('Use responsive table formatting with HTML for better mobile display')
    }

    if (report.criticalIssues.some(issue => issue.includes('long lines'))) {
      optimizations.push('Break long URLs and code snippets for mobile readability')
    }

    if (report.results.some(r => r.analysis.headingStructure.h2Count === 0)) {
      optimizations.push('Add section headings for better GitHub mobile navigation')
    }

    if (report.results.some(r => r.analysis.listFormatting.totalLists === 0)) {
      optimizations.push('Use bullet points for key benefits - GitHub mobile renders lists well')
    }

    return optimizations
  }

  /**
   * Run comprehensive mobile test suite
   */
  async runTestSuite(filePaths: string[] = [SPONSORME_PATH]): Promise<void> {
    console.log('📱 Starting mobile responsiveness testing...')

    for (const filePath of filePaths) {
      try {
        console.log(`\n🔍 Testing: ${path.basename(filePath)}`)

        const report = await this.generateReport(filePath)
        const previousResults = await this.loadPreviousResults()

        // Save results
        await this.saveResults(report)

        // Display results
        console.log(`📊 Overall Score: ${report.overallScore.toFixed(1)}/100`)

        if (report.criticalIssues.length > 0) {
          console.log('\n❌ Critical Issues:')
          report.criticalIssues.forEach(issue => console.log(`   • ${issue}`))
        }

        if (report.improvements.length > 0) {
          console.log('\n💡 Improvements:')
          report.improvements.slice(0, 5).forEach(improvement => console.log(`   • ${improvement}`))
        }

        // GitHub-specific optimizations
        const githubOptimizations = this.generateGitHubOptimizations(report)
        if (githubOptimizations.length > 0) {
          console.log('\n🔧 GitHub Mobile Optimizations:')
          githubOptimizations.forEach(opt => console.log(`   • ${opt}`))
        }

        // Breakpoint-specific results
        console.log('\n📐 Breakpoint Analysis:')
        report.results.forEach(result => {
          const status = result.score >= 80 ? '✅' : result.score >= 60 ? '⚠️' : '❌'
          console.log(`   ${status} ${result.breakpoint}: ${result.score.toFixed(1)}/100`)
        })

        // Progress comparison
        if (previousResults) {
          const scoreDiff = report.overallScore - previousResults.overallScore
          if (scoreDiff > 0) {
            console.log(`\n📈 Improvement: +${scoreDiff.toFixed(1)} points from last test`)
          } else if (scoreDiff < 0) {
            console.log(`\n📉 Regression: ${scoreDiff.toFixed(1)} points from last test`)
          } else {
            console.log('\n📊 Score unchanged from last test')
          }
        }
      } catch (error) {
        console.error(`❌ Failed to test ${filePath}:`, error)
      }
    }
  }
}

/**
 * CLI interface for mobile testing
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const tester = new MobileResponsivenessTester()

  if (args.includes('--help')) {
    console.log(`
📱 Mobile Responsiveness and Readability Tester

Usage:
  pnpm mobile:test [options] [files...]

Options:
  --template      Test the template file instead of generated content
  --all           Test both template and generated files
  --report        Generate detailed report only
  --help          Show this help message

Examples:
  pnpm mobile:test
  pnpm mobile:test --template
  pnpm mobile:test --all
  pnpm mobile:test SPONSORME.md
`)
    return
  }

  let filesToTest: string[] = []

  if (args.includes('--template')) {
    filesToTest = [TEMPLATE_PATH]
  } else if (args.includes('--all')) {
    filesToTest = [SPONSORME_PATH, TEMPLATE_PATH]
  } else {
    // Check for specific files in args
    const specifiedFiles = args.filter(arg => !arg.startsWith('--'))
    filesToTest = specifiedFiles.length > 0 ? specifiedFiles : [SPONSORME_PATH]
  }

  if (args.includes('--report')) {
    // Generate detailed report
    for (const file of filesToTest) {
      const report = await tester.generateReport(file)
      console.log('\n📋 Detailed Mobile Test Report')
      console.log('============================')
      console.log(JSON.stringify(report, null, 2))
    }
    return
  }

  // Run test suite
  await tester.runTestSuite(filesToTest)
}

if (import.meta.main) {
  main().catch(console.error)
}
