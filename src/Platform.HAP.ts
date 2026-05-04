import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import { FailureSensor } from './failureSensor.js'
import { FAILURE_SENSOR_UUID_KEY, LEGACY_UPDATE_SENSOR_UUID_KEY, PLATFORM_NAME, PLUGIN_NAME, UPDATE_SENSOR_UUID_KEY } from './settings.js'
import { UpdateSensor } from './updateSensor.js'
import { isFailureSensorEnabled } from './utils.js'

export class PluginUpdatePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging
  private readonly config: PlatformConfig
  private readonly api: API
  private updateSensor: UpdateSensor
  private failureSensor: FailureSensor
  private readonly updateSensorUuid: string
  private readonly legacyUpdateSensorUuid: string
  private readonly failureSensorUuid: string
  private failureSensorRegistered = false
  private cachedFailureAccessory?: PlatformAccessory
  /** Cached accessory with the legacy v2.x UUID — resolved in handleLegacyMigration */
  private cachedLegacyUpdateAccessory?: PlatformAccessory
  /** True when a v3 update-sensor accessory was found in the cache (current UUID) */
  private updateSensorCached = false

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log
    this.config = config
    this.api = api
    this.updateSensorUuid = api.hap.uuid.generate(UPDATE_SENSOR_UUID_KEY)
    this.legacyUpdateSensorUuid = api.hap.uuid.generate(LEGACY_UPDATE_SENSOR_UUID_KEY)
    this.failureSensorUuid = api.hap.uuid.generate(FAILURE_SENSOR_UUID_KEY)
    this.failureSensor = new FailureSensor(log, api, config.failureSensorType || config.sensorType, 'hap')
    // Register legacy migration BEFORE UpdateSensor so it runs first on didFinishLaunching
    api.on('didFinishLaunching', this.handleLegacyMigration.bind(this))
    this.updateSensor = new UpdateSensor(log, config, api, {
      protocol: 'hap',
      onFailureStateChange: isFailureSensorEnabled(config) ? (failed) => this.failureSensor.setState(failed) : undefined,
    })
    // Register the failure sensor accessory
    api.on('didFinishLaunching', this.addFailureSensor.bind(this))
  }

  /**
   * Resolves legacy v2.x cached accessories on first launch after an upgrade.
   *
   * Two scenarios:
   * 1. Only the legacy UUID is in the cache (fresh v2→v3 migration): configure the
   *    update sensor on the legacy accessory so that {@link UpdateSensor.addUpdateSensor}
   *    sees `registered = true` and does NOT create a duplicate.
   * 2. Both legacy and current UUIDs are in the cache (user already ran v3 once):
   *    unregister the stale legacy accessory and let the current-UUID accessory continue.
   */
  private handleLegacyMigration(): void {
    if (!this.cachedLegacyUpdateAccessory) {
      return
    }

    if (this.updateSensorCached) {
      // Current-UUID accessory already recognised — remove the stale legacy one
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedLegacyUpdateAccessory])
      this.cachedLegacyUpdateAccessory = undefined
      this.log.info('Removed stale legacy update sensor accessory (migrated to current UUID)')
      return
    }

    // Only the legacy accessory exists — use it for the update sensor so no duplicate is created
    this.updateSensor.configureAccessory(this.cachedLegacyUpdateAccessory)
    this.log.info('Restored update sensor from legacy cached accessory')
    this.cachedLegacyUpdateAccessory = undefined
  }

  private addFailureSensor(): void {
    // If the failure sensor has been disabled, remove any previously cached accessory
    if (!isFailureSensorEnabled(this.config)) {
      if (this.cachedFailureAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedFailureAccessory])
        this.cachedFailureAccessory = undefined
        this.log.info('Removed cached failure sensor accessory (failure sensor is disabled)')
      }
      return
    }

    if (this.failureSensorRegistered) {
      return
    }

    const Accessory = this.api.platformAccessory
    const failureAccessory = new Accessory('Plugin Update Failure', this.failureSensorUuid)
    this.failureSensor.configure(failureAccessory)
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [failureAccessory])
    this.failureSensorRegistered = true
  }

  // Handle cached accessories: restore event and delegate configuration
  configureAccessory(accessory: any): void {
    if (accessory && typeof accessory.on === 'function') {
      accessory.on('identify', () => {
        if (this.updateSensor && (this.updateSensor as any).log) {
          (this.updateSensor as any).log(`${accessory.displayName} identify requested!`)
        }
      })
    }
    // Restore for update sensor (current UUID)
    if (accessory.UUID === this.updateSensorUuid) {
      this.updateSensor.configureAccessory(accessory)
      this.updateSensorCached = true
      return
    }
    // Restore for failure sensor
    if (accessory.UUID === this.failureSensorUuid) {
      if (!isFailureSensorEnabled(this.config)) {
        // Sensor is disabled — keep track of the cached accessory so it can be
        // unregistered once `didFinishLaunching` fires.
        this.cachedFailureAccessory = accessory
        return
      }
      this.failureSensor.configure(accessory)
      this.failureSensorRegistered = true
      return
    }
    // Legacy v2.x update sensor UUID — resolved in handleLegacyMigration
    if (accessory.UUID === this.legacyUpdateSensorUuid) {
      this.cachedLegacyUpdateAccessory = accessory
      return
    }

    this.log.warn(`Ignoring unknown cached accessory: ${accessory.displayName}`)
  }
}
