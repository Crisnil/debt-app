import { render, screen, within } from '@testing-library/react'
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
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('shows alerts behind the bell: bills due soon with Pay, and the count', async () => {
    renderHome(base, '2030-01-29')
    const bell = screen.getByRole('button', { name: /^Alerts \(\d+\)$/ })
    expect(screen.queryByRole('dialog', { name: 'Alerts' })).not.toBeInTheDocument()
    await userEvent.click(bell)
    expect(within(screen.getByRole('dialog', { name: 'Alerts' })).getByRole('link', { name: 'Pay Alpha' })).toHaveAttribute('href', '/add?type=pay&card=alpha')
  })

  it('says so behind the bell when there is nothing to see', async () => {
    renderHome({ ...base, cards: [], payables: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Alerts' }))
    expect(screen.getByText('No alerts ✓')).toBeInTheDocument()
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

  it('shows swipe cards: spendable now, each account (Debit, then Cash), then each credit card', () => {
    renderHome()
    const cards = within(screen.getByRole('heading', { name: 'Accounts and cards' }).nextElementSibling as HTMLElement).getAllByRole('listitem')
    expect(cards.map((c) => c.textContent!.split('₱')[0])).toEqual(['Spendable now', 'Payroll · Debit', 'Piggy Bank · Debitsavings goal', 'Cash · Cash', 'Alpha · Credit', 'Beta · Credit'])
    expect(cards[0]).toHaveTextContent(/Savings goal ₱5,200\.00 · Total/)
    expect(cards[2]).toHaveTextContent('₱5,200.00')
  })

  it('opens an account card on its transactions, Update balance on its balance check, and a credit card on its page', () => {
    renderHome()
    expect(screen.getByRole('link', { name: 'Payroll · Debit' })).toHaveAttribute('href', '/transactions?account=payroll')
    expect(screen.getByRole('link', { name: 'Update balance of Payroll' })).toHaveAttribute('href', '/balances?account=payroll')
    expect(screen.getByRole('link', { name: 'Alpha · Credit' })).toHaveAttribute('href', '/cards/alpha')
  })

  it('charts spent vs moved to savings per month, with this month selected', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'Spent vs saved' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jan 2030: spent ₱4,650.25, moved to savings ₱200.00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Jan 2030 (so far)')).toBeInTheDocument()
    // Due next and This month are gone: due bills are behind the bell, balances are on the cards.
    expect(screen.queryByRole('heading', { name: 'Due next' })).not.toBeInTheDocument()
    expect(screen.queryByText('Income (plan)')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What we owe' })).not.toBeInTheDocument()
  })

  it('shows another month of the chart on tap', async () => {
    renderHome()
    await userEvent.click(screen.getByRole('button', { name: /^Dec 2029:/ }))
    expect(screen.getByText('Dec 2029')).toBeInTheDocument()
  })

  it('lists the 5 newest transactions of every kind, with View all', () => {
    renderHome()
    const recent = screen.getByRole('heading', { name: 'Recent transactions' }).closest('div')!.parentElement!
    expect(within(recent).getAllByRole('listitem')).toHaveLength(5)
    expect(within(recent).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/transactions')
  })

  it('says so when there are no transactions yet', () => {
    renderHome({ ...base, transfers: [], payments: [], incomeLog: [], transactions: [], lines: [] })
    expect(screen.getByText('Nothing yet. Add one with the + button.')).toBeInTheDocument()
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

  it('shows the first steps for a new sheet, and hides them on request', async () => {
    localStorage.clear()
    const fresh: Workbook = { ...base, accounts: base.accounts.filter((a) => a.type === 'cash'), cards: [], incomeSources: [], settings: {} }
    renderHome(fresh)
    expect(screen.getByRole('heading', { name: 'Get started · 0 of 4 done' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your salary' })).toHaveAttribute('href', '/settings')
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('heading', { name: /Get started/ })).not.toBeInTheDocument()
  })

  it('does not show the first steps for a sheet in use', () => {
    renderHome()
    expect(screen.queryByRole('heading', { name: /Get started/ })).not.toBeInTheDocument()
  })
})

