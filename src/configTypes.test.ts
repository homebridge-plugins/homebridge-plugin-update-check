import type { PluginUpdatePlatformConfig } from './configTypes.js'

import { describe, expect, it } from 'vitest'

describe('pluginUpdatePlatformConfig', () => {
  it('should allow valid platform name and identifier', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
    }
    expect(config.platform).toBe('ExamplePlatform')
  })

  it('should allow optional forceNcu property', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      forceNcu: true,
    }
    expect(config.forceNcu).toBe(true)
  })

  it('should allow optional sensorType property', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      sensorType: 'temperature',
    }
    expect(config.sensorType).toBe('temperature')
  })

  it('should allow optional initialCheckDelay property', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      initialCheckDelay: 30,
    }
    expect(config.initialCheckDelay).toBe(30)
  })

  it('should allow all properties to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      forceNcu: true,
      sensorType: 'humidity',
      checkHomebridgeUpdates: true,
      checkHomebridgeUIUpdates: true,
      checkPluginUpdates: true,
      checkDockerUpdates: true,
      initialCheckDelay: 15,
    }
    expect(config.platform).toBe('ExamplePlatform')
    expect(config.forceNcu).toBe(true)
    expect(config.sensorType).toBe('humidity')
    expect(config.checkHomebridgeUpdates).toBe(true)
    expect(config.checkHomebridgeUIUpdates).toBe(true)
    expect(config.checkPluginUpdates).toBe(true)
    expect(config.checkDockerUpdates).toBe(true)
    expect(config.initialCheckDelay).toBe(15)
  })
})
