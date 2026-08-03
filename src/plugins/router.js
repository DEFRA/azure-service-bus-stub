import { health } from '#/routes/health.js'
import { payRequestConsumer } from '#/routes/consumer/pay-request.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const router = {
  plugin: {
    name: 'router',
    register: async (server) => {
      server.route([health])
      await server.register([payRequestConsumer])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
