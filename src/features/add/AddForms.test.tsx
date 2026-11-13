import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { renderWithSheet } from '../../test/providers'
import { ExpenseForm } from './ExpenseForm'
import { MoneyInForm } from './MoneyInForm'
import { MoveMoneyForm } from './MoveMoneyForm'
import { PayCardForm } from './PayCardForm'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const pressed = (group: string) => screen.getByRole('group', { name: group }).querySelector('[aria-pressed="true"]')

describe('Money in', () => {
  beforeEach(() => localStorage.clear())

  it('starts with the salary: its amount and account are filled in', async () => {
    renderWithSheet(<MoneyInForm sheetId="in1" workbook={base} />, 'in1', base)
    expect(pressed('What')).toHaveTextContent('Salary')
    expect(screen.getByLabelText('Amount received (₱)')).toHaveValue('20000.00')
    expect(pressed('Received in')).toHaveTextContent('Payroll')
    await userEvent.click(screen.getByRole('button', { name: 'Save money in' }))
    expect(screen.getByText('Saved Salary ₱20,000.00.')).toBeInTheDocument()
    expect(readOutbox('in1')).toContainEqual(expect.objectContaining({ tab: 'IncomeLog', record: expect.objectContaining({ source_id: 'salary', type: 'salary', amount: 20000 }) }))
  })

  it('asks who gave a gift, and notes it', async () => {
    renderWithSheet(<MoneyInForm sheetId="in2" workbook={base} />, 'in2', base)
    await userEvent.click(within(screen.getByRole('group', { name: 'What' })).getByRole('button', { name: 'Gift' }))
    expect(screen.getByLabelText('Amount received (₱)')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Amount received (₱)'), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save money in' }))
    expect(screen.getByText('Enter who gave the money.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('From'), 'Tita')
    await userEvent.click(screen.getByRole('button', { name: 'Save money in' }))
    expect(screen.getByText('Saved ₱500.00 from Tita.')).toBeInTheDocument()
    expect(readOutbox('in2')).toContainEqual(expect.objectContaining({ record: expect.objectContaining({ source_id: '', type: 'gift', amount: 500, note: 'From Tita' }) }))
  })

  it('saves a bonus as one-time income', async () => {
    renderWithSheet(<MoneyInForm sheetId="in3" workbook={base} />, 'in3', base)
    await userEvent.click(within(screen.getByRole('group', { name: 'What' })).getByRole('button', { name: 'Bonus' }))
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Amount received (₱)'), '3000')
    await userEvent.click(screen.getByRole('button', { name: 'Save money in' }))
    expect(readOutbox('in3')).toContainEqual(expect.objectContaining({ record: expect.objectContaining({ type: 'bonus', amount: 3000 }) }))
  })
})

describe('Move money to savings', () => {
  beforeEach(() => localStorage.clear())

  it('?to=savings starts with the savings goal account as To', () => {
    renderWithSheet(<MoveMoneyForm sheetId="mv" workbook={base} initialTo="savings" />, 'mv', base)
    expect(pressed('To')).toHaveTextContent('Piggy Bank')
    expect(pressed('From')).toHaveTextContent('Payroll')
    expect(screen.getByText('Counts toward your savings goal. Not spending.')).toBeInTheDocument()
  })
})

describe('Pay card', () => {
  it('picks a card, then saves the payment to it', async () => {
    renderWithSheet(<PayCardForm sheetId="pay" workbook={base} />, 'pay', base)
    const cards = screen.getByRole('group', { name: 'Card' })
    expect(cards).not.toHaveTextContent('Gamma') // closed
    await userEvent.click(within(cards).getByRole('button', { name: 'Beta' }))
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    expect(screen.getByText('Paid ₱1,000.00 to Beta.')).toBeInTheDocument()
    expect(readOutbox('pay')).toContainEqual(expect.objectContaining({ tab: 'Payments', record: expect.objectContaining({ card_id: 'beta', amount: 1000 }) }))
  })
})

describe('after a save', () => {
  beforeEach(() => localStorage.clear())

  it('Undo takes back an entry still waiting on this phone', async () => {
    renderWithSheet(<ExpenseForm sheetId="un" workbook={base} />, 'un', base)
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '250')
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(readOutbox('un')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Undone. The app does not count it.')).toBeInTheDocument()
    expect(readOutbox('un')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('Add another closes the note and goes back to the amount; Done goes Home', async () => {
    renderWithSheet(<MoveMoneyForm sheetId="aa" workbook={base} />, 'aa', base)
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }))
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/')
    await userEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (₱)')).toHaveFocus()
  })
})
