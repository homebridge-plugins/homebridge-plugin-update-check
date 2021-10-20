import {
  API,
  APIEvent,
  Characteristic,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
  Service,
  WithUUID
} from 'homebridge';
import { spawn } from 'child_process';
import fs from 'fs';
import { hostname } from 'os';
import path from 'path';
import { PluginUpdatePlatformConfig } from './configTypes';
import { UiApi } from './ui-api';

let hap: HAP;
let Accessory: typeof PlatformAccessory;

const PLUGIN_NAME = 'homebridge-plugin-update-check';
const PLATFORM_NAME = 'PluginUpdate';

class PluginUpdatePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;
  private readonly config: PluginUpdatePlatformConfig;
  private readonly uiApi: UiApi;
  private readonly useNcu: boolean;
  private readonly updateType: string;
  private readonly isDocker: boolean;
  private readonly updateValue!: CharacteristicValue;
  private readonly updateService!: WithUUID<typeof Service>;
  private readonly serviceType: WithUUID<typeof Service> = this.updateTypeService();
  private readonly updateCharacteristic!: WithUUID<new () => Characteristic>;
  private readonly characteristicType: WithUUID<new () => Characteristic> = this.updateTypeCharacteristic();
  private service?: Service;
  private timer?: NodeJS.Timeout;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config as PluginUpdatePlatformConfig;
    this.api = api;

    this.uiApi = new UiApi(this.api.user.storagePath());
    this.useNcu = this.config.forceNcu || !this.uiApi.isConfigured();
    this.isDocker = fs.existsSync('/homebridge/package.json');
    this.updateType = this.config.updateType || 'motion';

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.addUpdateAccessory.bind(this));
  }

  async runNcu(args: Array<string>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    args = [
      path.resolve(__dirname, '../node_modules/npm-check-updates/bin/cli.js'),
      '--jsonUpgraded',
      '--filter',
      '/^(@.*\\/)?homebridge(-.*)?$/'
    ].concat(args);

    const output = await new Promise<string>((resolve, reject) => {
      try {
        const ncu = spawn(process.argv0, args, {
          env: this.isDocker ? { ...process.env, HOME: '/homebridge' } : undefined
        });
        let stdout = '';
        ncu.stdout.on('data', (chunk: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          stdout += chunk.toString();
        });
        let stderr = '';
        ncu.stderr.on('data', (chunk: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          stderr += chunk.toString();
        });
        ncu.on('close', () => {
          if (stderr) {
            reject(stderr);
          } else {
            resolve(stdout);
          }
        });
      } catch (ex) {
        reject(ex);
      }
    });

    return JSON.parse(output);
  }

  async checkNcu(): Promise<number> {
    let results = await this.runNcu(['--global']);

    if (this.isDocker) {
      const dockerResults = await this.runNcu(['--packageFile', '/homebridge/package.json']);
      results = { ...results, ...dockerResults };
    }

    const updates = Object.keys(results).length;
    this.log.debug('node-check-updates reports ' + updates +
      ' outdated package(s): ' + JSON.stringify(results));

    return updates;
  }

  async checkUi(): Promise<number> {
    const plugins = await this.uiApi.getPlugins();
    const homebridge = await this.uiApi.getHomebridge();
    plugins.push(homebridge);

    const results = plugins.filter(plugin => plugin.updateAvailable);
    this.log.debug('homebridge-config-ui-x reports ' + results.length +
      ' outdated package(s): ' + JSON.stringify(results));

    return results.length;
  }

  doCheck(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const check = this.useNcu ? this.checkNcu() : this.checkUi();

    check
      .then(updates => {
        this.service?.setCharacteristic(this.characteristicType, updates > this.value());
      })
      .catch(ex => {
        this.log.error(ex);
      })
      .finally(((): void => {
        this.timer = setTimeout(this.doCheck.bind(this), 8 * 60 * 60 * 1000);
      }).bind(this));
  }

  configureAccessory(accessory: PlatformAccessory): void {
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(accessory.displayName + ' identify requested!');
    });

    const accInfo = accessory.getService(hap.Service.AccessoryInformation);
    if (accInfo) {
      accInfo
        .setCharacteristic(hap.Characteristic.Manufacturer, 'Homebridge')
        .setCharacteristic(hap.Characteristic.Model, 'Plugin Update Check')
        .setCharacteristic(hap.Characteristic.SerialNumber, hostname());
    }

    this.service = accessory.getService(this.serviceType);
    this.service?.setCharacteristic(this.characteristicType, this.value());
  }

  addUpdateAccessory(): void {
    if (!this.service) {
      const uuid = hap.uuid.generate(PLATFORM_NAME);
      const newAccessory = new Accessory('Plugin Update Check', uuid);

      newAccessory.addService(this.serviceType);

      this.configureAccessory(newAccessory);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory]);
    }

    this.timer = setTimeout(this.doCheck.bind(this), 60 * 1000); // Onzu recommends waiting 60 seconds on start
  }

  value(): CharacteristicValue {
    switch (this.updateType) {
      case 'contact':
      case 'occupancy':
      case 'smoke':
      case 'monoxide':
      case 'dioxide':
      case 'leak':
        this.updateValue === 0;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'light':
        this.updateValue === 0; //0.0001 to 100000?
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'humidity':
        this.updateValue === 0; // 0 to 100?
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'air':
        this.updateValue === 1; // 1 to 5?
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'motion':
      default:
        this.updateValue === false;
        this.log.debug(`Update Type: ${this.updateType}`);
    }
    return this.updateValue;
  }

  updateTypeCharacteristic(): WithUUID<new () => Characteristic> {
    switch (this.updateType) {
      case 'contact':
        this.updateCharacteristic === hap.Characteristic.ContactSensorState;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'occupancy':
        this.updateCharacteristic === hap.Characteristic.OccupancyDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'smoke':
        this.updateCharacteristic === hap.Characteristic.SmokeDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'leak':
        this.updateCharacteristic === hap.Characteristic.LeakDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'light':
        this.updateCharacteristic === hap.Characteristic.CurrentAmbientLightLevel;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'humidity':
        this.updateCharacteristic === hap.Characteristic.CurrentRelativeHumidity;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'monoxide':
        this.updateCharacteristic === hap.Characteristic.CarbonMonoxideDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'dioxide':
        this.updateCharacteristic === hap.Characteristic.CarbonDioxideDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'air':
        this.updateCharacteristic === hap.Characteristic.AirQuality;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'motion':
      default:
        this.updateCharacteristic === hap.Characteristic.MotionDetected;
        this.log.debug(`Update Type: ${this.updateType}`);
    }
    return this.updateCharacteristic;
  }

  updateTypeService(): WithUUID<typeof Service> {
    switch (this.updateType) {
      case 'contact':
        this.updateService === hap.Service.ContactSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'occupancy':
        this.updateService === hap.Service.OccupancySensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'smoke':
        this.updateService === hap.Service.SmokeSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'leak':
        this.updateService === hap.Service.LeakSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'light':
        this.updateService === hap.Service.LightSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'humidity':
        this.updateService === hap.Service.HumiditySensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'monoxide':
        this.updateService === hap.Service.CarbonMonoxideSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'dioxide':
        this.updateService === hap.Service.CarbonDioxideSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'air':
        this.updateService === hap.Service.AirQualitySensor;
        this.log.debug(`Update Type: ${this.updateType}`);
        break;
      case 'motion':
      default:
        this.updateService === hap.Service.MotionSensor;
        this.log.debug(`Update Type: ${this.updateType}`);
    }
    return this.updateService;
  }
}

export = (api: API): void => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PluginUpdatePlatform);
};