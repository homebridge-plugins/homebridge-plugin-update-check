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

  it('should allow all properties to be set', () => {
    const config: PluginUpdatePlatformConfig = {
      platform: 'ExamplePlatform',
      forceNcu: true,
      sensorType: 'humidity',
      checkHomebridgeUpdates: true,
      checkHomebridgeUIUpdates: true,
      checkPluginUpdates: true,
      checkDockerUpdates: false,
      autoUpdateHomebridge: true,
      autoUpdateHomebridgeUI: false,
      autoUpdatePlugins: true,
      allowDirectNpmUpdates: false,
    }
    expect(config.platform).toBe('ExamplePlatform')
    expect(config.forceNcu).toBe(true)
    expect(config.sensorType).toBe('humidity')
    expect(config.checkHomebridgeUpdates).toBe(true)
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
})
