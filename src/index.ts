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

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { Cron } from 'croner'

// eslint-disable-next-line ts/consistent-type-imports
import { InstalledPlugin, UiApi } from './ui-api.js'

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
  private readonly useNcu: boolean

  private readonly isDocker: boolean
  private readonly sensorInfo: SensorInfo
  private readonly failureSensorInfo: SensorInfo
  private readonly checkHB: boolean
  private readonly checkHBUI: boolean
  private readonly checkPlugins: boolean
  private readonly checkDocker: boolean
  private readonly autoUpdateHB: boolean
  private readonly autoUpdateHBUI: boolean
  private readonly autoUpdatePlugins: boolean
  private readonly allowDirectNpmUpdates: boolean
  private readonly autoRestartAfterUpdates: boolean

  private service?: Service
  private failureService?: Service

  private cronJob!: Cron
  private firstDailyRun: boolean = true

  private hbUpdates: string[] = []
  private hbUIUpdates: string[] = []
  private pluginUpdates: string[] = []
  private dockerUpdates: string[] = []

  // Track successful updates for restart logic
  private successfulHomebridgeUpdate: boolean = false
  private successfulHBUIUpdate: boolean = false
  private successfulPluginUpdates: string[] = []

  // Track failures for notification sensor
  private hasUpdateFailures: boolean = false

  // Track backup creation status
  private backupCreated: boolean = false

  constructor(log: Logging, config: PlatformConfig, api: API) {
    hap = api.hap
    Accessory = api.platformAccessory

    this.log = log
    this.config = config as PluginUpdatePlatformConfig
    this.api = api

    this.uiApi = new UiApi(this.api.user.storagePath(), this.log)
    this.useNcu = this.config.forceNcu || !this.uiApi.isConfigured()
    this.isDocker = fs.existsSync('/homebridge/package.json')
    this.sensorInfo = this.getSensorInfo(this.config.sensorType)
    this.failureSensorInfo = this.getSensorInfo(this.config.failureSensorType || 'motion')

    this.checkHB = this.config.checkHomebridgeUpdates ?? false
    this.checkHBUI = this.config.checkHomebridgeUIUpdates ?? false
    this.checkPlugins = this.config.checkPluginUpdates ?? false
    this.checkDocker = this.config.checkDockerUpdates ?? false

    this.autoUpdateHB = this.config.autoUpdateHomebridge ?? false
    this.autoUpdateHBUI = this.config.autoUpdateHomebridgeUI ?? false
    this.autoUpdatePlugins = this.config.autoUpdatePlugins ?? false
    this.allowDirectNpmUpdates = this.config.allowDirectNpmUpdates ?? false
    this.autoRestartAfterUpdates = this.config.autoRestartAfterUpdates ?? false

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

    // Add failure notification sensor if any auto-update features are enabled
    if (this.hasAutoUpdateEnabled() && !this.failureService) {
      const failureUuid = hap.uuid.generate(PLATFORM_NAME + '_failure')
      const failureAccessory = new Accessory('Update/Restart Failure', failureUuid)

      failureAccessory.addService(this.failureSensorInfo.serviceType as unknown as Service)

      this.configureFailureAccessory(failureAccessory)

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [failureAccessory])
    }

    setTimeout(() => {
      this.doCheck()
      this.firstDailyRun = false
    }, 10 * 1000)

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
        this.backupCreated = false // Reset backup flag for daily backup creation
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

  async runNcu(args: Array<string>, filter: string = '/^(@.*\\/)?homebridge(-.*)?$/'): Promise<any> {
    args = [
      path.resolve(__dirname, '../node_modules/npm-check-updates/build/cli.js'),
      '--jsonUpgraded',
      '--filter',
      filter,
    ].concat(args)

    const output = await new Promise<string>((resolve, reject) => {
      try {
        const ncu = spawn(process.argv0, args, {
          env: this.isDocker ? { ...process.env, HOME: '/homebridge' } : undefined,
        })
        let stdout = ''
        ncu.stdout.on('data', (chunk: any) => {
          stdout += chunk.toString()
        })
        let stderr = ''
        ncu.stderr.on('data', (chunk: any) => {
          stderr += chunk.toString()
        })
        ncu.on('close', () => {
          if (stderr) {
            reject(stderr)
          } else {
            resolve(stdout)
          }
        })
      } catch (ex) {
        reject(ex)
      }
    })

    return JSON.parse(output)
  }

  async checkNcu(): Promise<number> {
    this.log.debug('Checking for updates using NCU')

    const homebridgeFilter = 'homebridge'
    const homebridgeUIFilter = 'homebridge-config-ui-x'
    const pluginsFilter = '(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*'

    const filters: string[] = []
    if (this.checkHB) filters.push(homebridgeFilter)
    if (this.checkHBUI) filters.push(homebridgeUIFilter)
    if (this.checkPlugins) filters.push(pluginsFilter)

    // eslint-disable-next-line prefer-template
    const filter = '/^' + filters.join('|') + ')$/'

    let results = await this.runNcu(['--global'], filter)

    if (this.isDocker) {
      const dockerPackageResults = await this.runNcu(['--packageFile', '/homebridge/package.json'], filter)
      results = { ...results, ...dockerPackageResults }

      const docker = await this.uiApi.getDocker()
      if (docker.updateAvailable) {
        results.push(docker)
      }
    }

    const updates = Object.keys(results).length
    this.log.debug(`npm-check-updates reports ${updates} available update(s): ${JSON.stringify(results)}`)

    return updates
  }

  async checkUi(): Promise<number> {
    this.log.debug('Searching for available updates ...')

    let logLevel = (this.firstDailyRun === true) ? LogLevel.INFO : LogLevel.DEBUG
    const updatesAvailable: InstalledPlugin[] = []

    // Create backup before performing any automatic updates
    const shouldCreateBackup = this.autoUpdateHB || this.autoUpdateHBUI || this.autoUpdatePlugins
    if (shouldCreateBackup && !this.backupCreated) {
      this.log.info('Automatic updates are enabled - creating backup before updates')
      this.backupCreated = await this.uiApi.createBackup()
      if (!this.backupCreated) {
        this.log.warn('Backup creation failed, but continuing with updates. Ensure you have manual backups in place.')
      }
    }

    if (this.checkHB) {
      const homebridge = await this.uiApi.getHomebridge()

      if (homebridge.updateAvailable) {
        updatesAvailable.push(homebridge)

        const version: string = homebridge.latestVersion

        if (this.hbUpdates.length === 0 || !this.hbUpdates.includes(version)) logLevel = LogLevel.INFO
        this.log.log(logLevel, `Homebridge update available: ${version}`)

        // Attempt automatic update if enabled
        if (this.autoUpdateHB && (!this.useNcu || this.allowDirectNpmUpdates)) {
          try {
            this.log.info(`Attempting to automatically update Homebridge to ${version}`)
            const success = await this.uiApi.updateHomebridge(version)
            if (success) {
              this.log.info(`Successfully initiated Homebridge update to ${version}`)
              this.successfulHomebridgeUpdate = true
            } else {
              this.log.warn(`Failed to initiate Homebridge update to ${version}`)
              this.setFailureState('Homebridge update failed')
            }
          } catch (error) {
            this.log.error(`Error during automatic Homebridge update: ${error}`)
            this.setFailureState(`Homebridge update error: ${error}`)
          }
        } else if (this.autoUpdateHB && this.useNcu && !this.allowDirectNpmUpdates) {
          this.log.warn('Automatic updates require either homebridge-config-ui-x to be available or "allowDirectNpmUpdates" to be enabled')
        }

        this.hbUpdates = [version]
      }
    }

    if (this.checkHBUI || this.checkPlugins) {
      const plugins = await this.uiApi.getPlugins()

      if (this.checkHBUI) {
        const homebridgeUiPlugins = plugins.filter(plugin => plugin.name === 'homebridge-config-ui-x')

        // Only one plugin is returned
        for (const homebridgeUI of homebridgeUiPlugins) {
          if (homebridgeUI.updateAvailable) {
            updatesAvailable.push(homebridgeUI)

            const version: string = homebridgeUI.latestVersion

            if (this.hbUIUpdates.length === 0 || !this.hbUIUpdates.includes(version)) logLevel = LogLevel.INFO
            this.log.log(logLevel, `Homebridge UI update available: ${version}`)

            // Attempt automatic update if enabled
            if (this.autoUpdateHBUI && (!this.useNcu || this.allowDirectNpmUpdates)) {
              try {
                this.log.info(`Attempting to automatically update Homebridge UI to ${version}`)
                const success = await this.uiApi.updatePlugin('homebridge-config-ui-x', version)
                if (success) {
                  this.log.info(`Successfully initiated Homebridge UI update to ${version}`)
                  this.successfulHBUIUpdate = true
                } else {
                  this.log.warn(`Failed to initiate Homebridge UI update to ${version}`)
                  this.setFailureState('Homebridge UI update failed')
                }
              } catch (error) {
                this.log.error(`Error during automatic Homebridge UI update: ${error}`)
                this.setFailureState(`Homebridge UI update error: ${error}`)
              }
            } else if (this.autoUpdateHBUI && this.useNcu && !this.allowDirectNpmUpdates) {
              this.log.warn('Automatic updates require either homebridge-config-ui-x to be available or "allowDirectNpmUpdates" to be enabled')
            }

            this.hbUIUpdates = [version]
          }
        }
      }

      if (this.checkPlugins) {
        const filteredPlugins = plugins.filter(plugin => plugin.name !== 'homebridge-config-ui-x')

        const tempUpdates: string[] = []

        for (const plugin of filteredPlugins) {
          if (plugin.updateAvailable) {
            updatesAvailable.push(plugin)

            const version: string = plugin.latestVersion

            if (this.pluginUpdates.length === 0 || !this.pluginUpdates.includes(version)) logLevel = LogLevel.INFO
            this.log.log(logLevel, `Homebridge plugin update available: ${plugin.name} ${plugin.latestVersion}`)

            // Attempt automatic update if enabled
            if (this.autoUpdatePlugins && (!this.useNcu || this.allowDirectNpmUpdates)) {
              try {
                this.log.info(`Attempting to automatically update plugin ${plugin.name} to ${version}`)
                const success = await this.uiApi.updatePlugin(plugin.name, version)
                if (success) {
                  this.log.info(`Successfully initiated plugin update: ${plugin.name} to ${version}`)
                  this.successfulPluginUpdates.push(plugin.name)
                } else {
                  this.log.warn(`Failed to initiate plugin update: ${plugin.name} to ${version}`)
                  this.setFailureState(`Plugin update failed: ${plugin.name}`)
                }
              } catch (error) {
                this.log.error(`Error during automatic plugin update for ${plugin.name}: ${error}`)
                this.setFailureState(`Plugin update error for ${plugin.name}: ${error}`)
              }
            } else if (this.autoUpdatePlugins && this.useNcu && !this.allowDirectNpmUpdates) {
              this.log.warn('Automatic updates require either homebridge-config-ui-x to be available or "allowDirectNpmUpdates" to be enabled')
            }

            tempUpdates.push(version)
          }
        }

        this.pluginUpdates = tempUpdates
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

    this.log.log(logLevel, `Available update(s): ${updatesAvailable.length}`)

    // Check if restart is needed after successful updates
    if (this.autoRestartAfterUpdates && (this.successfulHomebridgeUpdate || this.successfulHBUIUpdate || this.successfulPluginUpdates.length > 0)) {
      this.log.info('Successful updates detected, preparing to restart Homebridge...')
      
      // List what was updated
      const updatedComponents: string[] = []
      if (this.successfulHomebridgeUpdate) updatedComponents.push('Homebridge')
      if (this.successfulHBUIUpdate) updatedComponents.push('Homebridge UI')
      if (this.successfulPluginUpdates.length > 0) updatedComponents.push(`plugins: ${this.successfulPluginUpdates.join(', ')}`)
      
      this.log.info(`Updated components: ${updatedComponents.join(', ')}`)
      
      // Clear any previous failure state since updates were successful
      this.clearFailureState()
      
      // Restart Homebridge to apply the completed updates
      try {
        await this.uiApi.restartHomebridge()
      } catch (error) {
        this.log.error(`Failed to restart Homebridge: ${error}`)
        this.setFailureState(`Homebridge restart failed: ${error}`)
      }
      
      // Reset tracking variables
      this.successfulHomebridgeUpdate = false
      this.successfulHBUIUpdate = false
      this.successfulPluginUpdates = []
    }

    return updatesAvailable.length
  }

  doCheck(): void {
    const check = this.useNcu ? this.checkNcu() : this.checkUi()

    this.log.debug(`Checking with ncu: ${this.useNcu}`)

    check
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

  configureFailureAccessory(accessory: PlatformAccessory): void {
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(`${accessory.displayName} identify requested!`)
    })

    const accInfo = accessory.getService(hap.Service.AccessoryInformation)
    if (accInfo) {
      accInfo
        .setCharacteristic(hap.Characteristic.Manufacturer, 'Homebridge')
        .setCharacteristic(hap.Characteristic.Model, 'Update/Restart Failure Monitor')
        .setCharacteristic(hap.Characteristic.SerialNumber, hostname())
    }

    this.failureService = accessory.getService(this.failureSensorInfo.serviceType)
    if (!this.failureService) {
      this.failureService = accessory.addService(this.failureSensorInfo.serviceType as unknown as Service)
    }

    // Initialize in no-failure state
    this.failureService.setCharacteristic(this.failureSensorInfo.characteristicType, this.failureSensorInfo.untrippedValue)
  }

  hasAutoUpdateEnabled(): boolean {
    return this.autoUpdateHB || this.autoUpdateHBUI || this.autoUpdatePlugins
  }

  setFailureState(reason: string): void {
    if (this.hasAutoUpdateEnabled() && this.failureService) {
      this.log.warn(`Update/restart failure detected: ${reason}`)
      this.hasUpdateFailures = true
      this.failureService.setCharacteristic(this.failureSensorInfo.characteristicType, this.failureSensorInfo.trippedValue)
    }
  }

  clearFailureState(): void {
    if (this.hasAutoUpdateEnabled() && this.failureService && this.hasUpdateFailures) {
      this.log.info('Clearing update/restart failure state')
      this.hasUpdateFailures = false
      this.failureService.setCharacteristic(this.failureSensorInfo.characteristicType, this.failureSensorInfo.untrippedValue)
    }
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
