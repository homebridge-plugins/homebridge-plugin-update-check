import type { PlatformIdentifier, PlatformName } from 'homebridge'

export interface PluginUpdatePlatformConfig {
  platform: PlatformName | PlatformIdentifier
  sensorType?: string
  checkHomebridgeUpdates?: boolean
  checkHomebridgeUIUpdates?: boolean
  checkPluginUpdates?: boolean
  checkDockerUpdates?: boolean
  initialCheckDelay?: number
  autoUpdateHomebridge?: boolean
  autoUpdateHomebridgeUI?: boolean
  autoUpdatePlugins?: boolean
  allowDirectNpmUpdates?: boolean
  autoRestartAfterUpdates?: boolean
  failureSensorType?: string
}
