import type { API } from 'homebridge'

import { PluginUpdateMatterPlatform } from './PluginUpdateMatterPlatform.js'
import { PluginUpdatePlatform } from './platform.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { createPlatformProxy } from './utils.js'

// Register our platform with homebridge using HAP/Matter proxy.
export default (api: API): void => {
  const ProxyCtor = createPlatformProxy(PluginUpdatePlatform, PluginUpdateMatterPlatform)
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProxyCtor as any)
}
