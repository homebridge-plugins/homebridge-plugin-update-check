## [3.0.0](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v3.0.0) (2026-04-29)

### Enhancements
- Node.js update check and auto-update:
  - The plugin can now check for new Node.js LTS versions and notify if an update is available. Controlled by the new `checkNodeUpdates` config option. Implements [#206](https://github.com/homebridge-plugins/homebridge-plugin-update-check/issues/206).
  - New config option: `autoUpdateNode` — If enabled, the plugin will attempt to automatically update Node.js using `hb-service update-node` when a new LTS version is detected and the system supports it.
  - The plugin checks for `hb-service update-node` support before attempting the update, and logs the result (success or failure).
  - If a Node.js update is available, a log line is emitted when the HomeKit/Matter sensor is tripped due to Node.js.
  - The HomeKit/Matter sensor is now tripped if any update is available, including Node.js, Homebridge, UI, plugins, or Docker.
- Suppress or log at debug level when no updates are found, instead of always logging "Found 0 available update(s)". Fixes [#224](https://github.com/homebridge-plugins/homebridge-plugin-update-check/issues/224).
- Log level for update notifications is now correct per update type (Homebridge, UI, plugins, Docker). Each update logs as info only if a new update is found for that type, otherwise as debug. Fixes [#225](https://github.com/homebridge-plugins/homebridge-plugin-update-check/issues/225).
- Full Homebridge v2.0 Matter support with HAP fallback. Matter is now the default platform when available and enabled, with seamless fallback to HAP if not.
- Refactored to use a runtime proxy/factory pattern for platform selection (HAP vs Matter).
- Added `preferMatter`, `enableMatter`, `disableMatter`, and `externalAccessory` options to configuration and schema.
- Improved accessory registration and cleanup logic for both HAP and Matter, including external accessory support.
- Switched all HTTP(S) requests to native Node.js http/https modules with manual retry and DNS caching (cacheable-lookup). Removed axios and axios-retry dependencies.
- Updated documentation and schema for new features and options.

### Bug Fixes
- Croner cron jobs are now unref'd so they do not prevent Node.js from exiting cleanly. Fixes [#222](https://github.com/homebridge-plugins/homebridge-plugin-update-check/issues/222).
- Accessory/device name now uses the configured `name` property as the HomeKit/Matter accessory name, not just the platform name. Fixes [#223](https://github.com/homebridge-plugins/homebridge-plugin-update-check/issues/223).

### Other
- Added and updated tests for new config options and proxy logic. All tests pass.
- Updated all dependencies and removed unused packages for improved security and compatibility.
- General code cleanup, improved file/class naming, and import clarity.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.7...v3.0.0

## [2.3.7](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.7) (2025-12-01)

### What's Changed
- Clamp max DNS cache TTL to prevent excessive warnings ([#208](https://github.com/homebridge-plugins/homebridge-plugin-update-check/pull/208))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.6...v2.3.7

## [2.3.6](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.6) (2025-11-01)

### What's Changed
- Add explicit warning when an outdated Homebridge UI (homebridge-config-ui-x) is detected, explaining that a newer UI version is required for full functionality ([#200](https://github.com/homebridge-plugins/homebridge-plugin-update-check/pull/200))
- Clarify the requirement notice to better guide users on updating the Homebridge UI
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.5...v2.3.6

## [2.3.5](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.5) (2025-11-01)

### What's Changed
- Fix error where current Docker version is not found by @justjam2013 in https://github.com/homebridge-plugins/homebridge-plugin-update-check/pull/166
- v2.3.5 by @donavanbecker in https://github.com/homebridge-plugins/homebridge-plugin-update-check/pull/189

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.4...v2.3.5

## [2.3.4](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.4) (2025-09-14)

### What's Changed
- Fix error where current Docker version is not found by @justjam2013 in https://github.com/homebridge-plugins/homebridge-plugin-update-check/pull/166

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.3...v2.3.4

## [2.3.3](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.3) (2025-09-14)

### What's Changed
- v2.3.3 ([b7a4c9e](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/b7a4c9ec2b079b6f3e51411311573080b281d97c))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.2...v2.3.3

## [2.3.2](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.2) (2025-09-13)

### What's Changed
- Remove double variables for file and directory paths (#115) ([4743e21](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/4743e21c40bac30c1084d6ca0642f1d9ad723579))
- Remove npm-check-updates (NCU) option as it doesn't add value (#117) ([d8f5ee5](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/d8f5ee5dfc3886d665b646803fa48c1f6506abdb))
- Added cached dns lookup and retries (#118) ([f375adb](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/f375adb8c7a3bae35ff548c86c16a34e7daa037c))
- Add NodeJS 24 support by updating engines.node to ^20 || ^22 || ^24 (rebased against beta-2.3.2) (#123) ([f64de4d](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/f64de4d1f3f6d4bf46102b9ca14716360aba6ce0))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.1...v2.3.2

## [2.3.1](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.1) (2025-09-03)

### What's Changed
- Merge branch 'latest' into beta-2.3.1 ([f30d910](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/f30d91080dd11fecafc84275bd078ce30e15fe2d))
- Fix NCU filter regex construction to detect plugin updates correctly (#92) ([32733d8](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/32733d889fc9bdcf0d58f279f387b105a36bfc06))
- v2.3.1 ([c6b1af1](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/c6b1af1844f90520bb9217171d6117c6425f58d9))
- Fix Homebridge restart failure: use PUT method and implement endpoint fallback (#101) ([feb32be](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/feb32befefd97a5f87155ca95f58ebb105a83471))
- Add name validation to prevent HomeKit pairing issues with child bridges (#91) ([4db28af](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/4db28afd90f4f5c21c10579d8d0da08e022ea8f6))
- Patch ncu (#99) ([d3b7a3f](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/d3b7a3f5326142f1aa54a6d5247546e6803d8b48))
- Parenthesis & patch ncu (#98) ([7796773](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/7796773d376e3ff936a9724109125fc1c671dd7f))
- resolve __dirname is not defined (#97) ([c295a20](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/c295a20962e982b449bd1296b0b02708e1fde058))
- Add automatic update functionality with configurable npm support, restart capability, automatic backup creation, and configurable failure notifications for Homebridge, UI, and plugins (#94) ([e58b488](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/e58b488edf02eccf801627314107a70f08c36693))
- Fix npm-check-updates CLI path for v16+ compatibility (#96) ([acf607c](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/acf607c9cd5944eb418b88a8465744cb942d1460))
- Update available update list (#89) ([bd84b83](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/bd84b83556c3bffdac0d35f15e1047f7c54e8887))
- Fix ReferenceError: __dirname is not defined in ESM module (#86) ([5668b01](https://github.com/homebridge-plugins/homebridge-plugin-update-check/commit/5668b015900d708bbeb4a38d82fac14a7215f022))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.3.0...v2.3.1

## [2.3.0](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.3.0) (2025-08-18)

### What's Changed
- Display newer updates in logs

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.2.1...v2.3.0

## [2.2.1](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.2.1) (2025-08-09)

### What's Changed
- Change logging to daily
- Fix log info output

## [2.1.0](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.1.0) (2025-08-09)

### What's Changed
- Output available updates to log
- Fix plugin update check
- Fixed version checks and added debug output
- Add docker version check and fixed NCU search
- Fixed field names
- Fix default check value
- Select which components to check for updates
- Fix Labler
- Build fixes and improvements

## [2.0.2](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.0.2) (2025-03-04)

### What's Changes
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.0.1...v2.0.2

## [2.0.1](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.0.1) (2025-01-25)

### What's Changes
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v2.0.0...v2.0.1

## [2.0.0](https://github.com/homebridge-plugins/homebridge-plugin-update-check/releases/tag/v2.0.0) (2025-01-16)

### What's Changes
- This plugins has moved to a scoped plugin under the `@homebridge-plugins` org.
  - Homebridge UI is designed to transition you to the new scoped plugin.
- Updated to ES Module

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-plugin-update-check/compare/v1.0.2...v2.0.0
