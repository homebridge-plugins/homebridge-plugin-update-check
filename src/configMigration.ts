import type { API, HomebridgeConfig } from 'homebridge'

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js'
import { UiApi } from './ui-api.js'

const LEGACY_PLATFORM_NAME = 'PluginUpdate'

export function migratePlatformAliasInPluginConfigs(configs: Array<Record<string, unknown>>): number {
  if (!Array.isArray(configs)) {
    return 0
  }

  let updated = 0
  for (const platformConfig of configs) {
    if (platformConfig?.platform === LEGACY_PLATFORM_NAME) {
      platformConfig.platform = PLATFORM_NAME
      updated++
    }
  }

  return updated
}

export async function migrateLegacyPlatformAlias(api: API): Promise<void> {
  const hbStoragePath = (api.user as any)?.storagePath?.()
  if (!hbStoragePath) {
    return
  }

  const silentLog = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }

  try {
    // Primary approach: read config.json directly so that legacy 'PluginUpdate' entries
    // are found and migrated regardless of which npm package name they were last saved
    // under. This is required when upgrading from the old unscoped package
    // (homebridge-plugin-update-check) or from a v2.x install where the platform alias
    // was still 'PluginUpdate', because the Homebridge UI API only returns entries for
    // the current plugin alias ('HomebridgeUpdater') and will return an empty array
    // before the first migration completes.
    const configPath = path.resolve(hbStoragePath, 'config.json')
    let hbConfig: HomebridgeConfig | undefined
    try {
      hbConfig = JSON.parse(readFileSync(configPath, 'utf8')) as HomebridgeConfig
    }
    catch {
      hbConfig = undefined
    }

    if (hbConfig?.platforms && Array.isArray(hbConfig.platforms)) {
      const updatedDirect = migratePlatformAliasInPluginConfigs(hbConfig.platforms as Array<Record<string, unknown>>)
      if (updatedDirect > 0) {
        writeFileSync(configPath, JSON.stringify(hbConfig, null, 4), 'utf8')
        return
      }
    }

    // Fallback: use the UI API for cases where the direct file approach found nothing
    // but the UI API may have additional context (e.g. partial earlier migration).
    const uiApi = new UiApi(hbStoragePath, silentLog as any)
    if (!uiApi.isConfigured()) {
      return
    }

    const pluginConfigs = await uiApi.getPluginConfig(PLUGIN_NAME)
    const updated = migratePlatformAliasInPluginConfigs(pluginConfigs)
    if (!updated) {
      return
    }

    await uiApi.updatePluginConfig(PLUGIN_NAME, pluginConfigs)
    await uiApi.savePluginConfig(PLUGIN_NAME)
  }
  catch {
    // Ignore migration errors so plugin startup is never blocked.
  }
}
