import { describe, expect, it, vi } from 'vitest'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

/**
 * Unit tests for the stale HAP accessory cleanup in PluginUpdateMatterPlatform.
 *
 * When the platform runs in Matter mode, any cached HAP accessories from a previous
 * HAP-mode run (including legacy v2 accessories) are stale and must be unregistered
 * to prevent ghost/duplicate sensors in HomeKit.
 *
 * Removal is intentionally deferred to `didFinishLaunching` — calling
 * `unregisterPlatformAccessories` during the `configureAccessory` phase (before the
 * bridge is fully initialized) causes Homebridge to throw
 * "Cannot find the bridged Accessory to remove."
 */
describe('pluginUpdateMatterPlatform stale HAP cleanup', () => {
  function buildMocks() {
    const unregisterCalls: Array<{ pluginName: string, platformName: string, accessories: any[] }> = []
    const didFinishListeners: Array<() => void> = []

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    const mockApi = {
      matter: { registerPlatformAccessories: vi.fn(), uuid: { generate: vi.fn().mockReturnValue('matter-uuid') } },
      hap: { uuid: { generate: vi.fn().mockReturnValue('hap-uuid') } },
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'didFinishLaunching') {
          didFinishListeners.push(cb)
        }
      }),
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

    function fireDidFinishLaunching() {
      for (const cb of didFinishListeners) {
        cb()
      }
    }

    return { mockLog, mockApi, mockConfig, unregisterCalls, fireDidFinishLaunching }
  }

  /**
   * Build a simulator that mirrors PluginUpdateMatterPlatform's stale-accessory
   * handling without importing the real class (which would pull in Homebridge modules).
   *
   * - configureAccessory: collects accessories into a stale list (no immediate removal)
   * - removeStaleAccessories: called on didFinishLaunching; batches all collected
   *   accessories into a single unregisterPlatformAccessories call
   */
  function buildSimulator(api: ReturnType<typeof buildMocks>['mockApi']) {
    const staleAccessories: any[] = []

    function configureAccessory(accessory: { UUID: string, displayName: string }) {
      staleAccessories.push(accessory)
    }

    function removeStaleAccessories() {
      if (staleAccessories.length === 0) {
        return
      }
      api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [...staleAccessories])
      staleAccessories.length = 0
    }

    return { configureAccessory, removeStaleAccessories }
  }

  it('does not unregister stale accessories immediately during configureAccessory', () => {
    const { mockApi, unregisterCalls } = buildMocks()
    const { configureAccessory } = buildSimulator(mockApi)

    const legacyAccessory = { UUID: mockApi.hap.uuid.generate('PluginUpdate'), displayName: 'Homebridge Plugin Update' }
    configureAccessory(legacyAccessory)

    // Must NOT be called yet — bridge is not fully initialized until didFinishLaunching
    expect(unregisterCalls).toHaveLength(0)
  })

  it('unregisters a stale legacy v2 HAP accessory (PluginUpdate UUID) after didFinishLaunching', () => {
    const { mockApi, unregisterCalls } = buildMocks()
    const { configureAccessory, removeStaleAccessories } = buildSimulator(mockApi)

    const legacyAccessory = { UUID: mockApi.hap.uuid.generate('PluginUpdate'), displayName: 'Homebridge Plugin Update' }
    configureAccessory(legacyAccessory)
    removeStaleAccessories()

    expect(unregisterCalls).toHaveLength(1)
    expect(unregisterCalls[0].pluginName).toBe(PLUGIN_NAME)
    expect(unregisterCalls[0].platformName).toBe(PLATFORM_NAME)
    expect(unregisterCalls[0].accessories).toContain(legacyAccessory)
  })

  it('unregisters a stale v3 HAP update-sensor accessory (PluginUpdateCheck-UpdateSensor UUID) after didFinishLaunching', () => {
    const { mockApi, unregisterCalls } = buildMocks()
    const { configureAccessory, removeStaleAccessories } = buildSimulator(mockApi)

    const v3Accessory = { UUID: mockApi.hap.uuid.generate('PluginUpdateCheck-UpdateSensor'), displayName: 'PluginUpdate' }
    configureAccessory(v3Accessory)
    removeStaleAccessories()

    expect(unregisterCalls).toHaveLength(1)
    expect(unregisterCalls[0].accessories).toContain(v3Accessory)
  })

  it('unregisters multiple stale accessories in a single batch after didFinishLaunching', () => {
    const { mockApi, unregisterCalls } = buildMocks()
    const { configureAccessory, removeStaleAccessories } = buildSimulator(mockApi)

    const accessory1 = { UUID: 'uuid-1', displayName: 'Accessory 1' }
    const accessory2 = { UUID: 'uuid-2', displayName: 'Accessory 2' }

    configureAccessory(accessory1)
    configureAccessory(accessory2)
    removeStaleAccessories()

    // All stale accessories are batched into a single unregister call
    expect(unregisterCalls).toHaveLength(1)
    expect(unregisterCalls[0].accessories).toContain(accessory1)
    expect(unregisterCalls[0].accessories).toContain(accessory2)
  })

  it('does not call unregisterPlatformAccessories when there are no cached accessories', () => {
    const { mockApi, unregisterCalls } = buildMocks()
    const { removeStaleAccessories } = buildSimulator(mockApi)

    removeStaleAccessories()

    expect(unregisterCalls).toHaveLength(0)
  })
})
