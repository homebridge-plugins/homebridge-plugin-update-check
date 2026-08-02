<p align="center">
   <a href="https://github.com/homebridge-plugins/homebridge-updater"><img alt="homebridge-updater" src="https://raw.githubusercontent.com/homebridge-plugins/homebridge-updater/latest/branding/Homebridge_x_Updater.png" width="600px"></a>
</p>
<span align="center">

## homebridge-updater

Homebridge plugin that surfaces available Homebridge and plugin updates as HomeKit sensors

[![npm](https://img.shields.io/npm/v/@homebridge-plugins/homebridge-updater/latest?label=latest)](https://www.npmjs.com/package/@homebridge-plugins/homebridge-updater)
[![npm](https://img.shields.io/npm/v/@homebridge-plugins/homebridge-updater/beta?label=beta)](https://github.com/homebridge/homebridge/wiki/How-to-Install-Alternate-Plugin-Versions)<br>
[![npm](https://img.shields.io/npm/dt/@homebridge-plugins/homebridge-updater)](https://www.npmjs.com/package/@homebridge-plugins/homebridge-updater)
[![Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=hb-discord)](https://discord.gg/bHjKNkN)

</span>

### Plugin Information

- This plugin checks for updates to Homebridge and your installed plugins, and exposes the result to HomeKit. The plugin:
  - reads your local Homebridge install and queries the public npm registry - no account or device is required
  - lets you choose which HomeKit sensor type represents "an update is available" (for example a motion, contact or occupancy sensor)
  - can optionally expose the sensors over Matter as well as HomeKit

### Prerequisites

- To use this plugin, you will need to already have:
  - [Node](https://nodejs.org): latest version of `v22`, `v24` or `v26` - any other major version is not supported.
  - [Homebridge](https://homebridge.io): `v2` - refer to link for more information and installation instructions.

### Setup

- [Installation](https://github.com/homebridge-plugins/homebridge-updater/wiki/Installation)
- [Configuration](https://github.com/homebridge-plugins/homebridge-updater/wiki/Configuration)
- [Beta Version](https://github.com/homebridge-plugins/homebridge-updater/wiki/Beta-Version)
- [Node Version](https://github.com/homebridge-plugins/homebridge-updater/wiki/Node-Version)

### Features

- A HomeKit sensor that trips when a Homebridge or plugin update is available
- Your choice of sensor type for the indicator
- A separate sensor that reports when an update check itself failed
- Scheduled, automatic re-checks

### Help/About

- [Common Errors](https://github.com/homebridge-plugins/homebridge-updater/wiki/Common-Errors)
- [Support Request](https://github.com/homebridge-plugins/homebridge-updater/issues/new/choose)
- [Changelog](https://github.com/homebridge-plugins/homebridge-updater/blob/latest/CHANGELOG.md)

### Credits

- To David Maher (Sunoo): the original creator of this plugin.
- To the creators/contributors of [Homebridge](https://homebridge.io) who make this plugin possible.

### Disclaimer

- This plugin is a personal project that I maintain in my free time.
- Use this plugin entirely at your own risk - please see licence for more information.
