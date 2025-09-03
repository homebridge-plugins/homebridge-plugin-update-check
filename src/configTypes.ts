import type { PlatformIdentifier, PlatformName } from 'homebridge'

export interface PluginUpdatePlatformConfig {
  platform: PlatformName | PlatformIdentifier
  forceNcu?: boolean
  sensorType?: string
  checkHomebridgeUpdates?: boolean
  checkHomebridgeUIUpdates?: boolean
  checkPluginUpdates?: boolean
  checkDockerUpdates?: boolean
  autoUpdateHomebridge?: boolean
  autoUpdateHomebridgeUI?: boolean
  autoUpdatePlugins?: boolean
  allowDirectNpmUpdates?: boolean
  autoRestartAfterUpdates?: boolean
  failureSensorType?: string
}
