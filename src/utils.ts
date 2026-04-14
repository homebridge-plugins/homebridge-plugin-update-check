import type { PlatformConfig } from 'homebridge'

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
      const matterAvailable = !!(api?.isMatterAvailable?.() && api?.isMatterEnabled?.())

      if (enableMatter && preferMatter && MatterPlatform && matterAvailable) {
        this.impl = new MatterPlatform(log, config, api)
        return this.impl
      }

      // Fallback to HAP
      this.impl = new HAPPlatform(log, config, api)
      return this.impl
    }
  }
}
