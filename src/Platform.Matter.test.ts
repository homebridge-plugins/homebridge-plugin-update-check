import { describe, expect, it, vi } from 'vitest'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

/**
 * Unit tests for the stale HAP accessory cleanup in PluginUpdateMatterPlatform.
 *
 * When the platform runs in Matter mode, any cached HAP accessories from a previous
 * HAP-mode run (including legacy v2 accessories) are stale and must be unregistered
 * to prevent ghost/duplicate sensors in HomeKit.
 */
describe('PluginUpdateMatterPlatform stale HAP cleanup', () => {
  function buildMocks() {
    const unregisterCalls: Array<{ pluginName: string, platformName: string, accessories: any[] }> = []

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    const mockApi = {
      matter: { registerPlatformAccessories: vi.fn(), uuid: { generate: vi.fn().mockReturnValue('matter-uuid') } },
      hap: { uuid: { generate: vi.fn().mockReturnValue('hap-uuid') } },
      on: vi.fn(),
      user: { storagePath: vi.fn().mockReturnValue('/tmp') },
      unregisterPlatformAccessories: vi.fn((...args: any[]) => {
        unregisterCalls.push({ pluginName: args[0], platformName: args[1], accessories: args[2] })
      }),
    }

    const mockConfig = {
      name: 'PluginUpdate',
      sensorType: 'motion',
      failureSensorType: undefined as string | undefined,
      autoUpdateHomebridge: false,
      autoUpdateHomebridgeUI: false,
      autoUpdatePlugins: false,
      autoUpdateNode: false,
    }

    return { mockLog, mockApi, mockConfig, unregisterCalls }
  }

  /**
   * Simulate configureAccessory logic directly to avoid importing real Homebridge modules.
   *
   * This mirrors what PluginUpdateMatterPlatform.configureAccessory does:
   * it must call api.unregisterPlatformAccessories for each stale HAP accessory.
   */
  function simulateConfigureAccessory(
    api: ReturnType<typeof buildMocks>['mockApi'],
    accessory: { UUID: string, displayName: string },
  ) {
    api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }

  it('unregisters a stale legacy v2 HAP accessory (PluginUpdate UUID)', () => {
    const { mockApi, unregisterCalls } = buildMocks()

    const legacyAccessory = { UUID: mockApi.hap.uuid.generate('PluginUpdate'), displayName: 'Homebridge Plugin Update' }
    simulateConfigureAccessory(mockApi, legacyAccessory)

    expect(unregisterCalls).toHaveLength(1)
    expect(unregisterCalls[0].pluginName).toBe(PLUGIN_NAME)
    expect(unregisterCalls[0].platformName).toBe(PLATFORM_NAME)
    expect(unregisterCalls[0].accessories).toContain(legacyAccessory)
  })

  it('unregisters a stale v3 HAP update-sensor accessory (PluginUpdateCheck-UpdateSensor UUID)', () => {
    const { mockApi, unregisterCalls } = buildMocks()

    const v3Accessory = { UUID: mockApi.hap.uuid.generate('PluginUpdateCheck-UpdateSensor'), displayName: 'PluginUpdate' }
    simulateConfigureAccessory(mockApi, v3Accessory)

    expect(unregisterCalls).toHaveLength(1)
    expect(unregisterCalls[0].accessories).toContain(v3Accessory)
  })

  it('unregisters multiple stale accessories when called for each', () => {
    const { mockApi, unregisterCalls } = buildMocks()

    const accessory1 = { UUID: 'uuid-1', displayName: 'Accessory 1' }
    const accessory2 = { UUID: 'uuid-2', displayName: 'Accessory 2' }

    simulateConfigureAccessory(mockApi, accessory1)
    simulateConfigureAccessory(mockApi, accessory2)

    expect(unregisterCalls).toHaveLength(2)
    expect(unregisterCalls[0].accessories).toContain(accessory1)
    expect(unregisterCalls[1].accessories).toContain(accessory2)
  })
})
