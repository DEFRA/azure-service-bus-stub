import { config } from '#/config.js'

export const health = {
  method: 'GET',
  path: '/health',
  handler: (_request, h) =>
    h.response({
      message: 'success',
      version: config.get('serviceVersion') ?? 'dev'
    })
}
