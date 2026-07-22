# Copilot instructions

Guidance for AI coding agents working in this repository. The fuller version of this document is [CLAUDE.md](../CLAUDE.md) at the repo root — keep the two in sync.

## Commands

- Build: `npm run build` (`rimraf ./dist` → `tsc` → copy plugin UI html). All steps are required for a working package.
- Lint: `npm run lint` (`eslint . --max-warnings=0`, CI fails on warnings); `npm run lint:fix` to autofix.
- Test: `npm test` (vitest, colocated `src/**/*.test.ts`; see `vitest.config.ts`).
- Local dev loop: `npm run watch` (rebuild + restart on changes; see `nodemon.json`).

## Key architecture facts

- Homebridge dynamic platform plugin (`platform: "HomebridgeUpdater"`) that checks npm for newer versions of Homebridge and installed plugins and surfaces "an update is available" to HomeKit as a sensor. It talks to no device — it reads the local install and the public npm registry.
- `src/index.ts` registers a runtime HAP/Matter proxy (`createPlatformProxy` in `src/utils.ts`); keep `api.matter?.…` / Matter calls optional-chained.
- `src/updateCheckCore.ts` queries `registry.npmjs.org` (via `https` + `cacheable-lookup`) for latest versions; checks are scheduled with `croner`.
- Each indicator is a HomeKit sensor whose type is user-selectable (`sensorType` in `PluginUpdatePlatformConfig`, `src/configTypes.ts`); `failureSensor.ts` flags failed checks; `configMigration.ts` upgrades old config.
- `src/ui-api.ts` signs a short-lived JWT (`jsonwebtoken`); import `Buffer`/`process` from `node:*`, not as globals.

## Conventions

- TypeScript ESM: relative imports need `.js` extensions.
- ESLint `@antfu/eslint-config`: single quotes, sorted imports, multi-line braces on guards; run `npm run lint:fix` before committing.
- `config.schema.json` must stay in sync with `PluginUpdatePlatformConfig` in `src/configTypes.ts`.
- Licensed BSD-2-Clause — keep the LICENSE and upstream attribution intact.
