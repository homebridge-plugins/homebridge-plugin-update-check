import { major, valid } from 'semver'
import { describe, expect, it } from 'vitest'

/**
 * Locks the loop-guard decision used by handleConfiguredAutoUpdates (#257).
 *
 * A target is skipped (to avoid an endless update/restart loop) only when it was
 * already updated to the SAME version but is STILL reported as out of date, and
 * the previous attempt was within the cooldown window.
 */
interface AutoUpdateAttempt { version: string, attempts: number, firstAttempt: number, lastAttempt: number }

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function isLooping(record: AutoUpdateAttempt | undefined, targetVersion: string, now: number): boolean {
  return !!record
    && record.version === targetVersion
    && record.attempts >= 1
    && (now - record.lastAttempt) < COOLDOWN_MS
}

describe('auto-update loop guard (#257)', () => {
  const now = 1_000_000_000_000

  it('applies a target with no prior attempt', () => {
    expect(isLooping(undefined, '2.0.0', now)).toBe(false)
  })

  it('skips a target already attempted at the same version within cooldown', () => {
    const record = { version: '2.0.0', attempts: 1, firstAttempt: now - 60_000, lastAttempt: now - 60_000 }
    expect(isLooping(record, '2.0.0', now)).toBe(true)
  })

  it('applies when a newer version than the last attempt is offered', () => {
    const record = { version: '2.0.0', attempts: 3, firstAttempt: now - 60_000, lastAttempt: now - 60_000 }
    expect(isLooping(record, '2.1.0', now)).toBe(false)
  })

  it('retries once the cooldown has elapsed', () => {
    const record = { version: '2.0.0', attempts: 5, firstAttempt: now - (2 * COOLDOWN_MS), lastAttempt: now - COOLDOWN_MS - 1 }
    expect(isLooping(record, '2.0.0', now)).toBe(false)
  })
})

/**
 * Locks the major-version detection used to hold back major updates from
 * auto-update when autoUpdateSkipMajorVersions is enabled (#263). Only applies
 * to valid semver on both sides, so date-based versions are never a "major".
 */
function isMajorUpdate(installedVersion: string, latestVersion: string): boolean {
  const from = valid(installedVersion)
  const to = valid(latestVersion)
  if (!from || !to) {
    return false
  }
  return major(to) > major(from)
}

describe('skip major versions detection (#263)', () => {
  it('treats a major bump as major', () => {
    expect(isMajorUpdate('2.4.1', '3.0.0')).toBe(true)
  })

  it('treats a minor bump as not major', () => {
    expect(isMajorUpdate('2.4.1', '2.5.0')).toBe(false)
  })

  it('treats a patch bump as not major', () => {
    expect(isMajorUpdate('2.4.1', '2.4.2')).toBe(false)
  })

  it('never treats date-based (non-semver) versions as major', () => {
    expect(isMajorUpdate('2026-05-01', '2026-06-01')).toBe(false)
  })
})
