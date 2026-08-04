import hapiPino from 'hapi-pino'

import { loggerOptions } from './logger-options.js'

/**
 * Per-route pino options read by the request logger.
 * @typedef {object} PinoRoutePlugins
 * @property {object} [pino] Per-route logging configuration
 * @property {boolean} [pino.logHeaders] Include request headers in the log message
 * @property {boolean} [pino.logPayload] Include the request body in the log message
 * @property {boolean} [pino.logResponse] Include the response body in the log message
 * @property {boolean} [pino.logRequestComplete] When false, suppress the response log for this route
 */

// Custom message function that includes payloads in the log message
/**
 * @param {Request} request
 * @param {number} responseTime
 * @returns {string}
 */
const customRequestCompleteMessage = (request, responseTime) => {
  let message = `[response] ${request.method} ${request.raw.req.url} ${request.raw.res.statusCode} (${responseTime}ms)`

  /** @type {PinoRoutePlugins | undefined} */
  const routePlugins = request.route.settings.plugins
  const pinoOptions = routePlugins?.pino
  if (!pinoOptions) return message

  try {
    if (pinoOptions.logHeaders) {
      const filteredHeaders = Object.entries(request.headers).reduce(
        (acc, [key, value]) => {
          if (key !== 'x-api-key') {
            acc[key] = value
          }
          return acc
        },
        {}
      )

      if (Object.keys(filteredHeaders).length > 0) {
        message += `\n request headers: ${JSON.stringify(filteredHeaders, null, 2)}`
      }
    }

    if (pinoOptions.logPayload && request?.payload) {
      message += `\n request body: ${JSON.stringify(request.payload, null, 2)}`
    }

    const response = /** @type {ResponseObject | undefined} */ (
      request.response
    )
    if (pinoOptions.logResponse && (response?.source || response?.headers)) {
      if (pinoOptions.logHeaders) {
        message += `\n response headers: ${JSON.stringify(response.headers, null, 2)}`
      }
      message += `\n response body: ${JSON.stringify(response.source, null, 2)}`
    }
  } catch {
    // ignore
  }

  return message
}

// Suppress the response log for routes that opt out via their pino plugin
// options, e.g. endpoints that are polled frequently.
/**
 * @param {Request} request
 * @returns {boolean}
 */
const shouldLogRequestComplete = (request) => {
  /** @type {PinoRoutePlugins | undefined} */
  const routePlugins = request.route.settings.plugins
  return routePlugins?.pino?.logRequestComplete !== false
}

/**
 * @satisfies {ServerRegisterPluginObject<Options>}
 */
export const requestLogger = {
  plugin: hapiPino,
  options: {
    ...loggerOptions,
    customRequestCompleteMessage,
    logRequestComplete: shouldLogRequestComplete
  }
}

/**
 * @import { Options } from 'hapi-pino'
 * @import { Request, ResponseObject, ServerRegisterPluginObject } from '@hapi/hapi'
 */
