import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../../data/workbook'
import { PAYABLES, type CardForecast, type MonthBills } from '../../domain/forecast'
import type { PayoffMonth } from '../../domain/payoff'
import type { Card, Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { CreditUsedBar } from './CreditUsed'
import { Donut, type DonutPart } from './Donut'
import { FutureBillsChart } from './FutureBillsChart'
import { cardColor, OTHER_COLOR, PAYABLES_COLOR, SERIES, slotColor } from './palette'
import { PayoffChart } from './PayoffChart'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const card = (n: number, active = true): Card => ({
  cardId: `c${n}`,
  bank: '',
  name: `Card ${n}`,
  sheetTab: '',
  statementDay: 1,
  dueDay: 20,
  monthlyRate: null,
  creditLimit: 1000000,
  active,
  row: n + 2,
})

const payoffMonth = (month: string, owed: number, savedTotal: number): PayoffMonth => ({
  month,
  cardBill: 0,
  interest: 0,
  nonCard: 0,
  income: 0,
  living: 0,
  installments: 0,
  earlier: 0,
  paid: 0,
  unpaid: 0,
  carried: 0,
  saved: 0,
  savedTotal,
  owed,
})

describe('chart colors', () => {
  it('never repeats a color: slots past the 7 colors are Other', () => {
    expect(SERIES.slice(0, 7).map((_, i) => slotColor(i))).toEqual(SERIES.slice(0, 7))
    expect(slotColor(7)).toBe(OTHER_COLOR)
    expect(slotColor(12)).toBe(OTHER_COLOR)
    expect(slotColor(-1)).toBe(OTHER_COLOR)
  })

  it('keeps a card color when an earlier card is turned off, and payables have their own color', () => {
    const wb: Workbook = { ...base, cards: [card(0), card(1), card(2)] }
    const off: Workbook = { ...wb, cards: [card(0, false), card(1), card(2)] }
    expect(cardColor(off, 'c2')).toBe(cardColor(wb, 'c2'))
    expect(cardColor(wb, 'c2')).toBe(SERIES[2])
    expect(cardColor(wb, PAYABLES)).toBe(PAYABLES_COLOR)
  })
})

describe('PayoffChart', () => {
  const months = ['2030-01', '2030-02', '2030-03', '2030-04'].map((m, i) => payoffMonth(m, 400000 - i * 100000, i * 50000))

  it('names both lines at their end, so color is not the only key', () => {
    const { container } = render(<PayoffChart paths={[{ key: 'plan', label: 'Plan', dashed: true, months }]} />)
    const svg = container.querySelector('svg[role="img"]')!
    expect(within(svg as HTMLElement).getByText('Owed')).toBeInTheDocument()
    expect(within(svg as HTMLElement).getByText('Saved')).toBeInTheDocument()
  })

  it('is one tab stop; the arrow keys move between months', async () => {
    render(<PayoffChart paths={[{ key: 'plan', label: 'Plan', dashed: true, months }]} />)
    const bands = screen.getAllByRole('button', { name: /still owed/ })
    expect(bands.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1)
    await userEvent.tab()
    expect(bands[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(bands[1]).toHaveFocus()
    expect(screen.getByText('After the Feb 2030 bills')).toBeInTheDocument()
    await userEvent.keyboard('{End}')
    expect(bands[3]).toHaveFocus()
  })
})

describe('FutureBillsChart', () => {
  it('puts the cards past the 7 colors into one Other stack', () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(i))
    const wb: Workbook = { ...base, cards }
    const series = [...cards.map((c) => ({ cardId: c.cardId, name: c.name })), { cardId: PAYABLES, name: 'Bills & payables' }].map((s) => ({
      ...s,
      color: cardColor(wb, s.cardId),
    }))
    const months: MonthBills[] = ['2030-01', '2030-02'].map((month) => ({
      month,
      byCard: series.map((s) => ({ cardId: s.cardId, committed: 10000, estimate: 0, bills: [] })),
      total: series.length * 10000,
    }))
    render(<FutureBillsChart months={months} series={series} income={0} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Other (Card 7, Card 8)')).toBeInTheDocument()
    expect(within(legend).queryByText('Card 7')).not.toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '₱200.00' })).toHaveLength(2) // the Other column in the table, each month: 2 × ₱100
  })
})

describe('Donut', () => {
  it('shows a heading with the total before the parts of each group', () => {
    const parts: DonutPart[] = [
      { id: 'a', name: 'Payroll', amount: 10000, color: slotColor(0), group: 'Debit' },
      { id: 'b', name: 'Maribank', amount: 5000, color: slotColor(1), group: 'Debit' },
      { id: 'c', name: 'GCash', amount: 2000, color: slotColor(2), group: 'E-wallet' },
    ]
    render(
      <MemoryRouter>
        <Donut parts={parts} centerLabel="have" />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Debit₱150.00',
      'Payroll₱100.00',
      'Maribank₱50.00',
      'E-wallet₱20.00',
      'GCash₱20.00',
    ])
  })

  it('shows at most 6 parts, the rest together as Other', () => {
    const parts: DonutPart[] = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `Account ${i}`, amount: 10000, color: slotColor(i) }))
    render(
      <MemoryRouter>
        <Donut parts={parts} centerLabel="have" />
      </MemoryRouter>,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[5]).toHaveTextContent('Other: Account 5, Account 6, Account 7')
    expect(items[5]).toHaveTextContent('₱300.00')
  })
})

describe('CreditUsedBar', () => {
  it('keeps the meter value inside its range when over the limit, and says so', () => {
    const forecast: CardForecast = { card: card(0), bills: [], plans: [], owed: 1200000, used: 1.2 }
    render(
      <MemoryRouter>
        <CreditUsedBar forecast={forecast} />
      </MemoryRouter>,
    )
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '100')
    expect(meter).toHaveAttribute('aria-valuetext', '120%, over the limit')
  })
})
