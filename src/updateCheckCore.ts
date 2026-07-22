import type { Logging, PlatformConfig } from 'homebridge'

import type { PluginUpdatePlatformConfig } from './configTypes.js'
import type { InstalledPlugin } from './ui-api.js'

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import process from 'node:process'

import { Cron } from 'croner'
import { LogLevel } from 'homebridge'
import { gt, prerelease } from 'semver'

import { UiApi } from './ui-api.js'

/** A remembered auto-update attempt, used to detect and stop restart loops (#257). */
interface AutoUpdateAttempt {
  version: string
  attempts: number
  firstAttempt: number
  lastAttempt: number
}

export class UpdateCheckCore {
  public readonly checkNode: boolean
  public readonly checkNpm: boolean
  public nodeUpdates: string[] = []
  public npmUpdates: string[] = []
  public readonly log: Logging
  public readonly config: PluginUpdatePlatformConfig
  public readonly uiApi: UiApi
  public readonly respectDisabledPlugins: boolean
  public readonly checkHB: boolean
  public readonly checkHBUI: boolean
  public readonly checkPlugins: boolean
  public readonly checkDocker: boolean
  public readonly isDocker: boolean
  public readonly initialCheckDelay: number
  public hbUpdates: string[] = []
  public hbUIUpdates: string[] = []
  public pluginUpdates: string[] = []
  public dockerUpdates: string[] = []
  public firstDailyRun: boolean = true
  private lastAutoUpdateFailed = false
  /** Path to the file that remembers auto-update attempts across restarts. */
  private readonly autoUpdateStatePath: string
  /** How long (ms) to pause auto-updating a target that keeps coming back after a "successful" update. */
  private readonly autoUpdateLoopCooldownMs = 24 * 60 * 60 * 1000

  constructor(log: Logging, config: PlatformConfig, storagePath: string, isDocker: boolean) {
    this.log = log
    this.config = config as PluginUpdatePlatformConfig
    this.uiApi = new UiApi(storagePath, log)
    this.autoUpdateStatePath = join(storagePath, 'homebridge-updater-autoupdate.json')
    this.isDocker = isDocker
    this.respectDisabledPlugins = this.config.respectDisabledPlugins ?? true
    this.checkHB = this.config.checkHomebridgeUpdates ?? false
    this.checkHBUI = this.config.checkHomebridgeUIUpdates ?? false
    this.checkPlugins = this.config.checkPluginUpdates ?? false
    this.checkDocker = this.config.checkDockerUpdates ?? false
    this.initialCheckDelay = this.config.initialCheckDelay ?? 10
    this.checkNode = this.config.checkNodeUpdates ?? false
    this.checkNpm = this.config.checkNpmUpdates ?? false
  }

  async checkUi(): Promise<number> {
    this.lastAutoUpdateFailed = false
    this.log.debug('Searching for available updates ...')
    const isFirstDailyRun = this.firstDailyRun === true
    const updatesAvailable: InstalledPlugin[] = []
    let ignoredPlugins: string[] = []

    // Node.js update check (after variable declarations)
    if (this.checkNode) {
      try {
        const currentVersion = process.versions.node
        // Fetch latest LTS version from Node.js API
        const latestLtsVersion = await new Promise<string>((resolve, reject) => {
          const req = https.get('https://nodejs.org/dist/index.json', (res) => {
            let data = ''
            res.on('data', (chunk) => {
              data += chunk
            })
            res.on('end', () => {
              try {
                const releases = JSON.parse(data)
                // Find latest LTS
                const ltsReleases = releases.filter((r: any) => r.lts)
                if (ltsReleases.length === 0) {
                  return reject(new Error('No LTS releases found'))
                }
                // Sort by version descending
                ltsReleases.sort((a: any, b: any) => b.version.localeCompare(a.version, undefined, { numeric: true }))
                const latest = ltsReleases[0].version.replace(/^v/, '')
                resolve(latest)
              } catch (e) { reject(e) }
            })
          })
          req.on('error', reject)
        })
        // Compare versions (semver)
        const semverCompare = (a: string, b: string) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; ++i) {
            if (pa[i] > pb[i]) {
              return 1
            }
            if (pa[i] < pb[i]) {
              return -1
            }
          }
          return 0
        }
        if (semverCompare(currentVersion, latestLtsVersion) < 0) {
          const isNew = this.nodeUpdates.length === 0 || !this.nodeUpdates.includes(latestLtsVersion)
          const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
          this.log.log(logLevel, `Node.js update available: ${currentVersion} → ${latestLtsVersion}`)
          this.nodeUpdates = [latestLtsVersion]
          updatesAvailable.push({
            name: 'node',
            installedVersion: currentVersion,
            latestVersion: latestLtsVersion,
            updateAvailable: true,
          })
          // Auto-update Node.js if enabled and supported
          if (this.config.autoUpdateNode) {
            const { spawnSync } = await import('node:child_process')
            // Check if hb-service supports update-node
            const help = spawnSync('hb-service', ['--help'], { encoding: 'utf8' })
            if (help.stdout && help.stdout.includes('update-node')) {
              this.log.info('Attempting to auto-update Node.js using hb-service update-node ...')
              const result = spawnSync('hb-service', ['update-node'], { encoding: 'utf8' })
              if (result.status === 0) {
                this.log.info('Node.js auto-update completed successfully. A system restart may be required.')
              } else {
                this.lastAutoUpdateFailed = true
                this.log.error(`Node.js auto-update failed: ${result.stderr || result.stdout}`)
              }
            } else {
              this.lastAutoUpdateFailed = true
              this.log.warn('hb-service update-node is not supported on this system.')
            }
          }
        } else {
          this.log.debug(`Node.js is up to date (current: ${currentVersion}, latest LTS: ${latestLtsVersion})`)
        }
      } catch (err) {
        this.lastAutoUpdateFailed = true
        this.log.warn(`Failed to check Node.js updates: ${err}`)
      }
    }

    if (this.checkNpm) {
      try {
        const currentNpmVersion = this.getLocalNpmVersion()
        if (!currentNpmVersion) {
          this.log.debug('npm command is not available on this system; skipping npm update check.')
        } else {
          const latestNpmVersion = await this.getLatestNpmVersion()
          if (this.compareSemver(currentNpmVersion, latestNpmVersion) < 0) {
            const isNew = this.npmUpdates.length === 0 || !this.npmUpdates.includes(latestNpmVersion)
            const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
            this.log.log(logLevel, `npm update available: ${currentNpmVersion} -> ${latestNpmVersion}`)
            this.npmUpdates = [latestNpmVersion]
            updatesAvailable.push({
              name: 'npm',
              installedVersion: currentNpmVersion,
              latestVersion: latestNpmVersion,
              updateAvailable: true,
            })
          } else {
            this.log.debug(`npm is up to date (current: ${currentNpmVersion}, latest: ${latestNpmVersion})`)
          }
        }
      } catch (err) {
        this.log.warn(`Failed to check npm updates: ${err}`)
      }
    }

    // (removed duplicate declarations)
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
        const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge')
        if (!isIgnored) {
          updatesAvailable.push(homebridge)
          const version: string = homebridge.latestVersion
          const isNew = this.hbUpdates.length === 0 || !this.hbUpdates.includes(version)
          const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
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
        for (const homebridgeUI of homebridgeUiPlugins) {
          // The generic /api/plugins list only reflects the stable release for the
          // Homebridge UI. If the user has set the UI's own update policy to beta,
          // honour it here so a UI beta update is detected too (#255).
          await this.applyHomebridgeUiBetaPolicy(homebridgeUI)
          if (homebridgeUI.updateAvailable) {
            const isIgnored = this.respectDisabledPlugins && ignoredPlugins.includes('homebridge-config-ui-x')
            if (!isIgnored) {
              updatesAvailable.push(homebridgeUI)
              const version: string = homebridgeUI.latestVersion
              const isNew = this.hbUIUpdates.length === 0 || !this.hbUIUpdates.includes(version)
              const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
              this.log.log(logLevel, `Homebridge UI update available: ${version}`)
              this.hbUIUpdates = [version]
            } else {
              this.log.debug(`Ignoring Homebridge UI update: ${homebridgeUI.latestVersion} (update notifications disabled in homebridge-config-ui-x)`)
            }
          }
        }
      }
      if (this.checkPlugins) {
        this.log.debug(`Checking ${plugins.length} plugins for updates (respectDisabledPlugins: ${this.respectDisabledPlugins})`)
        const filteredPlugins = plugins.filter((plugin) => {
          if (plugin.name === 'homebridge-config-ui-x') {
            return false
          }
          if (this.respectDisabledPlugins) {
            if (ignoredPlugins.includes(plugin.name)) {
              this.log.debug(`Filtering out plugin ${plugin.name} (ignored in homebridge-config-ui-x)`)
              return false
            }
          }
          return true
        })
        filteredPlugins.forEach((plugin) => {
          if (plugin.updateAvailable) {
            updatesAvailable.push(plugin)
            const version: string = plugin.latestVersion
            const isNew = this.pluginUpdates.length === 0 || !this.pluginUpdates.includes(version)
            const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
            this.log.log(logLevel, `Homebridge plugin update available: ${plugin.name} ${plugin.latestVersion}`)
            this.pluginUpdates.push(version)
          }
        })
        if (this.respectDisabledPlugins) {
          const ignoredWithUpdates = plugins.filter(plugin =>
            plugin.name !== 'homebridge-config-ui-x'
            && plugin.updateAvailable
            && ignoredPlugins.includes(plugin.name),
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
        const isNew = this.dockerUpdates.length === 0 || !this.dockerUpdates.includes(version)
        const logLevel = isFirstDailyRun || isNew ? LogLevel.INFO : LogLevel.DEBUG
        this.log.log(logLevel, `Docker update available: ${version}`)
        this.dockerUpdates = [version]
      }
    }
    // Log summary: suppress or debug if no updates, info/debug if updates
    if (updatesAvailable.length === 0) {
      this.log.debug('Found 0 available update(s)')
    } else {
      this.log.log(isFirstDailyRun ? LogLevel.INFO : LogLevel.DEBUG, `Found ${updatesAvailable.length} available update(s)`)
    }
    if (this.respectDisabledPlugins && ignoredPlugins.length > 0) {
      this.log.debug(`Filtering enabled with ${ignoredPlugins.length} ignored plugins: ${ignoredPlugins.join(', ')}`)
    } else if (this.respectDisabledPlugins) {
      this.log.debug('Filtering enabled but no ignored plugins found')
    } else {
      this.log.debug('Plugin filtering is disabled (respectDisabledPlugins: false)')
    }
    await this.handleConfiguredAutoUpdates(updatesAvailable)

    return updatesAvailable.length
  }

  public getLastAutoUpdateFailed(): boolean {
    return this.lastAutoUpdateFailed
  }

  /**
   * When the Homebridge UI's own update policy is `beta`, the generic
   * `/api/plugins` result (stable only) misses beta releases. This mirrors the
   * beta check the Homebridge UI applies to itself: offer the version on the
   * beta dist-tag only when it beats both the installed version and the stable
   * release, so a beta user is never sent backwards to an older stable (#255).
   */
  private async applyHomebridgeUiBetaPolicy(homebridgeUI: InstalledPlugin): Promise<void> {
    if (this.uiApi.getHomebridgeUiUpdatePolicy() !== 'beta' || !homebridgeUI.installedVersion) {
      return
    }
    try {
      const distTags = await this.uiApi.getNpmDistTags('homebridge-config-ui-x')
      // Stay on the same prerelease line if already on one, otherwise track beta.
      const installedTag = prerelease(homebridgeUI.installedVersion)?.[0]?.toString()
      const targetTag = installedTag ?? 'beta'
      const candidate = distTags[targetTag]
      if (!candidate) {
        return
      }
      const beatsInstalled = gt(candidate, homebridgeUI.installedVersion)
      const beatsStable = !homebridgeUI.updateAvailable || !homebridgeUI.latestVersion || gt(candidate, homebridgeUI.latestVersion)
      if (beatsInstalled && beatsStable) {
        homebridgeUI.latestVersion = candidate
        homebridgeUI.updateAvailable = true
        this.log.debug(`Homebridge UI beta update available on tag '${targetTag}': ${candidate}`)
      }
    } catch (e) {
      this.log.debug(`Failed to check Homebridge UI beta updates: ${e}`)
    }
  }

  private async handleConfiguredAutoUpdates(updatesAvailable: InstalledPlugin[]): Promise<void> {
    const shouldAutoUpdateHomebridge = this.config.autoUpdateHomebridge === true
    const shouldAutoUpdateUi = this.config.autoUpdateHomebridgeUI === true
    const shouldAutoUpdatePlugins = this.config.autoUpdatePlugins === true
    const shouldAutoUpdateNpm = this.config.autoUpdateNpm === true

    if (!shouldAutoUpdateHomebridge && !shouldAutoUpdateUi && !shouldAutoUpdatePlugins && !shouldAutoUpdateNpm) {
      return
    }

    const autoUpdateTargets = updatesAvailable.filter((plugin) => {
      if (plugin.name === 'npm') {
        return shouldAutoUpdateNpm
      }
      if (plugin.name === 'homebridge') {
        return shouldAutoUpdateHomebridge
      }
      if (plugin.name === 'homebridge-config-ui-x') {
        return shouldAutoUpdateUi
      }
      return shouldAutoUpdatePlugins && plugin.name !== 'node' && plugin.name !== 'Docker image'
    })

    // Prune the loop-guard record: anything no longer reported as out of date has
    // either updated successfully or is no longer offered, so forget it.
    const state = this.loadAutoUpdateState()
    const outstanding = new Set(updatesAvailable.map(update => update.name))
    let stateChanged = false
    for (const name of Object.keys(state)) {
      if (!outstanding.has(name)) {
        delete state[name]
        stateChanged = true
      }
    }

    if (autoUpdateTargets.length === 0) {
      if (stateChanged) {
        this.saveAutoUpdateState(state)
      }
      return
    }

    if (shouldAutoUpdateNpm && !this.getLocalNpmVersion()) {
      this.lastAutoUpdateFailed = true
      this.log.warn('autoUpdateNpm is enabled, but npm is not available on this system.')
    }

    const hasUiApi = this.uiApi.isConfigured()
    const allowDirectNpmUpdates = this.config.allowDirectNpmUpdates === true
    const hasNonNpmTargets = autoUpdateTargets.some(target => target.name !== 'npm')
    if (hasNonNpmTargets && !hasUiApi && !allowDirectNpmUpdates) {
      this.lastAutoUpdateFailed = true
      this.log.warn('Auto-update is enabled, but homebridge-config-ui-x is not configured and allowDirectNpmUpdates is disabled.')
      return
    }

    // Loop guard: skip any target we already updated to this same version that is
    // STILL reported as out of date. Repeating it would just restart Homebridge in
    // a loop without ever taking effect (#257). Retry at most once every cooldown.
    const now = Date.now()
    const targetsToApply = autoUpdateTargets.filter((target) => {
      const record = state[target.name]
      const looping = record
        && record.version === target.latestVersion
        && record.attempts >= 1
        && (now - record.lastAttempt) < this.autoUpdateLoopCooldownMs
      if (looping) {
        this.lastAutoUpdateFailed = true
        this.log.warn(`Skipping auto-update of ${target.name} to ${target.latestVersion}: it was already updated but is still reported as out of date, so repeating it would just restart Homebridge in a loop. This usually means the update installed to a location Homebridge is not loading from (common with hb-service or Docker setups). Please update ${target.name} from the Homebridge UI or your usual method. Auto-update of this version is paused for 24 hours.`)
        return false
      }
      return true
    })

    if (targetsToApply.length === 0) {
      this.saveAutoUpdateState(state)
      return
    }

    if (hasUiApi && targetsToApply.some(target => target.name !== 'npm')) {
      await this.uiApi.createBackup()
    }

    let successfulUpdates = 0

    for (const target of targetsToApply) {
      const updated = await this.applyAutoUpdate(target)
      // Record the attempt regardless of the reported result: the real test of
      // success is whether the target is still out of date on the next check.
      const previous = state[target.name]
      const sameVersion = previous?.version === target.latestVersion
      state[target.name] = {
        version: target.latestVersion,
        attempts: sameVersion ? previous.attempts + 1 : 1,
        firstAttempt: sameVersion ? previous.firstAttempt : now,
        lastAttempt: now,
      }
      if (updated) {
        successfulUpdates++
      } else {
        this.lastAutoUpdateFailed = true
      }
    }

    this.saveAutoUpdateState(state)

    if (successfulUpdates > 0 && this.config.autoRestartAfterUpdates === true) {
      const restarted = await this.uiApi.restartHomebridge()
      if (!restarted) {
        this.lastAutoUpdateFailed = true
      }
    }
  }

  private loadAutoUpdateState(): Record<string, AutoUpdateAttempt> {
    try {
      if (!existsSync(this.autoUpdateStatePath)) {
        return {}
      }
      const parsed = JSON.parse(readFileSync(this.autoUpdateStatePath, 'utf8'))
      return (parsed && typeof parsed === 'object') ? parsed as Record<string, AutoUpdateAttempt> : {}
    } catch (e) {
      this.log.debug(`Could not read auto-update state: ${e}`)
      return {}
    }
  }

  private saveAutoUpdateState(state: Record<string, AutoUpdateAttempt>): void {
    try {
      writeFileSync(this.autoUpdateStatePath, JSON.stringify(state, null, 2))
    } catch (e) {
      this.log.debug(`Could not write auto-update state: ${e}`)
    }
  }

  private async applyAutoUpdate(target: InstalledPlugin): Promise<boolean> {
    if (target.name === 'npm') {
      return await this.uiApi.updateNpm(target.latestVersion)
    }

    if (target.name === 'homebridge') {
      return await this.uiApi.updateHomebridge(target.latestVersion)
    }

    this.log.info(`Attempting to auto-update ${target.name} to ${target.latestVersion}`)
    return await this.uiApi.updatePlugin(target.name, target.latestVersion)
  }

  private getLocalNpmVersion(): string | undefined {
    const result = spawnSync('npm', ['--version'], { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      return undefined
    }
    const version = (result.stdout || '').trim()
    return version.length > 0 ? version : undefined
  }

  private async getLatestNpmVersion(): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const req = https.get('https://registry.npmjs.org/npm/latest', (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            const body = JSON.parse(data) as { version?: string }
            if (!body.version) {
              reject(new Error('npm registry response missing version field'))
              return
            }
            resolve(body.version)
          } catch (error) {
            reject(error)
          }
        })
      })
      req.on('error', reject)
    })
  }

  private compareSemver(a: string, b: string): number {
    const normalize = (value: string) => value.split('.').map(part => Number.parseInt(part.replace(/\D.*$/, ''), 10) || 0)
    const pa = normalize(a)
    const pb = normalize(b)
    const max = Math.max(pa.length, pb.length)
    for (let i = 0; i < max; i++) {
      const va = pa[i] ?? 0
      const vb = pb[i] ?? 0
      if (va > vb) {
        return 1
      }
      if (va < vb) {
        return -1
      }
    }
    return 0
  }

  private firstDailyRunResetCronJob?: Cron
  private updatesCronJob?: Cron
  /**
   * Start scheduled update checks and daily reset using cron jobs.
   * @param onCheck Callback to run after each update check (e.g., set sensor/cluster value)
   * @param timezone Optional timezone string (defaults to system timezone)
   */
  startScheduledChecks(onCheck: (updates: number) => void, timezone?: string): void {
    const tz = timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone
    // Daily reset at midnight
    this.firstDailyRunResetCronJob = new Cron(
      '0 0 * * *',
      {
        name: 'First Daily Run Reset Cron Job',
        timezone: tz,
        unref: true,
      },
      async () => {
        this.firstDailyRun = true
        this.log.debug(`Reset "firstDailyRun" to ${this.firstDailyRun}`)
      },
    )
    // Periodic update check (5 minutes after every hour)
    this.updatesCronJob = new Cron(
      '5 * * * *',
      {
        name: 'Updates Available Cron Job',
        timezone: tz,
        unref: true,
      },
      async () => {
        this.log.debug(`Is first daily run: ${this.firstDailyRun}`)
        try {
          const updates = await this.checkUi()
          onCheck(updates)
        } catch (ex: any) {
          this.log.error(ex)
        }
        this.firstDailyRun = false
        this.log.debug(`Cleared "firstDailyRun" to ${this.firstDailyRun}`)
      },
    )
  }

  /**
   * Stop all scheduled cron jobs (if running)
   */
  stopScheduledChecks(): void {
    this.firstDailyRunResetCronJob?.stop()
    this.updatesCronJob?.stop()
  }
}
