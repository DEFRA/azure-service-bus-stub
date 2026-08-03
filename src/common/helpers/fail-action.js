import { createLogger } from './logging/logger.js'

const logger = createLogger()

/**
 * Hapi fail action that logs and re-throws validation errors
 * @param {import('@hapi/hapi').Request} _request
 * @param {import('@hapi/hapi').ResponseToolkit} _h
 * @param {Error | undefined} error
 * @returns {never}
 */
export function failAction(_request, _h, error) {
  logger.warn(error, error?.message)
  throw error ?? new Error('Unknown validation error')
}
