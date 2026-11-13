import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { MoneyInForm } from './MoneyInForm'
import { MoveMoneyForm } from './MoveMoneyForm'
import { PayCardForm } from './PayCardForm'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const pressed = (group: string) => screen.getByRole('group', { name: group }).querySelector('[aria-pressed="true"]')

describe('Money in', () => {
  beforeEach(() => localStorage.clear())

  it('starts with the salary: its amount and account are filled in', async () => {
    render(<MoneyInForm sheetId="in1" workbook={base} />)
    expect(pressed('What')).toHaveTextContent('Salary')
    expect(screen.getByLabelText('Amount received (₱)')).toHaveValue('20000.00')
    expect(pressed('Received in')).toHaveTextContent('Payroll')
    await userEvent.click(screen.getByRole('button', { name: 'Save money in' }))
    expect(screen.getByText('Saved Salary ₱20,000.00.')).toBeInTheDocument()
    expect(readOutbox('in1')).toContainEqual(expect.objectContaining({ tab: 'IncomeLog', record: expect.objectContaining({ source_id: 'salary', type: 'salary', amount: 20000 }) }))
  })

  it('asks who gave a gift, and notes it', async () => {
    render(<MoneyInForm sheetId="in2" workbook={base} />)
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
    render(<MoneyInForm sheetId="in3" workbook={base} />)
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
    render(<MoveMoneyForm sheetId="mv" workbook={base} initialTo="savings" />)
    expect(pressed('To')).toHaveTextContent('Piggy Bank')
    expect(pressed('From')).toHaveTextContent('Payroll')
    expect(screen.getByText('Counts toward your savings goal. Not spending.')).toBeInTheDocument()
  })
})

describe('Pay card', () => {
  it('picks a card, then saves the payment to it', async () => {
    render(<PayCardForm sheetId="pay" workbook={base} />)
    const cards = screen.getByRole('group', { name: 'Card' })
    expect(cards).not.toHaveTextContent('Gamma') // closed
    await userEvent.click(within(cards).getByRole('button', { name: 'Beta' }))
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    expect(screen.getByText('Paid ₱1,000.00 to Beta.')).toBeInTheDocument()
    expect(readOutbox('pay')).toContainEqual(expect.objectContaining({ tab: 'Payments', record: expect.objectContaining({ card_id: 'beta', amount: 1000 }) }))
  })
})
