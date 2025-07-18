import type {
  HomebridgeConfig,
  PlatformIdentifier,
  PlatformName,
} from 'homebridge'

import { readFileSync } from 'node:fs'
import https from 'node:https'
import path from 'node:path'

import axios from 'axios'
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

export class UiApi {
  private readonly secrets?: SecretsFile
  private readonly baseUrl?: string
  private readonly httpsAgent?: https.Agent
  private token?: string
  private readonly dockerUrl?: string

  constructor(hbStoragePath: string) {
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
      return await this.makeCall('/api/status/homebridge-version') as InstalledPlugin
    } else {
      return {
        name: '',
        installedVersion: '',
        latestVersion: '',
        updateAvailable: false,
      }
    }
  }

  public async getPlugins(): Promise<Array<InstalledPlugin>> {
    if (this.isConfigured()) {
      return await this.makeCall('/api/plugins') as Array<InstalledPlugin>
    } else {
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
      const json = await this.makeDockerCall('/v2/repositories/homebridge/homebridge/tags/?page_size=10&page=1&ordering=last_updated')
      const versions = JSON.parse(json).results as any[]

      const installedVersion = versions.filter(version => version.name === currentDockerVersion)[0]
      const installedVersionDate = Date.parse(installedVersion.last_updated)

      const availableVersions = versions.filter(version =>
        !(version.name as string).includes('beta') &&
        (Date.parse(version.last_updated) > installedVersionDate)
      )
      if (availableVersions.length > 0) {
        dockerInfo = {
          name: 'Docker image',
          installedVersion: installedVersion,
          latestVersion: availableVersions[0].name,
          updateAvailable: true,
        }
      }
    }

    return dockerInfo
  }

  private async makeDockerCall(apiPath: string): Promise<any> {
    const response = await axios.get(this.dockerUrl + apiPath, {
      httpsAgent: this.httpsAgent,
    })

    return response.data
  }

  private async makeCall(apiPath: string): Promise<unknown> {
    const response = await axios.get(this.baseUrl + apiPath, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
      httpsAgent: this.httpsAgent,
    })

    return response.data
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
