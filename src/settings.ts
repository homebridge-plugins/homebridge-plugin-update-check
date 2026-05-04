/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'HomebridgeUpdater'

/**
 * This must match the name of your plugin as defined in the package.json `name` property
 */
export const PLUGIN_NAME = '@homebridge-plugins/homebridge-updater'

export const UPDATE_SENSOR_UUID_KEY = 'PluginUpdateCheck-UpdateSensor'

export const FAILURE_SENSOR_UUID_KEY = 'PluginUpdateCheck-FailureSensor'

/**
 * UUID key used by v2.x of homebridge-plugin-update-check.
 * Stored here to support migration of cached accessories from old installs.
 */
export const LEGACY_UPDATE_SENSOR_UUID_KEY = 'PluginUpdate'
