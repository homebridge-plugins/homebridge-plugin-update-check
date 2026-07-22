import { gt, prerelease } from 'semver'
import { describe, expect, it } from 'vitest'

/**
 * Locks the decision rule used by applyHomebridgeUiBetaPolicy (#255), which
 * mirrors the beta check the Homebridge UI applies to itself: with the UI's own
 * update policy set to `beta`, offer the version on the beta dist-tag only when
 * it beats BOTH the installed version and the stable release, so a beta user is
 * never sent backwards to an older stable.
 */
function decideUiBeta(
  installedVersion: string,
  stableLatest: string | null,
  stableUpdateAvailable: boolean,
  distTags: Record<string, string>,
): { updateAvailable: boolean, latestVersion: string | null } {
  const installedTag = prerelease(installedVersion)?.[0]?.toString()
  const targetTag = installedTag ?? 'beta'
  const candidate = distTags[targetTag]
  if (!candidate) {
    return { updateAvailable: stableUpdateAvailable, latestVersion: stableLatest }
  }
  const beatsInstalled = gt(candidate, installedVersion)
  const beatsStable = !stableUpdateAvailable || !stableLatest || gt(candidate, stableLatest)
  if (beatsInstalled && beatsStable) {
    return { updateAvailable: true, latestVersion: candidate }
  }
  return { updateAvailable: stableUpdateAvailable, latestVersion: stableLatest }
}

describe('homebridge UI beta update policy (#255)', () => {
  it('offers a newer beta when on a stable release', () => {
    const result = decideUiBeta('5.22.0', '5.22.0', false, { latest: '5.22.0', beta: '5.23.0-beta.1' })
    expect(result).toEqual({ updateAvailable: true, latestVersion: '5.23.0-beta.1' })
  })

  it('keeps the stable release when the beta is older than the newest stable', () => {
    // A stable update is already available and is newer than the beta line.
    const result = decideUiBeta('5.22.0', '5.24.0', true, { latest: '5.24.0', beta: '5.23.0-beta.1' })
    expect(result).toEqual({ updateAvailable: true, latestVersion: '5.24.0' })
  })

  it('does not send a beta user backwards to an older stable', () => {
    // Installed a beta that is ahead of the latest stable; no newer beta exists.
    const result = decideUiBeta('5.23.0-beta.2', '5.22.0', false, { latest: '5.22.0', beta: '5.23.0-beta.2' })
    expect(result).toEqual({ updateAvailable: false, latestVersion: '5.22.0' })
  })

  it('follows the same prerelease line when already on a beta', () => {
    const result = decideUiBeta('5.23.0-beta.1', '5.22.0', false, { latest: '5.22.0', beta: '5.23.0-beta.3' })
    expect(result).toEqual({ updateAvailable: true, latestVersion: '5.23.0-beta.3' })
  })

  it('leaves the result untouched when there is no beta tag', () => {
    const result = decideUiBeta('5.22.0', '5.22.0', false, { latest: '5.22.0' })
    expect(result).toEqual({ updateAvailable: false, latestVersion: '5.22.0' })
  })
})
