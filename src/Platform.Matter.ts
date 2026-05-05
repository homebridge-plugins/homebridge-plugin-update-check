import type { API, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import { FailureSensor } from './failureSensor.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { UpdateSensor } from './updateSensor.js'
import { isFailureSensorEnabled } from './utils.js'

export class PluginUpdateMatterPlatform {
  private readonly api: API
  private updateSensor: UpdateSensor
  private failureSensor: FailureSensor

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api
    this.failureSensor = new FailureSensor(log, api, config.failureSensorType || config.sensorType, 'matter')
    this.updateSensor = new UpdateSensor(log, config, api, {
      protocol: 'matter',
      onFailureStateChange: isFailureSensorEnabled(config) ? (failed) => this.failureSensor.setState(failed) : undefined,
    })
    // Register the failure sensor as a separate Matter device only when enabled
    if (isFailureSensorEnabled(config)) {
      const deviceName = (config as any).name || 'Plugin Update Check'
      const failureDeviceName = `${deviceName} Failure`
      this.failureSensor.configure({ displayName: failureDeviceName } as any)
    }
  }

  /**
   * Called by Homebridge for each accessory found in the platform cache.
   * When running in Matter mode, all cached HAP accessories are stale — unregister
   * them immediately to prevent ghost accessories from appearing in HomeKit.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
  }
}
