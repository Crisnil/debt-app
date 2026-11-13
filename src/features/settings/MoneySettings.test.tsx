import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAccount, saveCreditLimit } from '../../data/actions'
import { parseWorkbook } from '../../data/workbook'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { MoneySettings } from './MoneySettings'

vi.mock('../../data/actions', async (original) => ({
  ...(await original<typeof import('../../data/actions')>()),
  saveAccount: vi.fn(async () => {}),
  saveCreditLimit: vi.fn(async () => {}),
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

function renderSettings() {
  // Signed in with the sample sheet loaded, so edits can run.
  localStorage.setItem('debt-app.sheet', JSON.stringify({ id: 's', name: 'Sample' }))
  const client = new QueryClient()
  client.setQueryData(['workbook', 's'], base)
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter>
          <MoneySettings workbook={base} />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

const rowOf = (name: string) => screen.getByRole('button', { name: `Edit ${name}` }).closest('tr')!

describe('Settings lists', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows the accounts as one short row each', () => {
    renderSettings()
    expect(rowOf('Piggy Bank')).toHaveTextContent('Piggy Bank')
    expect(rowOf('Piggy Bank')).toHaveTextContent('savings')
    expect(rowOf('Piggy Bank')).toHaveTextContent('₱5,200.00')
    expect(rowOf('Cash')).toHaveTextContent('₱150.00')
    // Cards are not money accounts.
    expect(screen.queryByRole('button', { name: 'Edit Alpha' })).not.toBeInTheDocument()
    // No form fields on the page until a pop-up opens.
    expect(screen.queryByLabelText('Starting balance (₱)')).not.toBeInTheDocument()
  })

  it('edits an account in a pop-up, then closes it and says it is saved', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Cash' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Cash' })
    expect(within(dialog).getByLabelText('Name')).toHaveFocus()
    const field = within(dialog).getByLabelText('Starting balance (₱)')
    await userEvent.clear(field)
    await userEvent.type(field, '250')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved Cash.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saveAccount).toHaveBeenCalledWith(
      's',
      base,
      expect.any(Number),
      { label: 'Cash', type: 'cash', isSavings: false, openingBalance: 25000, openingDate: '2030-01-01', maintainingBalance: 0 },
      'tok',
    )
  })

  it('groups the accounts as Debit, Credit, and Cash, with what is owed on each card', () => {
    renderSettings()
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads.filter((h) => /^(Debit|Credit|E-wallet|Cash)/.test(h ?? '')).map((h) => h!.split('Home')[0])).toEqual(['Debit', 'Credit', 'Cash'])
    expect(rowOf('Payroll')).toHaveTextContent('Debit')
    expect(rowOf('Piggy Bank')).toHaveTextContent('savings goal')
    expect(rowOf('Alpha limit')).toHaveTextContent(/₱[\d,.]+ owed/)
  })

  it('renames an account, changes its type, and ticks savings goal money', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Payroll' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Payroll' })
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Security Bank Payroll')
    expect(within(dialog).getByLabelText('Type')).toHaveValue('bank')
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'e-wallet')
    await userEvent.click(within(dialog).getByLabelText(/Savings goal money/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved Security Bank Payroll.')).toBeInTheDocument()
    expect(saveAccount).toHaveBeenCalledWith('s', base, expect.any(Number), expect.objectContaining({ label: 'Security Bank Payroll', type: 'e-wallet', isSavings: true }), 'tok')
  })

  it('does not let an account take the name of another', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Payroll' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Payroll' })
    await userEvent.clear(within(dialog).getByLabelText('Name'))
    await userEvent.type(within(dialog).getByLabelText('Name'), 'cash')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByText('This name is already used.')).toBeInTheDocument()
    expect(saveAccount).not.toHaveBeenCalled()
  })

  it('keeps the pop-up open with the problem when the input is wrong', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: '+ Add account' }))
    const dialog = screen.getByRole('dialog', { name: 'Add account' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))
    expect(within(dialog).getByText('Enter a name, for example "BPI Savings".')).toBeInTheDocument()
  })

  it('closes the pop-up with Esc and with ✕ without saving', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }))
    expect(screen.getByRole('dialog', { name: 'Edit Salary' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+ Add income' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits a credit limit in a pop-up', async () => {
    renderSettings()
    expect(rowOf('Alpha limit')).toHaveTextContent('not set')
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha limit' }))
    await userEvent.type(screen.getByLabelText('Credit limit (₱)'), '200,000')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved Alpha limit.')).toBeInTheDocument()
    expect(saveCreditLimit).toHaveBeenCalledWith('s', base, expect.any(Number), 20000000, 'tok')
  })
})
