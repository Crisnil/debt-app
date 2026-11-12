import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { mergeOutbox, readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import { accountBalances } from '../../domain/balances'
import { spendingItems } from '../../domain/reconcile'
import type { Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { BalancesView } from './BalancesPage'

const HEADER = ['check_id', 'created_at', 'date', 'account_id', 'balance', 'count_difference', 'note']
const withTab = (rows: (string | number | boolean)[][] = []) =>
  parseWorkbook('Sample', [...fixtureTabs, 'BalanceChecks'], { ...fixtureValues, BalanceChecks: [HEADER, ...rows] })

function renderBalances(workbook: Workbook) {
  return render(
    <MemoryRouter>
      <BalancesView sheetId="s" workbook={workbook} today="2030-01-21" />
    </MemoryRouter>,
  )
}

describe('Check balances', () => {
  beforeEach(() => localStorage.clear())

  it('asks for Update sheet when the tab is missing', () => {
    renderBalances(parseWorkbook('Sample', fixtureTabs, fixtureValues))
    expect(screen.getByText(/Update sheet first/)).toBeInTheDocument()
  })

  it('treats the first check as a new starting balance', async () => {
    renderBalances(withTab())
    // Cash in the app: 150.
    await userEvent.type(screen.getByLabelText('Real balance of Cash (₱)'), '100')
    expect(screen.getByText('₱50.00 less than the app. Not counted: new starting balance.')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[2])
    const record = readOutbox('s').at(-1)?.record
    expect(record).toMatchObject({ date: '2030-01-21', account_id: 'cash', balance: 100, count_difference: false })
    const wb = mergeOutbox(withTab(), readOutbox('s'))
    expect(accountBalances(wb).find((b) => b.account.accountId === 'cash')?.balance).toBe(10000)
    expect(spendingItems(wb).some((i) => i.source === 'check')).toBe(false)
  })

  it('counts a lower balance after an earlier check, and a higher savings balance only updates it', async () => {
    renderBalances(withTab([['c1', '2030-01-02T00:00:00Z', '2030-01-01', 'cash', 200, false, '']]))
    await userEvent.type(screen.getByLabelText('Real balance of Cash (₱)'), '120')
    expect(screen.getByText('₱30.00 less than the app: counted as Not recorded spending.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Real balance of Piggy Bank (₱)'), '5,210.50')
    expect(screen.getByText(/₱10.50 more than the app/)).toBeInTheDocument()
  })

  it('lists past checks', () => {
    renderBalances(withTab([['c1', '2030-01-02T00:00:00Z', '2030-01-13', 'cash', 0, true, '']]))
    expect(screen.getByRole('heading', { name: 'Past checks' })).toBeInTheDocument()
    expect(screen.getByText('₱50.00 less than the app: counted as Not recorded spending.')).toBeInTheDocument()
  })
})
