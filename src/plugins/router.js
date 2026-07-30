import { health } from '#/routes/health.js'
import { payRequestConsumer } from '#/routes/consumer/pay-request.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server) => {
      server.route([health])
      server.register([payRequestConsumer])
    }
  }
}
