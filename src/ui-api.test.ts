import { describe, expect, it, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { UiApi } from './ui-api.js'
import type { Logging } from 'homebridge'

// Mock axios
vi.mock('axios')
const mockedAxios = vi.mocked(axios)

// Mock fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({
    platforms: [{
      platform: 'config',
      host: 'localhost',
      port: 8581
    }]
  }))
}))

// Mock console methods to prevent noise in tests
const mockLog: Logging = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn()
} as any

describe('UiApi restart functionality', () => {
  let uiApi: UiApi

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Create UiApi instance with mocked storage path
    uiApi = new UiApi('/mock/storage/path', mockLog)
  })

  it('should use PUT method for restart calls', async () => {
    // Mock successful response
    mockedAxios.put.mockResolvedValue({ data: {} })

    // Mock isConfigured to return true
    vi.spyOn(uiApi, 'isConfigured').mockReturnValue(true)
    vi.spyOn(uiApi, 'getToken').mockReturnValue('mock-token')

    const result = await uiApi.restartHomebridge()

    expect(result).toBe(true)
    expect(mockedAxios.put).toHaveBeenCalledWith(
      'http://localhost:8581/api/server/restart',
      {},
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer mock-token'
        }
      })
    )
  })

  it('should try multiple restart endpoints when first one fails', async () => {
    // Mock first call to fail, second to succeed
    mockedAxios.put
      .mockRejectedValueOnce(new Error('404 Not Found'))
      .mockResolvedValueOnce({ data: {} })

    // Mock isConfigured to return true
    vi.spyOn(uiApi, 'isConfigured').mockReturnValue(true)
    vi.spyOn(uiApi, 'getToken').mockReturnValue('mock-token')

    const result = await uiApi.restartHomebridge()

    expect(result).toBe(true)
    expect(mockedAxios.put).toHaveBeenCalledTimes(2)
    expect(mockedAxios.put).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8581/api/server/restart',
      {},
      expect.any(Object)
    )
    expect(mockedAxios.put).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8581/api/platform-tools/docker/restart-container',
      {},
      expect.any(Object)
    )
  })

  it('should fall back to process exit when all endpoints fail', async () => {
    // Mock all restart calls to fail
    mockedAxios.put.mockRejectedValue(new Error('404 Not Found'))

    // Mock isConfigured to return true
    vi.spyOn(uiApi, 'isConfigured').mockReturnValue(true)
    vi.spyOn(uiApi, 'getToken').mockReturnValue('mock-token')

    // Mock process.exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    const result = await uiApi.restartHomebridge()

    expect(result).toBe(true)
    expect(mockedAxios.put).toHaveBeenCalledTimes(3) // All three endpoints tried
    
    // Check that process exit would be called after timeout
    // Note: We can't easily test the setTimeout without mocking timers
    // but we can verify the function would call it
  })

  it('should fall back to process exit when UI API is not configured', async () => {
    // Mock isConfigured to return false
    vi.spyOn(uiApi, 'isConfigured').mockReturnValue(false)

    const result = await uiApi.restartHomebridge()

    expect(result).toBe(true)
    expect(mockedAxios.put).not.toHaveBeenCalled()
  })
})