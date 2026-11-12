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

const purchases = () => within(screen.getByRole('heading', { name: /^Purchases/ }).parentElement!).getAllByRole('listitem')

describe('Spending page', () => {
  it('shows every purchase this month once, with the total', () => {
    renderSpending()
    // Cafe 150 + Pharmacy 800 + Grocer 2,500.25 (logged and on statement) + Fuel 1,200 (statement only).
    expect(screen.getByText('₱4,650.25')).toBeInTheDocument()
    expect(purchases()).toHaveLength(4)
    expect(screen.getByText('Sample Grocer').nextSibling).toHaveTextContent('Jan 3 · Grocery · Alpha · logged · on statement ✓')
  })

  it('filters by paid from', async () => {
    renderSpending()
    await userEvent.selectOptions(screen.getByLabelText('Paid from'), 'alpha')
    expect(purchases()).toHaveLength(2)
    expect(screen.getByText('₱3,300.25')).toBeInTheDocument()
  })

  it('shows budget vs actual and filters by a tapped category', async () => {
    renderSpending()
    const grocery = screen.getByRole('button', { name: /Grocery/ })
    expect(grocery).toHaveTextContent('₱2,500.25 of ₱13,000.00')
    await userEvent.click(grocery)
    expect(purchases()).toHaveLength(1)
    expect(screen.getByLabelText('Category')).toHaveValue('Grocery')
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(purchases()).toHaveLength(4)
  })

  it('shows an empty month', async () => {
    renderSpending('2030-03-02')
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Month'), '2030-01')
    expect(purchases()).toHaveLength(4)
  })

  it('compares the month with the Plan total', async () => {
    renderSpending('2030-01-21', { ...base, plannedExpenses: [{ itemId: 'g', name: 'Grocery', amount: 1000000, active: true, payableId: '', row: 2 }] })
    expect(screen.getByText(/of the Plan/)).toHaveTextContent('47% of the Plan (₱10,000.00 for the month) · ₱5,349.75 left')
    await userEvent.selectOptions(screen.getByLabelText('Paid from'), 'alpha')
    expect(screen.queryByText(/of the Plan/)).not.toBeInTheDocument()
  })
})
