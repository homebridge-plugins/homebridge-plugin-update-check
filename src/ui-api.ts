/* eslint-disable style/brace-style */
/* eslint-disable style/operator-linebreak */

import type {
  HomebridgeConfig,
  Logging,
  PlatformIdentifier,
  PlatformName,
} from 'homebridge'

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import process from 'node:process'

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import CacheableLookup from 'cacheable-lookup'
import jwt from 'jsonwebtoken'

export interface InstalledPlugin {
  name: string
  installedVersion: string
  latestVersion: string
  updateAvailable: boolean
}

interface SecretsFile {
  secretKey: string
}

interface UiConfig {
  platform: PlatformName | PlatformIdentifier
  host?: string
  port?: number
  ssl?: {
    key?: string
    pfx?: string
  }
}

class ApiPluginEndpoints {
  static readonly getHomebridgeVersion = '/api/status/homebridge-version'
  static readonly getPluginList = '/api/plugins'
  static readonly getIgnoredPluginList = '/api/config-editor/ui/plugins/hide-updates-for'
}

export class UiApi {
  private log: Logging
  private readonly secrets?: SecretsFile
  private readonly baseUrl?: string
  private readonly httpsAgent?: https.Agent
  private token?: string
  private readonly dockerUrl?: string
  private readonly cacheable: CacheableLookup
  private readonly hbStoragePath: string

  constructor(hbStoragePath: string, log: Logging) {
    this.log = log
    this.hbStoragePath = hbStoragePath

    const MAX_TTL_SEC = 86400; // limit TTL to 24 hours
    this.cacheable = new CacheableLookup({ maxTtl: MAX_TTL_SEC });
    
    const configPath = path.resolve(hbStoragePath, 'config.json')
    const hbConfig = JSON.parse(readFileSync(configPath, 'utf8')) as HomebridgeConfig
    const config = hbConfig.platforms.find((config: { platform: string }) =>
      config.platform === 'config' || config.platform === 'homebridge-config-ui-x.config') as UiConfig

    if (config) {
      const secretPath = path.resolve(hbStoragePath, '.uix-secrets')
      this.secrets = JSON.parse(readFileSync(secretPath, 'utf8'))

      const ssl = !!config.ssl?.key || !!config.ssl?.pfx

      const protocol = ssl ? 'https://' : 'http://'
      const host = config.host ?? 'localhost'
      const port = config.port ?? 8581

      this.baseUrl = `${protocol + host}:${port.toString()}`

      const dockerProtocol = 'https://'
      const dockerHost = 'hub.docker.com'

      this.dockerUrl = `${dockerProtocol + dockerHost}`

      if (ssl) {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false }) // don't reject self-signed certs
      }
    }
  }

  public isConfigured(): boolean {
    return this.secrets !== undefined
  }

  public async getHomebridge(): Promise<InstalledPlugin> {
    if (this.isConfigured()) {
      const result = await this.makeCall(ApiPluginEndpoints.getHomebridgeVersion) as Array<InstalledPlugin>

      if (result.length > 0) {
        return result[0]
      }
    }

    return {
      name: '',
      installedVersion: '',
      latestVersion: '',
      updateAvailable: false,
    }
  }

  public async getPlugins(): Promise<Array<InstalledPlugin>> {
    if (this.isConfigured()) {
      return await this.makeCall(ApiPluginEndpoints.getPluginList) as Array<InstalledPlugin>
    } else {
      return []
    }
  }

  public async getIgnoredPlugins(): Promise<Array<string>> {
    if (this.isConfigured()) {
      try {
        const result = await this.makeCall(ApiPluginEndpoints.getIgnoredPluginList)

        // Validate the response format
        if (!Array.isArray(result)) {
          this.log.warn(`Unexpected response format from ignored plugins API: ${typeof result}, expected array`)
          return []
        }

        const ignoredPlugins = result as Array<string>
        this.log.debug(`API returned ${ignoredPlugins.length} ignored plugins: ${ignoredPlugins.join(', ')}`)
        return ignoredPlugins
      } catch (error: any) {
        // Check if it's a 404 error (API endpoint doesn't exist)
        if (error?.response?.status === 404) {
          this.log.warn('Ignored plugins API endpoint not found - requires homebridge-config-ui-x v5.6.2-beta.2 or later')
        } else {
          this.log.warn(`Failed to retrieve ignored plugins list from /config-editor/ui/plugins/hide-updates-for: ${error}`)
        }
        return []
      }
    } else {
      this.log.debug('homebridge-config-ui-x not configured, cannot retrieve ignored plugins list')
      return []
    }
  }

  public async getDocker(): Promise<InstalledPlugin> {
    const currentDockerVersion = process.env.DOCKER_HOMEBRIDGE_VERSION

    let dockerInfo: InstalledPlugin = {
      name: '',
      installedVersion: '',
      latestVersion: '',
      updateAvailable: false,
    }

    if (this.isConfigured() && currentDockerVersion !== undefined) {
      const json = await this.makeDockerCall('/v2/repositories/homebridge/homebridge/tags/?page_size=30&page=1&ordering=last_updated')
      const images = json.results as any[]

      // If the currently installed version is not returned in the list of Docker versions (too old or deleted),
      // then use a last-updated date Jan 1, 1970
      const installedImage = images.filter(image => image.name === currentDockerVersion)[0] ?? undefined
      const installedImageDate = Date.parse(installedImage ? installedImage.last_updated : '1970-01-01T00:00:00.000000Z')

      // Filter for version names YYYY-MM-DD (no alphas or betas)
      const regex: RegExp = /^\d{4}-\d{2}-\d{2}$/gm
      const availableImages = images.filter(image =>
        (image.name as string).match(regex) &&
        (Date.parse(image.last_updated) > installedImageDate),
      )
      if (availableImages.length > 0) {
        dockerInfo = {
          name: 'Docker image',
          installedVersion: currentDockerVersion,
          latestVersion: availableImages[0].name,
          updateAvailable: true,
        }
      }
    }

    return dockerInfo
  }

  public async updateHomebridge(targetVersion?: string): Promise<boolean> {
    this.log.info(`Attempting to update Homebridge${targetVersion ? ` to ${targetVersion}` : ' to latest version'}`)

    try {
      const args = ['install', '-g', `homebridge${targetVersion ? `@${targetVersion}` : '@latest'}`]
      const result = await this.runNpmCommand(args)
      this.log.info(`Homebridge update command completed successfully (${result})`)
      return true
    } catch (error) {
      this.log.error(`Failed to update Homebridge: ${error}`)
      return false
    }
  }

  public async updatePlugin(pluginName: string, targetVersion?: string): Promise<boolean> {
    this.log.info(`Attempting to update plugin ${pluginName}${targetVersion ? ` to ${targetVersion}` : ' to latest version'}`)

    try {
      const args = ['install', '-g', `${pluginName}${targetVersion ? `@${targetVersion}` : '@latest'}`]
      const result = await this.runNpmCommand(args)
      this.log.info(`Plugin ${pluginName} update command completed successfully (${result})`)
      return true
    } catch (error) {
      this.log.error(`Failed to update plugin ${pluginName}: ${error}`)
      return false
    }
  }

  private async runNpmCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const npm = spawn('npm', args, {
          env: process.env,
        })

        let stdout = ''
        let stderr = ''

        // eslint-disable-next-line node/prefer-global/buffer
        npm.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })

        // eslint-disable-next-line node/prefer-global/buffer
        npm.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        npm.on('close', (code) => {
          if (code === 0) {
            resolve(stdout)
          } else {
            reject(new Error(`npm command failed with code ${code}: ${stderr}`))
          }
        })

        npm.on('error', (error) => {
          reject(error)
        })
      } catch (ex) {
        reject(ex)
      }
    })
  }

  public async createBackup(): Promise<boolean> {
    this.log.info('Creating backup before performing updates')

    try {
      if (this.isConfigured()) {
        // Try different possible backup API endpoints
        const backupEndpoints = [
          '/api/backup/create',
          '/api/backups/create',
          '/api/backup',
          '/api/server/backup',
        ]

        for (const endpoint of backupEndpoints) {
          try {
            await this.makeBackupCall(endpoint)
            this.log.info(`Backup created successfully via UI API (${endpoint})`)
            return true
          } catch (error) {
            this.log.debug(`Backup endpoint ${endpoint} failed: ${error}`)
            // Continue to next endpoint
          }
        }

        this.log.warn('All backup endpoints failed - backup creation unavailable')
        return false
      } else {
        this.log.warn('UI API not configured - backup creation skipped')
        return false
      }
    } catch (error) {
      this.log.warn(`Failed to create backup: ${error}`)
      this.log.warn('Continuing with updates despite backup failure - ensure you have manual backups in place')
      return false
    }
  }

  public async restartHomebridge(): Promise<boolean> {
    this.log.info('Attempting to restart Homebridge to apply updates')

    try {
      if (this.isConfigured()) {
        // Try different restart endpoints with fallback strategy
        const restartEndpoints = [
          '/api/server/restart',
          '/api/platform-tools/docker/restart-container',
          '/api/platform-tools/linux/restart-host',
        ]

        for (const endpoint of restartEndpoints) {
          try {
            await this.makeRestartCall(endpoint)
            this.log.info(`Homebridge restart initiated via UI API (${endpoint})`)
            return true
          } catch (error) {
            this.log.debug(`Restart endpoint ${endpoint} failed: ${error}`)
            // Continue to next endpoint
          }
        }

        this.log.warn('All restart endpoints failed - UI API restart unavailable')
        // Fallback: exit process to trigger restart by process manager
        this.log.info('Falling back to process exit for restart')
        setTimeout(() => {
          process.exit(0)
        }, 5000) // 5 second delay to allow log message to be written
        return true
      } else {
        // Fallback: exit process to trigger restart by process manager
        this.log.info('UI API not available, triggering process exit for restart')
        setTimeout(() => {
          process.exit(0)
        }, 5000) // 5 second delay to allow log message to be written
        return true
      }
    } catch (error) {
      this.log.error(`Failed to restart Homebridge: ${error}`)
      return false
    }
  }

  private async makeRestartCall(apiPath: string): Promise<unknown> {
    return this.nativeRequestWithRetry('PUT', this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      agent: this.httpsAgent,
      lookup: this.cacheable.lookup,
    })
  }

  private async makeBackupCall(apiPath: string): Promise<unknown> {
    return this.nativeRequestWithRetry('POST', this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      agent: this.httpsAgent,
      lookup: this.cacheable.lookup,
      timeout: 60000,
    })
  }

  private async makeDockerCall(apiPath: string): Promise<any> {
    try {
      return await this.nativeRequestWithRetry('GET', this.dockerUrl + apiPath, {
        agent: this.httpsAgent,
        lookup: this.cacheable.lookup,
        timeout: 60000,
      })
    } catch (error: any) {
      if (error.code === 'ETIMEOUT') {
        this.log.error(`Timeout error connecting to ${this.dockerUrl}`)
      } else {
        this.log.error(`${error.code} error connecting to ${this.dockerUrl}`)
      }
      return { count: 0, results: [] }
    }
  }

  private async makeCall(apiPath: string): Promise<any[]> {
    try {
      const data = await this.nativeRequestWithRetry('GET', this.baseUrl + apiPath, {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
        agent: this.httpsAgent,
        lookup: this.cacheable.lookup,
      })
      this.log.debug(`${this.baseUrl + apiPath}: ${JSON.stringify(data)}`)
      if (!Array.isArray(data)) {
        return [data]
      }
      return data
    } catch (error: any) {
      this.log.error(`${error.code} error connecting to ${this.baseUrl + apiPath}`)
      if (error.code === 'ERR_BAD_REQUEST' && error.status === 404 && apiPath === ApiPluginEndpoints.getIgnoredPluginList) {
        this.log.debug(`Error: ${JSON.stringify(error, undefined, 2)}`)
        this.log.warn(`This feature requires a newer version of Homebridge UI. Please update to the latest version.`)
      }
      return []
    }
  }

  private async nativeRequestWithRetry(method: string, urlString: string, options: any = {}, retries = 3, backoff = 1000): Promise<any> {
    let attempt = 0
    let lastError
    while (attempt < retries) {
      try {
        return await this.nativeRequest(method, urlString, options)
      } catch (err) {
        lastError = err
        attempt++
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, backoff * attempt))
        }
      }
    }
    throw lastError
  }

  private nativeRequest(method: string, urlString: string, options: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(urlString)
        const isHttps = urlObj.protocol === 'https:'
        const reqOptions: any = {
          method,
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          headers: options.headers || {},
          agent: options.agent,
          timeout: options.timeout || 30000,
          lookup: options.lookup,
        }
        const req = (isHttps ? httpsRequest : httpRequest)(reqOptions, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              const contentType = res.headers['content-type'] || ''
              if (contentType.includes('application/json')) {
                resolve(JSON.parse(data))
              } else {
                resolve(data)
              }
            } catch (err) {
              reject(err)
            }
          })
        })
        req.on('error', (err) => reject(err))
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('ETIMEOUT'))
        })
        if (method === 'POST' || method === 'PUT') {
          req.write(options.body ? JSON.stringify(options.body) : '{}')
        }
        req.end()
      } catch (err) {
        reject(err)
      }
    })
  }

  public getToken(): string {
    if (this.token) {
      return this.token
    }

    const user = { // fake user
      username: '@homebridge-plugins/homebridge-plugin-update-check',
      name: '@homebridge-plugins/homebridge-plugin-update-check',
      admin: true,
      instanceId: 'xxxxxxx',
    }

    this.token = jwt.sign(user, this.secrets!.secretKey, { expiresIn: '1m' })

    setTimeout((): void => {
      this.token = undefined
    }, 30 * 1000)

    return this.token as string
  }
}
