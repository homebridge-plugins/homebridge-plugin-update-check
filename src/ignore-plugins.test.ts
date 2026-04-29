import { describe, expect, it } from 'vitest'

// Test for the plugin filtering logic
describe('plugin Update Filtering', () => {
  it('should filter plugins correctly based on ignore list', () => {
    // Mock plugin data similar to what would come from the API
    const mockPlugins = [
      {
        name: 'homebridge-plugin-1',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-plugin-2',
        installedVersion: '2.0.0',
        latestVersion: '2.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-config-ui-x',
        installedVersion: '4.0.0',
        latestVersion: '4.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-plugin-3',
        installedVersion: '3.0.0',
        latestVersion: '3.1.0',
        updateAvailable: true,
      },
    ]

    const ignoredPlugins = ['homebridge-plugin-2', 'homebridge-plugin-3']

    // Test the filtering logic that would be used in checkUi()
    const filteredPlugins = mockPlugins.filter(plugin =>
      plugin.name !== 'homebridge-config-ui-x'
      && !ignoredPlugins.includes(plugin.name),
    )

    expect(filteredPlugins).toHaveLength(1)
    expect(filteredPlugins[0].name).toBe('homebridge-plugin-1')
  })

  it('should include all plugins when ignore list is empty', () => {
    const mockPlugins = [
      {
        name: 'homebridge-plugin-1',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-plugin-2',
        installedVersion: '2.0.0',
        latestVersion: '2.1.0',
        updateAvailable: true,
      },
    ]

    const ignoredPlugins: string[] = []

    const filteredPlugins = mockPlugins.filter(plugin =>
      plugin.name !== 'homebridge-config-ui-x'
      && !ignoredPlugins.includes(plugin.name),
    )

    expect(filteredPlugins).toHaveLength(2)
    expect(filteredPlugins.map(p => p.name)).toEqual(['homebridge-plugin-1', 'homebridge-plugin-2'])
  })

  it('should correctly identify ignored plugins with updates', () => {
    const mockPlugins = [
      {
        name: 'homebridge-plugin-1',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-plugin-ignored',
        installedVersion: '2.0.0',
        latestVersion: '2.1.0',
        updateAvailable: true,
      },
      {
        name: 'homebridge-plugin-no-update',
        installedVersion: '3.0.0',
        latestVersion: '3.0.0',
        updateAvailable: false,
      },
    ]

    const ignoredPlugins = ['homebridge-plugin-ignored']

    // Test identifying ignored plugins with available updates
    const ignoredWithUpdates = mockPlugins.filter(plugin =>
      ignoredPlugins.includes(plugin.name) && plugin.updateAvailable,
    )

    expect(ignoredWithUpdates).toHaveLength(1)
    expect(ignoredWithUpdates[0].name).toBe('homebridge-plugin-ignored')
  })

  it('should filter homebridge-config-ui-x when in ignore list', () => {
    const mockPlugins = [
      {
        name: 'homebridge-config-ui-x',
        installedVersion: '4.0.0',
        latestVersion: '4.1.0',
        updateAvailable: true,
      },
    ]

    const ignoredPlugins = ['homebridge-config-ui-x']

    // Test filtering homebridge-config-ui-x updates when ignored
    const shouldFilterUI = ignoredPlugins.includes('homebridge-config-ui-x')
    expect(shouldFilterUI).toBe(true)

    // Simulate what would happen in the checkUi() method
    const uiPlugin = mockPlugins.find(plugin => plugin.name === 'homebridge-config-ui-x')
    const shouldAddUpdate = uiPlugin && uiPlugin.updateAvailable && !shouldFilterUI
    expect(shouldAddUpdate).toBe(false)
  })

  it('should filter homebridge core updates when in ignore list', () => {
    const mockHomebridge = {
      name: 'homebridge',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    }

    const ignoredPlugins = ['homebridge']

    // Test filtering homebridge core updates when ignored
    const shouldFilterHomebridge = ignoredPlugins.includes('homebridge')
    expect(shouldFilterHomebridge).toBe(true)

    // Simulate what would happen in the checkUi() method
    const shouldAddUpdate = mockHomebridge.updateAvailable && !shouldFilterHomebridge
    expect(shouldAddUpdate).toBe(false)
  })
})
