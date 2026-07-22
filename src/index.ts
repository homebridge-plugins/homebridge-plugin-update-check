import type { API } from 'homebridge'

import { migrateLegacyPlatformAlias } from './configMigration.js'
import { PluginUpdatePlatform } from './Platform.HAP.js'
import { PluginUpdateMatterPlatform } from './Platform.Matter.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { createPlatformProxy } from './utils.js'

// Register our platform with homebridge using HAP/Matter proxy.
export default (api: API): void => {
  void migrateLegacyPlatformAlias(api)
  const ProxyCtor = createPlatformProxy(PluginUpdatePlatform, PluginUpdateMatterPlatform)
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor as any)
}
