import { describe, expect, it } from 'vitest'

import { normalizeHttpUrl } from './safe-url'

describe('normalizeHttpUrl', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', '/relative'])('rejects unsafe URL %s', (url) => {
    expect(normalizeHttpUrl(url)).toBeNull()
  })

  it('accepts absolute HTTP URLs', () => {
    expect(normalizeHttpUrl('https://example.com/catalog')).toBe('https://example.com/catalog')
  })
})
