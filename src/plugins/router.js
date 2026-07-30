import { health } from '#/routes/health.js'
import { example } from '#/routes/example.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server) => {
      server.route([health].concat(example))
    }
  }
}
