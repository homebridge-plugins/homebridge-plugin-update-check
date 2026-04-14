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

interface MatterSensorInfo {
  deviceType: any
  clusterName: string
  trippedClusterState: Record<string, unknown>
  untrippedClusterState: Record<string, unknown>
  initialClusters: Record<string, unknown>
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
  private readonly useMatter: boolean
  private readonly externalAccessory: boolean

  private service?: Service
  private matterUUID?: string
  private cachedMatterAccessory?: any

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

    // Determine if Matter should be used: requires Homebridge v2 with Matter available
    // and Matter enabled, unless the user has explicitly disabled it via config
    const matterAvailable = !!(
      (api as any)?.isMatterAvailable?.()
      && (api as any)?.isMatterEnabled?.()
    )
    const disableMatter = this.config.disableMatter ?? false
    this.useMatter = matterAvailable && !disableMatter

    if (matterAvailable && disableMatter) {
      this.log.debug('Matter is available but disabled by configuration (disableMatter: true)')
    } else if (this.useMatter) {
      this.log.debug('Matter is available and enabled - using Matter accessory')
    }

    this.externalAccessory = this.config.externalAccessory ?? false
    if (this.externalAccessory) {
      this.log.debug('External accessory mode enabled - accessory will be published outside the bridge')
    }

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.addUpdateAccessory.bind(this))
  }

  async addUpdateAccessory(): Promise<void> {
    if (this.useMatter) {
      // Clean up stale Matter accessory if the sensor type changed and a new one needs to be registered
      await this.addMatterAccessory()
    } else {
      // If switching from Matter to HAP mode, unregister any cached Matter accessory
      if (this.cachedMatterAccessory) {
        this.log.debug('Unregistering stale Matter accessory (switching to HAP mode):', this.cachedMatterAccessory.displayName)
        try {
          await (this.api as any).matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cachedMatterAccessory])
        } catch (error) {
          this.log.warn('Failed to unregister stale Matter accessory:', error)
        }
        this.cachedMatterAccessory = undefined
        this.matterUUID = undefined
      }
      this.addHapAccessory()
    }

    setTimeout(() => {
      this.doCheck()
      this.firstDailyRun = false
    }, this.initialCheckDelay * 1000)

    const timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
    this.setupFirstDailyRunResetCron(timezone)
    this.setupUpdatesCron(timezone)
  }

  private addHapAccessory(): void {
    if (this.externalAccessory) {
      // External accessory: always create fresh and publish outside the bridge.
      // Homebridge handles pairing persistence; configureAccessory is never called
      // by Homebridge for external accessories on restart.
      const uuid = hap.uuid.generate(PLATFORM_NAME)
      const newAccessory = new Accessory('Plugin Update Check', uuid)
      newAccessory.addService(this.sensorInfo.serviceType as unknown as Service)
      this.setupHapAccessoryServices(newAccessory)
      this.api.publishExternalAccessories(PLUGIN_NAME, [newAccessory])
    } else if (!this.service) {
      // Bridged accessory: only register if not already restored from cache by configureAccessory
      const uuid = hap.uuid.generate(PLATFORM_NAME)
      const newAccessory = new Accessory('Plugin Update Check', uuid)
      newAccessory.addService(this.sensorInfo.serviceType as unknown as Service)
      this.configureAccessory(newAccessory)
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory])
    }
  }

  private async addMatterAccessory(): Promise<void> {
    const matterApi = (this.api as any).matter
    const serialNumber = `${PLATFORM_NAME}-update-sensor`
    const expectedUUID = matterApi.uuid.generate(serialNumber)

    // If already restored from cache by configureMatterAccessory, skip registration.
    // External accessories are not cached via configureMatterAccessory, so always register when externalAccessory is true.
    if (!this.externalAccessory && this.matterUUID === expectedUUID) {
      this.log.debug('Using cached Matter accessory (UUID: %s)', this.matterUUID)
      return
    }

    this.matterUUID = expectedUUID
    const matterSensorInfo = this.getMatterSensorInfo(this.config.sensorType)

    const matterAccessory = {
      UUID: this.matterUUID,
      displayName: 'Plugin Update Check',
      deviceType: matterSensorInfo.deviceType,
      serialNumber,
      manufacturer: 'Homebridge',
      model: 'Plugin Update Check',
      firmwareRevision: '1.0.0',
      hardwareRevision: '1.0.0',
      clusters: matterSensorInfo.initialClusters,
      ...(this.externalAccessory ? { external: true } : {}),
    }

    try {
      await matterApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [matterAccessory])
      this.log.debug('Matter accessory registered (UUID: %s)', this.matterUUID)
    } catch (error) {
      this.log.error(`Failed to register Matter accessory '${matterAccessory.displayName}' (${this.matterUUID}):`, error)
    }
  }

  configureMatterAccessory(accessory: any): void {
    this.log.debug('Loading cached Matter accessory:', accessory.displayName)
    this.cachedMatterAccessory = accessory
    this.matterUUID = accessory.UUID
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
        if (this.useMatter && this.matterUUID) {
          const matterSensorInfo = this.getMatterSensorInfo(this.config.sensorType)
          const state = updates ? matterSensorInfo.trippedClusterState : matterSensorInfo.untrippedClusterState
          ;(this.api as any).matter.updateAccessoryState(this.matterUUID, matterSensorInfo.clusterName, state)
            .catch((error: any) => this.log.error(`Failed to update Matter accessory state for ${this.matterUUID}:`, error))
        } else {
          this.service?.setCharacteristic(this.sensorInfo.characteristicType, updates ? this.sensorInfo.trippedValue : this.sensorInfo.untrippedValue)
        }
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
    // When using Matter, any cached HAP accessory is stale - unregister it
    if (this.useMatter) {
      this.log.debug('Unregistering stale HAP accessory (switching to Matter mode):', accessory.displayName)
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      return
    }

    // When using external accessory mode, any cached bridged accessory is stale - unregister it
    if (this.externalAccessory) {
      this.log.debug('Unregistering stale bridged HAP accessory (switching to external mode):', accessory.displayName)
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      return
    }

    this.setupHapAccessoryServices(accessory)
  }

  private setupHapAccessoryServices(accessory: PlatformAccessory): void {
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

  getMatterSensorInfo(sensorType?: string): MatterSensorInfo {
    const matterApi = (this.api as any).matter
    switch (sensorType?.toLowerCase()) {
      case 'contact':
        return {
          deviceType: matterApi.deviceTypes.ContactSensor,
          clusterName: 'booleanState',
          // Matter BooleanState: false = contact open/triggered, true = contact closed/normal
          trippedClusterState: { stateValue: false },
          untrippedClusterState: { stateValue: true },
          initialClusters: { booleanState: { stateValue: true } },
        }
      case 'occupancy':
      case 'motion':
        return {
          deviceType: matterApi.deviceTypes.OccupancySensor,
          clusterName: 'occupancySensing',
          // Matter OccupancySensing: 1 = occupied/triggered, 0 = unoccupied/normal
          trippedClusterState: { occupancy: 1 },
          untrippedClusterState: { occupancy: 0 },
          initialClusters: { occupancySensing: { occupancy: 0 } },
        }
      case 'leak':
        return {
          deviceType: matterApi.deviceTypes.WaterLeakDetector,
          clusterName: 'booleanState',
          trippedClusterState: { stateValue: true },
          untrippedClusterState: { stateValue: false },
          initialClusters: { booleanState: { stateValue: false } },
        }
      case 'smoke':
        return {
          deviceType: matterApi.deviceTypes.SmokeCOAlarm,
          clusterName: 'smokeCoAlarm',
          // Matter SmokeCoAlarm: 1 = warning/critical, 0 = normal
          trippedClusterState: { smokeState: 1 },
          untrippedClusterState: { smokeState: 0 },
          initialClusters: { smokeCoAlarm: { smokeState: 0, coState: 0, batteryAlert: 0 } },
        }
      case 'air':
        return {
          deviceType: matterApi.deviceTypes.AirQualitySensor,
          clusterName: 'airQuality',
          // Matter AirQuality: 1 = good, 5 = very poor
          trippedClusterState: { airQuality: 5 },
          untrippedClusterState: { airQuality: 1 },
          initialClusters: { airQuality: { airQuality: 1 } },
        }
      case 'humidity':
        return {
          deviceType: matterApi.deviceTypes.HumiditySensor,
          clusterName: 'relativeHumidityMeasurement',
          // Matter RelativeHumidityMeasurement: value in 0.01% increments
          trippedClusterState: { measuredValue: 9999 },
          untrippedClusterState: { measuredValue: 0 },
          initialClusters: { relativeHumidityMeasurement: { measuredValue: 0, minMeasuredValue: 0, maxMeasuredValue: 9999 } },
        }
      case 'light':
        return {
          deviceType: matterApi.deviceTypes.LightSensor,
          clusterName: 'illuminanceMeasurement',
          // Matter IlluminanceMeasurement: 10000*log10(lux)+1, high value = bright (updates)
          trippedClusterState: { measuredValue: 65534 },
          untrippedClusterState: { measuredValue: 1 },
          initialClusters: { illuminanceMeasurement: { measuredValue: 1, minMeasuredValue: 1, maxMeasuredValue: 65534 } },
        }
      default:
        // Default to ContactSensor for unsupported types (monoxide, dioxide, etc.)
        return {
          deviceType: matterApi.deviceTypes.ContactSensor,
          clusterName: 'booleanState',
          trippedClusterState: { stateValue: false },
          untrippedClusterState: { stateValue: true },
          initialClusters: { booleanState: { stateValue: true } },
        }
    }
  }
}

// Register our platform with homebridge.
export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PluginUpdatePlatform)
}
