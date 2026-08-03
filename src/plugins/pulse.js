import hapiPulse from 'hapi-pulse'
import { createLogger } from '#/common/helpers/logging/logger.js'

const tenSeconds = 10 * 1000

/**
 * @satisfies {ServerRegisterPluginObject<{ logger: Logger; timeout: number }>}
 */
export const pulse = {
  plugin: hapiPulse,
  options: {
    logger: createLogger(),
    timeout: tenSeconds
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { Logger } from 'pino'
 */
