import { config } from '#/config.js'

/**
 * @satisfies {ServerRoute}
 */
export const health = {
  method: 'GET',
  path: '/health',
  handler: (_request, h) =>
    h.response({
      message: 'success',
      version: config.get('serviceVersion') ?? 'dev'
    })
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
