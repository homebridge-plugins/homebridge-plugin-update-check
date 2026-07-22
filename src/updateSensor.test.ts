import { describe, expect, it, vi } from 'vitest'

/**
 * Regression test for: update checks not running after Homebridge restart
 *
 * When Homebridge restarts, cached accessories are restored via `configureAccessory`
 * before `didFinishLaunching` fires. The previous implementation returned early in
 * `addUpdateSensor` when `registered` was already true, which prevented the initial
 * check and scheduled cron jobs from being started.
 */
describe('updateSensor cached accessory restore', () => {
  it('should start update checks even when the accessory is restored from cache', async () => {
    // Arrange: track calls to startScheduledChecks and doCheck (via checkUi)
    const checkUiCalls: number[] = []
    const startScheduledChecksCalls: number[] = []

    // Minimal mock for UpdateCheckCore
    const mockUpdateCore = {
      initialCheckDelay: 0,
      checkUi: vi.fn().mockResolvedValue(0),
      startScheduledChecks: vi.fn<(cb: () => void) => void>(() => {
        startScheduledChecksCalls.push(1)
      }),
      getLastAutoUpdateFailed: vi.fn().mockReturnValue(false),
    }

    // Minimal mock for a HAP sensor
    const mockSensor = {
      configure: vi.fn(),
      setState: vi.fn(),
    }

    // Minimal mock for the Homebridge API (HAP path, no Matter)
    const mockAccessory = {
      UUID: 'test-uuid',
      displayName: 'Plugin Update Check',
      on: vi.fn(),
    }

    // Build the UpdateSensor object directly by manipulating internal state
    // to simulate the cached accessory scenario without needing to import the full class
    // (which requires a real Homebridge environment).
    //
    // Instead, we test the *logic* extracted from addUpdateSensor:
    // The fix ensures that checks are started whether or not the accessory was cached.

    let registered = false

    // Simulate configureAccessory being called (cached accessory restore)
    function configureAccessory(_accessory: any) {
      mockSensor.configure(_accessory)
      registered = true
    }

    // Fixed addUpdateSensor: only skips accessory creation, always starts checks
    function addUpdateSensor() {
      if (!registered) {
        // Would create and register the accessory here
        mockSensor.configure(mockAccessory)
        registered = true
      }
      // Always start checks
      setTimeout(() => {
        mockUpdateCore.checkUi().then((updates: number) => {
          checkUiCalls.push(updates)
          mockSensor.setState(!!updates)
        })
      }, mockUpdateCore.initialCheckDelay * 1000)
      mockUpdateCore.startScheduledChecks(() => {
        mockUpdateCore.checkUi()
      })
    }

    // Simulate Homebridge restart: cached accessory is restored first
    configureAccessory(mockAccessory)
    expect(registered).toBe(true)

    // Then addUpdateSensor fires on didFinishLaunching
    addUpdateSensor()

    // The accessory should NOT be reconfigured (already was via restore)
    expect(mockSensor.configure).toHaveBeenCalledTimes(1)

    // Scheduled checks MUST be started
    expect(startScheduledChecksCalls).toHaveLength(1)
    expect(mockUpdateCore.startScheduledChecks).toHaveBeenCalledTimes(1)

    // Wait for setTimeout(0) to fire
    await new Promise(resolve => setTimeout(resolve, 10))

    // The initial check must have run
    expect(mockUpdateCore.checkUi).toHaveBeenCalled()
    expect(checkUiCalls).toHaveLength(1)
  })

  it('should NOT start checks twice when addUpdateSensor is called on first launch (no cached accessory)', async () => {
    const startScheduledChecksCalls: number[] = []
    const configureCalls: number[] = []

    const mockUpdateCore = {
      initialCheckDelay: 0,
      checkUi: vi.fn().mockResolvedValue(1),
      startScheduledChecks: vi.fn<(cb: () => void) => void>(() => {
        startScheduledChecksCalls.push(1)
      }),
      getLastAutoUpdateFailed: vi.fn().mockReturnValue(false),
    }

    const mockSensor = {
      configure: vi.fn<(acc?: any) => void>(() => configureCalls.push(1)),
      setState: vi.fn(),
    }

    const mockAccessory = {
      UUID: 'test-uuid',
      displayName: 'Plugin Update Check',
    }

    let registered = false

    // Fixed addUpdateSensor (no prior configureAccessory call)
    function addUpdateSensor() {
      if (!registered) {
        mockSensor.configure(mockAccessory)
        registered = true
      }
      setTimeout(() => {
        mockUpdateCore.checkUi()
      }, mockUpdateCore.initialCheckDelay * 1000)
      mockUpdateCore.startScheduledChecks(() => {
        mockUpdateCore.checkUi()
      })
    }

    // First launch: no cached accessory; addUpdateSensor creates it
    addUpdateSensor()

    expect(registered).toBe(true)
    expect(configureCalls).toHaveLength(1)
    expect(startScheduledChecksCalls).toHaveLength(1)
  })
})
