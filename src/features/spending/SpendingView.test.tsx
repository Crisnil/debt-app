import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../../data/workbook'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import type { Workbook } from '../../domain/types'
import { SpendingView } from './SpendingPage'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

function renderSpending(today = '2030-01-21', workbook: Workbook = base) {
  return render(
    <MemoryRouter>
      <SpendingView workbook={workbook} today={today} />
    </MemoryRouter>,
  )
}

const rows = () => within(screen.getByRole('heading', { level: 2, name: /^(All entries|Purchases|Money in|Moves|Card payments)/ }).parentElement!).getAllByRole('listitem')
const purchases = () => rows().filter((li) => within(li).getByRole('button').getAttribute('aria-label')!.endsWith('correct or void'))
const totals = () => screen.getByLabelText('Month totals')

describe('Transactions page', () => {
  it('lists purchases, money in, moves, and card payments of the month, newest first', () => {
    renderSpending()
    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument()
    // 4 purchases + salary + 2 moves + 3 card payments.
    expect(rows()).toHaveLength(10)
    expect(purchases()).toHaveLength(4)
    expect(screen.getByText('Sample Grocer').nextSibling).toHaveTextContent('Jan 3 · Grocery · Alpha · logged · on statement ✓')
    expect(screen.getByText('Payroll → Piggy Bank').nextSibling).toHaveTextContent('Jan 14 · Move')
    expect(screen.getByText('Salary').nextSibling).toHaveTextContent('Jan 14 · Money in · to Payroll')
    expect(screen.getByRole('button', { name: 'Salary ₱20,000.00: details' })).toHaveTextContent('+₱20,000.00')
    const dates = rows().map((li) => li.textContent!.match(/Jan (\d+)/)![1]).map(Number)
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('shows spent (purchases only) and the month totals of the other kinds', () => {
    renderSpending()
    // Cafe 150 + Pharmacy 800 + Grocer 2,500.25 (logged and on statement) + Fuel 1,200 (statement only).
    expect(screen.getByText('₱4,650.25')).toBeInTheDocument()
    expect(totals()).toHaveTextContent('Money in ₱20,000.00 · Moved ₱400.00 · Card payments ₱3,199.75')
  })

  it('filters by type', async () => {
    renderSpending()
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'move')
    expect(rows()).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 2, name: /^Moves/ })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'payment')
    expect(rows()).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(rows()).toHaveLength(10)
  })

  it('filters by account on either side of a move, and splits moves in and out', async () => {
    renderSpending()
    await userEvent.selectOptions(screen.getByLabelText('Account'), 'piggy')
    // Payroll → Piggy Bank (in) and Piggy Bank → Cash (out).
    expect(rows()).toHaveLength(2)
    expect(totals()).toHaveTextContent('Moved in ₱300.00 · Moved out ₱100.00')
    await userEvent.selectOptions(screen.getByLabelText('Account'), 'alpha')
    // 2 purchases on Alpha + 2 payments to Alpha.
    expect(purchases()).toHaveLength(2)
    expect(rows()).toHaveLength(4)
    expect(screen.getByText('₱3,300.25')).toBeInTheDocument()
  })

  it('shows budget vs actual and shows only the purchases of a tapped category', async () => {
    renderSpending()
    const grocery = screen.getByRole('button', { name: /Grocery/ })
    expect(grocery).toHaveTextContent('₱2,500.25 of ₱13,000.00')
    await userEvent.click(grocery)
    expect(rows()).toHaveLength(1)
    expect(screen.getByLabelText('Category')).toHaveValue('Grocery')
    expect(screen.getByLabelText('Type')).toHaveValue('purchase')
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(rows()).toHaveLength(10)
  })

  it('shows an empty month', async () => {
    renderSpending('2030-03-02')
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Month'), '2030-01')
    expect(rows()).toHaveLength(10)
  })

  it('compares the month with the Plan total', async () => {
    renderSpending('2030-01-21', { ...base, plannedExpenses: [{ itemId: 'g', name: 'Grocery', amount: 1000000, active: true, payableId: '', row: 2 }] })
    expect(screen.getByText(/of the Plan/)).toHaveTextContent('47% of the Plan (₱10,000.00 for the month) · ₱5,349.75 left')
    await userEvent.selectOptions(screen.getByLabelText('Account'), 'alpha')
    expect(screen.queryByText(/of the Plan/)).not.toBeInTheDocument()
  })

  it('searches the entries, in the month or in all months', async () => {
    renderSpending()
    await userEvent.type(screen.getByLabelText('Search'), 'pharmacy')
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('1 found in Jan 2030. To look in every month, choose All months.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Search'))
    await userEvent.type(screen.getByLabelText('Search'), 'before opening')
    expect(screen.getByText('0 found in Jan 2030. To look in every month, choose All months.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Month'), '')
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('1 found in all months.')).toBeInTheDocument()
    expect(screen.getByText(/Spent in all months/)).toBeInTheDocument()
  })

  it('starts filtered to the account from the Home card link', () => {
    render(
      <MemoryRouter>
        <SpendingView workbook={base} today="2030-01-21" account="payroll" />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Account')).toHaveValue('payroll')
  })
})
