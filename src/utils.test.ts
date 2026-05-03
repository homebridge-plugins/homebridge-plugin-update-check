import { describe, expect, it } from 'vitest'

import { createPlatformProxy, isFailureSensorEnabled } from './utils.js'

describe('isFailureSensorEnabled', () => {
  it('should return false when failureSensorType is "none"', () => {
    expect(isFailureSensorEnabled({ failureSensorType: 'none', autoUpdateHomebridge: true } as any)).toBe(false)
  })

  it('should return false when no auto-update option is enabled', () => {
    expect(isFailureSensorEnabled({} as any)).toBe(false)
    expect(isFailureSensorEnabled({ autoUpdateHomebridge: false, autoUpdateHomebridgeUI: false, autoUpdatePlugins: false, autoUpdateNode: false } as any)).toBe(false)
  })

  it('should return true when at least one auto-update option is enabled', () => {
    expect(isFailureSensorEnabled({ autoUpdateHomebridge: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdateHomebridgeUI: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdatePlugins: true } as any)).toBe(true)
    expect(isFailureSensorEnabled({ autoUpdateNode: true } as any)).toBe(true)
  })

  it('should return false when failureSensorType is "none" even if auto-updates are enabled', () => {
    const config = {
      failureSensorType: 'none',
      autoUpdateHomebridge: true,
      autoUpdateHomebridgeUI: true,
      autoUpdatePlugins: true,
      autoUpdateNode: true,
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
    new ProxyCtor('log', { preferMatter: true, enableMatter: true }, api)

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
    new ProxyCtor('log', { preferMatter: true, enableMatter: true }, api)

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
    new ProxyCtor('log', { preferMatter: true, enableMatter: false }, api)

    expect(hapConstructed).toHaveLength(1)
    expect(matterConstructed).toHaveLength(0)
  })

  it('should fall back to HAP when preferMatter is false', () => {
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

    // Matter available but not preferred
    const api = {
      matter: {},
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
    }
    new ProxyCtor('log', { preferMatter: false, enableMatter: true }, api)

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
    new ProxyCtor('log', { preferMatter: true, enableMatter: true }, api)

    expect(matterConstructed).toHaveLength(1)
    expect(hapConstructed).toHaveLength(0)
  })
})
