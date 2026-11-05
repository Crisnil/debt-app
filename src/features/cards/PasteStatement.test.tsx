import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readOutbox } from '../../data/outbox'
import { parseWorkbook } from '../../data/workbook'
import type { Workbook } from '../../domain/types'
import { fixtureTabs, fixtureValues } from '../../test/fixtures'
import { PasteStatement } from './PasteStatement'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
// t3: Sample Pharmacy, 800.00 on alpha, 2030-01-11, not on a statement yet.
const PASTE = '01/12 01/11 SAMPLE PHARMACY 800.00'

async function readPaste(workbook: Workbook = base) {
  render(<PasteStatement sheetId="sheet" workbook={workbook} cardId="alpha" />)
  fireEvent.change(screen.getByLabelText('Paste the lines from your billing statement'), { target: { value: PASTE } })
  await userEvent.click(screen.getByRole('button', { name: 'Read lines' }))
}

describe('PasteStatement match states', () => {
  beforeEach(() => localStorage.clear())

  it('shows a suggested match as linked, with undo', async () => {
    await readPaste()
    expect(screen.getByText(/Same purchase:/).parentElement).toHaveTextContent('✓ Same purchase: your entry 2030-01-11 · Sample Pharmacy · ₱800.00. Linked when you save.Undo')
    expect(screen.getByRole('button', { name: 'Save 1 line (1 matched)' })).toBeInTheDocument()
  })

  it('asks again after undo, and says "not linked" after "Not this"', async () => {
    await readPaste()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText(/Matches your entry/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save 1 line' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Not this' }))
    expect(screen.getByText(/Not linked. Counted from the statement./)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Same purchase' }))
    expect(screen.getByText(/Linked when you save/)).toBeInTheDocument()
  })

  it('saves the confirmed link with the line', async () => {
    await readPaste()
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 line (1 matched)' }))
    const [item] = readOutbox('sheet')
    expect(item.record).toMatchObject({ description: 'SAMPLE PHARMACY', txn_id: 't3' })
    expect(screen.getByText('Saved 1 line, 1 matched to your entries.')).toBeInTheDocument()
  })
})
