import type { PlatformIdentifier, PlatformName } from 'homebridge'

export interface PluginUpdatePlatformConfig {
  autoUpdateNode?: boolean
  checkNodeUpdates?: boolean
  autoUpdateNpm?: boolean
  checkNpmUpdates?: boolean
  name: string
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
  autoUpdateSkipMajorVersions?: boolean
  failureSensorType?: string
  respectDisabledPlugins?: boolean
  enableMatter?: boolean
}
