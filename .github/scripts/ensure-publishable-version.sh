#!/usr/bin/env bash
set -euo pipefail

# ensure-publishable-version.sh
# 
# NOTE: This script is downloaded from homebridge/.github at:
# https://raw.githubusercontent.com/homebridge/.github/latest/.github/scripts/ensure-publishable-version.sh
#
# It exists locally because the reusable workflow publish-release.yml@latest expects it to be
# present at .github/scripts/ensure-publishable-version.sh but does not download it automatically.
# This should be addressed in the reusable workflow to download the script like other scripts.
#
# Usage: ensure-publishable-version.sh <release_type> <max_attempts>
# Writes NPM_VERSION to $GITHUB_OUTPUT when run inside GitHub Actions, otherwise prints it to stdout.

release_type=${1:-beta}
max_attempts=${2:-5}

PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")

echo "ensure-publishable-version: checking ${PKG_NAME}@${PKG_VERSION} (release_type=${release_type}, max_attempts=${max_attempts})"

attempt=0
while true; do
  attempt=$((attempt+1))

  if npm view "${PKG_NAME}@${PKG_VERSION}" version > /dev/null 2>&1; then
    echo "Attempt ${attempt}: Version ${PKG_VERSION} already exists on npm"

    if [ "${release_type}" = "latest" ]; then
      echo "Cannot publish: version ${PKG_VERSION} already exists and release_type is 'latest'" >&2
      exit 1
    fi

    if [ "${attempt}" -gt "${max_attempts}" ]; then
      echo "Exceeded max attempts (${max_attempts}) to find a free prerelease version" >&2
      exit 1
    fi

    echo "Bumping prerelease for tag '${release_type}' (attempt ${attempt})"
    npm version prerelease --preid="${release_type}" --no-git-tag-version
    PKG_VERSION=$(node -p "require('./package.json').version")
    echo "New version to check: ${PKG_VERSION}"
  else
    echo "Attempt ${attempt}: Version ${PKG_VERSION} does not exist on npm — safe to publish"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
      echo "NPM_VERSION=${PKG_VERSION}" >> "$GITHUB_OUTPUT"
    else
      echo "NPM_VERSION=${PKG_VERSION}"
    fi
    exit 0
  fi
done
