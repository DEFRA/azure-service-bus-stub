import Hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'

import { config } from '#/config.js'

import {
  publishToResponseTopic,
  startServiceBusBroker,
  stopServiceBusBroker,
  serviceBusHttpRoutes
} from './service-bus-http-api.js'

const SUBSCRIPTION = 'grants-payment-service'

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
})

const createServer = async () => {
  const server = Hapi.server()
  await server.register({ plugin: hapiPino, options: { level: 'silent' } })
  server.route(serviceBusHttpRoutes)
  return server
}

describe('serviceBusHttpApi', () => {
  const topicLogger = createLogger()

  beforeEach(() => {
    vi.clearAllMocks()
    config.set('serviceBus.topic', 'ffc-pay-request-response-dev')
  })

  afterEach(() => {
    stopServiceBusBroker()
  })

  test('publishes and delivers a message to a subscription via HTTP', async () => {
    const server = await createServer()

    const payload = { type: 'BATCH_REJECTED', data: { sbi: 123456789 } }
    const { messageId } = publishToResponseTopic(payload, topicLogger)

    const res = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })

    expect(res.statusCode).toBe(200)
    expect(res.result.messageId).toBe(messageId)
    expect(res.result.subject).toBe('BATCH_REJECTED')
    expect(res.result.contentType).toBe('application/json')
    expect(res.result.body).toEqual(payload)
    expect(res.headers['x-lock-token']).toBeDefined()
    expect(res.headers['x-locked-until']).toBeDefined()
  })

  test('returns 204 when no messages are available', async () => {
    const server = await createServer()

    const res = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })

    expect(res.statusCode).toBe(204)
  })

  test('completes (deletes) a locked message', async () => {
    const server = await createServer()

    publishToResponseTopic({ type: 'BATCH_REJECTED' }, topicLogger)

    const pollRes = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    const lockToken = String(pollRes.headers['x-lock-token'])

    const completeRes = await server.inject({
      method: 'DELETE',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/${lockToken}`
    })
    expect(completeRes.statusCode).toBe(200)

    const pollAfter = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(pollAfter.statusCode).toBe(204)
  })

  test('abandons a locked message back into the queue', async () => {
    const server = await createServer()

    publishToResponseTopic({ type: 'BATCH_REJECTED' }, topicLogger)

    const pollRes = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    const lockToken = String(pollRes.headers['x-lock-token'])

    const abandonRes = await server.inject({
      method: 'POST',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/${lockToken}/abandon`
    })
    expect(abandonRes.statusCode).toBe(200)

    const pollAfter = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(pollAfter.statusCode).toBe(200)
    expect(pollAfter.result.body).toEqual({ type: 'BATCH_REJECTED' })
  })

  test('returns 404 when completing with an unknown lock token', async () => {
    const server = await createServer()

    const res = await server.inject({
      method: 'DELETE',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/nonexistent-token`
    })
    expect(res.statusCode).toBe(404)
  })

  test('returns 404 when abandoning with an unknown lock token', async () => {
    const server = await createServer()

    const res = await server.inject({
      method: 'POST',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/nonexistent-token/abandon`
    })
    expect(res.statusCode).toBe(404)
  })

  test('only locks one message at a time', async () => {
    const server = await createServer()

    publishToResponseTopic({ type: 'BATCH_REJECTED', data: { id: 1 } }, topicLogger)
    publishToResponseTopic({ type: 'BATCH_REJECTED', data: { id: 2 } }, topicLogger)

    const first = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(first.statusCode).toBe(200)
    expect(first.result.body.data.id).toBe(1)

    const second = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(second.statusCode).toBe(200)
    expect(second.result.body.data.id).toBe(2)

    const third = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(third.statusCode).toBe(204)
  })

  test('startServiceBusBroker returns the configured port', () => {
    config.set('port', 3001)
    const port = startServiceBusBroker({ logger: topicLogger })
    expect(port).toBe(3001)
  })

  test('stopServiceBusBroker clears all queues', async () => {
    const server = await createServer()

    publishToResponseTopic({ type: 'BATCH_REJECTED' }, topicLogger)

    stopServiceBusBroker()

    const res = await server.inject({
      method: 'GET',
      url: `/servicebus/subscriptions/${SUBSCRIPTION}/messages/head`
    })
    expect(res.statusCode).toBe(204)
  })

  test('can be restarted after stopping', () => {
    startServiceBusBroker({ logger: topicLogger })
    stopServiceBusBroker()
    const port = startServiceBusBroker({ logger: topicLogger })
    expect(port).toBeGreaterThan(0)
  })
})
