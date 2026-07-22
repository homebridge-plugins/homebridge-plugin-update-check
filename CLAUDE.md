# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — `rimraf ./dist && tsc && npm run plugin-ui`. The `plugin-ui` step rsyncs `src/homebridge-ui/public/index.html` into `dist/` (the custom settings UI). Skipping it produces a broken published package.
- `npm run lint` — ESLint over the whole repo with `--max-warnings=0`. CI fails on any warning. `npm run lint:fix` to autofix.
- `npm test` — vitest, colocated `src/**/*.test.ts` files (see `vitest.config.ts`). `npm run test:watch` and `npm run test-coverage` also available.
- `npm run watch` — build, `npm link`, then `nodemon`: recompiles and restarts on `src/**/*.ts` changes (see `nodemon.json`).
- `npm run docs` — typedoc into `docs/` (gitignored — generated output is never committed).
- `npm run prepublishOnly` — lint then build; runs automatically on publish.

CI (`.github/workflows/build.yml`) runs install + lint on Node 22.x/24.x. Releases publish via `.github/workflows/release.yml`: a GitHub release (tag `vX.Y.Z`) publishes to npm's `latest` tag; pushes to `beta-X.Y.Z` / `alpha-X.Y.Z` branches publish incrementing prerelease versions to the `beta` / `alpha` tags.

Supported Node: `^22.12.0 || ^24.0.0`. Homebridge: `^1.11.4 || ^2.0.0`.

## Architecture

Homebridge dynamic platform plugin (`platform: "HomebridgeUpdater"`, package `@homebridge-plugins/homebridge-updater`) that checks npm for newer versions of Homebridge itself and of installed plugins, and surfaces "an update is available" to HomeKit as a sensor. Unlike the other plugins it talks to no device — it reads the local Homebridge install and the public npm registry.

### HAP/Matter platform selection

`src/index.ts` registers a runtime proxy (`createPlatformProxy` in `src/utils.ts`) that instantiates the Matter platform (`src/Platform.Matter.ts`) when Homebridge reports Matter available+enabled, otherwise the HAP `src/Platform.HAP.ts`. Matter API calls must stay optional-chained.

### Update checking (`src/updateCheckCore.ts`)

Enumerates installed plugins and queries `registry.npmjs.org` (over `https` with a `cacheable-lookup` DNS cache) for the latest published version of each, plus the running Node/Homebridge versions. Checks are scheduled with `croner`. Results feed the sensors.

### Sensors (`src/updateSensor.ts`, `src/failureSensor.ts`, `src/sensorBase.ts`)

Each "update available" indicator is exposed as a HomeKit sensor whose **type is user-selectable** via `sensorType` in `PluginUpdatePlatformConfig` (`src/configTypes.ts`) — motion, contact, leak, occupancy, smoke, etc. `failureSensor.ts` reports when a check itself failed. `configMigration.ts` upgrades older config shapes on load.

### Custom UI backend (`src/ui-api.ts`)

The settings UI server signs a short-lived JWT (`jsonwebtoken`) to authenticate its own requests. `Buffer`/`process` are imported from `node:*` rather than used as globals.

## Conventions

- TypeScript ESM (`"type": "module"`): relative imports use `.js` extensions even from `.ts` source.
- ESLint is `@antfu/eslint-config` (flat config in `eslint.config.js`): single quotes, 1tbs braces, `curly` multi-line only (single-line guards must use full multi-line braces), sorted imports. Run `npm run lint:fix` before committing.
- `config.schema.json` defines the Homebridge UI form and must stay in sync with `PluginUpdatePlatformConfig` in `src/configTypes.ts`.
- Licensed BSD-2-Clause — keep the LICENSE and upstream attribution intact.
