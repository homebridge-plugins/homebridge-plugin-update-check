import type { API, Logging, PlatformAccessory } from 'homebridge'

import type { SensorOptions, SensorProtocol } from './sensorBase.js'

import { HAPSensor, MatterSensor } from './sensorBase.js'

/**
 * Manages a failure sensor for automatic update operations.
 * This sensor is triggered when automatic updates fail.
 */

export class FailureSensor {
  private readonly log: Logging
  private readonly protocolSensor: SensorProtocol

  constructor(log: Logging, api: API, sensorType?: string, protocol: 'hap' | 'matter' = 'hap') {
    this.log = log
    const options: SensorOptions = { log, api, sensorType }
    // Choose protocol implementation
    if (protocol === 'matter') {
      this.protocolSensor = new MatterSensor(options)
    } else {
      this.protocolSensor = new HAPSensor(options)
    }
  }

  configure(accessory: PlatformAccessory): void {
    this.protocolSensor.configure(accessory)
    // Only set initial state immediately for HAP, not Matter
    if (this.protocolSensor instanceof HAPSensor) {
      this.setState(false)
    }
  }

  /**
   * Set the failure sensor state
   * @param failed - true if failure detected, false for normal operation
   */
  setState(failed: boolean): void {
    this.protocolSensor.setState(failed)
    this.log.debug(`[FailureSensor] Set to ${failed ? 'triggered' : 'normal'} state`)
  }
}
