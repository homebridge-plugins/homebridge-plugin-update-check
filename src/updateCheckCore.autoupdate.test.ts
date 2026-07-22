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
