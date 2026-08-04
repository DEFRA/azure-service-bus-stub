import crypto from 'node:crypto'

import rhea from 'rhea'

import { config } from '#/config.js'

/**
 * A minimal, in-process AMQP 1.0 Service Bus broker built on `rhea`.
 *
 * grants-payment-service subscribes to the `ffc-pay-request-response-dev`
 * topic using the real `@azure/service-bus` SDK. The SDK opens a plain AMQP
 * connection (SASL PLAIN) and attaches a receiver link whose source address is
 * the Service Bus node name for a topic subscription
 * (`{topic}/subscriptions/{subscription}`). This broker accepts those links and
 * forwards any event published via `publishToResponseTopic` to all matching
 * subscribers, replacing the need for a separate Service Bus emulator container.
 */

/** @type {Map<object, string>} Sender (client receiver link) keyed by its source address */
const senderAddresses = new Map()

/** @type {Set<object>} Open client connections */
const connections = new Set()

/** @type {object | null} */
let container = null

/** @type {import('node:net').Server | null} */
let listener = null

/** @type {import('pino').Logger | null} */
let logger = null

/** @type {object | null} Server-side sender linked to the SDK's $cbs receiver */
let cbsSender = null

/**
 * Get the AMQP source address of a sender (a client receiver link)
 * @param {{ source?: { address?: string } | string }} sender
 * @returns {string | undefined}
 */
const getSourceAddress = (sender) => {
  const source = sender?.source

  if (!source) {
    return undefined
  }

  return typeof source === 'string' ? source : source.address
}

/**
 * Register a client receiver link as a subscription to its source address
 * @param {object} sender
 */
const registerSubscription = (sender) => {
  const address = getSourceAddress(sender)

  if (!address) {
    return
  }

  senderAddresses.set(sender, address)
  logger?.info(`Service Bus subscription attached (source: ${address})`)
}

/**
 * Unregister a client receiver link
 * @param {object} sender
 */
const unregisterSubscription = (sender) => {
  const address = getSourceAddress(sender)

  senderAddresses.delete(sender)
  logger?.info(
    `Service Bus subscription detached (source: ${address ?? 'unknown'})`
  )
}

/**
 * Start the in-process Service Bus broker
 * @param {{ logger: import('pino').Logger }} options
 * @returns {Promise<number>} The port the broker is listening on
 */
export const startServiceBusBroker = async ({ logger: loggerParam }) => {
  if (container) {
    throw new Error('Service Bus broker is already running')
  }

  logger = loggerParam
  container = rhea.create_container()
  container.options.local_settle = false

  const log = loggerParam

  container.sasl_server_mechanisms.enable_anonymous()
  container.sasl_server_mechanisms.enable_plain((username) => {
    log.info(`Service Bus client authenticating (username: ${username})`)
    return true
  })

  container.on('connection_open', (context) => {
    connections.add(context.connection)
    log.info(
      `Service Bus client connected (remote: ${context.connection.remote_address ?? 'unknown'})`
    )
  })

  container.on('connection_close', (context) => {
    connections.delete(context.connection)
    log.info(
      `Service Bus client disconnected (remote: ${context.connection.remote_address ?? 'unknown'})`
    )
  })

  container.on('connection_error', (context) => {
    log.error(context.error, 'Service Bus connection error')
  })

  container.on('sender_open', (context) => {
    const address = getSourceAddress(context.sender)
    if (address === '$cbs') {
      cbsSender = context.sender
      log.debug('Service Bus CBS receiver link opened by client')
      return
    }
    registerSubscription(context.sender)
  })

  container.on('sender_close', (context) => {
    const address = getSourceAddress(context.sender)
    if (address === '$cbs') {
      cbsSender = null
      return
    }
    unregisterSubscription(context.sender)
  })

  container.on('receiver_open', (context) => {
    const target =
      typeof context.receiver?.target === 'string'
        ? context.receiver.target
        : context.receiver?.target?.address
    log.debug(`Service Bus client link opened (target: ${target ?? 'unknown'})`)
  })

  container.on('message', (context) => {
    const { message } = context

    if (message?.to !== '$cbs' || !message?.reply_to) {
      return
    }

    log.debug(
      `Service Bus CBS PUT-TOKEN received (messageId: ${message.message_id ?? 'unknown'}, replyTo: ${message.reply_to})`
    )

    if (!cbsSender) {
      log.warn('No CBS sender available to respond to PUT-TOKEN')
      return
    }

    const response = {
      correlation_id: message.message_id,
      application_properties: {
        'status-code': 200,
        'status-description': 'OK'
      }
    }

    cbsSender.send(response)
  })

  container.on('settled', () => {
    log.debug('Service Bus message settled')
  })

  container.on('error', (error) => {
    log.error(error, 'Service Bus broker error')
  })

  const host = config.get('serviceBus.host')
  const port = config.get('serviceBus.amqpPort')

  const netServer = container.listen({ host, port })
  listener = netServer

  netServer.on('error', (error) => {
    log.error(error, 'Service Bus broker listen error')
  })

  await new Promise((resolve, reject) => {
    netServer.once('listening', resolve)
    netServer.once('error', reject)
  })

  const actualPort = /** @type {import('node:net').AddressInfo} */ (
    netServer.address()
  ).port

  log.info(`Service Bus broker listening on ${host}:${actualPort}`)

  return actualPort
}

/**
 * Stop the in-process Service Bus broker, closing all client connections
 */
export const stopServiceBusBroker = () => {
  if (!container) {
    return
  }

  for (const connection of connections) {
    connection.close()
  }
  connections.clear()
  senderAddresses.clear()
  cbsSender = null

  listener?.close()
  listener = null
  container = null

  logger?.info('Service Bus broker stopped')
}

/**
 * Publish a payload to the configured topic, delivering it to every attached
 * subscription of that topic
 * @param {object} payload
 * @param {import('pino').Logger} loggerParam
 * @returns {{ messageId: string }} The message ID of the published message
 */
export const publishToResponseTopic = (payload, loggerParam) => {
  const topic = config.get('serviceBus.topic')
  const messageId = crypto.randomUUID()
  const lockToken = crypto.randomUUID()

  const message = {
    message_id: messageId,
    content_type: 'application/json',
    subject: payload?.type ?? 'unknown',
    creation_time: new Date(),
    body: payload,
    message_annotations: {
      'x-opt-locked-until': new Date(Date.now() + 30_000)
    }
  }

  let delivered = 0

  for (const [sender, address] of senderAddresses) {
    if (
      address !== topic &&
      !address.toLowerCase().startsWith(`${topic.toLowerCase()}/subscriptions/`)
    ) {
      continue
    }

    try {
      sender.send(message, lockToken)
      delivered += 1
      loggerParam.info(
        `Delivered message (messageId: ${messageId}) to Service Bus subscription (${address})`
      )
    } catch (error) {
      loggerParam.error(
        error,
        `Failed to deliver message (messageId: ${messageId}) to Service Bus subscription (${address})`
      )
    }
  }

  if (delivered === 0) {
    loggerParam.warn(
      `Published message (messageId: ${messageId}) to Service Bus topic ${topic} but no subscribers were attached`
    )
  }

  return { messageId }
}
