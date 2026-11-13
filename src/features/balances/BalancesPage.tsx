import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addBalanceCheck } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { accountBalances, checkResults, type CheckResult } from '../../domain/balances'
import { todayIso } from '../../domain/dues'
import type { Account, BalanceCheck, IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { Field, SuccessNote, TextInput } from '../../ui/form'
import { WithWorkbook } from '../WithWorkbook'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

/** Real balance typed by the user: may be 0 or below 0 (overdrawn). null = not a number. */
function parseBalance(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** What the check means, in one sentence. */
function describeResult(r: Pick<CheckResult, 'difference' | 'notRecorded' | 'account' | 'check'>): string {
  if (r.difference === 0) return 'Same as the app ✓'
  const amount = formatPeso(Math.abs(r.difference))
  if (r.difference > 0) return `${amount} more than the app (interest or money in not recorded). Not counted as income or savings.`
  if (r.notRecorded > 0) return `${amount} less than the app: counted as Not recorded spending.`
  return `${amount} less than the app. Not counted: new starting balance.`
}

function AccountCheck({ sheetId, workbook, account, appBalance, date }: { sheetId: string; workbook: Workbook; account: Account; appBalance: number; date: IsoDate }) {
  const hasChecks = workbook.balanceChecks.some((c) => c.accountId === account.accountId)
  const [text, setText] = useState('')
  // The first check replaces the starting balance (it may be a placeholder), so its difference is not counted by default.
  const [count, setCount] = useState(hasChecks)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const balance = parseBalance(text)
  const draft: BalanceCheck | null =
    balance === null ? null : { checkId: 'draft', createdAt: '9999', date, accountId: account.accountId, balance, countDifference: count, note: '' }
  const preview = draft ? checkResults({ ...workbook, balanceChecks: [...workbook.balanceChecks, draft] }).find((r) => r.check === draft) : undefined
  const last = workbook.balanceChecks.filter((c) => c.accountId === account.accountId).sort((a, b) => b.date.localeCompare(a.date))[0]
  const id = `bal-${account.accountId}`

  function save() {
    setSaved(null)
    if (!draft || !preview) return setError('Enter the balance shown in the bank app, or the cash you counted.')
    if (account.openingDate && date < account.openingDate) return setError(`Choose a date on or after the starting balance date (${shortDay(account.openingDate)}).`)
    setError(null)
    addBalanceCheck(sheetId, { date, accountId: account.accountId, balance: draft.balance, countDifference: draft.countDifference, note: '' })
    setSaved(`Saved ${account.label}: ${formatPeso(draft.balance)}. ${describeResult(preview)}`)
    setText('')
    setCount(true)
  }

  return (
    <li className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-900">
          {account.label} {account.isSavings && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">savings</span>}
        </span>
        <span className="text-sm text-slate-700">App: {formatPeso(appBalance)}</span>
      </p>
      <p className="text-xs text-slate-500">{last ? `Last check ${shortDay(last.date)}: ${formatPeso(last.balance)}` : 'Not checked yet'}</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={`Real balance of ${account.label} (₱)`} htmlFor={id}>
            <TextInput id={id} inputMode="decimal" autoComplete="off" placeholder="0.00" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" onClick={save}>
          Save
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={count} onChange={(e) => setCount(e.target.checked)} />
        <span>
          Count a lower balance as Not recorded spending
          {!hasChecks && <span className="block text-xs text-slate-500">Off for the first check: it replaces the starting balance.</span>}
        </span>
      </label>
      {preview && !saved && <p className="text-sm text-slate-600">{describeResult(preview)}</p>}
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </li>
  )
}

function History({ workbook }: { workbook: Workbook }) {
  const results = checkResults(workbook).slice(0, 12)
  if (results.length === 0) return null
  return (
    <div className={panel}>
      <h2 className="mb-2 font-medium text-slate-900">Past checks</h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {results.map((r) => (
          <li key={r.check.checkId} className="py-2">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-slate-900">
                {r.account.label} · {shortDay(r.check.date)}
              </span>
              <span className="text-slate-800">{formatPeso(r.check.balance)}</span>
            </p>
            <p className="text-xs text-slate-500">{describeResult(r)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Monthly balance check: type the real balance of each account. The difference shows as Not recorded. */
export function BalancesView({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: IsoDate }) {
  const [date, setDate] = useState(today)
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const balances = new Map(accountBalances(workbook).map((b) => [b.account.accountId, b.balance]))

  if (workbook.updates.some((u) => u.tab === 'BalanceChecks' && u.create)) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Check balances</h1>
        <p className="text-slate-600">
          Open{' '}
          <Link to="/settings" className="text-green-900 underline">
            Settings
          </Link>{' '}
          → Update sheet first. It adds the BalanceChecks tab.
        </p>
      </section>
    )
  }

  return (
    <section className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Check balances</h1>
      <div className={panel}>
        <p className="text-sm text-slate-600">
          Type the balance from each bank app, or count your cash. The app balance starts again from it. If you moved money and did not record it, add it with
          Move money first.
        </p>
        <div className="mt-3 max-w-48">
          <Field label="Balance at the end of" htmlFor="bal-date">
            <TextInput id="bal-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
        </div>
        <ul className="mt-4 space-y-3">
          {accounts.map((a) => (
            <AccountCheck key={a.accountId} sheetId={sheetId} workbook={workbook} account={a} appBalance={balances.get(a.accountId) ?? 0} date={date} />
          ))}
        </ul>
      </div>
      <History workbook={workbook} />
    </section>
  )
}

export function BalancesPage() {
  return <WithWorkbook title="Check balances">{(sheetId, workbook) => <BalancesView sheetId={sheetId} workbook={workbook} today={todayIso()} />}</WithWorkbook>
}
