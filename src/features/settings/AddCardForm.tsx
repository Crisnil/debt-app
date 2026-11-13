import { useState, type FormEvent } from 'react'
import { addCard } from '../../data/actions'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Field, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

/** Monthly interest when the user does not know it: 3% is common for Philippine credit cards. */
const USUAL_RATE = '3'

const dayOf = (text: string) => {
  const day = Number(text)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

/** New credit card: name, bank, statement and due days, limit, and monthly interest. Adds its statement tab too. */
export function AddCardForm({ onSaved }: { onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [statementDay, setStatementDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [limit, setLimit] = useState('')
  const [rate, setRate] = useState(USUAL_RATE)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const statement = dayOf(statementDay)
    const due = dayOf(dueDay)
    const creditLimit = limit.trim() ? parsePositiveAmount(limit) : null
    const monthlyRate = Number(rate)
    if (!name.trim()) return edit.fail('Enter the card name, for example "BPI Credit".')
    if (statement === null || due === null) return edit.fail('Enter the statement day and the due day, from 1 to 31.')
    if (limit.trim() && creditLimit === null) return edit.fail('Enter the credit limit, or leave it empty.')
    if (!Number.isFinite(monthlyRate) || monthlyRate < 0 || monthlyRate > 10) return edit.fail('Enter the monthly interest in %, for example 3.')
    const message = `Added ${name.trim()}. Paste its latest statement on the card's page.`
    const ok = await edit.run(message, (sheetId, wb, token) =>
      addCard(sheetId, wb, { name: name.trim(), bank: bank.trim(), statementDay: statement, dueDay: due, creditLimit, monthlyRate: monthlyRate / 100 }, token),
    )
    if (ok) onSaved(message)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Card name" htmlFor="card-name">
          <TextInput id="card-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BPI Credit" />
        </Field>
        <Field label="Bank (optional)" htmlFor="card-bank">
          <TextInput id="card-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. BPI" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Statement day" htmlFor="card-statement" hint="Day the bill is made">
          <TextInput id="card-statement" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Due day" htmlFor="card-due" hint="Last day to pay">
          <TextInput id="card-due" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="30" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Credit limit (₱, optional)" htmlFor="card-limit">
          <AmountInput id="card-limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label="Interest per month (%)" htmlFor="card-rate" hint="On an unpaid balance">
          <TextInput id="card-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">The app adds a tab for the card&apos;s statements to your sheet. The card shows in Paid from.</p>
      <Button type="submit" className="w-full" disabled={edit.busy}>
        {edit.busy ? 'Adding…' : 'Add card'}
      </Button>
      <ErrorNote message={edit.error} />
    </form>
  )
}
