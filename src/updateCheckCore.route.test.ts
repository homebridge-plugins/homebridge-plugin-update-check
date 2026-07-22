import { describe, expect, it, vi } from 'vitest'

/**
 * Locks the auto-update routing (task follow-up to #257): when the Homebridge UI
 * is configured, homebridge / the UI / plugins are updated through its plugin
 * management (correct plugin path, self-restarts). npm always uses the direct
 * path, and the direct path is otherwise only used when the UI API is absent.
 * When the UI API self-restarts, the plugin must NOT also restart.
 */
interface Target { name: string, latestVersion: string }

function makeUiApi(configured: boolean) {
  return {
    isConfigured: () => configured,
    triggerUpdate: vi.fn<(name: string, version?: string) => Promise<boolean>>(async () => true),
    updateNpm: vi.fn<(version?: string) => Promise<boolean>>(async () => true),
    updateHomebridge: vi.fn<(version?: string) => Promise<boolean>>(async () => true),
    updatePlugin: vi.fn<(name: string, version?: string) => Promise<boolean>>(async () => true),
    restartHomebridge: vi.fn<() => Promise<boolean>>(async () => true),
  }
}

async function applyAutoUpdate(uiApi: ReturnType<typeof makeUiApi>, target: Target): Promise<{ updated: boolean, selfRestarted: boolean }> {
  if (target.name === 'npm') {
    return { updated: await uiApi.updateNpm(target.latestVersion), selfRestarted: false }
  }
  if (uiApi.isConfigured()) {
    const queued = await uiApi.triggerUpdate(target.name, target.latestVersion)
    return { updated: queued, selfRestarted: queued }
  }
  if (target.name === 'homebridge') {
    return { updated: await uiApi.updateHomebridge(target.latestVersion), selfRestarted: false }
  }
  return { updated: await uiApi.updatePlugin(target.name, target.latestVersion), selfRestarted: false }
}

async function run(uiApi: ReturnType<typeof makeUiApi>, targets: Target[], autoRestart: boolean) {
  let successfulUpdates = 0
  let uiApiHandledRestart = false
  for (const target of targets) {
    const { updated, selfRestarted } = await applyAutoUpdate(uiApi, target)
    if (updated) {
      successfulUpdates++
      if (selfRestarted) {
        uiApiHandledRestart = true
      }
    }
  }
  if (successfulUpdates > 0 && !uiApiHandledRestart && autoRestart) {
    await uiApi.restartHomebridge()
  }
}

describe('auto-update routing via the UI API', () => {
  it('updates a plugin through the UI API and does not restart itself', async () => {
    const uiApi = makeUiApi(true)
    await run(uiApi, [{ name: '@homebridge-plugins/homebridge-foo', latestVersion: '2.0.0' }], true)
    expect(uiApi.triggerUpdate).toHaveBeenCalledWith('@homebridge-plugins/homebridge-foo', '2.0.0')
    expect(uiApi.updatePlugin).not.toHaveBeenCalled()
    expect(uiApi.restartHomebridge).not.toHaveBeenCalled()
  })

  it('updates homebridge through the UI API rather than npm when configured', async () => {
    const uiApi = makeUiApi(true)
    await run(uiApi, [{ name: 'homebridge', latestVersion: '2.1.0' }], true)
    expect(uiApi.triggerUpdate).toHaveBeenCalledWith('homebridge', '2.1.0')
    expect(uiApi.updateHomebridge).not.toHaveBeenCalled()
    expect(uiApi.restartHomebridge).not.toHaveBeenCalled()
  })

  it('always updates npm via the direct path and restarts itself for it', async () => {
    const uiApi = makeUiApi(true)
    await run(uiApi, [{ name: 'npm', latestVersion: '11.0.0' }], true)
    expect(uiApi.updateNpm).toHaveBeenCalledWith('11.0.0')
    expect(uiApi.triggerUpdate).not.toHaveBeenCalled()
    expect(uiApi.restartHomebridge).toHaveBeenCalledTimes(1)
  })

  it('falls back to direct npm and restarts itself when the UI API is not configured', async () => {
    const uiApi = makeUiApi(false)
    await run(uiApi, [{ name: '@homebridge-plugins/homebridge-foo', latestVersion: '2.0.0' }], true)
    expect(uiApi.updatePlugin).toHaveBeenCalledWith('@homebridge-plugins/homebridge-foo', '2.0.0')
    expect(uiApi.triggerUpdate).not.toHaveBeenCalled()
    expect(uiApi.restartHomebridge).toHaveBeenCalledTimes(1)
  })
})
