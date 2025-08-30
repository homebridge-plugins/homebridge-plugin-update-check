# homebridge-plugin-update-check

[![npm](https://img.shields.io/npm/v/homebridge-plugin-update-check) ![npm](https://img.shields.io/npm/dt/homebridge-plugin-update-check)](https://www.npmjs.com/package/homebridge-plugin-update-check) [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A [Homebridge](https://github.com/nfarina/homebridge) plugin for checking for updates to Homebridge and plugins.

This will use [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x) when available, but will fall back to using [npm-check-updates](https://www.npmjs.com/package/npm-check-updates) if it is not.

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
        "forceNcu": false,
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
* "forceNcu": Force use of npm-check-updates instead of homebridge-config-ui-x. (Default: `false`)

Homebridge, Homebridge UI, plugin, and Docker updates can be selected independently. This allows you for example, to ignore available Homebridge, Homebridge UI available updates if you are running Homebridge in a Docker container and wish to only update these components when a new Docker image is available.

**Note on Automatic Updates:** When automatic updates are enabled, the plugin will:
1. **Automatically create a backup** before performing any updates (when homebridge-config-ui-x is available)
2. Attempt to install updates via npm commands. This requires:
   - homebridge-config-ui-x to be installed and properly configured (unless `allowDirectNpmUpdates` is enabled)
   - Sufficient privileges to install global npm packages

Automatic updates are disabled by default for safety. Enable them only if you trust automatic updates. The plugin will attempt to create a backup before any updates are performed, but you should still maintain your own backup procedures as a best practice. Docker container updates are not supported via automatic updates for safety reasons.

When `allowDirectNpmUpdates` is enabled, automatic updates will work even when homebridge-config-ui-x is not available by using direct npm commands. This provides more flexibility but requires ensuring you have the necessary npm privileges.
