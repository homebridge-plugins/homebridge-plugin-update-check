import type { PluginUpdatePlatformConfig } from './configTypes.js'

import { describe, expect, it } from 'vitest'

describe('pluginUpdatePlatformConfig', () => {
  it('should allow valid platform name and identifier', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
    }
    expect(config.platform).toBe('ExamplePlatform')
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
      sensorType: 'humidity',
      checkHomebridgeUpdates: true,
      checkHomebridgeUIUpdates: true,
      checkPluginUpdates: true,
      checkDockerUpdates: true,
      initialCheckDelay: 15,
      autoUpdateHomebridge: true,
      autoUpdateHomebridgeUI: false,
      autoUpdatePlugins: true,
      allowDirectNpmUpdates: false,
    }
    expect(config.platform).toBe('ExamplePlatform')
    expect(config.sensorType).toBe('humidity')
    expect(config.checkHomebridgeUpdates).toBe(true)
    expect(config.checkHomebridgeUIUpdates).toBe(true)
    expect(config.checkPluginUpdates).toBe(true)
    expect(config.checkDockerUpdates).toBe(true)
    expect(config.initialCheckDelay).toBe(15)
    expect(config.autoUpdateHomebridge).toBe(true)
    expect(config.autoUpdateHomebridgeUI).toBe(false)
    expect(config.autoUpdatePlugins).toBe(true)
    expect(config.allowDirectNpmUpdates).toBe(false)
  })

  it('should allow auto-update properties to be set independently', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      autoUpdateHomebridge: true,
      autoUpdateHomebridgeUI: false,
      autoUpdatePlugins: true,
    }
    expect(config.autoUpdateHomebridge).toBe(true)
    expect(config.autoUpdateHomebridgeUI).toBe(false)
    expect(config.autoUpdatePlugins).toBe(true)
  })

  it('should allow allowDirectNpmUpdates property to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      allowDirectNpmUpdates: true,
    }
    expect(config.allowDirectNpmUpdates).toBe(true)
  })

  it('should allow autoRestartAfterUpdates property to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      autoRestartAfterUpdates: true,
    }
    expect(config.autoRestartAfterUpdates).toBe(true)
  })

  it('should allow disableMatter property to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      disableMatter: true,
    }
    expect(config.disableMatter).toBe(true)
  })

  it('should default disableMatter to undefined when not set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
    }
    expect(config.disableMatter).toBeUndefined()
  })

  it('should allow externalAccessory property to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      externalAccessory: true,
    }
    expect(config.externalAccessory).toBe(true)
  })

  it('should default externalAccessory to undefined when not set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
    }
    expect(config.externalAccessory).toBeUndefined()
  })
})
