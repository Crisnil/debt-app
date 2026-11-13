import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseWorkbook } from '../../data/workbook'
import { billsThisMonth, monthsToKeep } from '../../domain/payables'
import type { Payable, Transaction, Workbook } from '../../domain/types'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { BillsView } from './BillsPage'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const payable = (over: Partial<Payable>): Payable => ({
  payableId: 'p',
  name: 'Sample bill',
  payee: '',
  category: 'Utilities',
  amount: 100000,
  recurring: true,
  dueDay: 20,
  startMonth: '2030-01',
  times: null,
  active: true,
  note: '',
  row: 2,
  ...over,
})

const paid = (payableId: string, month: string, amount: number): Transaction => ({
  txnId: `${payableId}-${month}`,
  date: `${month}-10`,
  amount,
  merchant: '',
  category: 'Utilities',
  methodId: 'cash',
  note: '',
  payableId,
  payableMonth: month,
})

const wb: Workbook = {
  ...base,
  payables: [
    payable({ payableId: 'elec', name: 'Sample electric' }),
    payable({ payableId: 'water', name: 'Sample water', dueDay: 5, startMonth: '2030-03', row: 3 }),
    payable({ payableId: 'old', name: 'Sample repair', recurring: false, startMonth: '2030-02', dueDay: 1, row: 4 }),
    payable({ payableId: 'next', name: 'Sample future', startMonth: '2030-04', row: 5 }),
  ],
  transactions: [...base.transactions, paid('elec', '2030-01', 100000), paid('elec', '2030-02', 100000), paid('water', '2030-03', 100000)],
}

function renderBills(today = '2030-03-15', workbook = wb) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter>
          <BillsView sheetId="s" workbook={workbook} today={today} />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const bodyRows = () => screen.getAllByRole('row').slice(1)
const row = (name: string) => bodyRows().find((r) => within(r).queryByText(name))!

describe('Bills table', () => {
  beforeEach(() => localStorage.clear())

  it('lists this month only, late ones first, and recurring payables come back each month', () => {
    // March: electric (recurring, not paid yet), water (paid), and the one-time repair from February still unpaid.
    expect(billsThisMonth(wb, '2030-03-15').map((m) => `${m.payable.payableId} ${m.month}`)).toEqual(['old 2030-02', 'water 2030-03', 'elec 2030-03'])
    // April: the recurring ones come back for April; unpaid March electric and the February repair are late, first.
    expect(billsThisMonth(wb, '2030-04-02').map((m) => `${m.payable.payableId} ${m.month}`)).toEqual([
      'old 2030-02',
      'elec 2030-03',
      'water 2030-04',
      'elec 2030-04',
      'next 2030-04',
    ])
  })

  it('shows one table row per payable with Pay and Edit, and no Pay once paid', () => {
    renderBills()
    expect(bodyRows()).toHaveLength(3)
    expect(within(bodyRows()[0]).getAllByText('▲ Late').length).toBeGreaterThan(0)
    expect(within(row('Sample water')).getAllByText('✓ Paid').length).toBeGreaterThan(0)
    expect(within(row('Sample water')).queryByRole('button', { name: 'Pay Sample water' })).not.toBeInTheDocument()
    expect(within(row('Sample electric')).getByRole('button', { name: 'Pay Sample electric' })).toBeInTheDocument()
    expect(within(row('Sample electric')).getByRole('button', { name: 'Edit Sample electric' })).toBeInTheDocument()
    expect(screen.getByText('₱2,000.00')).toBeInTheDocument() // left this month: repair 1,000 + electric 1,000 (water is paid)
  })

  it('pays a bill in a pop-up and shows what was saved', async () => {
    renderBills()
    await userEvent.click(screen.getByRole('button', { name: 'Pay Sample electric' }))
    const dialog = screen.getByRole('dialog', { name: 'Pay Sample electric' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Paid Sample electric.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('debt-app.outbox.s')!)).toContainEqual(
      expect.objectContaining({ entity: expect.objectContaining({ value: expect.objectContaining({ amount: 100000, payableId: 'elec', payableMonth: '2030-03' }) }) }),
    )
  })

  it('adds a payable in a pop-up', async () => {
    renderBills()
    await userEvent.click(screen.getByRole('button', { name: '+ Add bill' }))
    const dialog = screen.getByRole('dialog', { name: 'Add bill' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sample internet')
    await userEvent.type(within(dialog).getByLabelText('Usual amount per month (₱)'), '1500')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add bill' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Added Sample internet.')).toBeInTheDocument()
  })

  it('asks before deleting in the Edit pop-up and says that past payments stay', async () => {
    renderBills()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample electric' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Sample electric' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByRole('alertdialog', { name: 'Delete Sample electric' })).toHaveTextContent('Payments you already made stay in your records.')
    await userEvent.click(within(within(dialog).getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('adds a bill to the plan with + Plan, and shows In plan · Remove once it is there', async () => {
    const inPlan: Workbook = { ...wb, updates: [], plannedExpenses: [{ itemId: 'i', name: 'Sample water', amount: 100000, active: true, payableId: 'water', row: 2 }] }
    renderBills('2030-03-15', inPlan)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample water' }))
    let dialog = screen.getByRole('dialog', { name: 'Edit Sample water' })
    expect(within(dialog).getByRole('button', { name: 'Remove Sample water from the plan' })).toHaveTextContent('✓ In plan · Remove')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByRole('alertdialog')).toHaveTextContent('It also leaves your plan.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample electric' }))
    dialog = screen.getByRole('dialog', { name: 'Edit Sample electric' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add Sample electric to the plan' }))
    expect(screen.getByText('Added Sample electric to the plan.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('debt-app.outbox.s')!)).toContainEqual(
      expect.objectContaining({ tab: 'PlannedExpenses', record: expect.objectContaining({ name: 'Sample electric', amount: 1000, payable_id: 'elec' }) }),
    )
  })

  it('hides + Plan until the sheet has the planned expenses column', async () => {
    renderBills()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Sample electric' }))
    expect(screen.queryByRole('button', { name: /to the plan$/ })).not.toBeInTheDocument()
    expect(screen.getByText(/To add bills to your plan, open Settings → Update sheet/)).toBeInTheDocument()
  })

  it('keeps the amount of earlier paid months when the usual amount changes', () => {
    expect(monthsToKeep(wb, wb.payables[0], '2030-03-15')).toEqual([
      { month: '2030-01', amount: 100000 },
      { month: '2030-02', amount: 100000 },
    ])
  })
})
