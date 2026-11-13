import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { Workbook } from '../domain/types'
import { SessionProvider } from '../state/session'

/** Renders a form with what the Add page has around it: the session, the loaded sheet, and a router. */
export function renderWithSheet(ui: ReactElement, sheetId: string, workbook: Workbook) {
  localStorage.setItem('debt-app.sheet', JSON.stringify({ id: sheetId, name: 'Sample' }))
  const client = new QueryClient()
  client.setQueryData(['workbook', sheetId], workbook)
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}
