import type { API, Logging, PlatformConfig } from 'homebridge'

import { PluginUpdatePlatform } from './platform.js'

/**
 * Matter-enabled platform for Homebridge Plugin Update Check.
 * Extends the HAP platform with Homebridge Matter support for Homebridge v2.0.
 * When Homebridge Matter is available and enabled, this platform is used instead
 * of the standard HAP platform.
 */
export class PluginUpdateMatterPlatform extends PluginUpdatePlatform {
  constructor(log: Logging, config: PlatformConfig, api: API) {
    super(log, config, api)
    log.info('PluginUpdateMatterPlatform: Initialized with Homebridge Matter support')
  }
}
