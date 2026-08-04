import crypto from 'node:crypto'

import { config } from '#/config.js'

/**
 * A minimal, in-process Service Bus stub exposed over HTTP.
 *
 * Instead of an AMQP broker, the stub stores messages in an in-memory queue
 * and exposes REST routes that grants-payment-service polls over HTTP:
 *
 *   GET    /servicebus/subscriptions/{sub}/messages/head   – peek-lock
 *   DELETE /servicebus/subscriptions/{sub}/messages/{token} – complete
 *   POST   /servicebus/subscriptions/{sub}/messages/{token}/abandon – abandon
 *
 * Messages published via `publishToResponseTopic` are placed into every
 * known subscription queue.  Locked messages are automatically abandoned
 * after {@link LOCK_TTL_MS}.
 */

/** @type {Map<string, Array<object>>} In-memory queues keyed by subscription name */
const queues = new Map()

/** Lock time-to-live in milliseconds */
const LOCK_TTL_MS = 30_000

/** Cleanup interval timer ID */
let cleanupTimer = null

/** Known subscriptions that receive published messages */
const KNOWN_SUBSCRIPTIONS = ['grants-payment-service']

/**
 * Publish a payload to the configured topic, delivering it to every known
 * subscription's in-memory queue.
 * @param {object} payload
 * @param {import('pino').Logger} loggerParam
 * @returns {{ messageId: string }}
 */
export const publishToResponseTopic = (payload, loggerParam) => {
  const topic = config.get('serviceBus.topic')
  const messageId = crypto.randomUUID()

  const message = {
    message_id: messageId,
    content_type: 'application/json',
    subject: payload?.type ?? 'unknown',
    body: payload,
    lock_token: null,
    locked_until: null
  }

  for (const subscription of KNOWN_SUBSCRIPTIONS) {
    if (!queues.has(subscription)) {
      queues.set(subscription, [])
    }
    queues.get(subscription)?.push(message)
  }

  loggerParam.info(
    `Published message (messageId: ${messageId}) to Service Bus topic ${topic} (${KNOWN_SUBSCRIPTIONS.length} subscription(s))`
  )

  return { messageId }
}

/**
 * Start the HTTP API.  Kicks off a periodic cleanup that auto-abandons
 * expired locks so messages re-enter the queue.
 * @param {{ logger: import('pino').Logger }} options
 * @returns {number} The port the HTTP server is listening on
 */
export const startServiceBusBroker = ({ logger: loggerParam }) => {
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [, queue] of queues) {
      for (const msg of queue) {
        if (msg.locked_until && msg.locked_until.getTime() < now) {
          msg.lock_token = null
          msg.locked_until = null
        }
      }
    }
  }, 5_000)

  loggerParam.info('Service Bus HTTP API ready')
  return Number(config.get('port'))
}

/**
 * Stop the HTTP API, clearing all queues and cancelling the cleanup timer.
 */
export const stopServiceBusBroker = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  queues.clear()
}

/**
 * Peek-lock the head message of a subscription queue.
 * @param {import('@hapi/hapi').Request<{ Params: { subscription: string; lockToken: string } }>} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {import('@hapi/hapi').ResponseObject}
 */
const peekHeadMessage = (request, h) => {
  const subscription = request.params.subscription
  const queue = queues.get(subscription) ?? []
  const message = queue.find((m) => !m.lock_token)

  if (!message) {
    return h.response().code(204)
  }

  const lockToken = crypto.randomUUID()
  message.lock_token = lockToken
  message.locked_until = new Date(Date.now() + LOCK_TTL_MS)

  return h
    .response({
      messageId: message.message_id,
      body: message.body,
      subject: message.subject,
      contentType: message.content_type
    })
    .header('x-lock-token', lockToken)
    .header('x-locked-until', message.locked_until.toISOString())
    .code(200)
}

/**
 * Complete (remove) a locked message from a subscription queue.
 * @param {import('@hapi/hapi').Request<{ Params: { subscription: string; lockToken: string } }>} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {import('@hapi/hapi').ResponseObject}
 */
const completeMessage = (request, h) => {
  const subscription = request.params.subscription
  const lockToken = request.params.lockToken
  const queue = queues.get(subscription) ?? []
  const index = queue.findIndex((m) => m.lock_token === lockToken)

  if (index === -1) {
    return h
      .response({ error: 'Message not found or lock expired' })
      .code(404)
  }

  queue.splice(index, 1)
  return h.response({ message: 'Message completed' }).code(200)
}

/**
 * Abandon a locked message, returning it to the subscription queue.
 * @param {import('@hapi/hapi').Request<{ Params: { subscription: string; lockToken: string } }>} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {import('@hapi/hapi').ResponseObject}
 */
const abandonMessage = (request, h) => {
  const subscription = request.params.subscription
  const lockToken = request.params.lockToken
  const queue = queues.get(subscription) ?? []
  const message = queue.find((m) => m.lock_token === lockToken)

  if (!message) {
    return h
      .response({ error: 'Message not found or lock expired' })
      .code(404)
  }

  message.lock_token = null
  message.locked_until = null
  return h.response({ message: 'Message abandoned' }).code(200)
}

/**
 * Hapi route definitions for the Service Bus HTTP API.
 * @type {import('@hapi/hapi').ServerRoute<{ Params: { subscription: string; lockToken: string } }>[]}
 */
export const serviceBusHttpRoutes = [
  {
    method: 'GET',
    path: '/servicebus/subscriptions/{subscription}/messages/head',
    handler: peekHeadMessage,
    options: {
      plugins: {
        pino: {
          logRequestComplete: false
        }
      }
    }
  },
  {
    method: 'DELETE',
    path: '/servicebus/subscriptions/{subscription}/messages/{lockToken}',
    handler: completeMessage
  },
  {
    method: 'POST',
    path: '/servicebus/subscriptions/{subscription}/messages/{lockToken}/abandon',
    handler: abandonMessage
  }
]
