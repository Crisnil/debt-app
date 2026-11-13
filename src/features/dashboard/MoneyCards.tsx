import { useState } from 'react'
import { addIncome } from '../../data/actions'
import { accountLabel } from '../../domain/accounts'
import { incomeTypeFor, paydaysToRecord, type Payday } from '../../domain/payday'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function PaydayRow({ sheetId, workbook, payday, today }: { sheetId: string; workbook: Workbook; payday: Payday; today: IsoDate }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(toPesos(payday.amount).toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const { source, date } = payday
  const to = source.toAccount
  const late = date < today

  const save = (cents: number, note = '') =>
    addIncome(sheetId, { date, sourceId: source.sourceId, type: incomeTypeFor(source), amount: cents, toAccount: to, note })

  function saveEdited() {
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    save(cents)
  }

  return (
    <li className="py-2">
      <p className="text-sm text-slate-800">
        {late ? '▲ Not recorded yet: ' : '💰 Payday: '}
        <b>
          {source.label} {formatPeso(payday.amount)}
        </b>{' '}
        → {accountLabel(workbook, to)} <span className="text-slate-500">({shortDate(date)})</span>
      </p>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="w-36">
            <TextInput aria-label={`${source.label} amount received (₱)`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button className="px-3 py-1.5" onClick={saveEdited}>
            Save
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error && <span className="text-sm text-red-800">{error}</span>}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="px-3 py-1.5" onClick={() => save(payday.amount)}>
            Record
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(true)}>
            Different amount
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => save(0, 'Skipped: did not arrive')}>
            Skip
          </Button>
        </div>
      )}
    </li>
  )
}

/** Paydays in the last two weeks that are not recorded yet: Record in one tap, a different amount, or Skip. */
export function PaydayReminders({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: IsoDate }) {
  const paydays = paydaysToRecord(workbook, today)
  if (paydays.length === 0) return null
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-3" role="status">
      <ul className="divide-y divide-green-100">
        {paydays.map((p) => (
          <PaydayRow key={`${p.source.sourceId}-${p.date}`} sheetId={sheetId} workbook={workbook} payday={p} today={today} />
        ))}
      </ul>
    </div>
  )
}
