import { describe, expect, it } from 'vitest'

describe('NCU Filter Generation', () => {
  // Simulate the filter generation logic from the checkNcu method
  function generateFilter(checkHB: boolean, checkHBUI: boolean, checkPlugins: boolean): string {
    const homebridgeFilter = 'homebridge'
    const homebridgeUIFilter = 'homebridge-config-ui-x'
    const pluginsFilter = '(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*'

    const filters: string[] = []
    if (checkHB) filters.push(homebridgeFilter)
    if (checkHBUI) filters.push(homebridgeUIFilter)
    if (checkPlugins) filters.push(pluginsFilter)

    // This is the fix - adding the missing opening parenthesis
    const filter = '/^(' + filters.join('|') + ')$/'
    return filter
  }

  describe('filter generation with correct regex', () => {
    it('should generate correct regex for homebridge only', () => {
      const filter = generateFilter(true, false, false)
      expect(filter).toBe('/^(homebridge)$/')
    })

    it('should generate correct regex for homebridge UI only', () => {
      const filter = generateFilter(false, true, false)
      expect(filter).toBe('/^(homebridge-config-ui-x)$/')
    })

    it('should generate correct regex for plugins only', () => {
      const filter = generateFilter(false, false, true)
      expect(filter).toBe('/^((?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*)$/')
    })

    it('should generate correct regex for all components', () => {
      const filter = generateFilter(true, true, true)
      const expectedFilter = '/^(homebridge|homebridge-config-ui-x|(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*)$/'
      expect(filter).toBe(expectedFilter)
    })

    it('should generate empty filter when no components are checked', () => {
      const filter = generateFilter(false, false, false)
      expect(filter).toBe('/^()$/')
    })

    it('should generate valid regex patterns that can be parsed', () => {
      const filter = generateFilter(true, true, true)

      // Extract the regex pattern from the string
      const regexPattern = filter.slice(2, -2) // Remove '/^' and '$/'
      
      // Test that the regex can be constructed and works correctly
      const regex = new RegExp(`^(${regexPattern})$`)
      
      // Test the regex with expected package names
      expect(regex.test('homebridge')).toBe(true)
      expect(regex.test('homebridge-config-ui-x')).toBe(true)
      expect(regex.test('homebridge-test-plugin')).toBe(true)
      // Note: @scoped packages might not match the complex plugin filter regex,
      // but basic homebridge-* packages should work
      expect(regex.test('some-other-package')).toBe(false)
    })
  })

  describe('comparison with old broken regex', () => {
    function generateBrokenFilter(checkHB: boolean, checkHBUI: boolean, checkPlugins: boolean): string {
      const homebridgeFilter = 'homebridge'
      const homebridgeUIFilter = 'homebridge-config-ui-x'
      const pluginsFilter = '(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*'

      const filters: string[] = []
      if (checkHB) filters.push(homebridgeFilter)
      if (checkHBUI) filters.push(homebridgeUIFilter)
      if (checkPlugins) filters.push(pluginsFilter)

      // This was the bug - missing opening parenthesis
      const filter = '/^' + filters.join('|') + ')$/'
      return filter
    }

    it('broken regex should be malformed', () => {
      const brokenFilter = generateBrokenFilter(true, true, true)
      const fixedFilter = generateFilter(true, true, true)
      
      expect(brokenFilter).toBe('/^homebridge|homebridge-config-ui-x|(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*)$/')
      expect(fixedFilter).toBe('/^(homebridge|homebridge-config-ui-x|(?=(@.*\\/)?homebridge-)(?:(?!homebridge-config-ui-x).)*)$/')
      expect(brokenFilter).not.toBe(fixedFilter)
    })

    it('broken regex should fail to parse correctly', () => {
      const brokenFilter = generateBrokenFilter(true, false, false)
      // Remove '/^' and '$/' to get just the pattern
      const brokenPattern = brokenFilter.slice(2, -2)
      
      // This would create an invalid regex: /^homebridge)$/
      expect(() => new RegExp(`^${brokenPattern}$`)).toThrow()
    })
  })
})