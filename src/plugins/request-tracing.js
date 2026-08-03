import { tracing } from '@defra/hapi-tracing'
import { config } from '#/config.js'

/**
 * @satisfies {ServerRegisterPluginObject<{ tracingHeader: string }>}
 */
export const requestTracing = {
  plugin: tracing.plugin,
  options: {
    tracingHeader: config.get('tracing.header')
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
