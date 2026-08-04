import Hapi from '@hapi/hapi'
import { secureContext } from '@defra/hapi-secure-context'
import { config } from '#/config.js'
import { router } from '#/plugins/router.js'
import { requestLogger } from '#/plugins/request-logger.js'
import { failAction } from '#/common/helpers/fail-action.js'
import { pulse } from '#/plugins/pulse.js'
import { requestTracing } from '#/plugins/request-tracing.js'
import { setupProxy } from '#/common/helpers/proxy/setup-proxy.js'
import {
  startServiceBusBroker,
  stopServiceBusBroker
} from '#/common/helpers/service-bus/service-bus-broker.js'
import { metrics } from '@defra/cdp-metrics'

/**
 * Create a Hapi server
 * @returns {Promise<Server>}
 */
export async function createServer() {
  setupProxy()
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    router
  ])

  // The in-process Service Bus (AMQP) broker that grants-payment-service
  // subscribes to via the @azure/service-bus SDK.
  await startServiceBusBroker({ logger: server.logger })
  server.events.on('stop', stopServiceBusBroker)

  return server
}

/**
 * @import { Server } from '@hapi/hapi'
 */
