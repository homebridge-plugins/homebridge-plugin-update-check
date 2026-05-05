import { describe, expect, it } from 'vitest'

import { createPlatformProxy, isFailureSensorEnabled } from './utils.js'

describe('isFailureSensorEnabled', () => {
  it('should return false when failureSensorType is "none"', () => {
    expect(isFailureSensorEnabled({ failureSensorType: 'none', autoUpdateHomebridge: true } as any)).toBe(false)
  })

  it('should return false when no auto-update option is enabled', () => {
    expect(isFailureSensorEnabled({} as any)).toBe(false)
    expect(isFailureSensorEnabled({ autoUpdateHomebridge: false, autoUpdateHomebridgeUI: false, autoUpdatePlugins: false, autoUpdateNode: false, autoUpdateNpm: false } as any)).toBe(false)
  })

  it('should return true when at least one auto-update option is enabled', () => {
    expect(isFailureSensorEnabled({ autoUpdateHomebridge: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdateHomebridgeUI: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdatePlugins: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdateNode: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdateNpm: true } as any)).toBe(true)
  })

  it('should return false when failureSensorType is "none" even if auto-updates are enabled', () => {
    const config = {
      failureSensorType: 'none',
      autoUpdateHomebridge: true,
      autoUpdateHomebridgeUI: true,
      autoUpdatePlugins: true,
      autoUpdateNode: true,
      autoUpdateNpm: true,
    }
    expect(isFailureSensorEnabled(config as any)).toBe(false)
  })

  it('should return true when failureSensorType is a valid sensor and auto-update is enabled', () => {
    expect(isFailureSensorEnabled({ failureSensorType: 'motion', autoUpdateHomebridge: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ failureSensorType: 'contact', autoUpdatePlugins: true } as any)).toBe(true)
  })
})

describe('createPlatformProxy', () => {
  it('should fall back to HAP platform when Matter is not available', () => {
    const hapConstructed: any[] = []
    const matterConstructed: any[] = []

    class MockHAPPlatform {
      constructor(log: any, config: any, api: any) {
        hapConstructed.push({ log, config, api })
      }
    }

    class MockMatterPlatform {
      constructor(log: any, config: any, api: any) {
        matterConstructed.push({ log, config, api })
      }
    }

    const ProxyCtor = createPlatformProxy(MockHAPPlatform, MockMatterPlatform)

    // api without Matter support
    const api = {}
    new ProxyCtor('log', { enableMatter: true }, api)

    expect(hapConstructed).toHaveLength(1)
    expect(matterConstructed).toHaveLength(0)
  })

  it('should use Matter platform when Matter is available and enabled', () => {
    const hapConstructed: any[] = []
    const matterConstructed: any[] = []

    class MockHAPPlatform {
      constructor(log: any, config: any, api: any) {
        hapConstructed.push({ log, config, api })
      }
    }

    class MockMatterPlatform {
      constructor(log: any, config: any, api: any) {
        matterConstructed.push({ log, config, api })
      }
    }

    const ProxyCtor = createPlatformProxy(MockHAPPlatform, MockMatterPlatform)

    // api with Matter support available and enabled
    const api = {
      matter: {},
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
    }
    new ProxyCtor('log', { enableMatter: true }, api)

    expect(matterConstructed).toHaveLength(1)
    expect(hapConstructed).toHaveLength(0)
  })

  it('should fall back to HAP when enableMatter is false', () => {
    const hapConstructed: any[] = []
    const matterConstructed: any[] = []

    class MockHAPPlatform {
      constructor(log: any, config: any, api: any) {
        hapConstructed.push({ log, config, api })
      }
    }

    class MockMatterPlatform {
      constructor(log: any, config: any, api: any) {
        matterConstructed.push({ log, config, api })
      }
    }

    const ProxyCtor = createPlatformProxy(MockHAPPlatform, MockMatterPlatform)

    // Matter available but disabled in config
    const api = {
      matter: {},
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
    }
    new ProxyCtor('log', { enableMatter: false }, api)

    expect(hapConstructed).toHaveLength(1)
    expect(matterConstructed).toHaveLength(0)
  })

  it('should use Matter when isMatter* APIs are unavailable but matter API exists', () => {
    const hapConstructed: any[] = []
    const matterConstructed: any[] = []

    class MockHAPPlatform {
      constructor(log: any, config: any, api: any) {
        hapConstructed.push({ log, config, api })
      }
    }

    class MockMatterPlatform {
      constructor(log: any, config: any, api: any) {
        matterConstructed.push({ log, config, api })
      }
    }

    const ProxyCtor = createPlatformProxy(MockHAPPlatform, MockMatterPlatform)

    // API shape used in some Homebridge versions/plugins where isMatter* may not exist.
    const api = {
      matter: {},
    }
    new ProxyCtor('log', { enableMatter: true }, api)

    expect(matterConstructed).toHaveLength(1)
    expect(hapConstructed).toHaveLength(0)
  })

  it('should delegate configureAccessory to the Matter impl (stale HAP cleanup)', () => {
    const configuredAccessories: any[] = []

    class MockHAPPlatform {
      constructor(_log: any, _config: any, _api: any) {}
      configureAccessory(accessory: any) {
        // Should not be called when Matter is active
        configuredAccessories.push({ platform: 'hap', accessory })
      }
    }

    class MockMatterPlatform {
      constructor(_log: any, _config: any, _api: any) {}
      configureAccessory(accessory: any) {
        configuredAccessories.push({ platform: 'matter', accessory })
      }
    }

    const ProxyCtor = createPlatformProxy(MockHAPPlatform, MockMatterPlatform)
    const api = { matter: {}, isMatterAvailable: () => true, isMatterEnabled: () => true }
    const proxy = new ProxyCtor('log', { enableMatter: true }, api)

    const staleAccessory = { UUID: 'old-hap-uuid', displayName: 'Homebridge Plugin Update' }
    proxy.configureAccessory(staleAccessory)

    expect(configuredAccessories).toHaveLength(1)
    expect(configuredAccessories[0].platform).toBe('matter')
    expect(configuredAccessories[0].accessory).toBe(staleAccessory)
  })
})
