import hapiPino from 'hapi-pino'

import { loggerOptions } from './logger-options.js'

// Custom message function that includes payloads in the log message
const customRequestCompleteMessage = (request, responseTime) => {
  let message = `[response] ${request.method} ${request.raw.req.url} ${request.raw.res.statusCode} (${responseTime}ms)`

  const pinoOptions = request.route.settings.plugins?.pino
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
    if (
      pinoOptions.logResponse &&
      (request?.response?.source || request?.response?.headers)
    ) {
      if (pinoOptions.logHeaders) {
        message += `\n response headers: ${JSON.stringify(request.response.headers, null, 2)}`
      }
      message += `\n response body: ${JSON.stringify(request.response.source, null, 2)}`
    }
  } catch {
    // ignore
  }

  return message
}

export const requestLogger = {
  plugin: hapiPino,
  options: { ...loggerOptions, customRequestCompleteMessage }
}
