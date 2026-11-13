import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../../data/workbook'
import { SessionProvider } from '../../state/session'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { StatsView } from './StatsPage'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

// The Plan tab's planned expenses need the session.
function renderStats(path = '/stats') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <StatsView sheetId="s" workbook={base} today="2030-01-21" />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

describe('Statistics', () => {
  it('opens on Spending: highlights and spending by category for this month', () => {
    renderStats()
    expect(screen.getByRole('tab', { name: 'Spending' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Highest month')).toBeInTheDocument()
    expect(screen.getByText('Most spent category')).toBeInTheDocument()
    expect(screen.getByText('Highest daily spending')).toBeInTheDocument()
    expect(screen.getByText('Average per day')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('img', { name: /^spent so far: ₱/ })).toBeInTheDocument()
    // This month is the latest: no Next.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('goes back a month, and switches to week and year', async () => {
    renderStats()
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Dec 2029')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Year' }))
    expect(screen.getAllByText('2030').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByText('Jan 21 – 27')).toBeInTheDocument()
  })

  it('shows the credit cards to swipe, and the chosen card below', async () => {
    renderStats('/stats?tab=cards')
    const cards = within(screen.getByRole('list', { name: 'Credit cards' })).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    // Soonest due first: Beta (due the 25th), then Alpha (the 30th).
    expect(screen.getByRole('button', { name: 'Beta · Credit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Alpha · Credit' }))
    expect(screen.getByRole('button', { name: 'Alpha · Credit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Beta' })).not.toBeInTheDocument()
  })

  it('has the Plan in its own tab', async () => {
    renderStats()
    await userEvent.click(screen.getByRole('tab', { name: 'Plan' }))
    expect(screen.getByRole('heading', { name: 'What we owe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bills in the next 12 months' })).toBeInTheDocument()
  })
})
