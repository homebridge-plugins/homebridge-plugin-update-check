import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock node:fs before any imports that use it — vitest hoists vi.mock automatically.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import * as fs from 'node:fs'
import { migratePlatformAliasInPluginConfigs, migrateLegacyPlatformAlias } from './configMigration.js'

describe('config migration', () => {
  it('should migrate legacy platform alias in plugin config entries', () => {
    const pluginConfigs: Array<Record<string, unknown>> = [
      { platform: 'PluginUpdate', name: 'Legacy Updater' },
      { platform: 'OtherPlugin', name: 'Other' },
    ]

    const updated = migratePlatformAliasInPluginConfigs(pluginConfigs)

    expect(updated).toBe(1)
    expect(pluginConfigs[0].platform).toBe('HomebridgeUpdater')
    expect(pluginConfigs[1].platform).toBe('OtherPlugin')
  })

  it('should keep entries unchanged when no legacy alias exists', () => {
    const pluginConfigs: Array<Record<string, unknown>> = [
      { platform: 'HomebridgeUpdater', name: 'Updater' },
    ]

    const updated = migratePlatformAliasInPluginConfigs(pluginConfigs)

    expect(updated).toBe(0)
    expect(pluginConfigs[0].platform).toBe('HomebridgeUpdater')
  })

  it('should return 0 for a non-array input', () => {
    expect(migratePlatformAliasInPluginConfigs(null as any)).toBe(0)
    expect(migratePlatformAliasInPluginConfigs(undefined as any)).toBe(0)
  })
})

describe('migrateLegacyPlatformAlias (direct file migration)', () => {
  const FAKE_STORAGE = '/fake/homebridge'
  const FAKE_CONFIG_PATH = `${FAKE_STORAGE}/config.json`

  const readFileSyncMock = vi.mocked(fs.readFileSync)
  const writeFileSyncMock = vi.mocked(fs.writeFileSync)

  function makeApi(storagePath: string | undefined) {
    return {
      user: { storagePath: () => storagePath },
    } as any
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should do nothing when storagePath is missing', async () => {
    await migrateLegacyPlatformAlias(makeApi(undefined))

    expect(readFileSyncMock).not.toHaveBeenCalled()
    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('should migrate PluginUpdate → HomebridgeUpdater entries directly in config.json', async () => {
    const originalConfig = {
      bridge: { name: 'Homebridge', username: 'AA:BB:CC:DD:EE:FF', port: 51826 },
      platforms: [
        { platform: 'PluginUpdate', name: 'Plugin Update', checkPluginUpdates: true },
        { platform: 'OtherPlugin', name: 'Other' },
      ],
    }

    readFileSyncMock.mockReturnValue(JSON.stringify(originalConfig) as any)
    writeFileSyncMock.mockImplementation(() => {})

    await migrateLegacyPlatformAlias(makeApi(FAKE_STORAGE))

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1)
    const [writtenPath, writtenData] = writeFileSyncMock.mock.calls[0] as [string, string, string]
    expect(writtenPath).toBe(FAKE_CONFIG_PATH)

    const written = JSON.parse(writtenData)
    expect(written.platforms[0].platform).toBe('HomebridgeUpdater')
    expect(written.platforms[0].name).toBe('Plugin Update')
    expect(written.platforms[0].checkPluginUpdates).toBe(true)
    // Unrelated platform entries must remain untouched
    expect(written.platforms[1].platform).toBe('OtherPlugin')
  })

  it('should not write config.json when no legacy entries exist', async () => {
    const currentConfig = {
      bridge: { name: 'Homebridge', username: 'AA:BB:CC:DD:EE:FF', port: 51826 },
      platforms: [
        { platform: 'HomebridgeUpdater', name: 'Updater' },
      ],
    }

    // readFileSync is called at least once (for config.json). Any extra calls (e.g. from
    // the UiApi fallback path) should also not find legacy entries.
    readFileSyncMock.mockReturnValue(JSON.stringify(currentConfig) as any)
    writeFileSyncMock.mockImplementation(() => {})

    await migrateLegacyPlatformAlias(makeApi(FAKE_STORAGE))

    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('should not throw when config.json cannot be read', async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT: no such file')
    })
    writeFileSyncMock.mockImplementation(() => {})

    await expect(migrateLegacyPlatformAlias(makeApi(FAKE_STORAGE))).resolves.toBeUndefined()
    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('should preserve all config fields (_bridge, etc.) when migrating', async () => {
    const configWithBridge = {
      bridge: { name: 'Homebridge', username: 'AA:BB:CC:DD:EE:FF', port: 51826 },
      platforms: [
        {
          platform: 'PluginUpdate',
          name: 'Plugin Update',
          _bridge: { username: '11:22:33:44:55:66', port: 51828, name: 'Plugin Update Child Bridge' },
          checkPluginUpdates: true,
          autoUpdatePlugins: false,
        },
      ],
    }

    readFileSyncMock.mockReturnValue(JSON.stringify(configWithBridge) as any)
    writeFileSyncMock.mockImplementation(() => {})

    await migrateLegacyPlatformAlias(makeApi(FAKE_STORAGE))

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1)
    const written = JSON.parse((writeFileSyncMock.mock.calls[0] as [string, string, string])[1])
    const migratedPlatform = written.platforms[0]
    expect(migratedPlatform.platform).toBe('HomebridgeUpdater')
    // Child bridge config must be preserved intact
    expect(migratedPlatform._bridge).toEqual(configWithBridge.platforms[0]._bridge)
    expect(migratedPlatform.checkPluginUpdates).toBe(true)
    expect(migratedPlatform.autoUpdatePlugins).toBe(false)
  })
})
