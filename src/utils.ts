import type { PlatformConfig } from 'homebridge'

import type { PluginUpdatePlatformConfig } from './configTypes.js'

/**
 * Returns true if the failure sensor should be registered and active.
 *
 * The failure sensor is disabled when:
 * - `failureSensorType` is explicitly set to `"none"`, OR
 * - none of the auto-update options (autoUpdateNode, autoUpdateHomebridge,
 *   autoUpdateHomebridgeUI, autoUpdatePlugins, autoUpdateNpm) are enabled, because without
 *   auto-updates there can never be an auto-update failure to report.
 */
export function isFailureSensorEnabled(config: PlatformConfig): boolean {
  const cfg = config as PluginUpdatePlatformConfig
  if (cfg.failureSensorType === 'none') {
    return false
  }
  return !!(cfg.autoUpdateNode || cfg.autoUpdateHomebridge || cfg.autoUpdateHomebridgeUI || cfg.autoUpdatePlugins || cfg.autoUpdateNpm)
}

/**
 * Describe a caught error for a log line.
 *
 * Node's network errors carry a `code` - ECONNREFUSED, ENOTFOUND and the rest -
 * and that is the most useful thing to put in front of someone reading a log.
 * Plenty of errors have no code at all though, and reading `error.code` on one
 * of those printed the literal word "undefined" where the reason should have
 * been (#276): the log said something had failed and then withheld what.
 *
 * @param error The caught value, which is not necessarily an Error.
 * @returns The error code, or failing that its message, or a last-resort string.
 */
export function describeError(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string' && code !== '') {
    return code
  }

  if (error instanceof Error && error.message !== '') {
    return error.message
  }

  // String(error) on a plain object gives "[object Object]", which is no more
  // use to a reader than "undefined" was.
  const described = String(error)
  return described === '[object Object]' ? 'unknown error' : described
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
      const enableMatter = (config as any).enableMatter ?? true
      const hasMatterApi = !!api?.matter
      const matterAvailable = typeof api?.isMatterAvailable === 'function' ? !!api.isMatterAvailable() : hasMatterApi
      const matterEnabled = typeof api?.isMatterEnabled === 'function' ? !!api.isMatterEnabled() : hasMatterApi

      if (enableMatter && MatterPlatform && hasMatterApi && matterAvailable && matterEnabled) {
        log?.debug?.('[Protocol] Using Matter platform implementation')
        this.impl = new MatterPlatform(log, config, api)
        return
      }

      if (enableMatter) {
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
        log?.debug?.(`[Protocol] Falling back to HAP: ${reasonText}`)
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
