import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import { accountBalances, savedInMonth } from '../../domain/balances'
import { spendingItems } from '../../domain/reconcile'
import type { Transfer, Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { MoveMoneyForm } from './MoveMoneyForm'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

describe('Move money', () => {
  beforeEach(() => localStorage.clear())

  it('starts from savings to Cash, and says that taking money out of savings lowers saved this month', async () => {
    render(<MoveMoneyForm sheetId="mv" workbook={base} />)
    expect(screen.getByRole('group', { name: 'From' }).querySelector('[aria-pressed="true"]')).toHaveTextContent('Piggy Bank')
    expect(screen.getByRole('group', { name: 'To' }).querySelector('[aria-pressed="true"]')).toHaveTextContent('Cash')
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '500')
    expect(screen.getByText('Lowers saved this month by ₱500.00. Not spending.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }))
    expect(screen.getByText('Moved ₱500.00 from Piggy Bank to Cash.')).toBeInTheDocument()
    expect(readOutbox('mv')).toContainEqual(expect.objectContaining({ tab: 'Transfers', record: expect.objectContaining({ from_account: 'piggy', to_account: 'cash', amount: 500 }) }))
  })

  it('remembers the last From account and never offers the From account as To', async () => {
    localStorage.setItem('debt-app.last-move-from', 'payroll')
    render(<MoveMoneyForm sheetId="mv2" workbook={base} />)
    expect(screen.getByRole('group', { name: 'From' }).querySelector('[aria-pressed="true"]')).toHaveTextContent('Payroll')
    expect(screen.getByText('Not spending. Log what you buy with it as expenses.')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'From' })).getByRole('button', { name: 'Cash' }))
    expect(screen.getByRole('group', { name: 'To' })).not.toHaveTextContent('Cash')
  })

  it('offers e-wallets in From and To, and says to log what you buy with it as expenses', async () => {
    const wb: Workbook = { ...base, accounts: [...base.accounts, { ...base.accounts[0], accountId: 'gcash', label: 'GCash', type: 'e-wallet', isSavings: false, row: 99 }] }
    render(<MoveMoneyForm sheetId="mv3" workbook={wb} />)
    expect(within(screen.getByRole('group', { name: 'From' })).getByRole('button', { name: 'GCash' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'From' })).getByRole('button', { name: 'Payroll' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'To' })).getByRole('button', { name: 'GCash' }))
    expect(screen.getByText('Not spending. Log what you buy with GCash as expenses paid from GCash.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }))
    expect(readOutbox('mv3')).toContainEqual(expect.objectContaining({ tab: 'Transfers', record: expect.objectContaining({ from_account: 'payroll', to_account: 'gcash', amount: 300 }) }))
  })

  it('a move changes both balances, is not spending, and out of savings lowers saved this month', () => {
    const atm: Transfer = { transferId: 'atm', date: '2030-01-20', fromAccount: 'piggy', toAccount: 'cash', amount: 50000, note: 'ATM' }
    const wb: Workbook = { ...base, transfers: [...base.transfers, atm] }
    const balance = (w: Workbook, id: string) => accountBalances(w).find((b) => b.account.accountId === id)!.balance
    expect(balance(wb, 'piggy')).toBe(balance(base, 'piggy') - 50000)
    expect(balance(wb, 'cash')).toBe(balance(base, 'cash') + 50000)
    expect(spendingItems(wb)).toEqual(spendingItems(base))
    expect(savedInMonth(wb, '2030-01')).toBe(savedInMonth(base, '2030-01') - 50000)
  })
})
