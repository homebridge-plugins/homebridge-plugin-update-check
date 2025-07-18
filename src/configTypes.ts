import type { PlatformIdentifier, PlatformName } from 'homebridge'

export interface PluginUpdatePlatformConfig {
  platform: PlatformName | PlatformIdentifier
  forceNcu?: boolean
  sensorType?: string
  checkHomebridgeUpdates?: boolean
  checkHomebridgeUIUpdates?: boolean
  checkPluginUpdates?: boolean
}
