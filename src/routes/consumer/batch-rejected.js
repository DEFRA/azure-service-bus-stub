import crypto from 'node:crypto'

import { publishToResponseTopic } from '#/common/helpers/service-bus/service-bus-broker.js'

/**
 * Example BATCH_REJECTED event as published by the payment hub response topic.
 * A caller may override any field (or the whole payload) via the request body.
 * @returns {{ type: string, data: object }}
 */
const createExampleBatchRejectedEvent = () => ({
  type: 'BATCH_REJECTED',
  data: {
    batchId: `batch-${crypto.randomUUID()}`,
    sourceSystem: 'AHWR',
    frn: 1234567890,
    sbi: 123456789,
    correlationId: crypto.randomUUID(),
    reason: 'One or more invoice lines failed payment hub validation'
  }
})

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const batchRejectedSubscription = {
  plugin: {
    name: 'azureServiceBusBatchRejectedTrigger',
    register: (server) => {
      server.route([
        {
          method: 'POST',
          path: '/trigger-batch-rejected',
          handler: (request, h) => {
            const { logger } = request
            const requestPayload =
              request.payload && typeof request.payload === 'object'
                ? request.payload
                : {}

            try {
              const payload = {
                ...createExampleBatchRejectedEvent(),
                ...requestPayload
              }

              const { messageId } = publishToResponseTopic(payload, logger)

              return h
                .response({
                  message: 'BATCH_REJECTED event published',
                  messageId
                })
                .code(202)
            } catch (error) {
              logger.error(
                error,
                'Failed to publish BATCH_REJECTED event to Service Bus'
              )

              return h
                .response({
                  message: 'Failed to publish BATCH_REJECTED event',
                  error: error?.message
                })
                .code(500)
            }
          },
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
      ])
    }
  },
  routes: { prefix: '/ffc-pay-request-response-dev' }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
