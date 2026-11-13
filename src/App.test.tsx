import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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
    await userEvent.click(screen.getByRole('link', { name: 'Stats' }))
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cards' })).not.toBeInTheDocument()
  })

  it.each(['/cards', '/plan'])('opens old %s links on Stats', (path) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument()
  })

  it('marks Stats in the nav on a card page', () => {
    renderAt('/cards/alpha')
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveClass('font-semibold')
  })

  it('opens Transactions from the nav, and from old Spending links', async () => {
    renderAt('/spending')
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions')
    expect(screen.queryByRole('link', { name: 'Spending' })).not.toBeInTheDocument()
  })

  it('opens the + menu with four actions, closes it with Escape, and hides the button on the Add page', async () => {
    renderAt('/')
    const plus = screen.getByRole('button', { name: 'Add' })
    expect(plus).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(plus)
    expect(screen.getByRole('button', { name: 'Close add menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Money in' })).toHaveAttribute('href', '/add?type=in')
    expect(screen.getByRole('link', { name: 'Move money' })).toHaveAttribute('href', '/add?type=move')
    expect(screen.getByRole('link', { name: 'Pay card' })).toHaveAttribute('href', '/add?type=pay')
    expect(screen.queryByRole('link', { name: 'Add savings' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'Money in' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('link', { name: 'Add expense' }))
    expect(screen.getByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it.each([
    ['received', 'Money in'],
    ['income', 'Money in'],
    ['save', 'Move money'],
    ['move', 'Move money'],
  ])('opens old Other entries links (%s) on the Add page', (type, heading) => {
    renderAt(`/add/other?type=${type}`)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('has Bills, Check balances, and Settings under More; Plan is in Stats', () => {
    renderAt('/more')
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: /^Bills/ })).toHaveAttribute('href', '/bills')
    expect(within(main).queryByRole('link', { name: /^Plan/ })).not.toBeInTheDocument()
    expect(within(main).getByRole('link', { name: /^Check balances/ })).toHaveAttribute('href', '/balances')
    expect(within(main).getByRole('link', { name: /^Settings/ })).toHaveAttribute('href', '/settings')
  })

  it('marks More in the bottom bar on a page under More', () => {
    renderAt('/settings')
    expect(screen.getByRole('link', { name: 'More' })).toHaveClass('font-semibold')
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
