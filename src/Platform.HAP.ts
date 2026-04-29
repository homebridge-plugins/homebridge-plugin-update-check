import type {
  API,
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  WithUUID,
} from 'homebridge'

import type { PluginUpdatePlatformConfig } from './configTypes.js'

import fs from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Cron } from 'croner'
import {
  APIEvent,
  LogLevel,
  PlatformAccessoryEvent,
} from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

import { UpdateCheckCore } from './updateCheckCore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let hap: HAP
let Accessory: typeof PlatformAccessory


interface SensorInfo {
  serviceType: WithUUID<typeof Service>
  characteristicType: WithUUID<new () => Characteristic>
  trippedValue: CharacteristicValue
  untrippedValue: CharacteristicValue
}

export class PluginUpdatePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging
  private readonly api: API
  private readonly config: PluginUpdatePlatformConfig
  private readonly sensorInfo: SensorInfo
  private readonly updateCore: UpdateCheckCore
  private service?: Service
  private firstDailyRunResetCronJob!: Cron
  private updatesCronJob!: Cron

  constructor(log: Logging, config: PlatformConfig, api: API) {
    hap = api.hap
    Accessory = api.platformAccessory

    this.log = log
    this.config = config as PluginUpdatePlatformConfig
    this.api = api
    this.sensorInfo = this.getSensorInfo(this.config.sensorType)
    const isDocker = fs.existsSync('/homebridge/package.json')
    this.updateCore = new UpdateCheckCore(log, config, this.api.user.storagePath(), isDocker)
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.addUpdateAccessory.bind(this))
  }

  addUpdateAccessory(): void {
    if (!this.service) {
      const accessoryName = this.config.name || 'Plugin Update Check';
      const uuid = hap.uuid.generate(PLATFORM_NAME)
      const newAccessory = new Accessory(accessoryName, uuid)

      newAccessory.addService(this.sensorInfo.serviceType as unknown as Service)

      this.configureAccessory(newAccessory)

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory])
    }

    // Initial check after delay
    setTimeout(() => {
      this.doCheck()
      this.updateCore.firstDailyRun = false
    }, this.updateCore.initialCheckDelay * 1000)

    // Use shared cron scheduling for periodic checks and daily reset
    this.updateCore.startScheduledChecks(() => {
      // Check if Node.js update is the reason for tripped state
      const nodeUpdate = this.updateCore.nodeUpdates.length > 0;
      if (nodeUpdate) {
        this.log.info('Sensor tripped: Node.js update available');
      }
      const updates = this.updateCore.hbUpdates.length + this.updateCore.hbUIUpdates.length + this.updateCore.pluginUpdates.length + this.updateCore.dockerUpdates.length + this.updateCore.nodeUpdates.length;
      this.service?.setCharacteristic(this.sensorInfo.characteristicType, updates ? this.sensorInfo.trippedValue : this.sensorInfo.untrippedValue);
    });
  }


  async checkUi(): Promise<number> {
    return this.updateCore.checkUi();
  }

  doCheck(): void {
    this.checkUi()
      .then((updates) => {
        this.service?.setCharacteristic(this.sensorInfo.characteristicType, updates ? this.sensorInfo.trippedValue : this.sensorInfo.untrippedValue)
      })
      .catch((ex) => {
        this.log.error(ex)
      })
      .finally(() => {
        this.log.debug('Check complete')
      })
  }

  checkService(accessory: PlatformAccessory, serviceType: WithUUID<typeof Service>): boolean {
    const service = accessory.getService(serviceType)
    if (this.sensorInfo.serviceType === serviceType) {
      if (service) {
        this.service = service
      } else {
        this.service = accessory.addService(serviceType as unknown as Service)
      }
      return true
    } else {
      if (service) {
        accessory.removeService(service)
      }
      return false
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(`${accessory.displayName} identify requested!`)
    })

    const accInfo = accessory.getService(hap.Service.AccessoryInformation)
    if (accInfo) {
      accInfo
        .setCharacteristic(hap.Characteristic.Manufacturer, 'Homebridge')
        .setCharacteristic(hap.Characteristic.Model, 'Plugin Update Check')
        .setCharacteristic(hap.Characteristic.SerialNumber, hostname())
    }

    this.checkService(accessory, hap.Service.MotionSensor)
    this.checkService(accessory, hap.Service.ContactSensor)
    this.checkService(accessory, hap.Service.OccupancySensor)
    this.checkService(accessory, hap.Service.SmokeSensor)
    this.checkService(accessory, hap.Service.LeakSensor)
    this.checkService(accessory, hap.Service.LightSensor)
    this.checkService(accessory, hap.Service.HumiditySensor)
    this.checkService(accessory, hap.Service.CarbonMonoxideSensor)
    this.checkService(accessory, hap.Service.CarbonDioxideSensor)
    this.checkService(accessory, hap.Service.AirQualitySensor)

    /* const motionService = accessory.getService(hap.Service.MotionSensor);
    const contactService = accessory.getService(hap.Service.ContactSensor);
    const occupancyService = accessory.getService(hap.Service.OccupancySensor);
    const smokeService = accessory.getService(hap.Service.SmokeSensor);
    const leakService = accessory.getService(hap.Service.LeakSensor);
    const lightService = accessory.getService(hap.Service.LightSensor);
    const humidityService = accessory.getService(hap.Service.HumiditySensor);
    const monoxideService = accessory.getService(hap.Service.CarbonMonoxideSensor);
    const dioxideService = accessory.getService(hap.Service.CarbonDioxideSensor);
    const airService = accessory.getService(hap.Service.AirQualitySensor);

    if (this.sensorInfo.serviceType == hap.Service.MotionSensor) {
      this.service = motionService;
    } else if (motionService) {
      accessory.removeService(motionService);
    }
    if (this.sensorInfo.serviceType == hap.Service.ContactSensor) {
      this.service = contactService;
    } else if (contactService) {
      accessory.removeService(contactService);
    }
    if (this.sensorInfo.serviceType == hap.Service.OccupancySensor) {
      this.service = occupancyService;
    } else if (occupancyService) {
      accessory.removeService(occupancyService);
    }
    if (this.sensorInfo.serviceType == hap.Service.SmokeSensor) {
      this.service = smokeService;
    } else if (smokeService) {
      accessory.removeService(smokeService);
    }
    if (this.sensorInfo.serviceType == hap.Service.LeakSensor) {
      this.service = leakService;
    } else if (leakService) {
      accessory.removeService(leakService);
    }
    if (this.sensorInfo.serviceType == hap.Service.LightSensor) {
      this.service = lightService;
    } else if (lightService) {
      accessory.removeService(lightService);
    }
    if (this.sensorInfo.serviceType == hap.Service.HumiditySensor) {
      this.service = humidityService;
    } else if (humidityService) {
      accessory.removeService(humidityService);
    }
    if (this.sensorInfo.serviceType == hap.Service.CarbonMonoxideSensor) {
      this.service = monoxideService;
    } else if (monoxideService) {
      accessory.removeService(monoxideService);
    }
    if (this.sensorInfo.serviceType == hap.Service.CarbonDioxideSensor) {
      this.service = dioxideService;
    } else if (dioxideService) {
      accessory.removeService(dioxideService);
    }
    if (this.sensorInfo.serviceType == hap.Service.AirQualitySensor) {
      this.service = airService;
    } else if (airService) {
      accessory.removeService(airService);
    } */

    this.service?.setCharacteristic(this.sensorInfo.characteristicType, this.sensorInfo.untrippedValue)
  }

  getSensorInfo(sensorType?: string): SensorInfo {
    switch (sensorType?.toLowerCase()) {
      case 'contact':
        return {
          serviceType: hap.Service.ContactSensor,
          characteristicType: hap.Characteristic.ContactSensorState,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'occupancy':
        return {
          serviceType: hap.Service.OccupancySensor,
          characteristicType: hap.Characteristic.OccupancyDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'smoke':
        return {
          serviceType: hap.Service.SmokeSensor,
          characteristicType: hap.Characteristic.SmokeDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'leak':
        return {
          serviceType: hap.Service.LeakSensor,
          characteristicType: hap.Characteristic.LeakDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'light':
        return {
          serviceType: hap.Service.LightSensor,
          characteristicType: hap.Characteristic.CurrentAmbientLightLevel,
          untrippedValue: 0.0001,
          trippedValue: 100000,
        }
      case 'humidity':
        return {
          serviceType: hap.Service.HumiditySensor,
          characteristicType: hap.Characteristic.CurrentRelativeHumidity,
          untrippedValue: 0,
          trippedValue: 100,
        }
      case 'monoxide':
        return {
          serviceType: hap.Service.CarbonMonoxideSensor,
          characteristicType: hap.Characteristic.CarbonMonoxideDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'dioxide':
        return {
          serviceType: hap.Service.CarbonDioxideSensor,
          characteristicType: hap.Characteristic.CarbonDioxideDetected,
          untrippedValue: 0,
          trippedValue: 1,
        }
      case 'air':
        return {
          serviceType: hap.Service.AirQualitySensor,
          characteristicType: hap.Characteristic.AirQuality,
          untrippedValue: 1,
          trippedValue: 5,
        }
      case 'motion':
      default:
        return {
          serviceType: hap.Service.MotionSensor,
          characteristicType: hap.Characteristic.MotionDetected,
          untrippedValue: false,
          trippedValue: true,
        }
    }
  }
}
