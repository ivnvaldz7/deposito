import { expect, vi } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

// Mock EventSource for jsdom (not implemented by jsdom)
vi.stubGlobal('EventSource', vi.fn().mockImplementation(() => ({
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onmessage: null,
  onopen: null,
  onerror: null,
  readyState: 0,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
  url: '',
  withCredentials: false,
})))
