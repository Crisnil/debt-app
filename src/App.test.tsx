import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { SessionProvider } from './state/session'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

describe('App shell', () => {
  beforeEach(() => localStorage.clear())

  it('asks to connect a sheet on first open', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Settings' })).toBeInTheDocument()
  })

  it('asks to sign in when a sheet was chosen before', () => {
    localStorage.setItem('debt-app.sheet', JSON.stringify({ id: 'x', name: 'My Debt Sheet' }))
    renderAt('/')
    expect(screen.getByText('Sign in to load My Debt Sheet.')).toBeInTheDocument()
  })

  it('navigates with the bottom nav', async () => {
    renderAt('/')
    await userEvent.click(screen.getByRole('link', { name: 'Budget' }))
    expect(screen.getByRole('heading', { name: 'Budget' })).toBeInTheDocument()
  })

  it('redirects unknown paths to the dashboard', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
