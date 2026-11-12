import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePlannedExpense } from '../../data/actions'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { PlannedExpenses } from './PlannedExpenses'

vi.mock('../../data/actions', async (original) => ({
  ...(await original<typeof import('../../data/actions')>()),
  savePlannedExpense: vi.fn(async () => {}),
}))

vi.mock('../../google/auth', async (original) => ({
  ...(await original<typeof import('../../google/auth')>()),
  currentToken: () => 'tok',
}))

vi.mock('../../data/workbook', async (original) => {
  const actual = await original<typeof import('../../data/workbook')>()
  return { ...actual, loadWorkbook: vi.fn(async () => actual.parseWorkbook('Sample', fixtureTabs, fixtureValues)) }
})

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const wb: Workbook = {
  ...base,
  updates: [],
  plannedExpenses: [
    { itemId: 'g', name: 'Sample grocery', amount: 800000, active: true, payableId: '', row: 2 },
    { itemId: 'n', name: 'Sample internet', amount: 150000, active: true, payableId: '', row: 3 },
  ],
}

function renderPlan() {
  localStorage.setItem('debt-app.sheet', JSON.stringify({ id: 's', name: 'Sample' }))
  const client = new QueryClient()
  client.setQueryData(['workbook', 's'], wb)
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter>
          <PlannedExpenses sheetId="s" workbook={wb} today="2030-01-21" />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

describe('Planned monthly expenses table', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows one row per expense and the total', () => {
    renderPlan()
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Sample grocery')).toBeInTheDocument()
    expect(within(rows[1]).getByText('₱8,000.00')).toBeInTheDocument()
    expect(within(rows.at(-1)!).getByText('Total this month')).toBeInTheDocument()
    expect(within(rows.at(-1)!).getByText('₱9,500.00')).toBeInTheDocument()
  })

  it('adds an expense in a pop-up', async () => {
    renderPlan()
    await userEvent.click(screen.getByRole('button', { name: '+ Add expense' }))
    const dialog = screen.getByRole('dialog', { name: 'Add planned expense' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sample water')
    await userEvent.type(within(dialog).getByLabelText('Per month (₱)'), '600')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to the plan' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Added Sample water.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('debt-app.outbox.s')!)).toContainEqual(
      expect.objectContaining({ record: expect.objectContaining({ name: 'Sample water', amount: 600 }) }),
    )
  })

  it('edits an expense in a pop-up', async () => {
    renderPlan()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample grocery' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Sample grocery' })
    await userEvent.clear(within(dialog).getByLabelText('Per month (₱)'))
    await userEvent.type(within(dialog).getByLabelText('Per month (₱)'), '9000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved Sample grocery.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(savePlannedExpense).toHaveBeenCalledWith('s', wb, 2, { name: 'Sample grocery', amount: 900000, active: true }, 'tok')
  })

  it('asks before removing an expense from the plan', async () => {
    renderPlan()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample internet' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Sample internet' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove from the plan' }))
    const confirm = within(dialog).getByRole('alertdialog', { name: 'Remove Sample internet' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Yes, remove' }))
    expect(await screen.findByText('Removed Sample internet.')).toBeInTheDocument()
    expect(savePlannedExpense).toHaveBeenCalledWith('s', wb, 3, { name: 'Sample internet', amount: 150000, active: false }, 'tok')
  })

  it('does not save without an amount', async () => {
    renderPlan()
    await userEvent.click(screen.getByRole('button', { name: '+ Add expense' }))
    const dialog = screen.getByRole('dialog', { name: 'Add planned expense' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sample water')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to the plan' }))
    expect(within(dialog).getByText('Enter an amount more than 0.')).toBeInTheDocument()
    expect(localStorage.getItem('debt-app.outbox.s')).toBeNull()
  })
})
