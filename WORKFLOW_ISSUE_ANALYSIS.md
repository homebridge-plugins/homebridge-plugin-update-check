# Workflow Issue Analysis - Unified Release Failure

## Issue Summary
The "Unified Release" workflow failed on run #17734903147 due to a malformed URL construction in the reusable workflow `homebridge/.github/.github/workflows/update-version.yml`.

## Root Cause
The reusable workflow attempts to download the npm version script using this URL construction:

```bash
RAW_BASE_URL="https://raw.githubusercontent.com/homebridge/.github/latest/.github"
VERSION_SCRIPT=".github/scripts/npm-version-script-esm-auto.js"
curl -fsSL "$RAW_BASE_URL/$VERSION_SCRIPT" -o "$VERSION_SCRIPT"
```

This results in the malformed URL:
```
https://raw.githubusercontent.com/homebridge/.github/latest/.github/.github/scripts/npm-version-script-esm-auto.js
```

Notice the double `.github` in the path, which causes a 404 error.

## Immediate Fix Applied
Added the required npm version scripts locally to this repository:
- `.github/scripts/npm-version-script-esm-auto.js` (ESM version)
- `.github/scripts/npm-version-script-auto.cjs` (CommonJS version)

This allows the workflow to use the local scripts instead of attempting to download them.

## Recommended Upstream Fix
To fix the root cause in the `homebridge/.github` repository, one of these changes should be made in `/.github/workflows/update-version.yml`:

### Option 1: Fix the base URL
```bash
RAW_BASE_URL="https://raw.githubusercontent.com/homebridge/.github/latest"
# Remove the trailing /.github
```

### Option 2: Fix the script path
```bash
VERSION_SCRIPT="scripts/npm-version-script-esm-auto.js"
# Remove the leading .github/
```

### Option 3: Use absolute path construction
```bash
SCRIPT_URL="https://raw.githubusercontent.com/homebridge/.github/latest/.github/scripts/npm-version-script-esm-auto.js"
curl -fsSL "$SCRIPT_URL" -o "$VERSION_SCRIPT"
```

## Impact
This issue affects all repositories using the `homebridge/.github/.github/workflows/update-version.yml` reusable workflow when they don't have local npm version scripts and the workflow needs to download them.

## Test Results
- ✅ Local ESM script works correctly
- ✅ Local CommonJS script works correctly (renamed to .cjs for ES module compatibility)
- ✅ All existing linting, building, and testing processes continue to work
- ✅ No impact on existing functionality

## Files Added
- `.github/scripts/npm-version-script-esm-auto.js`
- `.github/scripts/npm-version-script-auto.cjs`
- `.github/scripts/README.md`