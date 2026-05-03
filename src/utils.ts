import type { PlatformConfig } from 'homebridge'

/**
 * Returns true if the failure sensor should be registered and active.
 *
 * The failure sensor is disabled when:
 * - `failureSensorType` is explicitly set to `"none"`, OR
 * - none of the auto-update options (autoUpdateNode, autoUpdateHomebridge,
 *   autoUpdateHomebridgeUI, autoUpdatePlugins) are enabled, because without
 *   auto-updates there can never be an auto-update failure to report.
 */
export function isFailureSensorEnabled(config: PlatformConfig): boolean {
  if ((config as any).failureSensorType === 'none') {
    return false
  }
  return !!(
    (config as any).autoUpdateNode
    || (config as any).autoUpdateHomebridge
    || (config as any).autoUpdateHomebridgeUI
    || (config as any).autoUpdatePlugins
  )
}

/**
 * Factory function that creates a platform proxy constructor.
 * Selects between HAP and Matter platform implementations at runtime
 * based on whether Homebridge Matter support is available and enabled.
 *
 * @param HAPPlatform The HAP platform class constructor.
 * @param MatterPlatform The Matter platform class constructor.
 * @returns A proxy class that delegates to the correct platform implementation.
 */
export function createPlatformProxy(HAPPlatform: any, MatterPlatform: any): any {
  return class PluginUpdatePlatformProxy {
    /** The instantiated platform implementation (HAP or Matter) */
    private impl: any

    /**
     * Constructs the proxy and instantiates the correct platform implementation.
     * @param log Logger instance
     * @param config Platform config
     * @param api Homebridge API instance
     * @returns The instantiated platform implementation
     */
    constructor(log: any, config: PlatformConfig, api: any) {
      const preferMatter = (config as any).preferMatter ?? true
      const enableMatter = (config as any).enableMatter ?? true
      const hasMatterApi = !!api?.matter
      const matterAvailable = typeof api?.isMatterAvailable === 'function' ? !!api.isMatterAvailable() : hasMatterApi
      const matterEnabled = typeof api?.isMatterEnabled === 'function' ? !!api.isMatterEnabled() : hasMatterApi

      if (enableMatter && preferMatter && MatterPlatform && hasMatterApi && matterAvailable && matterEnabled) {
        log?.debug?.('[Protocol] Using Matter platform implementation')
        this.impl = new MatterPlatform(log, config, api)
        return
      }

      if (enableMatter && preferMatter) {
        const reasons: string[] = []
        if (!MatterPlatform) {
          reasons.push('Matter platform class unavailable')
        }
        if (!hasMatterApi) {
          reasons.push('api.matter missing')
        }
        if (!matterAvailable) {
          reasons.push('Matter not available')
        }
        if (!matterEnabled) {
          reasons.push('Matter not enabled')
        }
        const reasonText = reasons.length ? reasons.join(', ') : 'unknown reason'
        log?.debug?.(`[Protocol] Falling back to HAP despite Matter preference: ${reasonText}`)
      } else {
        log?.debug?.('[Protocol] Using HAP platform implementation')
      }

      // Fallback to HAP
      this.impl = new HAPPlatform(log, config, api)
    }

    configureAccessory(...args: any[]): any {
      return this.impl?.configureAccessory?.(...args)
    }
  }
}
