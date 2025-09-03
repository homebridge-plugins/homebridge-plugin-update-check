# homebridge-plugin-update-check

A TypeScript-based Homebridge plugin that creates HomeKit sensors to notify when updates are available for Homebridge, Homebridge UI, plugins, and Docker containers. The plugin uses either homebridge-config-ui-x API or npm-check-updates as a fallback to check for updates.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Initial Setup
Bootstrap the repository in a fresh environment:
```bash
npm install  # Takes ~30 seconds. NEVER CANCEL.
```

### Build Process
Build the TypeScript code and prepare distribution files:
```bash
npm run build  # Takes ~4 seconds. Compiles TS + copies UI files
```

**Build Details:**
- `npm run clean` - Removes dist/ directory (~0.2 seconds)
- `tsc` - Compiles TypeScript to JavaScript (~2 seconds)  
- `npm run plugin-ui` - Copies UI files to dist/ (~0.1 seconds)

### Testing
Run the test suite:
```bash
npx vitest run  # Takes <1 second
```

The project has minimal test coverage with only configuration type tests in `src/configTypes.test.ts`.

### Linting and Code Quality
Always run these before committing changes:
```bash
npm run lint      # Takes ~2 seconds. Runs ESLint on TypeScript files
npm run lint:fix  # Auto-fixes ESLint issues
```

### Documentation
Generate and validate TypeDoc documentation:
```bash
npm run docs       # Takes ~2 seconds. Generates docs/ directory
npm run docs:lint  # Takes ~5 seconds. Validates docs with warnings as errors
```

### Full Validation Pipeline
Run the complete validation used in CI:
```bash
npm run prepublishOnly  # Takes ~17 seconds. Runs lint + build + plugin-ui + docs + docs:lint
```

### Development Workflow
For continuous development with auto-rebuild:
```bash
npm run watch  # Builds, sets up plugin-ui, links globally, and runs nodemon
```
**Note**: This script is intended for use in a Homebridge development environment.

### Dependency Management
Check for outdated dependencies:
```bash
npm run check  # Runs npm install && npm outdated
```

## Validation

**CRITICAL**: This is a Homebridge plugin - it CANNOT be run standalone like a typical application. It requires integration with a Homebridge environment and HomeKit.

### Manual Validation Steps
After making changes, always:
1. **Build validation**: Run `npm run build` and verify `dist/` contains compiled JS files
2. **Syntax check**: Run `node -c dist/index.js` to verify JavaScript syntax
3. **Lint validation**: Run `npm run lint` to ensure code style compliance
4. **Test validation**: Run `npx vitest run` to ensure tests pass
5. **Documentation**: Run `npm run docs:lint` to validate TypeDoc comments

### Build Artifacts Validation
Verify these files exist after building:
- `dist/index.js` - Main plugin entry point
- `dist/index.d.ts` - TypeScript declarations
- `dist/configTypes.js` - Configuration types
- `dist/ui-api.js` - Homebridge UI integration
- `dist/homebridge-ui/public/index.html` - UI component

### CI Pipeline Compatibility
The GitHub Actions workflow uses the homebridge shared workflow. Always run these locally before pushing:
```bash
npm install && npm run lint && npm run build && npx vitest run
```

## Project Structure

### Key Source Files
- `src/index.ts` - Main plugin implementation (PluginUpdatePlatform class)
- `src/configTypes.ts` - Configuration interface definitions  
- `src/ui-api.ts` - Homebridge Config UI X integration
- `src/configTypes.test.ts` - Basic configuration type tests
- `src/homebridge-ui/` - Plugin UI components

### Configuration Files
- `package.json` - Dependencies and npm scripts
- `tsconfig.json` - TypeScript compiler configuration
- `eslint.config.js` - ESLint rules (uses @antfu/eslint-config)
- `typedoc.json` - Documentation generation settings
- `config.schema.json` - Homebridge configuration schema

### Build Outputs
- `dist/` - Compiled JavaScript and type definitions
- `docs/` - Generated TypeDoc documentation (not committed)

### Key Dependencies
- `homebridge` - Platform integration (dev dependency for types)
- `npm-check-updates` - Fallback update checker
- `axios` - HTTP client for API calls
- `croner` - Cron job scheduling
- `jsonwebtoken` - Homebridge UI authentication

## Common Tasks

### Adding New Features
1. Modify TypeScript files in `src/`
2. Add corresponding tests in `src/*.test.ts` if needed
3. Update configuration schema in `config.schema.json` if adding config options
4. Run `npm run build && npm run lint && npx vitest run`
5. Update documentation comments for TypeDoc if adding public APIs

### Debugging Build Issues
1. Check TypeScript compilation: `npx tsc --noEmit`
2. Validate ESLint configuration: `npm run lint`
3. Clean and rebuild: `npm run clean && npm run build`

### Release Process
The project uses automated releases via GitHub Actions. The `prepublishOnly` script ensures quality before publishing:
```bash
npm run prepublishOnly  # Must pass before any release
```

## Architecture Notes

### Plugin Functionality
- Creates HomeKit sensors (motion, contact, occupancy, etc.) that trigger when updates are available
- Checks updates hourly via cron jobs
- Supports checking Homebridge core, Homebridge UI, plugins, and Docker updates independently
- Uses homebridge-config-ui-x API when available, falls back to npm-check-updates

### Configuration Options
See `src/configTypes.ts` for the complete interface. Key options:
- `platform`: Must be "PluginUpdate"
- `sensorType`: Type of HomeKit sensor to create
- `checkHomebridgeUpdates`, `checkHomebridgeUIUpdates`, `checkPluginUpdates`, `checkDockerUpdates`: Boolean flags
- `forceNcu`: Force use of npm-check-updates instead of UI API

### Development Limitations
- Cannot test actual update checking without Homebridge environment
- Cannot interact with HomeKit without proper Homebridge setup
- Limited to build/lint/unit test validation in development environment