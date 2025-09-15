# NPM Version Scripts

These scripts are used by the Homebridge release workflow to automatically determine and update version numbers for packages.

## Files

- `npm-version-script-esm-auto.js` - ESM version of the script used for packages with `"type": "module"`
- `npm-version-script-auto.cjs` - CommonJS version of the script for traditional packages

## Why These Scripts Are Local

These scripts were copied from the `homebridge/.github` repository due to a URL construction issue in the reusable workflow `homebridge/.github/.github/workflows/update-version.yml`.

The reusable workflow attempts to download the script from:
```
https://raw.githubusercontent.com/homebridge/.github/latest/.github/.github/scripts/npm-version-script-esm-auto.js
```

Notice the double `.github` in the path - this results in a 404 error. The correct URL should be:
```
https://raw.githubusercontent.com/homebridge/.github/latest/.github/scripts/npm-version-script-esm-auto.js
```

By including these scripts locally, the workflow will use the local versions instead of attempting to download them, thus avoiding the URL construction issue.

## Usage

These scripts are automatically invoked by the GitHub Actions workflow. They determine the appropriate version bump based on the current branch and release type.

## Source

These scripts are maintained in the `homebridge/.github` repository at:
- https://github.com/homebridge/.github/blob/latest/.github/scripts/