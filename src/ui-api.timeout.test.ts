import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UiApi } from './ui-api.js'

/**
 * A Homebridge storage directory with just enough in it for the UiApi
 * constructor, which reads config.json and .uix-secrets straight off disk.
 */
function storageDir() {
  const dir = mkdtempSync(join(tmpdir(), 'updater-timeout-'))
  writeFileSync(join(dir, 'config.json'), JSON.stringify({
    bridge: {},
    platforms: [{ platform: 'config', port: 8581 }],
  }))
  writeFileSync(join(dir, '.uix-secrets'), JSON.stringify({ secretKey: 'test-secret-key' }))
  return dir
}

function silentLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() } as any
}

describe('request timeout', () => {
  let server: ReturnType<typeof createServer>
  let url: string

  beforeEach(async () => {
    // Accepts the connection and then says nothing, so the request can only end
    // by timing out - which is what a Homebridge UI busy with its own npm
    // registry checks looks like from here (#276).
    server = createServer(() => {})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    url = `http://127.0.0.1:${address.port}/api/status/homebridge-version`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  // ⚠️ The whole point. The callers read `error.code`, and this used to reject
  // with a bare `new Error('ETIMEOUT')` - a message and no code - so the
  // timeout branch never matched and the log printed the literal word
  // "undefined" where the reason belonged.
  it('rejects with an error carrying the ETIMEOUT code, not just the message', async () => {
    const api = new UiApi(storageDir(), silentLog())

    const error = await (api as any)
      .nativeRequest('GET', url, { timeout: 50 })
      .then(() => undefined, (err: any) => err)

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('ETIMEOUT')
    expect(error.message).toBe('ETIMEOUT')
  })
})
