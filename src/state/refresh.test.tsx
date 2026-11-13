import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addTransfer } from '../data/actions'
import { clearOutbox, flushOutbox, readOutbox } from '../data/outbox'
import { loadWorkbook, parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { useRefresh } from './hooks'
import { SessionProvider } from './session'

vi.mock('../google/auth', async (original) => ({
  ...(await original<typeof import('../google/auth')>()),
  currentToken: () => 'tok',
}))

vi.mock('../data/outbox', async (original) => {
  const actual = await original<typeof import('../data/outbox')>()
  return { ...actual, flushOutbox: vi.fn(async () => 0) }
})

vi.mock('../data/workbook', async (original) => {
  const actual = await original<typeof import('../data/workbook')>()
  return { ...actual, loadWorkbook: vi.fn(async () => actual.parseWorkbook('Sample', fixtureTabs, fixtureValues)) }
})

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

function setup() {
  localStorage.setItem('debt-app.sheet', JSON.stringify({ id: 's', name: 'Sample' }))
  const client = new QueryClient()
  client.setQueryData(['workbook', 's'], base)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
  return renderHook(() => useRefresh(), { wrapper })
}

describe('refresh balances', () => {
  beforeEach(() => {
    localStorage.clear()
    clearOutbox('s')
    vi.clearAllMocks()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  it('sends waiting entries, reloads the sheet, and says when', async () => {
    const { result } = setup()
    act(() => void addTransfer('s', { date: '2030-01-21', fromAccount: 'payroll', toAccount: 'cash', amount: 5000, note: '' }))
    expect(result.current.pending).toBe(1)
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.updatedAt).not.toBeNull())
    expect(flushOutbox).toHaveBeenCalledWith('s', base.headers, 'tok')
    expect(loadWorkbook).toHaveBeenCalledWith('s', 'tok')
    expect(result.current.error).toBeNull()
    expect(readOutbox('s')).toHaveLength(1) // flushOutbox is mocked: the entry is still waiting
  })

  it('only reloads the sheet when nothing is waiting', async () => {
    const { result } = setup()
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.updatedAt).not.toBeNull())
    expect(flushOutbox).not.toHaveBeenCalled()
    expect(loadWorkbook).toHaveBeenCalled()
  })

  it('says so when offline, and does not reload', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = setup()
    act(() => result.current.refresh())
    expect(result.current.error).toBe('You are offline. Balances show what is saved on this phone.')
    expect(loadWorkbook).not.toHaveBeenCalled()
  })

  it('shows the problem when the sheet does not load', async () => {
    vi.mocked(loadWorkbook).mockRejectedValueOnce(new Error('The sheet could not be loaded.')).mockRejectedValueOnce(new Error('The sheet could not be loaded.')).mockRejectedValueOnce(new Error('The sheet could not be loaded.'))
    const { result } = setup()
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.error).toBe('The sheet could not be loaded.'), { timeout: 5000 })
    expect(result.current.updatedAt).toBeNull()
  })
})
