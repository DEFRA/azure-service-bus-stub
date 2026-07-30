export const payRequestConsumer = {
  plugin: {
    name: 'azureServiceBusConsumer',
    register: (server) => {
      server.route([
        {
          method: 'POST',
          path: '/message',
          handler: (request, h) => h.response('').type('text/plain').code(200),
          options: {
            plugins: {
              pino: {
                logHeaders: true,
                logPayload: true,
                logResponse: true
              }
            }
          }
        }
      ]);
    }
  },
  routes: { prefix: '/ffc-pay-request-dev' }
};
