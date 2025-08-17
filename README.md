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
* "forceNcu": Force use of npm-check-updates instead of homebridge-config-ui-x. (Default: `false`)

Homebridge, Homebridge UI, plugin, and Docker updates can be selected independently. This allows you for example, to ignore available Homebridge, Homebridge UI available updates if you are running Homebridge in a Docker container and wish to only update these components when a new Docker image is available.
