import { describe, expect, it } from 'vitest'

import { createPlatformProxy } from './utils.js'

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
      isMatterAvailable: () => true,
      isMatterEnabled: () => true,
    }
    new ProxyCtor('log', { preferMatter: false, enableMatter: true }, api)

    expect(hapConstructed).toHaveLength(1)
    expect(matterConstructed).toHaveLength(0)
  })
})
