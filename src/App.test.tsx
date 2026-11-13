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
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
  })

  it('opens Transactions from the nav, and from old Spending links', async () => {
    renderAt('/spending')
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions')
    expect(screen.queryByRole('link', { name: 'Spending' })).not.toBeInTheDocument()
  })

  it('opens the + menu with three actions, closes it with Escape, and hides the button on the Add page', async () => {
    renderAt('/')
    const plus = screen.getByRole('button', { name: 'Add' })
    expect(plus).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(plus)
    expect(screen.getByRole('button', { name: 'Close add menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Money received' })).toHaveAttribute('href', '/add/other?type=received')
    expect(screen.getByRole('link', { name: 'Add savings' })).toHaveAttribute('href', '/add/other?type=save')
    expect(screen.getByRole('link', { name: 'Move money' })).toHaveAttribute('href', '/add/other?type=move')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'Money received' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('link', { name: 'Add expense' }))
    expect(screen.getByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('sends old statement links to the card page', () => {
    renderAt('/reconcile/alpha')
    expect(screen.getByRole('heading', { name: 'Card' })).toBeInTheDocument()
  })

  it('redirects unknown paths to the dashboard', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
