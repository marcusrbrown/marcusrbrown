import {Logger, LogLevel} from '@/utils/logger.js'
import {describe, expect, it, vi} from 'vitest'

describe('Logger Utility', () => {
  it('should create singleton instance', () => {
    const logger1 = Logger.getInstance()
    const logger2 = Logger.getInstance()

    expect(logger1).toBe(logger2)
    expect(logger1).toBeInstanceOf(Logger)
  })

  it('should set verbose mode', () => {
    const logger = Logger.getInstance()
    logger.setVerbose(true)

    // We can't directly test the private verbose property,
    // but we can test that the method doesn't throw
    expect(() => logger.setVerbose(false)).not.toThrow()
  })

  it('should have all required log levels', () => {
    expect(LogLevel.INFO).toBe('info')
    expect(LogLevel.WARN).toBe('warn')
    expect(LogLevel.ERROR).toBe('error')
    expect(LogLevel.SUCCESS).toBe('success')
    expect(LogLevel.DEBUG).toBe('debug')
  })

  it('should format messages consistently', () => {
    const logger = Logger.getInstance()

    // Mock console to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.info('Test message')

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('💡'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'))

    consoleSpy.mockRestore()
  })

  it('should log summary with proper formatting', () => {
    const logger = Logger.getInstance()

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.summary('Test Summary', {
      item1: 'value1',
      item2: 42,
    })

    expect(consoleSpy).toHaveBeenCalledTimes(3) // title + 2 items

    consoleSpy.mockRestore()
  })
})
