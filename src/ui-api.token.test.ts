import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import jwt from 'jsonwebtoken'
import { describe, expect, it, vi } from 'vitest'

import { PLUGIN_NAME } from './settings.js'
import { UiApi } from './ui-api.js'

const SECRET_KEY = 'test-secret-key'

/**
 * A Homebridge storage directory with just enough in it for the UiApi
 * constructor, which reads config.json and .uix-secrets straight off disk.
 */
function storageDir() {
  const dir = mkdtempSync(join(tmpdir(), 'updater-token-'))
  writeFileSync(join(dir, 'config.json'), JSON.stringify({
    bridge: {},
    platforms: [{ platform: 'config', port: 8581 }],
  }))
  writeFileSync(join(dir, '.uix-secrets'), JSON.stringify({ secretKey: SECRET_KEY }))
  return dir
}

function silentLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn() } as any
}

function decodeToken() {
  const api = new UiApi(storageDir(), silentLog())
  return jwt.verify(api.getToken(), SECRET_KEY) as Record<string, any>
}

/**
 * There is no account to log in with, so the token is signed with the UI's own
 * secret key. What the UI does with it depends on the claims below.
 */
describe('the token used for the homebridge ui api', () => {
  /**
   * ⚠️ The whole point of this file. The UI checks a token's username against
   * its auth file to revoke deleted and demoted users, and this plugin's
   * username has never been a user - so without `service` to mark the token as
   * belonging to a program, every request comes back 401 (homebridge-updater
   * stopped working entirely against homebridge-config-ui-x 5.27.1 betas).
   */
  it('declares itself a service, so the ui does not look for a user record', () => {
    expect(decodeToken().service).toBe(PLUGIN_NAME)
  })

  /**
   * The UI caps how long a service token may be valid for, and rejects one
   * that outlives the cap. One minute leaves plenty of room; anything near the
   * cap would be a slow-clock failure waiting to happen.
   */
  it('is short-lived, well inside the maximum the ui allows', () => {
    const { iat, exp } = decodeToken()
    expect(exp - iat).toBeLessThanOrEqual(60)
  })

  /**
   * Not new, but the other half of what the UI checks: a token minted for a
   * different instance is rejected outright.
   */
  it('identifies the instance it was minted for', () => {
    expect(decodeToken().instanceId).toBe(createHash('sha256').update(SECRET_KEY).digest('hex'))
  })

  it('asks for the administrator endpoints it uses', () => {
    expect(decodeToken().admin).toBe(true)
  })
})
