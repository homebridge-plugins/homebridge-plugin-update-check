# homebridge-plugin-update-check

A TypeScript Homebridge plugin that exposes update availability as sensors and supports both HAP and Matter at runtime.

Current focus of this repository:
- Dual protocol support with runtime proxy selection (Matter preferred when available, HAP fallback otherwise)
- Two managed sensors:
  - Main update sensor (updates available)
  - Failure sensor (auto-update failure state)
- Update checks for Node.js, Homebridge, Homebridge UI, plugins, and Docker (Docker check-only)
- Optional auto-update execution for Node.js, Homebridge, Homebridge UI, and plugins
- Failure propagation from auto-update flow to the dedicated failure sensor

Always use these instructions first.

## Working Effectively

### Initial Setup
```bash
npm install
```

### Build
```bash
npm run build
```

Build details:
- `npm run clean` removes `dist/`
- `tsc` compiles TypeScript
- `npm run plugin-ui` copies UI assets to `dist/homebridge-ui/public/`

### Test
```bash
npx vitest run
```

### Lint
```bash
npm run lint
npm run lint:fix
```

### Docs
```bash
npm run docs
npm run docs:lint
```

### Full Local Validation
```bash
npm run lint && npm run build && npx vitest run && node -c dist/index.js
```

### CI-Equivalent Validation
```bash
npm run prepublishOnly
```

## Architecture (Current)

### Platform Selection
- `src/index.ts` registers a proxy platform constructor.
- `src/utils.ts` (`createPlatformProxy`) selects Matter only when:
  - `enableMatter !== false`
  - `preferMatter !== false`
  - Homebridge reports Matter available and enabled
- Otherwise, platform falls back to HAP.

### Platform Implementations
- `src/Platform.HAP.ts`
  - Implements `DynamicPlatformPlugin`
  - Manages cached accessory restoration
  - Registers both update and failure accessories in HAP
- `src/Platform.Matter.ts`
  - Registers separate Matter devices for update and failure sensors

### Sensor Abstraction
- `src/sensorBase.ts`
  - `SensorProtocol` abstraction
  - `HAPSensor` implementation
  - `MatterSensor` implementation
- `src/updateSensor.ts`
  - Orchestrates update checks and update sensor state
  - Calls `onFailureStateChange` callback when auto-update failures occur
- `src/failureSensor.ts`
  - Orchestrates failure sensor state for HAP or Matter

### Update Engine
- `src/updateCheckCore.ts`
  - Periodic check scheduling with cron
  - Node.js LTS version check
  - Homebridge/Homebridge UI/plugin checks via UI API
  - Docker update checks (notification only)
  - Optional auto-update execution for:
    - Node.js (`hb-service update-node` when supported)
    - Homebridge
    - Homebridge UI
    - plugins
  - Tracks last auto-update failure state for failure sensor signaling

### UI API and Update Operations
- `src/ui-api.ts`
  - Reads Homebridge UI config/secrets
  - API calls for versions/plugins/ignored plugins
  - Backup creation attempt before auto-update (when UI is configured)
  - Update operations via npm install for Homebridge and plugins
  - Restart operation with endpoint fallbacks and process-exit fallback

## Configuration (Current)

Source of truth:
- `src/configTypes.ts`
- `config.schema.json`

Key options:
- Protocol selection:
  - `enableMatter`
  - `preferMatter`
- Sensor behavior:
  - `sensorType`
  - `failureSensorType`
- Update checks:
  - `checkNodeUpdates`
  - `checkHomebridgeUpdates`
  - `checkHomebridgeUIUpdates`
  - `checkPluginUpdates`
  - `checkDockerUpdates`
- Auto-update behavior:
  - `autoUpdateNode`
  - `autoUpdateHomebridge`
  - `autoUpdateHomebridgeUI`
  - `autoUpdatePlugins`
  - `allowDirectNpmUpdates`
  - `autoRestartAfterUpdates`
- Other:
  - `respectDisabledPlugins`
  - `initialCheckDelay`

## Validation Requirements For Any Change

After code changes, run:
1. `npm run build`
2. `node -c dist/index.js`
3. `npm run lint`
4. `npx vitest run`
5. `npm run docs:lint`

Also verify build outputs exist:
- `dist/index.js`
- `dist/index.d.ts`
- `dist/configTypes.js`
- `dist/ui-api.js`
- `dist/homebridge-ui/public/index.html`

## Development Constraints

- This is a Homebridge plugin and cannot be validated end-to-end without a Homebridge runtime.
- Matter behavior can be code-validated and build-validated locally, but commissioning and Home app behavior require a real Homebridge Matter environment.
- Docker updates are intentionally check-only; do not implement in-container self-update execution.

## Matter Mapping Reference

For Matter/HomeKit sensor deviceType, cluster, and attribute mapping, use the homebridge-matter wiki as the authoritative reference:
- Introduction: https://github.com/homebridge-plugins/homebridge-matter/wiki/Introduction
- Enabling Matter: https://github.com/homebridge-plugins/homebridge-matter/wiki/Enabling-Matter
- Core Concepts: https://github.com/homebridge-plugins/homebridge-matter/wiki/Core-Concepts
- State Management: https://github.com/homebridge-plugins/homebridge-matter/wiki/State-Management
- API Reference: https://github.com/homebridge-plugins/homebridge-matter/wiki/API-Reference
- Matter Types: https://github.com/homebridge-plugins/homebridge-matter/wiki/Matter-Types
- Sensors reference: https://github.com/homebridge-plugins/homebridge-matter/wiki/Section-7-Sensors

When sensor mappings change, update:
- `src/sensorBase.ts`
- `config.schema.json` (if user-facing options changed)
- tests as needed
