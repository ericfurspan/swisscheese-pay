import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest.config.ts doesn't set `test.globals: true`, so Testing Library's
// automatic afterEach(cleanup) (which only registers when it detects a
// global afterEach) never fires -- do it explicitly, or DOM nodes leak
// between tests in the same file.
afterEach(() => {
  cleanup()
})
