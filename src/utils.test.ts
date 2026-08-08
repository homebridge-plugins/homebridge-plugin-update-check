import { describe, expect, it } from 'vitest'

import { createPlatformProxy, describeError, isFailureSensorEnabled } from './utils.js'

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
    void new ProxyCtor('log', { enableMatter: true }, api)

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
    void new ProxyCtor('log', { enableMatter: true }, api)

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
    void new ProxyCtor('log', { enableMatter: false }, api)

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
    void new ProxyCtor('log', { enableMatter: true }, api)

    expect(matterConstructed).toHaveLength(1)
    expect(hapConstructed).toHaveLength(0)
  })

  it('should delegate configureAccessory to the Matter impl (stale HAP cleanup)', () => {
    const configuredAccessories: any[] = []

    class MockHAPPlatform {
      constructor() {}
      configureAccessory(accessory: any) {
        // Should not be called when Matter is active
        configuredAccessories.push({ platform: 'hap', accessory })
      }
    }

    class MockMatterPlatform {
      constructor() {}
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

describe('describeError', () => {
  it('uses the error code, which is the most useful thing for a network failure', () => {
    expect(describeError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe('ECONNREFUSED')
  })

  // ⚠️ The reason this exists. Reading `error.code` on an error that has none
  // put the literal word "undefined" in the log where the reason should have
  // been, so the line said something failed and then withheld what (#276).
  it('falls back to the message when the error carries no code', () => {
    expect(describeError(new Error('socket hang up'))).toBe('socket hang up')
  })

  it('ignores an empty code rather than logging a blank reason', () => {
    expect(describeError(Object.assign(new Error('socket hang up'), { code: '' }))).toBe('socket hang up')
  })

  it('handles a value that was never an Error', () => {
    expect(describeError('everything broke')).toBe('everything broke')
  })

  // "[object Object]" tells a reader no more than "undefined" did.
  it('says something readable for a plain object with nothing on it', () => {
    expect(describeError({})).toBe('unknown error')
  })

  it('does not fall over on null or undefined', () => {
    expect(describeError(null)).toBe('null')
    expect(describeError(undefined)).toBe('undefined')
  })
})
