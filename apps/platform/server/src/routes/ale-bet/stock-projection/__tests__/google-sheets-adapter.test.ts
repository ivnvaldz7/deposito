import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { StockProjectionSnapshot } from '../snapshot'
import type { StockProjectionSheetAdapter, StockProjectionSheetConfig } from '../sheet-adapter'
import { validateSheetConfig } from '../sheet-adapter'

const googleMocks = vi.hoisted(() => ({
  mockUpdate: vi.fn().mockResolvedValue({ data: {} }),
  mockClear: vi.fn().mockResolvedValue({ data: {} }),
  mockGet: vi.fn().mockResolvedValue({
    data: { sheets: [{ properties: { title: 'Stock', sheetId: 1 } }] },
  }),
  mockBatchUpdate: vi.fn().mockResolvedValue({ data: { replies: [{ addSheet: { properties: { sheetId: 2, title: 'NewSheet' } } }] } }),
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: class MockGoogleAuth {
        constructor() {}
      },
    },
    sheets: vi.fn().mockImplementation(() => ({
      spreadsheets: {
        get: googleMocks.mockGet,
        update: googleMocks.mockUpdate,
        values: {
          update: googleMocks.mockUpdate,
          batchClear: googleMocks.mockClear,
        },
        batchUpdate: googleMocks.mockBatchUpdate,
      },
    })),
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({ type: 'service_account', project_id: 'test', private_key: 'key', client_email: 'test@project.iam.gserviceaccount.com' })),
}))

function fakeAdapter(): StockProjectionSheetAdapter & { calls: StockProjectionSnapshot[] } {
  const calls: StockProjectionSnapshot[] = []
  return {
    calls,
    async writeSnapshot(snapshot) {
      calls.push(snapshot)
    },
  }
}

describe('validateSheetConfig', () => {
  it('returns enabled=false when GOOGLE_SHEETS_ENABLED is absent or false', () => {
    expect(validateSheetConfig({})).toEqual({ enabled: false })
    expect(validateSheetConfig({ GOOGLE_SHEETS_ENABLED: 'false' })).toEqual({ enabled: false })
    expect(validateSheetConfig({ GOOGLE_SHEETS_ENABLED: 'FALSE' })).toEqual({ enabled: false })
  })

  it('returns full config when all variables are present and enabled=true', () => {
    const config = validateSheetConfig({
      GOOGLE_SHEETS_ENABLED: 'true',
      GOOGLE_SHEETS_SPREADSHEET_ID: 'ssid',
      GOOGLE_SHEETS_SHEET_NAME: 'Stock',
      GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE: '/path/to/sa.json',
    })
    expect(config).toEqual({
      enabled: true,
      spreadsheetId: 'ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/path/to/sa.json',
    })
  })

  it('throws listing missing variables when enabled=true but config incomplete', () => {
    expect(() => validateSheetConfig({ GOOGLE_SHEETS_ENABLED: 'true' })).toThrow(/GOOGLE_SHEETS_SPREADSHEET_ID/)
    expect(() => validateSheetConfig({
      GOOGLE_SHEETS_ENABLED: 'true',
      GOOGLE_SHEETS_SPREADSHEET_ID: 'x',
    })).toThrow(/GOOGLE_SHEETS_SHEET_NAME.*GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE/)
  })
})

describe('Fake adapter — contract tests', () => {
  let adapter: ReturnType<typeof fakeAdapter>
  beforeEach(() => { adapter = fakeAdapter() })

  const emptySnapshot: StockProjectionSnapshot = { productoTerminado: [], sinAcondicionar: [] }
  const fullSnapshot: StockProjectionSnapshot = {
    productoTerminado: [
      { producto: 'AMANTINA 500 ML', lote: 'PL0615', total: 2400 },
      { producto: 'AMANTINA PREMIUM 100 ML', lote: 'PL0616', total: 1200 },
    ],
    sinAcondicionar: [
      { producto: 'TILCOSAN 100 ML', lote: 'T1', total: 800 },
    ],
  }

  it('A: empty snapshot writes with no data rows', async () => {
    await adapter.writeSnapshot(emptySnapshot)
    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]).toEqual(emptySnapshot)
  })

  it('B: tables go to distinct ranges', async () => {
    await adapter.writeSnapshot(fullSnapshot)
    expect(adapter.calls[0].productoTerminado).toHaveLength(2)
    expect(adapter.calls[0].sinAcondicionar).toHaveLength(1)
    expect(adapter.calls[0].productoTerminado[0]!.producto).toBe('AMANTINA 500 ML')
    expect(adapter.calls[0].sinAcondicionar[0]!.producto).toBe('TILCOSAN 100 ML')
  })

  it('C: TOTAL is a number, not a string', async () => {
    await adapter.writeSnapshot(fullSnapshot)
    for (const row of adapter.calls[0].productoTerminado) {
      expect(typeof row.total).toBe('number')
    }
    for (const row of adapter.calls[0].sinAcondicionar) {
      expect(typeof row.total).toBe('number')
    }
  })

  it('D: input order is preserved', async () => {
    await adapter.writeSnapshot(fullSnapshot)
    expect(adapter.calls[0].productoTerminado.map((r) => r.lote)).toEqual(['PL0615', 'PL0616'])
  })

  it('E: shorter snapshot replaces previous one', async () => {
    await adapter.writeSnapshot(fullSnapshot)
    await adapter.writeSnapshot(emptySnapshot)
    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[1]).toEqual(emptySnapshot)
  })

  it('F: two identical writes are idempotent', async () => {
    await adapter.writeSnapshot(fullSnapshot)
    await adapter.writeSnapshot(fullSnapshot)
    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[0]).toEqual(adapter.calls[1])
  })
})

describe('createGoogleSheetsAdapter', () => {
  it('G: enabled=false returns adapter that throws on write', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({ enabled: false })
    await expect(adapter.writeSnapshot({ productoTerminado: [], sinAcondicionar: [] }))
      .rejects.toThrow('Google Sheets está deshabilitado')
  })

  it('H: enabled=true with missing config throws on construction', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    expect(() => createGoogleSheetsAdapter({ enabled: true }))
      .toThrow('Configuración de Google Sheets incompleta')
  })

  it('K: adapter does not expose format operations', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({ enabled: false })
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))
    const ownKeys = Object.keys(adapter)
    const all = [...proto, ...ownKeys]
    expect(all.every((key) => !key.toLowerCase().includes('format'))).toBe(true)
    expect(all.every((key) => !key.toLowerCase().includes('dimension'))).toBe(true)
  })
})

describe('Google Sheets integration (mocked googleapis)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    googleMocks.mockGet.mockResolvedValue({
      data: { sheets: [{ properties: { title: 'Stock', sheetId: 1 } }] },
    })
  })

  it('I: creates sheet if not found, then writes snapshot', async () => {
    googleMocks.mockGet.mockResolvedValueOnce({ data: { sheets: [] } })
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({
      enabled: true,
      spreadsheetId: 'test-ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/tmp/sa.json',
    })
    const snapshot: StockProjectionSnapshot = {
      productoTerminado: [{ producto: 'A', lote: 'L1', total: 10 }],
      sinAcondicionar: [],
    }
    await adapter.writeSnapshot(snapshot)
    expect(googleMocks.mockBatchUpdate).toHaveBeenCalledOnce()
    expect(googleMocks.mockUpdate).toHaveBeenCalled()
  })

  it('J: does not recreate sheet when found', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({
      enabled: true,
      spreadsheetId: 'test-ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/tmp/sa.json',
    })
    await adapter.writeSnapshot({ productoTerminado: [], sinAcondicionar: [] })
    expect(googleMocks.mockBatchUpdate).not.toHaveBeenCalled()
  })

  it('K: no format operations in any call', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({
      enabled: true,
      spreadsheetId: 'test-ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/tmp/sa.json',
    })
    await adapter.writeSnapshot({
      productoTerminado: [{ producto: 'X', lote: 'L1', total: 5 }],
      sinAcondicionar: [],
    })
    const allCalls = [
      ...googleMocks.mockUpdate.mock.calls,
      ...googleMocks.mockClear.mock.calls,
      ...googleMocks.mockBatchUpdate.mock.calls,
      ...googleMocks.mockGet.mock.calls,
    ]
    const serialized = JSON.stringify(allCalls)
    expect(serialized).not.toContain('deleteSheet')
    expect(serialized).not.toContain('repeatCell')
    expect(serialized).not.toContain('updateDimensionProperties')
    expect(serialized).not.toContain('format')
  })

  it('E: clear is called before write (no stale rows)', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({
      enabled: true,
      spreadsheetId: 'test-ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/tmp/sa.json',
    })
    await adapter.writeSnapshot({
      productoTerminado: [{ producto: 'A', lote: 'L1', total: 10 }],
      sinAcondicionar: [],
    })
    const clearIndex = googleMocks.mockClear.mock.invocationCallOrder[0]
    const writeIndex = googleMocks.mockUpdate.mock.invocationCallOrder[0]
    expect(clearIndex).toBeLessThan(writeIndex)
  })

  it('clear range covers exactly rows 3–1002 (1000 managed rows)', async () => {
    const { createGoogleSheetsAdapter } = await import('../google-sheets-adapter')
    const adapter = createGoogleSheetsAdapter({
      enabled: true,
      spreadsheetId: 'test-ssid',
      sheetName: 'Stock',
      serviceAccountFile: '/tmp/sa.json',
    })
    await adapter.writeSnapshot({
      productoTerminado: [{ producto: 'A', lote: 'L1', total: 10 }],
      sinAcondicionar: [],
    })
    const clearCall = googleMocks.mockClear.mock.calls[0]![0]
    const ranges: string[] = clearCall.requestBody.ranges
    expect(ranges).toContain('Stock!A3:C1002')
    expect(ranges).toContain('Stock!E3:G1002')
    expect(ranges).not.toContain('Stock!A3:C1003')
    expect(ranges).not.toContain('Stock!A3:C1000')
    expect(ranges).not.toContain('Stock!E3:G1003')
    expect(ranges).not.toContain('Stock!E3:G1000')
  })
})
