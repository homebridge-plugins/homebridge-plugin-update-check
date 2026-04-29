import { Cron } from 'croner';
import https from 'node:https';
import type { Logging, PlatformConfig } from 'homebridge';
import type { PluginUpdatePlatformConfig } from './configTypes.js';
import { UiApi, InstalledPlugin } from './ui-api.js';
import { LogLevel } from 'homebridge';

export class UpdateCheckCore {
  public readonly checkNode: boolean;
  public nodeUpdates: string[] = [];
  public readonly log: Logging;
  public readonly config: PluginUpdatePlatformConfig;
  public readonly uiApi: UiApi;
  public readonly respectDisabledPlugins: boolean;
  public readonly checkHB: boolean;
  public readonly checkHBUI: boolean;
  public readonly checkPlugins: boolean;
  public readonly checkDocker: boolean;
  public readonly isDocker: boolean;
  public readonly initialCheckDelay: number;
  public hbUpdates: string[] = [];
  public hbUIUpdates: string[] = [];
  public pluginUpdates: string[] = [];
  public dockerUpdates: string[] = [];
  public firstDailyRun: boolean = true;
  private lastAutoUpdateFailed = false;

  constructor(log: Logging, config: PlatformConfig, storagePath: string, isDocker: boolean) {
    this.log = log;
    this.config = config as PluginUpdatePlatformConfig;
    this.uiApi = new UiApi(storagePath, log);
    this.isDocker = isDocker;
    this.respectDisabledPlugins = this.config.respectDisabledPlugins ?? true;
    this.checkHB = this.config.checkHomebridgeUpdates ?? false;
    this.checkHBUI = this.config.checkHomebridgeUIUpdates ?? false;
    this.checkPlugins = this.config.checkPluginUpdates ?? false;
    this.checkDocker = this.config.checkDockerUpdates ?? false;
    this.initialCheckDelay = this.config.initialCheckDelay ?? 10;
    this.checkNode = this.config.checkNodeUpdates ?? false;
  }

  async checkUi(): Promise<number> {
    this.lastAutoUpdateFailed = false;
    this.log.debug('Searching for available updates ...');
    const isFirstDailyRun = this.firstDailyRun === true;
    const updatesAvailable: InstalledPlugin[] = [];
    let ignoredPlugins: string[] = [];

    // Node.js update check (after variable declarations)
    if (this.checkNode) {
      try {
        const currentVersion = process.versions.node;
        // Fetch latest LTS version from Node.js API
        const latestLtsVersion = await new Promise<string>((resolve, reject) => {
          const req = https.get('https://nodejs.org/dist/index.json', (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const releases = JSON.parse(data);
                // Find latest LTS
                const ltsReleases = releases.filter((r: any) => r.lts);
                if (ltsReleases.length === 0) return reject('No LTS releases found');
                // Sort by version descending
                ltsReleases.sort((a: any, b: any) => b.version.localeCompare(a.version, undefined, { numeric: true }));
                const latest = ltsReleases[0].version.replace(/^v/, '');
                resolve(latest);
              } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
        });
        // Compare versions (semver)
        const semverCompare = (a: string, b: string) => {
          const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
          for (let i = 0; i < 3; ++i) {
            if (pa[i] > pb[i]) return 1;
            if (pa[i] < pb[i]) return -1;
          }
          return 0;
        };
        if (semverCompare(currentVersion, latestLtsVersion) < 0) {
          const isNew = this.nodeUpdates.length === 0 || !this.nodeUpdates.includes(latestLtsVersion);
          const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG;
          this.log.log(logLevel, `Node.js update available: ${currentVersion} → ${latestLtsVersion}`);
          this.nodeUpdates = [latestLtsVersion];
          updatesAvailable.push({
            name: 'node',
            installedVersion: currentVersion,
            latestVersion: latestLtsVersion,
            updateAvailable: true,
          });
          // Auto-update Node.js if enabled and supported
          if (this.config.autoUpdateNode) {
            const { spawnSync } = await import('node:child_process');
            // Check if hb-service supports update-node
            const help = spawnSync('hb-service', ['--help'], { encoding: 'utf8' });
            if (help.stdout && help.stdout.includes('update-node')) {
              this.log.info('Attempting to auto-update Node.js using hb-service update-node ...');
              const result = spawnSync('hb-service', ['update-node'], { encoding: 'utf8' });
              if (result.status === 0) {
                this.log.info('Node.js auto-update completed successfully. A system restart may be required.');
              } else {
                this.lastAutoUpdateFailed = true;
                this.log.error(`Node.js auto-update failed: ${result.stderr || result.stdout}`);
              }
            } else {
              this.lastAutoUpdateFailed = true;
              this.log.warn('hb-service update-node is not supported on this system.');
            }
          }
        } else {
          this.log.debug(`Node.js is up to date (current: ${currentVersion}, latest LTS: ${latestLtsVersion})`);
        }
      } catch (err) {
        this.lastAutoUpdateFailed = true;
        this.log.warn(`Failed to check Node.js updates: ${err}`);
      }
    }
    // (removed duplicate declarations)
    if (this.respectDisabledPlugins) {
      try {
        ignoredPlugins = await this.uiApi.getIgnoredPlugins();
        this.log.debug(`Retrieved ${ignoredPlugins.length} ignored plugin(s) from homebridge-config-ui-x: ${ignoredPlugins.join(', ')}`);
      } catch (error) {
        this.log.warn(`Failed to retrieve ignored plugins list, filtering disabled: ${error}`);
        ignoredPlugins = [];
      }
    } else {
      this.log.debug('respectDisabledPlugins is disabled, skipping plugin filtering');
    }
    if (this.checkHB) {
      const homebridge = await this.uiApi.getHomebridge();
      if (homebridge.updateAvailable) {
        const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge');
        if (!isIgnored) {
          updatesAvailable.push(homebridge);
          const version: string = homebridge.latestVersion;
          const isNew = this.hbUpdates.length === 0 || !this.hbUpdates.includes(version);
          const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG;
          this.log.log(logLevel, `Homebridge update available: ${version}`);
          this.hbUpdates = [version];
        } else {
          this.log.debug(`Ignoring Homebridge core update: ${homebridge.latestVersion} (update notifications disabled in homebridge-config-ui-x)`);
        }
      }
    }
    if (this.checkHBUI || this.checkPlugins) {
      const plugins = await this.uiApi.getPlugins();
      if (this.checkHBUI) {
        const homebridgeUiPlugins = plugins.filter(plugin => plugin.name === 'homebridge-config-ui-x');
        homebridgeUiPlugins.forEach((homebridgeUI) => {
          if (homebridgeUI.updateAvailable) {
            const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge-config-ui-x');
            if (!isIgnored) {
              updatesAvailable.push(homebridgeUI);
              const version: string = homebridgeUI.latestVersion;
              const isNew = this.hbUIUpdates.length === 0 || !this.hbUIUpdates.includes(version);
              const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG;
              this.log.log(logLevel, `Homebridge UI update available: ${version}`);
              this.hbUIUpdates = [version];
            } else {
              this.log.debug(`Ignoring Homebridge UI update: ${homebridgeUI.latestVersion} (update notifications disabled in homebridge-config-ui-x)`);
            }
          }
        });
      }
      if (this.checkPlugins) {
        this.log.debug(`Checking ${plugins.length} plugins for updates (respectDisabledPlugins: ${this.respectDisabledPlugins})`);
        const filteredPlugins = plugins.filter((plugin) => {
          if (plugin.name === 'homebridge-config-ui-x') {
            return false;
          }
          if (this.respectDisabledPlugins) {
            if (ignoredPlugins.includes(plugin.name)) {
              this.log.debug(`Filtering out plugin ${plugin.name} (ignored in homebridge-config-ui-x)`);
              return false;
            }
          }
          return true;
        });
        filteredPlugins.forEach((plugin) => {
          if (plugin.updateAvailable) {
            updatesAvailable.push(plugin);
            const version: string = plugin.latestVersion;
            const isNew = this.pluginUpdates.length === 0 || !this.pluginUpdates.includes(version);
            const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG;
            this.log.log(logLevel, `Homebridge plugin update available: ${plugin.name} ${plugin.latestVersion}`);
            this.pluginUpdates.push(version);
          }
        });
        if (this.respectDisabledPlugins) {
          const ignoredWithUpdates = plugins.filter(plugin =>
            plugin.name !== 'homebridge-config-ui-x'
            && plugin.updateAvailable
            && ignoredPlugins.includes(plugin.name),
          );
          if (ignoredWithUpdates.length > 0) {
            this.log.info(`Ignoring updates for ${ignoredWithUpdates.length} plugin(s): ${ignoredWithUpdates.map(p => p.name).join(', ')}`);
          }
        }
      }
    }
    if (this.isDocker && this.checkDocker) {
      const docker = await this.uiApi.getDocker();
      if (docker.updateAvailable) {
        updatesAvailable.push(docker);
        const version: string = docker.latestVersion;
        const isNew = this.dockerUpdates.length === 0 || !this.dockerUpdates.includes(version);
        const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG;
        this.log.log(logLevel, `Docker update available: ${version}`);
        this.dockerUpdates = [version];
      }
    }
    // Log summary: suppress or debug if no updates, info/debug if updates
    if (updatesAvailable.length === 0) {
      this.log.debug(`Found 0 available update(s)`);
    } else {
      this.log.log(isFirstDailyRun ? LogLevel.INFO : LogLevel.DEBUG, `Found ${updatesAvailable.length} available update(s)`);
    }
    if (this.respectDisabledPlugins && ignoredPlugins.length > 0) {
      this.log.debug(`Filtering enabled with ${ignoredPlugins.length} ignored plugins: ${ignoredPlugins.join(', ')}`);
    } else if (this.respectDisabledPlugins) {
      this.log.debug('Filtering enabled but no ignored plugins found');
    } else {
      this.log.debug('Plugin filtering is disabled (respectDisabledPlugins: false)');
    }
    await this.handleConfiguredAutoUpdates(updatesAvailable);

    return updatesAvailable.length;
  }

  public getLastAutoUpdateFailed(): boolean {
    return this.lastAutoUpdateFailed;
  }

  private async handleConfiguredAutoUpdates(updatesAvailable: InstalledPlugin[]): Promise<void> {
    const shouldAutoUpdateHomebridge = this.config.autoUpdateHomebridge === true;
    const shouldAutoUpdateUi = this.config.autoUpdateHomebridgeUI === true;
    const shouldAutoUpdatePlugins = this.config.autoUpdatePlugins === true;

    if (!shouldAutoUpdateHomebridge && !shouldAutoUpdateUi && !shouldAutoUpdatePlugins) {
      return;
    }

    const autoUpdateTargets = updatesAvailable.filter((plugin) => {
      if (plugin.name === 'homebridge') {
        return shouldAutoUpdateHomebridge;
      }
      if (plugin.name === 'homebridge-config-ui-x') {
        return shouldAutoUpdateUi;
      }
      return shouldAutoUpdatePlugins && plugin.name !== 'node' && plugin.name !== 'Docker image';
    });

    if (autoUpdateTargets.length === 0) {
      return;
    }

    const hasUiApi = this.uiApi.isConfigured();
    const allowDirectNpmUpdates = this.config.allowDirectNpmUpdates === true;
    if (!hasUiApi && !allowDirectNpmUpdates) {
      this.lastAutoUpdateFailed = true;
      this.log.warn('Auto-update is enabled, but homebridge-config-ui-x is not configured and allowDirectNpmUpdates is disabled.');
      return;
    }

    if (hasUiApi) {
      await this.uiApi.createBackup();
    }

    let successfulUpdates = 0;

    for (const target of autoUpdateTargets) {
      const updated = await this.applyAutoUpdate(target);
      if (updated) {
        successfulUpdates++;
      } else {
        this.lastAutoUpdateFailed = true;
      }
    }

    if (successfulUpdates > 0 && this.config.autoRestartAfterUpdates === true) {
      const restarted = await this.uiApi.restartHomebridge();
      if (!restarted) {
        this.lastAutoUpdateFailed = true;
      }
    }
  }

  private async applyAutoUpdate(target: InstalledPlugin): Promise<boolean> {
    if (target.name === 'homebridge') {
      return await this.uiApi.updateHomebridge(target.latestVersion);
    }

    this.log.info(`Attempting to auto-update ${target.name} to ${target.latestVersion}`);
    return await this.uiApi.updatePlugin(target.name, target.latestVersion);
  }

  private firstDailyRunResetCronJob?: Cron;
  private updatesCronJob?: Cron;
  /**
   * Start scheduled update checks and daily reset using cron jobs.
   * @param onCheck Callback to run after each update check (e.g., set sensor/cluster value)
   * @param timezone Optional timezone string (defaults to system timezone)
   */
  startScheduledChecks(onCheck: (updates: number) => void, timezone?: string): void {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Daily reset at midnight
    this.firstDailyRunResetCronJob = new Cron(
      '0 0 * * *',
      {
        name: 'First Daily Run Reset Cron Job',
        timezone: tz,
        unref: true,
      },
      async () => {
        this.firstDailyRun = true;
        this.log.debug(`Reset "firstDailyRun" to ${this.firstDailyRun}`);
      },
    );
    // Periodic update check (5 minutes after every hour)
    this.updatesCronJob = new Cron(
      '5 * * * *',
      {
        name: 'Updates Available Cron Job',
        timezone: tz,
        unref: true,
      },
      async () => {
        this.log.debug(`Is first daily run: ${this.firstDailyRun}`);
        try {
          const updates = await this.checkUi();
          onCheck(updates);
        } catch (ex: any) {
          this.log.error(ex);
        }
        this.firstDailyRun = false;
        this.log.debug(`Cleared "firstDailyRun" to ${this.firstDailyRun}`);
      },
    );
  }

  /**
   * Stop all scheduled cron jobs (if running)
   */
  stopScheduledChecks(): void {
    this.firstDailyRunResetCronJob?.stop();
    this.updatesCronJob?.stop();
  }
}
