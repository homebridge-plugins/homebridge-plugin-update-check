import type { API, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import { FailureSensor } from './failureSensor.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { UpdateSensor } from './updateSensor.js'
import { isFailureSensorEnabled } from './utils.js'

export class PluginUpdateMatterPlatform {
  private readonly api: API
  private updateSensor: UpdateSensor
  private failureSensor: FailureSensor
  private readonly staleAccessories: PlatformAccessory[] = []

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
    // Defer removal of stale HAP accessories until the bridge is fully initialized
    api.on('didFinishLaunching', this.removeStaleAccessories.bind(this))
  }

  /**
   * Called by Homebridge for each accessory found in the platform cache.
   * When running in Matter mode, all cached HAP accessories are stale — collect
   * them here so they can be removed once `didFinishLaunching` fires, at which
   * point the bridge is fully initialized and can process unregister calls.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.staleAccessories.push(accessory)
  }

  private removeStaleAccessories(): void {
    if (this.staleAccessories.length === 0) {
      return
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [...this.staleAccessories])
    this.staleAccessories.length = 0
  }
}
