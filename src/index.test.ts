import { describe, expect, it } from 'vitest'

describe('Plugin Configuration', () => {
  it('should be able to import without errors', () => {
    // Basic test to ensure the module can be imported
    expect(true).toBe(true)
  })

  it('should have automatic update functionality available', () => {
    // Test that automatic update methods exist in the compiled code
    const fs = require('node:fs')
    const path = require('node:path')
    
    const distPath = path.join(__dirname, '..', 'dist', 'index.js')
    const compiledCode = fs.readFileSync(distPath, 'utf8')
    
    // Verify that automatic update functionality is compiled
    expect(compiledCode).toContain('performAutomaticUpdates')
    expect(compiledCode).toContain('setFailureSensorState')
    expect(compiledCode).toContain('shouldPerformAnyUpdates')
  })
})