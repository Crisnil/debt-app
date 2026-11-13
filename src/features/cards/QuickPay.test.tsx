import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkbook } from '../../data/workbook'
import { summarizeDues } from '../../domain/dues'
import { forecastCards } from '../../domain/forecast'
import { badgeCount } from '../../domain/home'
import type { Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { renderWithSheet } from '../../test/providers'
import { CardRow } from './CardSummary'
import { PaymentForm } from './PaymentForm'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

describe('quick card payment', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-21T09:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('each unpaid card on the Cards page has a Pay button to the Add page', () => {
    const beta = summarizeDues(base, '2030-01-21').cards.find((c) => c.card.cardId === 'beta')!
    render(
      <MemoryRouter>
        <CardRow c={{ ...beta, status: 'due' }} next={undefined} toCheck={0} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Pay Beta' })).toHaveAttribute('href', '/add?type=pay&card=beta')
  })

  it('fills in the full amount or the minimum in one tap', async () => {
    const wb: Workbook = { ...base, payments: base.payments.filter((p) => p.cardId !== 'beta') }
    renderWithSheet(<PaymentForm sheetId="qp" workbook={wb} cardId="beta" />, 'qp', wb)
    await userEvent.click(screen.getByRole('button', { name: 'Pay minimum ₱300.00' }))
    expect(screen.getByLabelText('Amount (₱)')).toHaveValue('300.00')
    await userEvent.click(screen.getByRole('button', { name: 'Pay in full ₱1,200.00' }))
    expect(screen.getByLabelText('Amount (₱)')).toHaveValue('1200.00')
  })

  it('does not offer the minimum when it is already paid', () => {
    renderWithSheet(<PaymentForm sheetId="qp2" workbook={base} cardId="alpha" />, 'qp2', base)
    expect(screen.getByRole('button', { name: /^Pay in full/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pay minimum/ })).not.toBeInTheDocument()
  })
})

describe('app icon badge', () => {
  it('counts bills late or due in 3 days', () => {
    const at = (today: string) => badgeCount(base, forecastCards(base, today), today)
    expect(at('2030-01-28')).toBeGreaterThan(at('2030-01-21'))
  })
})
