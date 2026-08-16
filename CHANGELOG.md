## v3.1.12 (Pending Release)

### Changed

- fix(matter): declare the cluster each sensor actually updates, so the log stops warning about it

## v3.1.11 (2026-08-16)

### Changed

- fix: declare the ui api token as a service token, so newer homebridge ui versions accept it
- chore(deps): dependency updates

## v3.1.10 (2026-08-10)

### Changed

- chore: keep test files out of the published package
- chore(github): run the build and tests in ci, on node 22, 24 and 26
- chore: use the same lint setup across every plugin
- chore: add a changelog:sync script to populate the pending section from the commits
- chore: count a repeated commit subject once when syncing the changelog
- chore(github): check the changelog against the commits in ci
- chore(deps): dependency updates
- chore: remove personal funding links
- docs: add node 26 to the supported node versions
- chore: exclude test files and the test config from the published package
- fix: recover from a connection dropped mid-response instead of crashing the bridge
- fix: give up on a stalled update check, rather than waiting for the rest of the session
- fix: stop the scheduled update checks when homebridge shuts down
- fix: log the error message rather than the whole error object, which can carry the api response
- fix: stop writing other plugins' config, credentials included, into the debug log
- fix: say what actually went wrong, rather than logging "undefined error connecting to"

## v3.1.9 (2026-07-26)

### Changed

- chore(github): release on a published github release, not every push to latest
- chore(github): align workflows, funding and issue templates with the other org plugins
- chore: standardise the eslint setup and apply the org lint rules
- chore: align the npm publishing files with the other org plugins
- chore: standardise the package manifest with the other org plugins
- docs: add claude and copilot instructions files
- docs: use the standard org readme banner
- chore(deps): dependency updates
- fix(matter): register a carbon dioxide sensor on the air quality cluster so its state updates instead of failing (#256)
- fix: propagate a renamed sensor from the config to the cached accessory so the new name reaches homekit (#251)
- feat: detect homebridge ui beta updates when the ui update policy is set to beta (#255)
- fix: stop auto-update restarting homebridge in a loop when an update installs but is still reported as out of date (#257)
- feat: add an option to auto-update only minor and patch versions, leaving major versions to install manually (#263)
- fix: perform auto-updates through the homebridge ui so they install to the correct plugin path and actually take effect on hb-service and docker setups (#257)
- test: type the auto-update routing mocks so the build type-checks
- fix: detect when running under the homebridge docker image so docker image updates are actually checked (#264)
- fix(ui): register the cached-accessories handler with the leading slash the UI calls
- chore(github): use the shared homebridge action to deprecate past pre-releases
- docs(github): name this plugin's devices in the issue forms instead of meater
- style(ui): standardise the custom ui layout and sync the support tab with the readme
- chore: declare the supports-hap transport keyword for the homebridge ui
- docs(changelog): list every unreleased commit in the pending section
- chore(deps): dependency updates

## [3.1.7](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.1.7) (2026-06-03)

### Changes

* chore: update `.gitignore` to ignore webstorm files
* chore: dependency updates
* fix(ui-api): send correct instanceId so JWTs pass UI auth on v5.24.0+

## [3.1.2](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.1.2) (2026-05-05)

### Bug Fixes

* persist failureSensorType to JSON config by marking it required in schema ([#245](https://github.com/homebridge-plugins/homebridge-updater/issues/245)) ([accf14b](https://github.com/homebridge-plugins/homebridge-updater/commit/accf14b8343609b4534bdf9224d9866505dd056f))
* fix scoped plugin upgrade clearing config: migrate `PluginUpdate` → `HomebridgeUpdater` by reading `config.json` directly instead of relying on the Homebridge UI API, which cannot return legacy platform entries for the new plugin name ([#246](https://github.com/homebridge-plugins/homebridge-updater/issues/246))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.1.0...v3.1.2

## [3.1.0](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.1.0) (2026-05-04)

### Enhancements

* **Config `Platform` must be manually updated to `HomebridgeUpdater` instead of `PluginUpdate`.**

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.7...v3.1.0

## [3.0.7](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.0.7) (2026-05-04)

### Bug Fixes

* Fixed Homebridge Config UI layout rendering by moving `layout` to the top level of `config.schema.json` so the collapsible **Advanced Settings** fieldset is shown and applied correctly.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.6...v3.0.7

## [3.0.6](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.0.6) (2026-05-03)

### Enhancements

* Added npm update support:
  * New `checkNpmUpdates` option to detect newer npm versions.
  * New `autoUpdateNpm` option to automatically update npm.
* npm support is now environment-safe:
  * If npm is unavailable, npm checks are skipped without crashing.
  * If `autoUpdateNpm` is enabled but npm is unavailable, a clear warning is logged and failure state is tracked.
* Simplified Matter selection config:
  * Removed `preferMatter` from user config and schema.
  * Protocol selection now auto-prefers Matter when available and `enableMatter` is true.
* Reordered Config UI fields in `config.schema.json` into a more logical top-to-bottom flow.

### Bug Fixes

* Improved Homebridge UI action request compatibility for restart/backup flows:
  * Added JSON request headers/content-length for action endpoints.
  * Added restart method fallback (`PUT` then `POST`) to support API variations across UI versions.
  * Reduces `HTTP 415 Unsupported Media Type` restart failures.

### Documentation

* Updated README for new npm options and behavior when npm is not installed.
* Removed `preferMatter` from README examples and option table.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.5...v3.0.6

## [3.0.5](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.0.5) (2026-05-03)

### Bug Fixes

* Fixed restart API calls not detecting HTTP error responses (4xx/5xx) — error responses are now properly rejected instead of treated as successful
* Improved restart logging to show actual API response details and endpoint-specific error messages for better diagnostics

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.4...v3.0.5

## [3.0.4](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.0.4) (2026-05-03)

### Bug Fixes

* Fix update checks not starting after Homebridge restart ([#233](https://github.com/homebridge-plugins/homebridge-updater/pull/233)) — Cached accessory restoration was preventing scheduled checks and cron jobs from being initialized. Now checks are always started regardless of whether the accessory was newly created or restored from cache.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.3...v3.0.4

## [3.0.3](https://github.com/homebridge-plugins/homebridge-updater/compare/tag/v3.0.3) (2026-05-03)
### Bug Fixes

* respect `failureSensorType: "none"` and auto-disable failure sensor when no auto-updates are configured ([#231](https://github.com/homebridge-plugins/homebridge-updater/issues/231)) ([c007709](https://github.com/homebridge-plugins/homebridge-updater/commit/c007709301063abe5df1ca3b24fae12c1f50e75e))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.2...v3.0.3

## [3.0.2](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v3.0.2) (2026-05-02)

### Enhancements
- Refactored sensor handling into shared protocol abstractions with a new unified sensor base:
  - Added `MatterSensor` and `HAPSensor` implementations in `src/sensorBase.ts`.
  - Added `UpdateSensor` orchestration in `src/updateSensor.ts`.
  - Simplified platform classes by delegating sensor behavior to shared abstractions.
- Improved runtime platform selection and startup behavior:
  - Strengthened HAP/Matter proxy logic in `src/utils.ts`.
  - Added explicit protocol selection flow from platform constructors to update sensor initialization.
  - Added debug-level protocol selection logs for easier troubleshooting without noisy normal logs.

### Bug Fixes
- Fixed Matter startup regression where cached Matter accessories could be treated as orphaned on restart:
  - Ensured stable proxy instantiation/delegation for Homebridge platform lifecycle handling.
  - Improved Matter capability detection compatibility across Homebridge API shapes.
  - Prevented mixed protocol registration by explicitly selecting `hap` or `matter` for sensor wiring.
- Hardened accessory handling across platform implementations:
  - Improved update/failure sensor registration and restore behavior in both HAP and Matter paths.

### Other
- Updated tests for platform proxy behavior and protocol selection edge cases in `src/utils.test.ts`.
- Updated dependencies and lockfile metadata.
- Regenerated docs and TypeDoc assets.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.1...v3.0.2

## [3.0.1](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v3.0.1) (2026-04-29)

### Bug Fixes
- Fixed crash in Matter platform when running under ESM: removed use of `require` and now initialize Docker detection synchronously for compatibility with Homebridge v2.0+ and Node.js ESM environments.

### Other
- Internal refactor: clarified ESM limitations for Docker detection in Matter platform constructor.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v3.0.0...v3.0.1

## [3.0.0](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v3.0.0) (2026-04-29)

## What's Changed
### Enhancements
- Node.js update check and auto-update:
  - The plugin can now check for new Node.js LTS versions and notify if an update is available. Controlled by the new `checkNodeUpdates` config option. Implements [#206](https://github.com/homebridge-plugins/homebridge-updater/issues/206).
  - New config option: `autoUpdateNode` — If enabled, the plugin will attempt to automatically update Node.js using `hb-service update-node` when a new LTS version is detected and the system supports it.
  - The plugin checks for `hb-service update-node` support before attempting the update, and logs the result (success or failure).
  - If a Node.js update is available, a log line is emitted when the HomeKit/Matter sensor is tripped due to Node.js.
  - The HomeKit/Matter sensor is now tripped if any update is available, including Node.js, Homebridge, UI, plugins, or Docker.
- Suppress or log at debug level when no updates are found, instead of always logging "Found 0 available update(s)". Fixes [#224](https://github.com/homebridge-plugins/homebridge-updater/issues/224).
- Log level for update notifications is now correct per update type (Homebridge, UI, plugins, Docker). Each update logs as info only if a new update is found for that type, otherwise as debug. Fixes [#225](https://github.com/homebridge-plugins/homebridge-updater/issues/225).
- Full Homebridge v2.0 Matter support with HAP fallback. Matter is now the default platform when available and enabled, with seamless fallback to HAP if not.
- Refactored to use a runtime proxy/factory pattern for platform selection (HAP vs Matter).
- Added `preferMatter`, `enableMatter`, `disableMatter`, and `externalAccessory` options to configuration and schema.
- Improved accessory registration and cleanup logic for both HAP and Matter, including external accessory support.
- Switched all HTTP(S) requests to native Node.js http/https modules with manual retry and DNS caching (cacheable-lookup). Removed axios and axios-retry dependencies.
- Updated documentation and schema for new features and options.

### Bug Fixes
- Croner cron jobs are now unref'd so they do not prevent Node.js from exiting cleanly. Fixes [#222](https://github.com/homebridge-plugins/homebridge-updater/issues/222).
- Accessory/device name now uses the configured `name` property as the HomeKit/Matter accessory name, not just the platform name. Fixes [#223](https://github.com/homebridge-plugins/homebridge-updater/issues/223).

### Other
- Added and updated tests for new config options and proxy logic. All tests pass.
- Updated all dependencies and removed unused packages for improved security and compatibility.
- General code cleanup, improved file/class naming, and import clarity.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.7...v3.0.0

## [2.3.7](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.7) (2025-12-01)

### What's Changed
- Clamp max DNS cache TTL to prevent excessive warnings ([#208](https://github.com/homebridge-plugins/homebridge-updater/pull/208))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.6...v2.3.7

## [2.3.6](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.6) (2025-11-01)

### What's Changed
- Add explicit warning when an outdated Homebridge UI (homebridge-config-ui-x) is detected, explaining that a newer UI version is required for full functionality ([#200](https://github.com/homebridge-plugins/homebridge-updater/pull/200))
- Clarify the requirement notice to better guide users on updating the Homebridge UI
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.5...v2.3.6

## [2.3.5](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.5) (2025-11-01)

### What's Changed
- Fix error where current Docker version is not found by @justjam2013 in https://github.com/homebridge-plugins/homebridge-updater/pull/166
- v2.3.5 by @donavanbecker in https://github.com/homebridge-plugins/homebridge-updater/pull/189

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.4...v2.3.5

## [2.3.4](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.4) (2025-09-14)

### What's Changed
- Fix error where current Docker version is not found by @justjam2013 in https://github.com/homebridge-plugins/homebridge-updater/pull/166

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.3...v2.3.4

## [2.3.3](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.3) (2025-09-14)

### What's Changed
- v2.3.3 ([b7a4c9e](https://github.com/homebridge-plugins/homebridge-updater/commit/b7a4c9ec2b079b6f3e51411311573080b281d97c))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.2...v2.3.3

## [2.3.2](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.2) (2025-09-13)

### What's Changed
- Remove double variables for file and directory paths (#115) ([4743e21](https://github.com/homebridge-plugins/homebridge-updater/commit/4743e21c40bac30c1084d6ca0642f1d9ad723579))
- Remove npm-check-updates (NCU) option as it doesn't add value (#117) ([d8f5ee5](https://github.com/homebridge-plugins/homebridge-updater/commit/d8f5ee5dfc3886d665b646803fa48c1f6506abdb))
- Added cached dns lookup and retries (#118) ([f375adb](https://github.com/homebridge-plugins/homebridge-updater/commit/f375adb8c7a3bae35ff548c86c16a34e7daa037c))
- Add NodeJS 24 support by updating engines.node to ^20 || ^22 || ^24 (rebased against beta-2.3.2) (#123) ([f64de4d](https://github.com/homebridge-plugins/homebridge-updater/commit/f64de4d1f3f6d4bf46102b9ca14716360aba6ce0))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.1...v2.3.2

## [2.3.1](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.1) (2025-09-03)

### What's Changed
- Merge branch 'latest' into beta-2.3.1 ([f30d910](https://github.com/homebridge-plugins/homebridge-updater/commit/f30d91080dd11fecafc84275bd078ce30e15fe2d))
- Fix NCU filter regex construction to detect plugin updates correctly (#92) ([32733d8](https://github.com/homebridge-plugins/homebridge-updater/commit/32733d889fc9bdcf0d58f279f387b105a36bfc06))
- v2.3.1 ([c6b1af1](https://github.com/homebridge-plugins/homebridge-updater/commit/c6b1af1844f90520bb9217171d6117c6425f58d9))
- Fix Homebridge restart failure: use PUT method and implement endpoint fallback (#101) ([feb32be](https://github.com/homebridge-plugins/homebridge-updater/commit/feb32befefd97a5f87155ca95f58ebb105a83471))
- Add name validation to prevent HomeKit pairing issues with child bridges (#91) ([4db28af](https://github.com/homebridge-plugins/homebridge-updater/commit/4db28afd90f4f5c21c10579d8d0da08e022ea8f6))
- Patch ncu (#99) ([d3b7a3f](https://github.com/homebridge-plugins/homebridge-updater/commit/d3b7a3f5326142f1aa54a6d5247546e6803d8b48))
- Parenthesis & patch ncu (#98) ([7796773](https://github.com/homebridge-plugins/homebridge-updater/commit/7796773d376e3ff936a9724109125fc1c671dd7f))
- resolve __dirname is not defined (#97) ([c295a20](https://github.com/homebridge-plugins/homebridge-updater/commit/c295a20962e982b449bd1296b0b02708e1fde058))
- Add automatic update functionality with configurable npm support, restart capability, automatic backup creation, and configurable failure notifications for Homebridge, UI, and plugins (#94) ([e58b488](https://github.com/homebridge-plugins/homebridge-updater/commit/e58b488edf02eccf801627314107a70f08c36693))
- Fix npm-check-updates CLI path for v16+ compatibility (#96) ([acf607c](https://github.com/homebridge-plugins/homebridge-updater/commit/acf607c9cd5944eb418b88a8465744cb942d1460))
- Update available update list (#89) ([bd84b83](https://github.com/homebridge-plugins/homebridge-updater/commit/bd84b83556c3bffdac0d35f15e1047f7c54e8887))
- Fix ReferenceError: __dirname is not defined in ESM module (#86) ([5668b01](https://github.com/homebridge-plugins/homebridge-updater/commit/5668b015900d708bbeb4a38d82fac14a7215f022))

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.3.0...v2.3.1

## [2.3.0](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.3.0) (2025-08-18)

### What's Changed
- Display newer updates in logs

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.2.1...v2.3.0

## [2.2.1](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.2.1) (2025-08-09)

### What's Changed
- Change logging to daily
- Fix log info output

## [2.1.0](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.1.0) (2025-08-09)

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

## [2.0.2](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.0.2) (2025-03-04)

### What's Changes
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.0.1...v2.0.2

## [2.0.1](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.0.1) (2025-01-25)

### What's Changes
- Housekeeping and updated dependencies.

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v2.0.0...v2.0.1

## [2.0.0](https://github.com/homebridge-plugins/homebridge-updater/releases/tag/v2.0.0) (2025-01-16)

### What's Changes
- This plugins has moved to a scoped plugin under the `@homebridge-plugins` org.
  - Homebridge UI is designed to transition you to the new scoped plugin.
- Updated to ES Module

**Full Changelog**: https://github.com/homebridge-plugins/homebridge-updater/compare/v1.0.2...v2.0.0
