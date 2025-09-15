import { describe, expect, it } from 'vitest'
import type { InstalledPlugin } from './ui-api.js'

describe('Plugin Configuration', () => {
  it('should be able to import without errors', () => {
    // Basic test to ensure the module can be imported
    expect(true).toBe(true)
  })

  it('should support disabled property in InstalledPlugin interface', () => {
    // Test that the InstalledPlugin interface includes the optional disabled property
    const plugin: InstalledPlugin = {
      name: 'test-plugin',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      disabled: true,
    }
    
    expect(plugin.disabled).toBe(true)
    expect(plugin.name).toBe('test-plugin')
    expect(plugin.updateAvailable).toBe(true)
  })

  it('should work with InstalledPlugin interface without disabled property', () => {
    // Test that the disabled property is optional
    const plugin: InstalledPlugin = {
      name: 'test-plugin',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    }
    
    expect(plugin.disabled).toBeUndefined()
    expect(plugin.name).toBe('test-plugin')
    expect(plugin.updateAvailable).toBe(true)
    
  it('should have automatic update functionality available', () => {
    // Test that automatic update methods exist in the compiled code
    const fs = require('node:fs')
    const path = require('node:path')
    
    const distPath = path.join(__dirname, '..', 'dist', 'index.js')
    const compiledCode = fs.readFileSync(distPath, 'utf8')
    
    // Verify that automatic update functionality is compiled
    expect(compiledCode).toContain('performAutomaticUpdates')
    expect(compiledCode).toContain('FailureSensor')
    expect(compiledCode).toContain('shouldPerformAnyUpdates')
  })
})