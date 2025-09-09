# homebridge-plugin-update-check

[![npm](https://img.shields.io/npm/v/homebridge-plugin-update-check) ![npm](https://img.shields.io/npm/dt/homebridge-plugin-update-check)](https://www.npmjs.com/package/homebridge-plugin-update-check) [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A [Homebridge](https://github.com/nfarina/homebridge) plugin for checking for updates to Homebridge and plugins.

## Installation

1. Install Homebridge using the [official instructions](https://github.com/homebridge/homebridge/wiki).
2. Install this plugin using: `sudo npm install -g homebridge-plugin-update-check`.
3. Update your configuration file. See sample config.json snippet below.

### Configuration

Configuration sample:

```json
"platforms": [
    {
        "name": "PluginUpdate",
        "sensorType": "contact",
        "checkHomebridgeUpdates": false,
        "checkHomebridgeUIUpdates": false,
        "checkPluginUpdates": true,
        "checkDockerUpdates": true,
        "autoUpdateHomebridge": false,
        "autoUpdateHomebridgeUI": false,
        "autoUpdatePlugins": false,
        "allowDirectNpmUpdates": false,
        "autoRestartAfterUpdates": false,
        "failureSensorType": "motion",
        "platform": "PluginUpdate"
    }
]
```

#### Fields

* "platform": Must always be "PluginUpdate" (required)
* "sensorType": What type of sensor will be exposed to HomeKit. Can be `motion`, `contact`, `occupancy`, `humidity`, `light`, `air`, `leak`, `smoke`, `dioxide`, or `monoxide` (Default: `motion`)
* "checkHomebridgeUpdates": Check if an update is available for the Homebridge server
* "checkHomebridgeUIUpdates: Check if an update is available for the Homebridge UI
* "checkPluginUpdates": Check if updates are available for any installed plugins
* "checkDockerUpdates": If running in Docker, check if newer Docker versions are available. If not running in Docker, does nothing
* "autoUpdateHomebridge": Automatically install Homebridge updates when available (Default: `false`)
* "autoUpdateHomebridgeUI": Automatically install Homebridge Config UI updates when available (Default: `false`)
* "autoUpdatePlugins": Automatically install plugin updates when available (Default: `false`)
* "allowDirectNpmUpdates": Allow automatic updates using direct npm commands even when homebridge-config-ui-x is not available (Default: `false`)
* "autoRestartAfterUpdates": Automatically restart Homebridge after successful automatic updates to apply changes (Default: `false`)
* "failureSensorType": What type of sensor will be used for update/restart failure notifications. Can be `motion`, `contact`, `occupancy`, `humidity`, `light`, `air`, `leak`, `smoke`, `dioxide`, or `monoxide` (Default: `motion`, only shown when auto-updates are enabled)

Homebridge, Homebridge UI, plugin, and Docker updates can be selected independently. This allows you for example, to ignore available Homebridge, Homebridge UI available updates if you are running Homebridge in a Docker container and wish to only update these components when a new Docker image is available.

**Note on Automatic Updates:** When automatic updates are enabled, the plugin will:
1. **Automatically create a backup** before performing any updates (when homebridge-config-ui-x is available)
2. Attempt to install updates via npm commands. This requires:
   - homebridge-config-ui-x to be installed and properly configured (unless `allowDirectNpmUpdates` is enabled)
   - Sufficient privileges to install global npm packages
3. **Automatically restart Homebridge** after successful updates (when `autoRestartAfterUpdates` is enabled)
4. **Monitor for failures** and provide notifications via a configurable failure sensor (type set by `failureSensorType`)

Automatic updates are disabled by default for safety. Enable them only if you trust automatic updates. The plugin will automatically create a backup before any updates are performed when homebridge-config-ui-x is available, eliminating the need for manual backup procedures. However, you should still maintain your own backup procedures as a best practice.

**Note on Docker Updates:** Docker container updates are intentionally not supported via automatic updates for safety reasons. This is because the process performing the update would be running inside the container itself, which would result in the process killing itself halfway through the update, potentially corrupting the container or leaving it in an unusable state.

When `allowDirectNpmUpdates` is enabled, automatic updates will work even when homebridge-config-ui-x is not available by using direct npm commands. This provides more flexibility but requires ensuring you have the necessary npm privileges.
