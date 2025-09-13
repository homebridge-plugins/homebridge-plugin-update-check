import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv'
import { beforeAll, describe, expect, it } from 'vitest'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('config schema validation', () => {
  let schema: any
  let ajv: Ajv

  beforeAll(() => {
    // Load the config schema
    const schemaPath = path.resolve(__dirname, '../config.schema.json')
    const schemaContent = fs.readFileSync(schemaPath, 'utf8')
    const fullSchema = JSON.parse(schemaContent)
    schema = fullSchema.schema

    ajv = new Ajv()
  })

  describe('name field validation', () => {
    it('should accept valid names with letters, numbers, spaces, hyphens, and underscores', () => {
      const validNames = [
        'Plugin Update',
        'PluginUpdate V2',
        'Plugin-Update',
        'Plugin_Update',
        'Update123',
        'My Plugin Name',
        'Plugin-Update_V2 Test',
      ]

      validNames.forEach((name) => {
        const config = {
          name,
          sensorType: 'motion',
          platform: 'PluginUpdate',
        }

        const validate = ajv.compile(schema)
        const valid = validate(config)

        expect(valid, `Expected "${name}" to be valid, but got errors: ${JSON.stringify(validate.errors)}`).toBe(true)
      })
    })

    it('should reject names with periods and other invalid characters', () => {
      const invalidNames = [
        'Plugin Update V2.0', // Period - the reported issue
        'Plugin.Update', // Period
        'Plugin@Update', // @ symbol
        'Plugin#Update', // # symbol
        'Plugin$Update', // $ symbol
        'Plugin%Update', // % symbol
        'Plugin&Update', // & symbol
        'Plugin*Update', // * symbol
        'Plugin+Update', // + symbol
        'Plugin=Update', // = symbol
        'Plugin/Update', // / slash
        'Plugin\\Update', // \ backslash
        'Plugin|Update', // | pipe
        'Plugin<Update>', // < > brackets
        'Plugin[Update]', // [ ] square brackets
        'Plugin{Update}', // { } curly brackets
        'Plugin(Update)', // ( ) parentheses
      ]

      invalidNames.forEach((name) => {
        const config = {
          name,
          sensorType: 'motion',
          platform: 'PluginUpdate',
        }

        const validate = ajv.compile(schema)
        const valid = validate(config)

        expect(valid, `Expected "${name}" to be invalid, but validation passed`).toBe(false)
      })
    })

    it('should reject empty names', () => {
      const config = {
        name: '',
        sensorType: 'motion',
        platform: 'PluginUpdate',
      }

      const validate = ajv.compile(schema)
      const valid = validate(config)

      expect(valid).toBe(false)
    })

    it('should reject names that are too long', () => {
      const longName = 'A'.repeat(65) // 65 characters, exceeds maxLength of 64
      const config = {
        name: longName,
        sensorType: 'motion',
        platform: 'PluginUpdate',
      }

      const validate = ajv.compile(schema)
      const valid = validate(config)

      expect(valid).toBe(false)
    })

    it('should accept names at the maximum length', () => {
      const maxLengthName = 'A'.repeat(64) // Exactly 64 characters
      const config = {
        name: maxLengthName,
        sensorType: 'motion',
        platform: 'PluginUpdate',
      }

      const validate = ajv.compile(schema)
      const valid = validate(config)

      expect(valid).toBe(true)
    })
  })
})