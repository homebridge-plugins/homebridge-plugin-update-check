import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import { FailureSensor } from './failureSensor.js'
import { FAILURE_SENSOR_UUID_KEY, PLATFORM_NAME, PLUGIN_NAME, UPDATE_SENSOR_UUID_KEY } from './settings.js'
import { UpdateSensor } from './updateSensor.js'
import { isFailureSensorEnabled } from './utils.js'

export class PluginUpdatePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging
  private readonly config: PlatformConfig
  private readonly api: API
  private updateSensor: UpdateSensor
  private failureSensor: FailureSensor
  private readonly updateSensorUuid: string
  private readonly failureSensorUuid: string
  private failureSensorRegistered = false
  private staleFailureAccessory?: PlatformAccessory

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log
    this.config = config
    this.api = api
    this.updateSensorUuid = api.hap.uuid.generate(UPDATE_SENSOR_UUID_KEY)
    this.failureSensorUuid = api.hap.uuid.generate(FAILURE_SENSOR_UUID_KEY)
    this.failureSensor = new FailureSensor(log, api, config.failureSensorType || config.sensorType, 'hap')
    this.updateSensor = new UpdateSensor(log, config, api, {
      protocol: 'hap',
      onFailureStateChange: isFailureSensorEnabled(config) ? (failed) => this.failureSensor.setState(failed) : undefined,
    })
    // Register the failure sensor accessory
    api.on('didFinishLaunching', this.addFailureSensor.bind(this))
  }

  private addFailureSensor(): void {
    // If the failure sensor has been disabled, remove any previously cached accessory
    if (!isFailureSensorEnabled(this.config)) {
      if (this.staleFailureAccessory) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.staleFailureAccessory])
        this.staleFailureAccessory = undefined
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
    // Restore for update sensor
    if (accessory.UUID === this.updateSensorUuid) {
      this.updateSensor.configureAccessory(accessory)
      return
    }
    // Restore for failure sensor
    if (accessory.UUID === this.failureSensorUuid) {
      if (!isFailureSensorEnabled(this.config)) {
        // Sensor is disabled — keep track of the stale accessory so it can be
        // unregistered once `didFinishLaunching` fires.
        this.staleFailureAccessory = accessory
        return
      }
      this.failureSensor.configure(accessory)
      this.failureSensorRegistered = true
      return
    }

    this.log.warn(`Ignoring unknown cached accessory: ${accessory.displayName}`)
  }
}
