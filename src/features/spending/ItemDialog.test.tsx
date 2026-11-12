import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCheckCount, saveExpense, saveLine, voidBalanceCheck, voidExpense, voidLine } from '../../data/actions'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { SpendingView } from './SpendingPage'

vi.mock('../../data/actions', async (original) => ({
  ...(await original<typeof import('../../data/actions')>()),
  saveExpense: vi.fn(async () => {}),
  voidExpense: vi.fn(async () => {}),
  saveLine: vi.fn(async () => {}),
  voidLine: vi.fn(async () => {}),
  saveCheckCount: vi.fn(async () => {}),
  voidBalanceCheck: vi.fn(async () => {}),
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
          <SpendingView workbook={workbook} today="2030-01-21" />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const openItem = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }))
const dialog = () => screen.getByRole('dialog')
const inDialog = () => within(dialog())

async function voidWith(what: string, reason: 'Did not happen' | 'Entered by mistake') {
  await userEvent.click(inDialog().getByRole('button', { name: `Void this ${what}` }))
  const box = inDialog().getByRole('alertdialog', { name: `Void this ${what}` })
  await userEvent.click(within(box).getByRole('button', { name: reason }))
  await userEvent.click(within(box).getByRole('button', { name: 'Void' }))
}

describe('Spending: correct or void', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('corrects the amount, description, and category of a logged expense', async () => {
    renderSpending()
    await openItem(/^Sample Cafe/)
    const amount = inDialog().getByLabelText('Amount (₱)')
    await userEvent.clear(amount)
    await userEvent.type(amount, '175')
    await userEvent.clear(inDialog().getByLabelText('Description'))
    await userEvent.type(inDialog().getByLabelText('Description'), 'Sample Bakery')
    await userEvent.selectOptions(inDialog().getByLabelText('Category'), 'Grocery')
    await userEvent.click(inDialog().getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText('Corrected Sample Bakery.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const txn = base.transactions.find((t) => t.txnId === 't1')
    expect(saveExpense).toHaveBeenCalledWith('s', base, txn, { date: '2030-01-12', amount: 17500, merchant: 'Sample Bakery', category: 'Grocery', methodId: 'cash', note: '' }, 'tok')
  })

  it('voids a logged expense with a reason, after a confirm', async () => {
    renderSpending()
    await openItem(/^Sample Pharmacy/)
    await voidWith('expense', 'Entered by mistake')
    expect(await screen.findByText('Voided Sample Pharmacy (entered by mistake).')).toBeInTheDocument()
    expect(voidExpense).toHaveBeenCalledWith('s', base, base.transactions.find((t) => t.txnId === 't3'), 'Entered by mistake', 'tok')
  })

  it('corrects your entry of a matched purchase by default, or the statement line instead', async () => {
    renderSpending()
    await openItem(/^Sample Grocer/)
    await userEvent.type(inDialog().getByLabelText('Amount (₱)'), '1')
    expect(inDialog().getByText(/can break the match/)).toBeInTheDocument()
    await userEvent.click(inDialog().getByRole('button', { name: 'Void this expense' }))
    expect(inDialog().getByText('The purchase still counts from the card statement.')).toBeInTheDocument()

    await userEvent.click(inDialog().getByRole('button', { name: 'Fix the statement line instead' }))
    expect(inDialog().getByLabelText('Description')).toHaveValue('SAMPLE GROCER')
    await userEvent.selectOptions(inDialog().getByLabelText('Category'), 'Food')
    await userEvent.click(inDialog().getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText('Corrected SAMPLE GROCER.')).toBeInTheDocument()
    expect(saveLine).toHaveBeenCalledWith('s', base, expect.objectContaining({ cardId: 'alpha', description: 'SAMPLE GROCER' }), { amount: 250025, description: 'SAMPLE GROCER', category: 'Food' }, 'tok')
  })

  it('corrects a statement line that was read wrong', async () => {
    renderSpending()
    await openItem(/^SAMPLE FUEL/)
    const amount = inDialog().getByLabelText('Amount (₱)')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1,250')
    await userEvent.click(inDialog().getByRole('button', { name: 'Save correction' }))
    expect(await screen.findByText('Corrected SAMPLE FUEL.')).toBeInTheDocument()
    expect(saveLine).toHaveBeenCalledWith('s', base, expect.objectContaining({ cardId: 'beta' }), { amount: 125000, description: 'SAMPLE FUEL', category: 'Gasoline' }, 'tok')
  })

  it('voids a statement line that did not happen', async () => {
    renderSpending()
    await openItem(/^SAMPLE FUEL/)
    await voidWith('statement line', 'Did not happen')
    expect(await screen.findByText('Voided SAMPLE FUEL (did not happen).')).toBeInTheDocument()
    expect(voidLine).toHaveBeenCalledWith('s', base, expect.objectContaining({ description: 'SAMPLE FUEL' }), 'Did not happen', 'tok')
  })

  it('keeps the dialog open with the problem when the amount is wrong', async () => {
    renderSpending()
    await openItem(/^Sample Cafe/)
    await userEvent.clear(inDialog().getByLabelText('Amount (₱)'))
    await userEvent.click(inDialog().getByRole('button', { name: 'Save correction' }))
    expect(inDialog().getByText('Enter an amount more than 0.')).toBeInTheDocument()
    expect(saveExpense).not.toHaveBeenCalled()
  })

  it('does not change an entry that is not in the sheet yet', async () => {
    renderSpending({ ...base, transactions: [...base.transactions, { txnId: 'new', date: '2030-01-20', amount: 9900, merchant: 'Waiting Shop', category: 'Food', methodId: 'cash', note: '' }] })
    await openItem(/^Waiting Shop/)
    expect(inDialog().getByText(/not in the sheet yet/)).toBeInTheDocument()
    expect(inDialog().queryByRole('button', { name: 'Save correction' })).not.toBeInTheDocument()
  })

  it('stops counting a Not recorded difference, or voids the balance check', async () => {
    const check = { checkId: 'c1', createdAt: '', date: '2030-01-13', accountId: 'cash', balance: 0, countDifference: true, note: '', row: 2 }
    renderSpending({ ...base, balanceChecks: [check] })
    await openItem(/^Balance check: Cash/)
    await userEvent.click(inDialog().getByRole('button', { name: "Don't count as spending" }))
    expect(await screen.findByText('This difference is not counted any more.')).toBeInTheDocument()
    expect(saveCheckCount).toHaveBeenCalledWith('s', expect.anything(), check, false, 'tok')

    await openItem(/^Balance check: Cash/)
    await voidWith('balance check', 'Entered by mistake')
    expect(await screen.findByText('Voided the balance check (entered by mistake).')).toBeInTheDocument()
    expect(voidBalanceCheck).toHaveBeenCalledWith('s', expect.anything(), check, 'Entered by mistake', 'tok')
  })
})
