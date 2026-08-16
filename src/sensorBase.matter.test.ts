import type { API, PlatformAccessory } from 'homebridge'

import { describe, expect, it, vi } from 'vitest'

import { MatterSensor } from './sensorBase.js'

/**
 * Every sensor type declares its starting cluster state in configure(), and
 * then setState() writes to the cluster named in the type map. If those two
 * disagree, the declared state is dropped on the floor: Homebridge passes the
 * unknown cluster name straight to matter.js, which ignores it, and the name
 * also lands in the Matter accessory cache. On the next restart the cache
 * replays it and the bridge logs "No custom behavior class available for
 * cluster '<name>'" for a cluster the plugin never meant to own (#278).
 *
 * The same class of mistake in the other direction - setState writing to a
 * cluster that was never declared - is what caused #256.
 */

/** matter.js device types compose with .with(); the fake only has to be chainable. */
function fakeDeviceType(name: string): any {
  const type: any = {
    name,
    with: () => type,
  }
  type.requirements = new Proxy({}, {
    get: () => ({ with: () => type }),
  })
  return type
}

function fakeApi(): { api: API, registered: any[] } {
  const registered: any[] = []
  const deviceTypes = new Proxy({} as Record<string, any>, {
    get: (target, prop: string) => {
      if (!target[prop]) {
        target[prop] = fakeDeviceType(prop)
      }
      return target[prop]
    },
    has: () => true,
  })

  const api = {
    matter: {
      uuid: { generate: (input: string) => `uuid-${input}` },
      deviceTypes,
      registerPlatformAccessories: (_plugin: string, _platform: string, accessories: any[]) => {
        registered.push(...accessories)
      },
      updateAccessoryState: vi.fn(),
    },
  } as unknown as API

  return { api, registered }
}

const SENSOR_TYPES = [
  'contact',
  'occupancy',
  'motion',
  'smoke',
  'monoxide',
  'leak',
  'light',
  'humidity',
  'dioxide',
  'air',
  'temperature',
]

describe('matterSensor declared clusters', () => {
  it.each(SENSOR_TYPES)('%s declares exactly the cluster setState writes to', (sensorType) => {
    const { api, registered } = fakeApi()
    const sensor = new MatterSensor({ api, sensorType, log: { warn: vi.fn() } } as any)
    const info = MatterSensor.getMatterInfo(api, sensorType)

    sensor.configure({ displayName: `${sensorType} sensor` } as PlatformAccessory)

    expect(registered).toHaveLength(1)
    const clusters = registered[0].clusters as Record<string, Record<string, unknown>>

    // No second, misspelled cluster alongside the real one.
    expect(Object.keys(clusters)).toEqual([info.cluster])
    // And the attribute setState writes is one the declaration actually sets.
    expect(Object.keys(clusters[info.cluster])).toContain(info.attribute)
  })

  it('writes its state to the cluster it declared', async () => {
    const { api, registered } = fakeApi()
    const sensor = new MatterSensor({ api, sensorType: 'motion', log: { warn: vi.fn() } } as any)

    sensor.configure({ displayName: 'Plugin Update' } as PlatformAccessory)
    sensor.setState(true)

    const declaredCluster = Object.keys(registered[0].clusters)[0]
    expect((api as any).matter.updateAccessoryState).toHaveBeenCalledWith(
      registered[0].UUID,
      declaredCluster,
      { occupancy: { occupied: true } },
    )
  })
})
