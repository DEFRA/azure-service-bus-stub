import { serviceBusHttpRoutes } from '#/common/helpers/service-bus/service-bus-http-api.js'
import { health } from '#/routes/health.js'
import { payRequestConsumer } from '#/routes/consumer/pay-request.js'
import { batchRejectedSubscription } from '#/routes/consumer/batch-rejected.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const router = {
  plugin: {
    name: 'router',
    register: async (server) => {
      server.route([health])
      server.route(serviceBusHttpRoutes)
      await server.register([payRequestConsumer, batchRejectedSubscription])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
