import Hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'

import { publishToResponseTopic } from '#/common/helpers/service-bus/service-bus-http-api.js'

import { batchRejectedSubscription } from './batch-rejected.js'

vi.mock('#/common/helpers/service-bus/service-bus-http-api.js', () => ({
  publishToResponseTopic: vi.fn()
}))

const createServer = async () => {
  const server = Hapi.server()
  await server.register({
    plugin: hapiPino,
    options: { level: 'silent' }
  })
  await server.register(batchRejectedSubscription)
  return server
}

describe('batchRejectedSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publishToResponseTopic.mockReturnValue({ messageId: 'test-message-id' })
  })

  test('publishes a BATCH_REJECTED event and returns 202', async () => {
    const server = await createServer()

    const res = await server.inject({
      method: 'POST',
      url: '/ffc-pay-request-response-dev/trigger-batch-rejected',
      payload: {}
    })

    expect(res.statusCode).toBe(202)
    expect(res.result).toEqual({
      message: 'BATCH_REJECTED event published',
      messageId: 'test-message-id'
    })
  })

  test('publishes an example BATCH_REJECTED event when no payload is provided', async () => {
    const server = await createServer()

    await server.inject({
      method: 'POST',
      url: '/ffc-pay-request-response-dev/trigger-batch-rejected'
    })

    expect(publishToResponseTopic).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BATCH_REJECTED' }),
      expect.any(Object)
    )
  })

  test('merges a caller supplied payload over the example event', async () => {
    const server = await createServer()

    await server.inject({
      method: 'POST',
      url: '/ffc-pay-request-response-dev/trigger-batch-rejected',
      payload: {
        data: {
          batchId: 'custom-batch',
          frn: 9999999999
        }
      }
    })

    const [publishedPayload] = publishToResponseTopic.mock.calls[0]
    expect(publishedPayload.type).toBe('BATCH_REJECTED')
    expect(publishedPayload.data).toEqual({
      batchId: 'custom-batch',
      frn: 9999999999
    })
  })

  test('returns 500 when publishing fails', async () => {
    publishToResponseTopic.mockImplementation(() => {
      throw new Error('broker down')
    })
    const server = await createServer()

    const res = await server.inject({
      method: 'POST',
      url: '/ffc-pay-request-response-dev/trigger-batch-rejected',
      payload: {}
    })

    expect(res.statusCode).toBe(500)
    expect(res.result).toEqual({
      message: 'Failed to publish BATCH_REJECTED event',
      error: 'broker down'
    })
  })
})
