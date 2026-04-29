// Unified sensor abstraction for HAP and Matter support
// This file provides a base for both main and failure sensors

import type { API, Characteristic, CharacteristicValue, HAP, Logging, PlatformAccessory, Service, WithUUID } from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

export interface SensorProtocol {
  configure: (accessory: PlatformAccessory) => void
  setState: (state: boolean) => void
}

export interface SensorOptions {
  log: Logging
  api: API
  sensorType?: string
}

// HAP implementation
export class HAPSensor implements SensorProtocol {
  private readonly log: Logging
  private readonly hap: HAP
  private readonly sensorInfo: {
    serviceType: WithUUID<typeof Service>
    characteristicType: WithUUID<new () => Characteristic>
    trippedValue: CharacteristicValue
    untrippedValue: CharacteristicValue
  }

  private service?: Service

  constructor(options: SensorOptions) {
    this.log = options.log
    this.hap = options.api.hap
    this.sensorInfo = this.getSensorInfo(options.sensorType)
  }

  configure(accessory: PlatformAccessory): void {
    // Only add the correct service for the sensorType
    const service = accessory.getService(this.sensorInfo.serviceType) || accessory.addService(this.sensorInfo.serviceType as unknown as Service)
    this.service = service
    this.setState(false)
  }

  setState(tripped: boolean): void {
    if (this.service) {
      const value = tripped ? this.sensorInfo.trippedValue : this.sensorInfo.untrippedValue
      this.service.setCharacteristic(this.sensorInfo.characteristicType, value)
      this.log.debug(`Set HAP sensor to ${tripped ? 'triggered' : 'normal'} state`)
    }
  }

  private getSensorInfo(sensorType?: string) {
    switch (sensorType?.toLowerCase()) {
      case 'contact':
        return { serviceType: this.hap.Service.ContactSensor, characteristicType: this.hap.Characteristic.ContactSensorState, untrippedValue: 0, trippedValue: 1 }
      case 'occupancy':
        return { serviceType: this.hap.Service.OccupancySensor, characteristicType: this.hap.Characteristic.OccupancyDetected, untrippedValue: 0, trippedValue: 1 }
      case 'smoke':
        return { serviceType: this.hap.Service.SmokeSensor, characteristicType: this.hap.Characteristic.SmokeDetected, untrippedValue: 0, trippedValue: 1 }
      case 'leak':
        return { serviceType: this.hap.Service.LeakSensor, characteristicType: this.hap.Characteristic.LeakDetected, untrippedValue: 0, trippedValue: 1 }
      case 'light':
        return { serviceType: this.hap.Service.LightSensor, characteristicType: this.hap.Characteristic.CurrentAmbientLightLevel, untrippedValue: 0.0001, trippedValue: 100000 }
      case 'humidity':
        return { serviceType: this.hap.Service.HumiditySensor, characteristicType: this.hap.Characteristic.CurrentRelativeHumidity, untrippedValue: 0, trippedValue: 100 }
      case 'monoxide':
        return { serviceType: this.hap.Service.CarbonMonoxideSensor, characteristicType: this.hap.Characteristic.CarbonMonoxideDetected, untrippedValue: 0, trippedValue: 1 }
      case 'dioxide':
        return { serviceType: this.hap.Service.CarbonDioxideSensor, characteristicType: this.hap.Characteristic.CarbonDioxideDetected, untrippedValue: 0, trippedValue: 1 }
      case 'air':
        return { serviceType: this.hap.Service.AirQualitySensor, characteristicType: this.hap.Characteristic.AirQuality, untrippedValue: 1, trippedValue: 5 }
      case 'motion':
      default:
        return { serviceType: this.hap.Service.MotionSensor, characteristicType: this.hap.Characteristic.MotionDetected, untrippedValue: false, trippedValue: true }
    }
  }
}

export class MatterSensor implements SensorProtocol {
  private readonly log: Logging
  private readonly api: API
  private readonly sensorType: string
  private matterInfo: {
    deviceType: string
    cluster: string
    attribute: string
    trippedValue: any
    untrippedValue: any
  }

  private uuid?: string
  private registered: boolean = false

  constructor(options: SensorOptions) {
    this.log = options.log
    this.api = options.api
    this.sensorType = options.sensorType || 'motion'
    this.matterInfo = MatterSensor.getMatterInfo(this.api, this.sensorType)
  }

  static getMatterInfo(api: API, sensorType?: string) {
    // Copied and adapted from Platform.Matter.ts
    const typeMap: Record<string, { deviceType: string, cluster: string, attribute: string, trippedValue: any, untrippedValue: any }> = {
      contact: {
        deviceType: 'ContactSensor',
        cluster: 'booleanState',
        attribute: 'stateValue',
        trippedValue: false, // open/triggered (inverted)
        untrippedValue: true, // closed/normal
      },
      occupancy: {
        deviceType: 'MotionSensor',
        cluster: 'occupancySensing',
        attribute: 'occupancy',
        trippedValue: { occupied: true },
        untrippedValue: { occupied: false },
      },
      motion: {
        deviceType: 'MotionSensor',
        cluster: 'occupancySensing',
        attribute: 'occupancy',
        trippedValue: { occupied: true },
        untrippedValue: { occupied: false },
      },
      smoke: {
        deviceType: 'SmokeSensor',
        cluster: 'smokeCoAlarm',
        attribute: 'smokeState',
        trippedValue: 2, // Critical
        untrippedValue: 0, // Normal
      },
      monoxide: {
        deviceType: 'SmokeSensor',
        cluster: 'smokeCoAlarm',
        attribute: 'coState',
        trippedValue: 2, // Critical
        untrippedValue: 0, // Normal
      },
      leak: {
        deviceType: 'LeakSensor',
        cluster: 'booleanState',
        attribute: 'stateValue',
        trippedValue: true, // leak detected
        untrippedValue: false, // dry
      },
      light: {
        deviceType: 'LightSensor',
        cluster: 'illuminanceMeasurement',
        attribute: 'measuredValue',
        trippedValue: 27000, // ~500 lux
        untrippedValue: 5000, // ~3.16 lux
      },
      humidity: {
        deviceType: 'HumiditySensor',
        cluster: 'relativeHumidityMeasurement',
        attribute: 'measuredValue',
        trippedValue: 6550, // 65.5%
        untrippedValue: 5500, // 55%
      },
      dioxide: {
        deviceType: 'AirQualitySensor',
        cluster: 'carbonDioxideMeasurement',
        attribute: 'measuredValue',
        trippedValue: 10000, // 10000 ppm
        untrippedValue: 400, // 400 ppm
      },
      air: {
        deviceType: 'AirQualitySensor',
        cluster: 'airQuality',
        attribute: 'airQuality',
        trippedValue: 5, // Very Poor
        untrippedValue: 1, // Good
      },
      temperature: {
        deviceType: 'TemperatureSensor',
        cluster: 'temperatureMeasurement',
        attribute: 'measuredValue',
        trippedValue: 2150, // 21.5°C
        untrippedValue: 2100, // 21.0°C
      },
    }
    const key = (sensorType || 'motion').toLowerCase()
    const info = typeMap[key] || typeMap.motion
    if (!api.matter.deviceTypes[info.deviceType]) {
      console.error(`[Matter] Invalid deviceType '${info.deviceType}'. Available: ${Object.keys(api.matter.deviceTypes).join(', ')}`)
    }
    return info
  }

  configure(accessory: PlatformAccessory): void {
    // Register the Matter accessory if not already registered
    if (this.registered) {
      return
    }
    const deviceName = accessory.displayName || 'Plugin Update Sensor'
    const uuid = this.api.matter.uuid.generate(deviceName)
    this.uuid = uuid
    let matterDeviceType
    let clusters
    const info = this.matterInfo
    const availableTypes = Object.keys(this.api.matter.deviceTypes)
    if (info.deviceType === 'MotionSensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.MotionSensor.with(
          this.api.matter.deviceTypes.MotionSensor.requirements.OccupancySensingServer.with('PassiveInfrared'),
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct MotionSensor deviceType with OccupancySensingServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.MotionSensor
      }
      clusters = {
        'occupancy-sensing': {
          occupancy: 0,
          occupancySensorType: 0,
          occupancySensorTypeBitmap: { pir: true, ultrasonic: false, physicalContact: false },
        },
      }
    } else if (info.deviceType === 'ContactSensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.ContactSensor.with(
          this.api.matter.deviceTypes.ContactSensor.requirements.BooleanStateConfigurationServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct ContactSensor deviceType with BooleanStateConfigurationServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.ContactSensor
      }
      clusters = {
        contactSensor: {
          contactState: 0,
        },
      }
    } else if (info.deviceType === 'SmokeSensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.SmokeSensor.with(
          this.api.matter.deviceTypes.SmokeSensor.requirements.SmokeCoAlarmServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct SmokeSensor deviceType with SmokeCoAlarmServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.SmokeSensor
      }
      clusters = {
        smokeCoAlarm: {
          smokeState: 0,
          coState: 0,
        },
      }
    } else if (info.deviceType === 'LeakSensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.LeakSensor.with(
          this.api.matter.deviceTypes.LeakSensor.requirements.BooleanStateServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct LeakSensor deviceType with LeakDetectionServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.LeakSensor
      }
      clusters = {
        leakDetection: {
          leakState: 0,
        },
      }
    } else if (info.deviceType === 'LightSensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.LightSensor.with(
          this.api.matter.deviceTypes.LightSensor.requirements.IlluminanceMeasurementServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct LightSensor deviceType with IlluminanceMeasurementServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.LightSensor
      }
      clusters = {
        illuminanceMeasurement: {
          measuredValue: 1,
        },
      }
    } else if (info.deviceType === 'HumiditySensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.HumiditySensor.with(
          this.api.matter.deviceTypes.HumiditySensor.requirements.RelativeHumidityMeasurementServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct HumiditySensor deviceType with RelativeHumidityMeasurementServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.HumiditySensor
      }
      clusters = {
        relativeHumidityMeasurement: {
          measuredValue: 0,
        },
      }
    } else if (info.deviceType === 'AirQualitySensor') {
      try {
        matterDeviceType = this.api.matter.deviceTypes.AirQualitySensor.with(
          this.api.matter.deviceTypes.AirQualitySensor.requirements.AirQualityServer,
        )
      } catch (e) {
        this.log?.warn?.(`[Matter] Could not construct AirQualitySensor deviceType with AirQualityServer: ${e}`)
        matterDeviceType = this.api.matter.deviceTypes.AirQualitySensor
      }
      clusters = {
        airQuality: {
          airQuality: 1,
        },
      }
    } else {
      matterDeviceType = this.api.matter.deviceTypes[info.deviceType]
      if (!matterDeviceType) {
        this.log?.warn?.(`[Matter] Unknown deviceType '${info.deviceType}', falling back to '${availableTypes[0]}'`)
        matterDeviceType = this.api.matter.deviceTypes[availableTypes[0]]
      }
      clusters = {
        [info.cluster]: {
          [info.attribute]: info.untrippedValue,
        },
      }
    }
    const serialNumber = `matter-${info.deviceType.toLowerCase()}-sensor`
    const matterAccessory = {
      displayName: deviceName,
      UUID: uuid,
      deviceType: matterDeviceType,
      serialNumber,
      manufacturer: 'homebridge-plugins',
      model: 'UpdateSensor',
      firmwareRevision: '1.0.0',
      hardwareRevision: '1.0.0',
      context: {},
      clusters,
    }
    this.api.matter.registerPlatformAccessories?.(
      PLUGIN_NAME,
      PLATFORM_NAME,
      [matterAccessory],
    )
    this.registered = true
  }

  setState(tripped: boolean): void {
    if (!this.uuid) {
      return
    }
    const info = this.matterInfo
    this.api.matter.updateAccessoryState?.(
      this.uuid,
      info.cluster,
      {
        [info.attribute]: tripped ? info.trippedValue : info.untrippedValue,
      },
    )
  }
}
