#!/usr/bin/env node

/**
 * Standalone CommonJS implementation — self-contained so this file can be copied
 * into other repos without pulling any other files.
 */

const assert = require('node:assert')
const child_process = require('node:child_process')
const fs = require('node:fs')
const process = require('node:process')
// Minimal, in-file semver utilities used by this script.
// This avoids an external dependency so the script can run in environments
// where `semver` isn't installed.
const semver = {
	// Very small validation: match major.minor.patch with optional prerelease/build
	valid(v) {
		return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/.test(v)
	},
	// Return prerelease identifiers array or null
	prerelease(v) {
		const m = v.match(/^\d+\.\d+\.\d+-(.+)$/)
		return m ? m[1].split('.') : null
	},
	// Compare two semver strings in reverse order (for rcompare use)
	rcompare(a, b) {
		// Use standard semver precedence rules for major.minor.patch; ignore prerelease complexity except that prerelease is lower than release
		const pa = a.split('-')
		const pb = b.split('-')
		const aCore = pa[0].split('.').map(Number)
		const bCore = pb[0].split('.').map(Number)
		for (let i = 0; i < 3; i++) {
			if (aCore[i] > bCore[i]) return -1
			if (aCore[i] < bCore[i]) return 1
		}
		// equal core; releases (no prerelease) are greater than prerelease
		if (pa.length === 1 && pb.length > 1) return -1
		if (pa.length > 1 && pb.length === 1) return 1
		// both same prerelease status: compare as strings
		if (a > b) return -1
		if (a < b) return 1
		return 0
	},
	// Increment version by 'major'|'minor'|'patch'
	inc(v, level) {
		if (!this.valid(v)) throw new Error(`Invalid semver passed to inc: ${v}`)
		// strip prerelease/build
		const core = v.split('-')[0].split('+')[0]
		const parts = core.split('.').map(Number)
		switch (level) {
			case 'major':
				parts[0] += 1
				parts[1] = 0
				parts[2] = 0
				break
			case 'minor':
				parts[1] += 1
				parts[2] = 0
				break
			case 'patch':
			default:
				parts[2] += 1
				break
		}
		return parts.join('.')
	}
}

const BRANCH_VERSION_PATTERN = /^([A-Z]+)-(\d+\.\d+\.\d+)$/i

// Load package.json
const packageJSON = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const refArgument = process.argv[2]
const tagArgument = process.argv[3] || 'latest'
const prLabel = process.argv[4] || null // optional PR label: major, minor, patch

if (!refArgument) {
	console.error('ref argument is missing')
	console.error('Usage: npm-version-script-auto.js <ref> [tag] [pr_label]')
	process.exit(1)
}

function getTagVersionFromNpm(baseVersion, tag) {
	try {
		return JSON.parse(
			child_process.execSync(`npm info ${packageJSON.name} versions --json`).toString('utf8').trim()
		)
			.filter(v => (tag === 'latest' ? v === baseVersion : v.startsWith(`${baseVersion}-${tag}.`)))
			.reduce((_, current) => current, '')
	} catch (e) {
		console.error(`Failed to query the npm registry for the latest version for tag: ${tag}`, e)
		return ''
	}
}

function getLatestStableVersionFromNpm() {
	try {
		const versions = JSON.parse(
			child_process.execSync(`npm info ${packageJSON.name} versions --json`).toString('utf8').trim()
		)
		if (!Array.isArray(versions) || versions.length === 0) return ''

		const stable = versions.filter(v => semver.valid(v) && !semver.prerelease(v))
		if (stable.length === 0) return ''

		const sorted = stable.sort(semver.rcompare)
		return sorted[0]
	} catch (e) {
		console.error('Failed to query the npm registry for published versions', e)
		return ''
	}
}

function desiredTargetVersion(ref) {
	if (ref.startsWith('refs/pull/')) {
		throw new Error('The version script was executed inside a PR!')
	}

	assert(ref.startsWith('refs/heads/'))
	const branchName = ref.slice('refs/heads/'.length)

	const results = branchName.match(BRANCH_VERSION_PATTERN)
	if (results !== null) {
		if (results[1].toLowerCase() !== tagArgument.toLowerCase()) {
			console.warn(`The base branch name (${results[1]}) differs from the tag name ${tagArgument}`)
		}
		return results[2]
	}

	if (branchName === 'latest') {
		// For latest branch, start with package.json version as base
		return packageJSON.version
	}

	throw new Error(`Malformed branch name for ref: ${ref}. Must be beta-x.x.x, alpha-x.x.x, or 'latest'`)
}

function bumpVersion(baseVersion, prLabel) {
	const label = (prLabel || 'patch').toLowerCase()
	if (!semver.valid(baseVersion)) {
		throw new Error(`Invalid base version passed to bumpVersion: ${baseVersion}`)
	}

	switch (label) {
		case 'major':
			return semver.inc(baseVersion, 'major')
		case 'minor':
			return semver.inc(baseVersion, 'minor')
		case 'patch':
		default:
			return semver.inc(baseVersion, 'patch')
	}
}

const baseVersion = desiredTargetVersion(refArgument)
let publishTag = baseVersion

if (refArgument.includes('latest')) {
	if (prLabel) {
		// For latest branch, bump according to PR label
		publishTag = bumpVersion(baseVersion, prLabel)
	} else {
		// For latest branch with no PR label, determine next version based on npm
		const latestPublishedStable = getLatestStableVersionFromNpm()
		if (latestPublishedStable) {
			console.warn(`Latest published stable version is ${latestPublishedStable}; bumping patch`)
			publishTag = bumpVersion(latestPublishedStable, 'patch')
		} else {
			console.warn('No published stable versions found; bumping package.json version patch')
			publishTag = bumpVersion(baseVersion, 'patch')
		}
	}
} else {
	// For alpha/beta, query npm for latest
	const latestReleasedVersion = getTagVersionFromNpm(baseVersion, tagArgument)
	if (latestReleasedVersion) {
		console.warn(`Latest published version for ${baseVersion} with tag ${tagArgument} is ${latestReleasedVersion}`)
		publishTag = latestReleasedVersion
	} else {
		console.warn(`No published versions for ${baseVersion} with tag ${tagArgument}`)
	}
}

if (packageJSON.version !== publishTag) {
	console.warn(`Updating version in package.json from ${packageJSON.version} to ${publishTag}`)
	packageJSON.version = publishTag
	fs.writeFileSync('package.json', JSON.stringify(packageJSON, null, 2))

	const packageLockJSON = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
	packageLockJSON.version = publishTag
	fs.writeFileSync('package-lock.json', JSON.stringify(packageLockJSON, null, 2))
} else {
	console.warn(`Version in package.json is already ${packageJSON.version}`)
}

console.log(publishTag)