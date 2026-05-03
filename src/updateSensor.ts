import type { API, Logging, PlatformAccessory, PlatformConfig } from 'homebridge'

import type { SensorProtocol } from './sensorBase.js'

import { HAPSensor, MatterSensor } from './sensorBase.js'
import { PLATFORM_NAME, PLUGIN_NAME, UPDATE_SENSOR_UUID_KEY } from './settings.js'
import { UpdateCheckCore } from './updateCheckCore.js'

interface UpdateSensorOptions {
  onFailureStateChange?: (failed: boolean) => void
  protocol?: 'hap' | 'matter'
}

export class UpdateSensor {
  private readonly log: Logging
  private readonly config: PlatformConfig
  private readonly api: API
  private readonly updateCore: UpdateCheckCore
  private readonly sensor: SensorProtocol
  private readonly onFailureStateChange?: (failed: boolean) => void
  private accessory?: PlatformAccessory
  private registered = false

  constructor(log: Logging, config: PlatformConfig, api: API, options: UpdateSensorOptions = {}) {
    this.log = log
    this.config = config
    this.api = api
    this.onFailureStateChange = options.onFailureStateChange
    const isDocker = false // Adjust if needed
    this.updateCore = new UpdateCheckCore(log, config, api.user.storagePath(), isDocker)
    const protocol = options.protocol ?? (api.matter ? 'matter' : 'hap')
    // Choose protocol implementation
    if (protocol === 'matter') {
      this.sensor = new MatterSensor({ log, api, sensorType: config.sensorType })
    } else {
      this.sensor = new HAPSensor({ log, api, sensorType: config.sensorType })
    }
    api.on('didFinishLaunching', this.addUpdateSensor.bind(this))
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.sensor.configure(accessory)
    this.accessory = accessory
    this.registered = true
  }

  addUpdateSensor(): void {
    if (!this.registered) {
      const deviceName = (this.config as any).name || 'Plugin Update Check'
      // Create or get accessory (for HAP) or just pass config (for Matter)
      if (!this.api.matter) {
        // HAP: create accessory and register
        const uuid = this.api.hap.uuid.generate(UPDATE_SENSOR_UUID_KEY)
        const Accessory = this.api.platformAccessory
        const accessory = new Accessory(deviceName, uuid)
        this.sensor.configure(accessory)
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
        this.accessory = accessory
      } else {
        // Matter: configure with dummy accessory (not used)
        this.sensor.configure({ displayName: deviceName } as PlatformAccessory)
      }
      this.registered = true
    }
    // Always start checks (whether accessory was newly created or restored from cache)
    setTimeout(() => {
      this.doCheck()
    }, this.updateCore.initialCheckDelay * 1000)
    // Schedule periodic checks
    this.updateCore.startScheduledChecks(() => {
      this.doCheck()
    })
  }

  async doCheck(): Promise<void> {
    try {
      const updates = await this.updateCore.checkUi()
      this.sensor.setState(!!updates)
      this.onFailureStateChange?.(this.updateCore.getLastAutoUpdateFailed())
    } catch (e: any) {
      this.onFailureStateChange?.(true)
      this.log.error(e)
    }
  }
}
