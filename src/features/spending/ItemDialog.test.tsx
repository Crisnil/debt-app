import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteExpense, saveCheckCount, saveExpense, saveLineCategory } from '../../data/actions'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { SpendingView } from './SpendingPage'

vi.mock('../../data/actions', async (original) => ({
  ...(await original<typeof import('../../data/actions')>()),
  saveExpense: vi.fn(async () => {}),
  deleteExpense: vi.fn(async () => {}),
  saveLineCategory: vi.fn(async () => {}),
  saveCheckCount: vi.fn(async () => {}),
  deleteBalanceCheck: vi.fn(async () => {}),
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

function renderSpending(workbook: Workbook = base) {
  localStorage.setItem('debt-app.sheet', JSON.stringify({ id: 's', name: 'Sample' }))
  const client = new QueryClient()
  client.setQueryData(['workbook', 's'], workbook)
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter>
          <SpendingView sheetId="s" workbook={workbook} today="2030-01-21" />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const openItem = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }))
const dialog = () => screen.getByRole('dialog')

describe('Spending: edit, delete, correct', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('edits a logged expense, then closes and says it is saved', async () => {
    renderSpending()
    await openItem(/^Sample Cafe/)
    const amount = within(dialog()).getByLabelText('Amount (₱)')
    await userEvent.clear(amount)
    await userEvent.type(amount, '175')
    await userEvent.selectOptions(within(dialog()).getByLabelText('Category'), 'Grocery')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Saved Sample Cafe.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const txn = base.transactions.find((t) => t.txnId === 't1')
    expect(saveExpense).toHaveBeenCalledWith('s', base, txn, { date: '2030-01-12', amount: 17500, merchant: 'Sample Cafe', category: 'Grocery', methodId: 'cash', note: '' }, 'tok')
  })

  it('deletes a logged expense after a confirm', async () => {
    renderSpending()
    await openItem(/^Sample Pharmacy/)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete this expense' }))
    const confirm = within(dialog()).getByRole('alertdialog', { name: 'Delete this expense' })
    expect(deleteExpense).not.toHaveBeenCalled()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Deleted Sample Pharmacy.')).toBeInTheDocument()
    expect(deleteExpense).toHaveBeenCalledWith('s', base, base.transactions.find((t) => t.txnId === 't3'), 'tok')
  })

  it('warns that a new amount can break the match with the statement line', async () => {
    renderSpending()
    await openItem(/^Sample Grocer/)
    expect(within(dialog()).queryByText(/can break the match/)).not.toBeInTheDocument()
    await userEvent.type(within(dialog()).getByLabelText('Amount (₱)'), '1')
    expect(within(dialog()).getByText(/can break the match/)).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete this expense' }))
    expect(within(dialog()).getByText('The purchase still counts from the card statement.')).toBeInTheDocument()
  })

  it('changes only the category of a statement line', async () => {
    renderSpending()
    await openItem(/^SAMPLE FUEL/)
    expect(within(dialog()).queryByLabelText('Amount (₱)')).not.toBeInTheDocument()
    await userEvent.selectOptions(within(dialog()).getByLabelText('Category'), 'Food')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save category' }))
    expect(await screen.findByText('Saved the category of SAMPLE FUEL.')).toBeInTheDocument()
    expect(saveLineCategory).toHaveBeenCalledWith('s', base, expect.objectContaining({ description: 'SAMPLE FUEL', cardId: 'beta' }), 'Food', 'tok')
  })

  it('adds a correction as a minus entry with the same category and Paid from', async () => {
    renderSpending()
    await openItem(/^SAMPLE FUEL/)
    await userEvent.type(within(dialog()).getByLabelText('Take off (₱)'), '2000')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add correction' }))
    expect(within(dialog()).getByText('A correction can take off up to ₱1,200.00.')).toBeInTheDocument()
    await userEvent.clear(within(dialog()).getByLabelText('Take off (₱)'))
    await userEvent.type(within(dialog()).getByLabelText('Take off (₱)'), '200')
    await userEvent.type(within(dialog()).getByLabelText('Note (optional)'), 'refund')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Add correction' }))
    expect(screen.getByText('Added a correction of −₱200.00.')).toBeInTheDocument()
    expect(readOutbox('s').at(-1)?.record).toMatchObject({
      amount: -200,
      merchant: 'Correction: SAMPLE FUEL',
      category: 'Gasoline',
      method_id: 'beta',
      note: 'Correction of SAMPLE FUEL (2030-01-01) · refund',
    })
  })

  it('does not edit an entry that is not in the sheet yet', async () => {
    renderSpending({ ...base, transactions: [...base.transactions, { txnId: 'new', date: '2030-01-20', amount: 9900, merchant: 'Waiting Shop', category: 'Food', methodId: 'cash', note: '' }] })
    await openItem(/^Waiting Shop/)
    expect(within(dialog()).getByText(/not in the sheet yet/)).toBeInTheDocument()
    expect(within(dialog()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('stops counting a Not recorded difference from a balance check', async () => {
    const check = { checkId: 'c1', createdAt: '', date: '2030-01-13', accountId: 'cash', balance: 0, countDifference: true, note: '', row: 2 }
    renderSpending({ ...base, balanceChecks: [check] })
    await openItem(/^Balance check: Cash/)
    expect(within(dialog()).queryByText('Add a correction')).not.toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('button', { name: "Don't count as spending" }))
    expect(await screen.findByText('This difference is not counted any more.')).toBeInTheDocument()
    expect(saveCheckCount).toHaveBeenCalledWith('s', expect.anything(), check, false, 'tok')
  })
})
