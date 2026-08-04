import rhea from 'rhea'

import { config } from '#/config.js'

import {
  publishToResponseTopic,
  startServiceBusBroker,
  stopServiceBusBroker
} from './service-bus-broker.js'

const SUBSCRIPTION_ADDRESS =
  'ffc-pay-request-response-dev/subscriptions/grants-payment-service'

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
})

const subscribe = (port, address) => {
  const client = rhea.create_container()

  let resolveMessage
  let rejectMessage
  const message = new Promise((resolve, reject) => {
    resolveMessage = resolve
    rejectMessage = reject
  })

  client.on('message', (context) => {
    resolveMessage(context.message)
  })

  client.on('connection_error', (context) => {
    rejectMessage(context.error)
  })

  const connection = client.connect({
    host: '127.0.0.1',
    port,
    username: 'RootManageSharedAccessKey',
    password: 'SAS_KEY_VALUE',
    reconnect: false
  })

  const receiver = connection.open_receiver(address)

  return {
    message,
    opened: new Promise((resolve) => receiver.on('receiver_open', resolve)),
    close: () => connection.close()
  }
}

describe('serviceBusBroker', () => {
  const topicLogger = createLogger()

  beforeEach(() => {
    vi.clearAllMocks()
    config.set('serviceBus.host', '127.0.0.1')
    config.set('serviceBus.amqpPort', 0)
    config.set('serviceBus.topic', 'ffc-pay-request-response-dev')
  })

  afterEach(() => {
    stopServiceBusBroker()
  })

  test('starts listening on a port', async () => {
    const port = await startServiceBusBroker({ logger: topicLogger })

    expect(port).toBeGreaterThan(0)
  })

  test('delivers a published event to a matching subscription', async () => {
    const port = await startServiceBusBroker({ logger: topicLogger })
    const subscription = subscribe(port, SUBSCRIPTION_ADDRESS)
    await subscription.opened

    await vi.waitFor(() => {
      expect(topicLogger.info).toHaveBeenCalledWith(
        `Service Bus subscription attached (source: ${SUBSCRIPTION_ADDRESS})`
      )
    })

    const payload = { type: 'BATCH_REJECTED', data: { sbi: 123456789 } }
    const { messageId } = publishToResponseTopic(payload, topicLogger)

    const message = await subscription.message
    expect(message.message_id).toBe(messageId)
    expect(message.subject).toBe('BATCH_REJECTED')
    expect(message.content_type).toBe('application/json')
    expect(message.body).toEqual(payload)

    subscription.close()
  })

  test('authenticates the client with SASL PLAIN', async () => {
    const port = await startServiceBusBroker({ logger: topicLogger })
    const subscription = subscribe(port, SUBSCRIPTION_ADDRESS)

    await vi.waitFor(() => {
      expect(topicLogger.info).toHaveBeenCalledWith(
        'Service Bus client authenticating (username: RootManageSharedAccessKey)'
      )
    })

    subscription.close()
  })

  test('does not deliver to a subscription for another topic', async () => {
    const port = await startServiceBusBroker({ logger: topicLogger })
    const otherAddress = 'other-topic/subscriptions/other-subscription'
    const subscription = subscribe(port, otherAddress)
    await subscription.opened

    await vi.waitFor(() => {
      expect(topicLogger.info).toHaveBeenCalledWith(
        `Service Bus subscription attached (source: ${otherAddress})`
      )
    })

    publishToResponseTopic({ type: 'BATCH_REJECTED' }, topicLogger)

    await expect(
      Promise.race([
        subscription.message.then(() => 'received'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 200))
      ])
    ).resolves.toBe('timeout')
  })

  test('warns when publishing with no subscribers attached', async () => {
    await startServiceBusBroker({ logger: topicLogger })

    const { messageId } = publishToResponseTopic(
      { type: 'BATCH_REJECTED' },
      topicLogger
    )

    expect(messageId).toBeDefined()
    expect(topicLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no subscribers were attached')
    )
  })

  test('throws when started twice', async () => {
    await startServiceBusBroker({ logger: topicLogger })

    await expect(
      startServiceBusBroker({ logger: topicLogger })
    ).rejects.toThrow('Service Bus broker is already running')
  })

  test('can be restarted after stopping', async () => {
    const firstPort = await startServiceBusBroker({ logger: topicLogger })
    expect(firstPort).toBeGreaterThan(0)

    stopServiceBusBroker()

    const secondPort = await startServiceBusBroker({ logger: topicLogger })
    expect(secondPort).toBeGreaterThan(0)
  })
})
