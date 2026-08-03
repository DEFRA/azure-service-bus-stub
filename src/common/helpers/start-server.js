import { config } from '#/config.js'

import { createServer } from '#/server.js'

/**
 * Start the Hapi server
 * @returns {Promise<Server>}
 */
export async function startServer() {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  return server
}

/**
 * @import { Server } from '@hapi/hapi'
 */
