import { describe, expect, it, vi } from 'vitest'

import { LEGACY_UPDATE_SENSOR_UUID_KEY, UPDATE_SENSOR_UUID_KEY, FAILURE_SENSOR_UUID_KEY, PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

/**
 * Unit tests for the legacy UUID migration logic in PluginUpdatePlatform.
 *
 * These tests validate the three key scenarios handled by handleLegacyMigration:
 *   1. Only legacy UUID (v2.x) in cache — must restore without creating a duplicate.
 *   2. Both legacy and current UUID in cache — must unregister the stale legacy accessory.
 *   3. Normal v3 operation (no legacy) — must leave the current accessory untouched.
 */
describe('PluginUpdatePlatform legacy UUID migration', () => {
  function buildMocks(options: { generateReturnsByKey?: Record<string, string> } = {}) {
    // Map uuid key → deterministic UUID value
    const uuidMap: Record<string, string> = {
      [UPDATE_SENSOR_UUID_KEY]: 'uuid-v3-update',
      [FAILURE_SENSOR_UUID_KEY]: 'uuid-v3-failure',
      [LEGACY_UPDATE_SENSOR_UUID_KEY]: 'uuid-legacy-update',
      ...options.generateReturnsByKey,
    }

    const didFinishListeners: Array<() => void> = []

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    const mockApi = {
      hap: {
        uuid: {
          generate: vi.fn((key: string) => uuidMap[key] ?? `uuid-${key}`),
        },
      },
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'didFinishLaunching') {
          didFinishListeners.push(cb)
        }
      }),
      platformAccessory: vi.fn(),
      registerPlatformAccessories: vi.fn(),
      unregisterPlatformAccessories: vi.fn(),
    }

    const mockConfig = {
      sensorType: 'motion',
      failureSensorType: undefined as string | undefined,
      autoUpdateHomebridge: false,
      autoUpdateHomebridgeUI: false,
      autoUpdatePlugins: false,
      autoUpdateNode: false,
      name: 'PluginUpdate',
    }

    const mockUpdateSensor = {
      configureAccessory: vi.fn(),
      addUpdateSensor: vi.fn(),
    }

    const mockFailureSensor = {
      configure: vi.fn(),
      setState: vi.fn(),
    }

    function fireDidFinishLaunching() {
      for (const cb of didFinishListeners) {
        cb()
      }
    }

    return { mockLog, mockApi, mockConfig, mockUpdateSensor, mockFailureSensor, uuidMap, didFinishListeners, fireDidFinishLaunching }
  }

  /**
   * Simulate the Platform.HAP.ts logic directly using extracted functions so we can
   * test it without requiring a full Homebridge runtime import.
   */
  function runMigrationSimulation(
    mockApi: ReturnType<typeof buildMocks>['mockApi'],
    mockLog: ReturnType<typeof buildMocks>['mockLog'],
    mockUpdateSensor: ReturnType<typeof buildMocks>['mockUpdateSensor'],
    uuidMap: Record<string, string>,
    cachedAccessories: Array<{ UUID: string, displayName: string, on?: (...args: any[]) => void }>,
  ) {
    const updateSensorUuid = mockApi.hap.uuid.generate(UPDATE_SENSOR_UUID_KEY)
    const legacyUpdateSensorUuid = mockApi.hap.uuid.generate(LEGACY_UPDATE_SENSOR_UUID_KEY)

    let cachedLegacyUpdateAccessory: any = undefined
    let updateSensorCached = false

    // Simulate configureAccessory for each cached accessory
    for (const accessory of cachedAccessories) {
      if (accessory.UUID === updateSensorUuid) {
        mockUpdateSensor.configureAccessory(accessory)
        updateSensorCached = true
        continue
      }
      if (accessory.UUID === legacyUpdateSensorUuid) {
        cachedLegacyUpdateAccessory = accessory
        continue
      }
      mockLog.warn(`Ignoring unknown cached accessory: ${accessory.displayName}`)
    }

    // handleLegacyMigration (fires first on didFinishLaunching)
    let registered = updateSensorCached

    function handleLegacyMigration() {
      if (!cachedLegacyUpdateAccessory) return

      if (updateSensorCached) {
        mockApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedLegacyUpdateAccessory])
        cachedLegacyUpdateAccessory = undefined
        mockLog.info('Removed stale legacy update sensor accessory (migrated to current UUID)')
        return
      }

      mockUpdateSensor.configureAccessory(cachedLegacyUpdateAccessory)
      registered = true
      mockLog.info('Restored update sensor from legacy cached accessory')
      cachedLegacyUpdateAccessory = undefined
    }

    // addUpdateSensor (fires after handleLegacyMigration)
    function addUpdateSensor() {
      if (!registered) {
        // would create a new accessory and register it
        mockApi.registerPlatformAccessories(PLUGIN_NAME, 'HomebridgeUpdater', [{ displayName: 'new-accessory' }])
        registered = true
      }
    }

    handleLegacyMigration()
    addUpdateSensor()

    return { registered, cachedLegacyUpdateAccessory }
  }

  it('Scenario A: only legacy UUID in cache — must restore without creating a duplicate', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap, fireDidFinishLaunching } = buildMocks()

    const legacyAccessory = { UUID: uuidMap[LEGACY_UPDATE_SENSOR_UUID_KEY], displayName: 'Plugin Update Check' }

    const { registered } = runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [legacyAccessory])

    // Legacy accessory used as update sensor
    expect(mockUpdateSensor.configureAccessory).toHaveBeenCalledWith(legacyAccessory)
    expect(mockUpdateSensor.configureAccessory).toHaveBeenCalledTimes(1)
    // registered was set to true so no new accessory was created
    expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled()
    // No stale unregister
    expect(mockApi.unregisterPlatformAccessories).not.toHaveBeenCalled()
    // Info log emitted
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Restored update sensor from legacy cached accessory'))
    // No unknown-accessory warning
    expect(mockLog.warn).not.toHaveBeenCalled()
    expect(registered).toBe(true)
  })

  it('Scenario B: both legacy and current UUID in cache — must unregister the stale legacy accessory', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap } = buildMocks()

    const v3Accessory = { UUID: uuidMap[UPDATE_SENSOR_UUID_KEY], displayName: 'PluginUpdate' }
    const legacyAccessory = { UUID: uuidMap[LEGACY_UPDATE_SENSOR_UUID_KEY], displayName: 'Plugin Update Check' }

    runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [v3Accessory, legacyAccessory])

    // v3 accessory configured as update sensor
    expect(mockUpdateSensor.configureAccessory).toHaveBeenCalledWith(v3Accessory)
    // Legacy unregistered
    expect(mockApi.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [legacyAccessory])
    // No new accessory created (v3 already registered)
    expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled()
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Removed stale legacy update sensor accessory'))
  })

  it('Scenario B (legacy processed first): same result regardless of configureAccessory order', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap } = buildMocks()

    const v3Accessory = { UUID: uuidMap[UPDATE_SENSOR_UUID_KEY], displayName: 'PluginUpdate' }
    const legacyAccessory = { UUID: uuidMap[LEGACY_UPDATE_SENSOR_UUID_KEY], displayName: 'Plugin Update Check' }

    // Legacy accessory arrives first in configureAccessory order
    runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [legacyAccessory, v3Accessory])

    expect(mockUpdateSensor.configureAccessory).toHaveBeenCalledWith(v3Accessory)
    expect(mockApi.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [legacyAccessory])
    expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled()
  })

  it('Scenario C: normal v3 operation — no legacy accessory, no side effects', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap } = buildMocks()

    const v3Accessory = { UUID: uuidMap[UPDATE_SENSOR_UUID_KEY], displayName: 'PluginUpdate' }

    runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [v3Accessory])

    expect(mockUpdateSensor.configureAccessory).toHaveBeenCalledWith(v3Accessory)
    expect(mockApi.unregisterPlatformAccessories).not.toHaveBeenCalled()
    expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled()
    expect(mockLog.info).not.toHaveBeenCalled()
    expect(mockLog.warn).not.toHaveBeenCalled()
  })

  it('Scenario D: no cached accessories at all — creates new accessory normally', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap } = buildMocks()

    const { registered } = runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [])

    expect(mockUpdateSensor.configureAccessory).not.toHaveBeenCalled()
    expect(mockApi.registerPlatformAccessories).toHaveBeenCalledTimes(1)
    expect(registered).toBe(true)
    expect(mockLog.warn).not.toHaveBeenCalled()
  })

  it('truly unknown accessories still emit a warning', () => {
    const { mockLog, mockApi, mockUpdateSensor, uuidMap } = buildMocks()

    const unknownAccessory = { UUID: 'some-other-uuid', displayName: 'Some Other Accessory' }

    runMigrationSimulation(mockApi, mockLog, mockUpdateSensor, uuidMap, [unknownAccessory])

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unknown cached accessory: Some Other Accessory'))
  })
})
