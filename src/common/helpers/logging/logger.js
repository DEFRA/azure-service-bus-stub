import { pino } from 'pino'

import { loggerOptions } from '#/plugins/logger-options.js'

const logger = pino(loggerOptions)

/**
 * @returns {Logger}
 */
export function createLogger() {
  return logger
}

/**
 * @import { Logger } from 'pino'
 */
