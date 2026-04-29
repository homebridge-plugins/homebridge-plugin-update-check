import type { API, Logging, PlatformConfig } from 'homebridge'

import { FailureSensor } from './failureSensor.js'
import { UpdateSensor } from './updateSensor.js'

export class PluginUpdateMatterPlatform {
  private updateSensor: UpdateSensor
  private failureSensor: FailureSensor

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.failureSensor = new FailureSensor(log, api, config.failureSensorType || config.sensorType, 'matter')
    this.updateSensor = new UpdateSensor(log, config, api, {
      protocol: 'matter',
      onFailureStateChange: (failed) => this.failureSensor.setState(failed),
    })
    // Register the failure sensor as a separate Matter device
    const deviceName = (config as any).name || 'Plugin Update Check'
    const failureDeviceName = `${deviceName} Failure`
    this.failureSensor.configure({ displayName: failureDeviceName } as any)
  }
}
