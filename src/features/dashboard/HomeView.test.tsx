import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import type { RefreshState } from '../../state/hooks'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { HomeView } from './DashboardPage'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

function renderHome(workbook: Workbook = base, today = '2030-01-21', refresh?: RefreshState) {
  return render(
    <MemoryRouter>
      <HomeView sheetId="s" workbook={workbook} today={today} refresh={refresh} />
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('greets by name; adding is on the + button only', () => {
    renderHome({ ...base, settings: { ...base.settings, display_name: { value: 'Sample', row: 9 } } })
    expect(screen.getByText('👋 Welcome Sample!')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Add expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Add savings' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Check balances' })[0]).toHaveAttribute('href', '/balances')
  })

  it('compares what we owe with savings, with details on request', async () => {
    renderHome()
    expect(screen.getByRole('img', { name: 'Owed ₱10,799.25, savings ₱5,200.00' })).toBeInTheDocument()
    expect(screen.getByText('Savings cover 48% of what we owe')).toBeInTheDocument()
    // The fixture's last installment is on the Apr 2030 bill and nothing is carried.
    expect(screen.getByRole('link', { name: 'Debt-free Apr 2030 (3 months)' })).toHaveAttribute('href', '/plan')
    await userEvent.click(screen.getByRole('button', { name: '▸ Show details' }))
    expect(screen.getByText('Savings · Piggy Bank')).toBeInTheDocument()
  })

  it('says so when savings are more than what we owe', () => {
    renderHome({ ...base, accounts: base.accounts.map((a) => (a.accountId === 'piggy' ? { ...a, openingBalance: 5000000 } : a)) })
    expect(screen.getByText('✓ Savings are more than what we owe')).toBeInTheDocument()
  })

  it('reminds about a payday that is not recorded and records it in one tap', async () => {
    localStorage.clear()
    renderHome(base, '2030-01-29')
    expect(screen.getByText(/Not recorded yet/)).toHaveTextContent('▲ Not recorded yet: Salary ₱20,000.00 → Payroll (Jan 28)')
    await userEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(readOutbox('s').at(-1)?.record).toMatchObject({ date: '2030-01-28', source_id: 'salary', type: 'salary', amount: 20000, to_account: 'payroll' })
  })

  it('reminds to check the balances of accounts not checked this month', () => {
    const wb = parseWorkbook('Sample', [...fixtureTabs, 'BalanceChecks'], {
      ...fixtureValues,
      BalanceChecks: [['check_id', 'created_at', 'date', 'account_id', 'balance', 'count_difference', 'note'], ['c1', '', '2030-01-13', 'cash', 0, true, '']],
    })
    renderHome(wb)
    expect(screen.getByText(/Not checked this month/)).toHaveTextContent('Not checked this month: Payroll, Piggy Bank · Check now')
    expect(screen.getByRole('link', { name: 'Check now' })).toHaveAttribute('href', '/balances')
  })

  it('shows what we have, grouped Debit and Cash, with savings goal and spendable now', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'What we have' })).toBeInTheDocument()
    expect(screen.getByText(/Savings goal: .* Spendable now/)).toBeInTheDocument()
    expect(screen.getByText('Piggy Bank · savings goal')).toBeInTheDocument()
    expect(screen.getByText('Debit')).toBeInTheDocument()
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(1) // the group heading and the account
  })

  it('shows what we owe, the next due item, and this month', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'What we owe' })).toBeInTheDocument()
    expect(screen.getByText('Next due').closest('a')).toHaveAttribute('href', '/cards/alpha?tab=pay')
    expect(screen.getByText('Income (plan)')).toBeInTheDocument()
    expect(screen.getByText('Interest (est.)')).toBeInTheDocument()
  })

  it('refreshes the balances with the ↻ button, and shows when and what is waiting', async () => {
    const refresh: RefreshState = { refresh: vi.fn(), busy: false, error: null, updatedAt: new Date('2030-01-21T09:41:00'), pending: 2 }
    renderHome(base, '2030-01-21', refresh)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh balances' }))
    expect(refresh.refresh).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/Updated 9:41\sAM · 2 entries waiting to send/)
  })

  it('spins and disables the button while refreshing, and shows a problem', () => {
    renderHome(base, '2030-01-21', { refresh: vi.fn(), busy: true, error: 'You are offline. Balances show what is saved on this phone.', updatedAt: null, pending: 0 })
    expect(screen.getByRole('button', { name: 'Refresh balances' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…You are offline. Balances show what is saved on this phone.')
  })
})
