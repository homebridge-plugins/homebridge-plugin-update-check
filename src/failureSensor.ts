import type {
  API,
  Characteristic,
  CharacteristicValue,
  HAP,
  Logging,
  PlatformAccessory,
  Service,
  WithUUID,
} from 'homebridge'

interface SensorInfo {
  serviceType: WithUUID<typeof Service>
  characteristicType: WithUUID<new () => Characteristic>
  trippedValue: CharacteristicValue
  untrippedValue: CharacteristicValue
}

/**
 * Manages a failure sensor for automatic update operations.
 * This sensor is triggered when automatic updates fail.
 */
export class FailureSensor {
  private readonly log: Logging
  private readonly hap: HAP
  private readonly sensorInfo: SensorInfo
  private service?: Service

  constructor(log: Logging, api: API, sensorType?: string) {
    this.log = log
    this.hap = api.hap
    this.sensorInfo = this.getSensorInfo(sensorType)
  }

  /**
   * Configure the failure sensor service on the given accessory
   */
  configureService(accessory: PlatformAccessory): void {
    this.checkFailureService(accessory, this.hap.Service.MotionSensor)
    this.checkFailureService(accessory, this.hap.Service.ContactSensor)
    this.checkFailureService(accessory, this.hap.Service.OccupancySensor)
    this.checkFailureService(accessory, this.hap.Service.SmokeSensor)
    this.checkFailureService(accessory, this.hap.Service.LeakSensor)
    this.checkFailureService(accessory, this.hap.Service.LightSensor)
    this.checkFailureService(accessory, this.hap.Service.HumiditySensor)
    this.checkFailureService(accessory, this.hap.Service.CarbonMonoxideSensor)
    this.checkFailureService(accessory, this.hap.Service.CarbonDioxideSensor)
    this.checkFailureService(accessory, this.hap.Service.AirQualitySensor)

    // Initialize to normal state
    this.setState(false)
  }

  /**
   * Add the failure sensor service to a new accessory
   */
  addToAccessory(accessory: PlatformAccessory): void {
    accessory.addService(this.sensorInfo.serviceType as unknown as Service)
  }

  /**
   * Set the failure sensor state
   * @param failed - true if failure detected, false for normal operation
   */
  setState(failed: boolean): void {
    if (this.service) {
      const value = failed ? this.sensorInfo.trippedValue : this.sensorInfo.untrippedValue
      this.service.setCharacteristic(this.sensorInfo.characteristicType, value)
      this.log.debug(`Set failure sensor to ${failed ? 'triggered' : 'normal'} state`)
    }
  }

  /**
   * Get the sensor info for the configured failure sensor type
   */
  private getSensorInfo(sensorType?: string): SensorInfo {
    switch (sensorType?.toLowerCase()) {
      case 'contact':
        return {
          serviceType: this.hap.Service.ContactSensor,
          characteristicType: this.hap.Characteristic.ContactSensorState,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'occupancy':
        return {
          serviceType: this.hap.Service.OccupancySensor,
          characteristicType: this.hap.Characteristic.OccupancyDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'smoke':
        return {
          serviceType: this.hap.Service.SmokeSensor,
          characteristicType: this.hap.Characteristic.SmokeDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'leak':
        return {
          serviceType: this.hap.Service.LeakSensor,
          characteristicType: this.hap.Characteristic.LeakDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'light':
        return {
          serviceType: this.hap.Service.LightSensor,
          characteristicType: this.hap.Characteristic.CurrentAmbientLightLevel,
          untrippedValue: 0.0001,
          trippedValue: 100000,
        }
      case 'humidity':
        return {
          serviceType: this.hap.Service.HumiditySensor,
          characteristicType: this.hap.Characteristic.CurrentRelativeHumidity,
          untrippedValue: 0,
          trippedValue: 100,
        }
      case 'monoxide':
        return {
          serviceType: this.hap.Service.CarbonMonoxideSensor,
          characteristicType: this.hap.Characteristic.CarbonMonoxideDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'dioxide':
        return {
          serviceType: this.hap.Service.CarbonDioxideSensor,
          characteristicType: this.hap.Characteristic.CarbonDioxideDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'air':
        return {
          serviceType: this.hap.Service.AirQualitySensor,
          characteristicType: this.hap.Characteristic.AirQuality,
          untrippedValue: 1,
          trippedValue: 5,
        }
      case 'motion':
      default:
        return {
          serviceType: this.hap.Service.MotionSensor,
          characteristicType: this.hap.Characteristic.MotionDetected,
          untrippedValue: false,
          trippedValue: true,
        }
    }
  }

  /**
   * Check and configure the failure service for a specific service type
   */
  private checkFailureService(accessory: PlatformAccessory, serviceType: WithUUID<typeof Service>): boolean {
    const service = accessory.getService(serviceType)
    if (this.sensorInfo.serviceType === serviceType) {
      if (service) {
        this.service = service
      } else {
        this.service = accessory.addService(serviceType as unknown as Service)
        this.service.setCharacteristic(this.hap.Characteristic.Name, 'Update Failure')
      }
      return true
    } else {
      // Don't remove services that might be used by the main sensor
      // This check should be handled by the caller to avoid conflicts
      return false
    }
  }
}