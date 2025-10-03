/* eslint-disable style/operator-linebreak */
/* eslint-disable object-shorthand */
/* eslint-disable perfectionist/sort-imports */
/* eslint-disable antfu/if-newline */

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

import {
  APIEvent,
  LogLevel,
  PlatformAccessoryEvent,
} from 'homebridge'

import type { PluginUpdatePlatformConfig } from './configTypes.js'

import fs from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Cron } from 'croner'

// eslint-disable-next-line ts/consistent-type-imports
import { InstalledPlugin, UiApi } from './ui-api.js'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
// eslint-disable-next-line unused-imports/no-unused-vars
const __dirname = path.dirname(__filename)

let hap: HAP
let Accessory: typeof PlatformAccessory

const PLUGIN_NAME = '@homebridge-plugins/homebridge-plugin-update-check'
const PLATFORM_NAME = 'PluginUpdate'

interface SensorInfo {
  serviceType: WithUUID<typeof Service>
  characteristicType: WithUUID<new () => Characteristic>
  trippedValue: CharacteristicValue
  untrippedValue: CharacteristicValue
}

class PluginUpdatePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging
  private readonly api: API
  private readonly config: PluginUpdatePlatformConfig
  private readonly uiApi: UiApi

  private readonly isDocker: boolean
  private readonly sensorInfo: SensorInfo
  private readonly checkHB: boolean
  private readonly checkHBUI: boolean
  private readonly checkPlugins: boolean
  private readonly checkDocker: boolean
  private readonly initialCheckDelay: number
  private readonly autoUpdateHB: boolean
  private readonly autoUpdateHBUI: boolean
  private readonly autoUpdatePlugins: boolean
  private readonly allowDirectNpmUpdates: boolean
  private readonly autoRestartAfterUpdates: boolean
  private readonly respectDisabledPlugins: boolean

  private service?: Service

  private cronJob!: Cron
  private firstDailyRun: boolean = true

  private hbUpdates: string[] = []
  private hbUIUpdates: string[] = []
  private pluginUpdates: string[] = []
  private dockerUpdates: string[] = []

  constructor(log: Logging, config: PlatformConfig, api: API) {
    hap = api.hap
    Accessory = api.platformAccessory

    this.log = log
    this.config = config as PluginUpdatePlatformConfig
    this.api = api

    this.uiApi = new UiApi(this.api.user.storagePath(), this.log)
    this.isDocker = fs.existsSync('/homebridge/package.json')
    this.sensorInfo = this.getSensorInfo(this.config.sensorType)

    this.checkHB = this.config.checkHomebridgeUpdates ?? false
    this.checkHBUI = this.config.checkHomebridgeUIUpdates ?? false
    this.checkPlugins = this.config.checkPluginUpdates ?? false
    this.checkDocker = this.config.checkDockerUpdates ?? false
    this.initialCheckDelay = this.config.initialCheckDelay ?? 10

    this.autoUpdateHB = this.config.autoUpdateHomebridge ?? false
    this.autoUpdateHBUI = this.config.autoUpdateHomebridgeUI ?? false
    this.autoUpdatePlugins = this.config.autoUpdatePlugins ?? false
    this.allowDirectNpmUpdates = this.config.allowDirectNpmUpdates ?? false
    this.autoRestartAfterUpdates = this.config.autoRestartAfterUpdates ?? false
    this.respectDisabledPlugins = this.config.respectDisabledPlugins ?? true

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.addUpdateAccessory.bind(this))
  }

  addUpdateAccessory(): void {
    if (!this.service) {
      const uuid = hap.uuid.generate(PLATFORM_NAME)
      const newAccessory = new Accessory('Plugin Update Check', uuid)

      newAccessory.addService(this.sensorInfo.serviceType as unknown as Service)

      this.configureAccessory(newAccessory)

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory])
    }

    setTimeout(() => {
      this.doCheck()
      this.firstDailyRun = false
    }, this.initialCheckDelay * 1000)

    const timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
    this.setupFirstDailyRunResetCron(timezone)
    this.setupUpdatesCron(timezone)
  }

  setupFirstDailyRunResetCron(timezone: string): void {
    const cronScheduleAtMidnight = '0 0 * * *'

    this.cronJob = new Cron(
      cronScheduleAtMidnight,
      {
        name: `First Daily Run Reset Cron Job`,
        timezone: timezone,
      },
      async () => {
        this.firstDailyRun = true
        this.log.debug(`Reset "firstDailyRun" to ${this.firstDailyRun}`)
      },
    )
  }

  setupUpdatesCron(timezone: string): void {
    const cronScheduleFiveAfterTheHour = '5 * * * *'

    this.cronJob = new Cron(
      cronScheduleFiveAfterTheHour,
      {
        name: `Updates Available Cron Job`,
        timezone: timezone,
      },
      async () => {
        this.log.debug(`Is first daily run: ${this.firstDailyRun}`)
        this.doCheck()
        this.firstDailyRun = false
        this.log.debug(`Cleared "firstDailyRun" to ${this.firstDailyRun}`)
      },
    )
  }

  async checkUi(): Promise<number> {
    this.log.debug('Searching for available updates ...')

    let logLevel = (this.firstDailyRun === true) ? LogLevel.INFO : LogLevel.DEBUG
    const updatesAvailable: InstalledPlugin[] = []

    // Get ignored plugins from API if respectDisabledPlugins is enabled
    let ignoredPlugins: string[] = []
    if (this.respectDisabledPlugins) {
      try {
        ignoredPlugins = await this.uiApi.getIgnoredPlugins()
        this.log.debug(`Retrieved ${ignoredPlugins.length} ignored plugin(s) from homebridge-config-ui-x: ${ignoredPlugins.join(', ')}`)
      } catch (error) {
        this.log.warn(`Failed to retrieve ignored plugins list, filtering disabled: ${error}`)
        ignoredPlugins = []
      }
    } else {
      this.log.debug('respectDisabledPlugins is disabled, skipping plugin filtering')
    }

    if (this.checkHB) {
      const homebridge = await this.uiApi.getHomebridge()

      if (homebridge.updateAvailable) {
        // Check if homebridge core updates are ignored
        const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge')

        if (!isIgnored) {
          updatesAvailable.push(homebridge)

          const version: string = homebridge.latestVersion

          if (this.hbUpdates.length === 0 || !this.hbUpdates.includes(version)) logLevel = LogLevel.INFO
          this.log.log(logLevel, `Homebridge update available: ${version}`)

          this.hbUpdates = [version]
        } else {
          this.log.debug(`Ignoring Homebridge core update: ${homebridge.latestVersion} (update notifications disabled in homebridge-config-ui-x)`)
        }
      }
    }

    if (this.checkHBUI || this.checkPlugins) {
      const plugins = await this.uiApi.getPlugins()

      if (this.checkHBUI) {
        const homebridgeUiPlugins = plugins.filter(plugin => plugin.name === 'homebridge-config-ui-x')

        // Only one plugin is returned
        homebridgeUiPlugins.forEach((homebridgeUI) => {
          if (homebridgeUI.updateAvailable) {
            // Check if homebridge-config-ui-x updates are ignored
            const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge-config-ui-x')

            if (!isIgnored) {
              updatesAvailable.push(homebridgeUI)

              const version: string = homebridgeUI.latestVersion

              if (this.hbUIUpdates.length === 0 || !this.hbUIUpdates.includes(version)) logLevel = LogLevel.INFO
              this.log.log(logLevel, `Homebridge UI update available: ${version}`)

              this.hbUIUpdates = [version]
            } else {
              this.log.debug(`Ignoring Homebridge UI update: ${homebridgeUI.latestVersion} (update notifications disabled in homebridge-config-ui-x)`)
            }
          }
        })
      }

      if (this.checkPlugins) {
        this.log.debug(`Checking ${plugins.length} plugins for updates (respectDisabledPlugins: ${this.respectDisabledPlugins})`)

        const filteredPlugins = plugins.filter((plugin) => {
          // Always exclude homebridge-config-ui-x
          if (plugin.name === 'homebridge-config-ui-x') {
            return false
          }

          // If respectDisabledPlugins is enabled, check API ignored list
          if (this.respectDisabledPlugins) {
            if (ignoredPlugins.includes(plugin.name)) {
              this.log.debug(`Filtering out plugin ${plugin.name} (ignored in homebridge-config-ui-x)`)
              return false
            }
          }

          return true
        })

        this.log.debug(`After filtering: ${filteredPlugins.length} plugins to check for updates`)

        filteredPlugins.forEach((plugin) => {
          if (plugin.updateAvailable) {
            updatesAvailable.push(plugin)

            const version: string = plugin.latestVersion

            if (this.pluginUpdates.length === 0 || !this.pluginUpdates.includes(version)) logLevel = LogLevel.INFO
            this.log.log(logLevel, `Homebridge plugin update available: ${plugin.name} ${plugin.latestVersion}`)

            this.pluginUpdates.push(version)
          }
        })

        // Log ignored plugins if any updates are available for them (only when respectDisabledPlugins is enabled)
        if (this.respectDisabledPlugins) {
          const ignoredWithUpdates = plugins.filter(plugin =>
            plugin.name !== 'homebridge-config-ui-x' &&
            plugin.updateAvailable &&
            ignoredPlugins.includes(plugin.name),
          )
          if (ignoredWithUpdates.length > 0) {
            this.log.info(`Ignoring updates for ${ignoredWithUpdates.length} plugin(s): ${ignoredWithUpdates.map(p => p.name).join(', ')}`)
          }
        }
      }
    }

    if (this.isDocker && this.checkDocker) {
      const docker = await this.uiApi.getDocker()

      if (docker.updateAvailable) {
        updatesAvailable.push(docker)

        const version: string = docker.latestVersion

        if (this.dockerUpdates.length === 0 || !this.dockerUpdates.includes(version)) logLevel = LogLevel.INFO
        this.log.log(logLevel, `Docker update available: ${version}`)

        this.dockerUpdates = [version]
      }
    }

    this.log.log(logLevel, `Found ${updatesAvailable.length} available update(s)`)

    // Provide additional diagnostic information in debug mode
    if (this.respectDisabledPlugins && ignoredPlugins.length > 0) {
      this.log.debug(`Filtering enabled with ${ignoredPlugins.length} ignored plugins: ${ignoredPlugins.join(', ')}`)
    } else if (this.respectDisabledPlugins) {
      this.log.debug('Filtering enabled but no ignored plugins found')
    } else {
      this.log.debug('Plugin filtering is disabled (respectDisabledPlugins: false)')
    }

    return updatesAvailable.length
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

// Register our platform with homebridge.
export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PluginUpdatePlatform)
}
