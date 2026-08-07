/* eslint-disable style/operator-linebreak */

import type {
  HomebridgeConfig,
  Logging,
  PlatformIdentifier,
  PlatformName,
} from 'homebridge'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import https, { request as httpsRequest } from 'node:https'
import path from 'node:path'
import process from 'node:process'

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
  /** How the Homebridge UI itself decides which of its own versions to offer. */
  homebridgeUiUpdatePolicy?: 'all' | 'beta' | 'major' | 'none'
}

class ApiPluginEndpoints {
  static readonly getHomebridgeVersion = '/api/status/homebridge-version'
  static readonly getPluginList = '/api/plugins'
  static readonly getIgnoredPluginList = '/api/config-editor/ui/plugins/hide-updates-for'

  static pluginConfig(pluginName: string): string {
    return `/api/config-editor/plugin/${encodeURIComponent(pluginName)}`
  }

  static readonly saveConfig = '/api/config-editor'
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
  private readonly uiUpdatePolicy: 'all' | 'beta' | 'major' | 'none'

  constructor(hbStoragePath: string, log: Logging) {
    this.log = log
    this.hbStoragePath = hbStoragePath

    const MAX_TTL_SEC = 86400 // limit TTL to 24 hours
    this.cacheable = new CacheableLookup({ maxTtl: MAX_TTL_SEC })

    const configPath = path.resolve(hbStoragePath, 'config.json')
    const hbConfig = JSON.parse(readFileSync(configPath, 'utf8')) as HomebridgeConfig
    const config = hbConfig.platforms.find((config: { platform: string }) =>
      config.platform === 'config' || config.platform === 'homebridge-config-ui-x.config') as UiConfig

    this.uiUpdatePolicy = config?.homebridgeUiUpdatePolicy || 'all'

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

  /**
   * The Homebridge UI's own update policy for itself (`homebridgeUiUpdatePolicy`).
   * The generic `/api/plugins` list only applies the per-plugin beta preference,
   * so this is needed to honour a `beta` policy for homebridge-config-ui-x (#255).
   */
  public getHomebridgeUiUpdatePolicy(): 'all' | 'beta' | 'major' | 'none' {
    return this.uiUpdatePolicy
  }

  /**
   * Fetch the npm dist-tags (e.g. `latest`, `beta`, `next`) for a package,
   * mapping each tag to its published version.
   */
  public async getNpmDistTags(packageName: string): Promise<Record<string, string>> {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/^%40/, '@')}`
    return await new Promise<Record<string, string>>((resolve, reject) => {
      const req = https.get(url, { headers: { accept: 'application/vnd.npm.install-v1+json' } }, (res) => {
        let data = ''
        // Without an 'error' listener on the response, a connection dropped after
        // the headers arrive is an uncaught exception - and the promise never
        // settles either, so the caller waits for ever. The request's own error
        // handler below only covers failures before the response arrives.
        res.on('error', reject)
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            const body = JSON.parse(data) as { 'dist-tags'?: Record<string, string> }
            resolve(body['dist-tags'] ?? {})
          } catch (error) {
            reject(error)
          }
        })
      })
      req.on('error', reject)
    })
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

  public async getPluginConfig(pluginName: string): Promise<Array<Record<string, unknown>>> {
    if (!this.isConfigured()) {
      return []
    }

    const apiPath = ApiPluginEndpoints.pluginConfig(pluginName)
    const response = await this.nativeRequestWithRetry('GET', this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      agent: this.httpsAgent,
      lookup: this.cacheable.lookup,
    }) as unknown

    if (Array.isArray(response)) {
      return response as Array<Record<string, unknown>>
    }

    if (response && typeof response === 'object') {
      const pluginConfig = (response as any).pluginConfig
      if (Array.isArray(pluginConfig)) {
        return pluginConfig as Array<Record<string, unknown>>
      }
    }

    return []
  }

  public async updatePluginConfig(pluginName: string, pluginConfig: Array<Record<string, unknown>>): Promise<void> {
    if (!this.isConfigured()) {
      return
    }

    const apiPath = ApiPluginEndpoints.pluginConfig(pluginName)
    await this.nativeRequestWithRetry('PUT', this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: pluginConfig,
      agent: this.httpsAgent,
      lookup: this.cacheable.lookup,
    })
  }

  public async savePluginConfig(pluginName: string): Promise<void> {
    if (!this.isConfigured()) {
      return
    }

    await this.nativeRequestWithRetry('POST', this.baseUrl + ApiPluginEndpoints.saveConfig, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: {
        plugin: pluginName,
      },
      agent: this.httpsAgent,
      lookup: this.cacheable.lookup,
    })
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

  /**
   * Ask the Homebridge UI to update a package (`homebridge`, `homebridge-config-ui-x`
   * or a plugin) through its own plugin management. Unlike a direct `npm install -g`,
   * this installs into the path Homebridge actually loads plugins from (e.g. the
   * hb-service / Docker custom plugin path), so the update genuinely takes effect (#257).
   *
   * The UI queues the install in the background and performs the appropriate restart
   * itself, so callers must NOT also restart. Returns true once the update is queued.
   */
  public async triggerUpdate(packageName: string, targetVersion?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false
    }
    const query = targetVersion ? `?version=${encodeURIComponent(targetVersion)}` : ''
    const apiPath = `/api/plugins/update/${encodeURIComponent(packageName)}${query}`
    try {
      const response = await this.nativeRequestWithRetry('POST', this.baseUrl + apiPath, {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: {},
        agent: this.httpsAgent,
        lookup: this.cacheable.lookup,
        timeout: 60000,
      }) as { ok?: boolean } | undefined
      if (response?.ok === true) {
        this.log.info(`Queued update for ${packageName}${targetVersion ? ` to ${targetVersion}` : ''} via the Homebridge UI`)
        return true
      }
      this.log.warn(`Homebridge UI did not confirm the update for ${packageName}: ${JSON.stringify(response)}`)
      return false
    } catch (error) {
      this.log.error(`Failed to queue update for ${packageName} via the Homebridge UI: ${error}`)
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

  public async updateNpm(targetVersion?: string): Promise<boolean> {
    this.log.info(`Attempting to update npm${targetVersion ? ` to ${targetVersion}` : ' to latest version'}`)

    try {
      const args = ['install', '-g', `npm${targetVersion ? `@${targetVersion}` : '@latest'}`]
      const result = await this.runNpmCommand(args)
      this.log.info(`npm update command completed successfully (${result})`)
      return true
    } catch (error) {
      this.log.error(`Failed to update npm: ${error}`)
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

        npm.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })

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
            this.log.warn(`Restart endpoint ${endpoint} failed: ${error}`)
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
    const methods: Array<'PUT' | 'POST'> = ['PUT', 'POST']
    let lastError: unknown

    for (const method of methods) {
      try {
        const response = await this.nativeRequestWithRetry(method, this.baseUrl + apiPath, {
          headers: {
            Authorization: `Bearer ${this.getToken()}`,
          },
          body: {},
          agent: this.httpsAgent,
          lookup: this.cacheable.lookup,
        })
        this.log.debug(`Restart endpoint ${apiPath} (${method}) returned: ${JSON.stringify(response)}`)
        return response
      } catch (error) {
        lastError = error
        this.log.debug(`Restart endpoint ${apiPath} failed with ${method}: ${error}`)
      }
    }

    throw lastError
  }

  private async makeBackupCall(apiPath: string): Promise<unknown> {
    return this.nativeRequestWithRetry('POST', this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      body: {},
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
        this.log.warn('This feature requires a newer version of Homebridge UI. Please update to the latest version.')
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
        const hasJsonBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH'
        const requestBody = hasJsonBodyMethod
          ? JSON.stringify(options.body ?? {})
          : undefined
        const headers = {
          ...(options.headers || {}),
        } as Record<string, string>

        if (requestBody) {
          // UI API endpoints expect JSON content negotiation for action routes.
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json'
          }
          if (!headers.Accept) {
            headers.Accept = 'application/json'
          }
          headers['Content-Length'] = String(Buffer.byteLength(requestBody))
        }

        const reqOptions: any = {
          method,
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          headers,
          agent: options.agent,
          timeout: options.timeout || 30000,
          lookup: options.lookup,
        }
        const req = (isHttps ? httpsRequest : httpRequest)(reqOptions, (res) => {
          let data = ''
          // Without an 'error' listener on the response, a connection dropped after
          // the headers arrive is an uncaught exception - and the promise never
          // settles either, so the caller waits for ever. The request's own error
          // handler below only covers failures before the response arrives.
          res.on('error', reject)
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            try {
              // Check for HTTP error status codes
              if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                const statusCode = res.statusCode || 'unknown'
                reject(new Error(`HTTP ${statusCode}: ${data || 'no response body'}`))
                return
              }
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
        req.on('error', err => reject(err))
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('ETIMEOUT'))
        })
        if (requestBody) {
          req.write(requestBody)
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
      username: '@homebridge-plugins/homebridge-updater',
      name: '@homebridge-plugins/homebridge-updater',
      admin: true,
      instanceId: createHash('sha256').update(this.secrets!.secretKey).digest('hex'),
    }

    this.token = jwt.sign(user, this.secrets!.secretKey, { expiresIn: '1m' })

    setTimeout((): void => {
      this.token = undefined
    }, 30 * 1000)

    return this.token as string
  }
}
