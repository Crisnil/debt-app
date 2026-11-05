import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { HomeView } from './DashboardPage'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

function renderHome(workbook: Workbook = base, today = '2030-01-21') {
  return render(
    <MemoryRouter>
      <HomeView sheetId="s" workbook={workbook} today={today} />
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('greets by name and shows the two actions', () => {
    renderHome({ ...base, settings: { ...base.settings, display_name: { value: 'Sample', row: 9 } } })
    expect(screen.getByText('👋 Welcome Sample!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Add expense' })).toHaveAttribute('href', '/add')
    expect(screen.getByRole('link', { name: '+ Add savings' })).toHaveAttribute('href', '/add/other?type=save')
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

  it('shows what we have, with savings and spendable now', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'What we have' })).toBeInTheDocument()
    expect(screen.getByText(/Spendable now/)).toBeInTheDocument()
    expect(screen.getByText('Piggy Bank · savings')).toBeInTheDocument()
  })

  it('shows what we owe, the next due item, and this month', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'What we owe' })).toBeInTheDocument()
    expect(screen.getByText('Next due').closest('a')).toHaveAttribute('href', '/cards/alpha?tab=pay')
    expect(screen.getByText('Income (plan)')).toBeInTheDocument()
    expect(screen.getByText('Interest (est.)')).toBeInTheDocument()
  })
})
