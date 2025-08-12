/* eslint-disable no-console */
/**
 * Centralized logging utility for consistent output formatting
 */

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success',
  DEBUG = 'debug',
}

const LOG_COLORS = {
  [LogLevel.INFO]: '💡',
  [LogLevel.WARN]: '⚠️',
  [LogLevel.ERROR]: '❌',
  [LogLevel.SUCCESS]: '✅',
  [LogLevel.DEBUG]: '🔍',
} as const

export class Logger {
  private static instance: Logger | undefined
  private verbose = false

  private constructor() {}

  static getInstance(): Logger {
    if (Logger.instance === undefined) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }

  info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message))
  }

  warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message))
  }

  error(message: string, error?: Error): void {
    console.error(this.formatMessage(LogLevel.ERROR, message))
    if (error !== undefined && this.verbose) {
      console.error(error.stack)
    }
  }

  success(message: string): void {
    console.log(this.formatMessage(LogLevel.SUCCESS, message))
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(this.formatMessage(LogLevel.DEBUG, message))
    }
  }

  /**
   * Log a progress update with metrics
   */
  progress(message: string, metrics?: Record<string, number | string>): void {
    let output = this.formatMessage(LogLevel.INFO, message)

    if (metrics !== undefined) {
      const metricsStr = Object.entries(metrics)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      output += `\n   📊 ${metricsStr}`
    }

    console.log(output)
  }

  /**
   * Log a summary with multiple data points
   */
  summary(title: string, items: Record<string, string | number>): void {
    console.log(this.formatMessage(LogLevel.SUCCESS, title))
    for (const [key, value] of Object.entries(items)) {
      console.log(`   ${key}: ${value}`)
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const icon = LOG_COLORS[level]
    const timestamp = new Date().toISOString()
    return `${icon} [${timestamp}] ${message}`
  }
}

// Export singleton instance
export const logger = Logger.getInstance()
