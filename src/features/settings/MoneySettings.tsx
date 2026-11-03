import { useState, useSyncExternalStore } from 'react'
import { addIncomeSource, saveAccountOpening, saveIncomeSource, saveSettings } from '../../data/actions'
import { dayList } from '../../data/cells'
import { moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { Account, IncomeSource, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { canInstall, isInstalled, promptInstall, subscribeInstall } from '../../pwa/install'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Field, Select, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const card = 'rounded-xl bg-white p-4 shadow-sm'

function IncomeRow({ source, workbook }: { source: IncomeSource; workbook: Workbook }) {
  const edit = useSheetEdit()
  const [amount, setAmount] = useState(toPesos(source.amount).toFixed(2))
  const [days, setDays] = useState(source.days.join(','))
  const [active, setActive] = useState(source.active)
  const [toAccount, setToAccount] = useState(source.toAccount)
  const accounts = moneyAccounts(workbook)

  function save() {
    const cents = parsePositiveAmount(amount)
    const dayValues = dayList(days)
    if (cents === null) return edit.fail('Enter an amount more than 0.')
    if (dayValues.length === 0) return edit.fail('Enter the pay days, e.g. 14,28.')
    void edit.run(`Saved ${source.label}.`, (sheetId, wb, token) =>
      saveIncomeSource(sheetId, wb, { row: source.row, amount: cents, days: dayValues, active, inPlan: source.inPlan, toAccount }, token),
    )
  }

  return (
    <li className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-900">{source.label}</span>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={source.frequency === 'per_payday' ? 'Net per payday (₱)' : 'Net per month (₱)'} htmlFor={`inc-${source.sourceId}`}>
          <TextInput id={`inc-${source.sourceId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Days" htmlFor={`days-${source.sourceId}`}>
          <TextInput id={`days-${source.sourceId}`} value={days} onChange={(e) => setDays(e.target.value)} placeholder="14,28" />
        </Field>
      </div>
      <Field label="Lands in" htmlFor={`to-${source.sourceId}`}>
        <Select id={`to-${source.sourceId}`} value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button variant="secondary" disabled={edit.busy} onClick={save}>
        Save
      </Button>
      <ErrorNote message={edit.error} />
      <SuccessNote message={edit.done} />
    </li>
  )
}

function NewIncomeSource({ workbook }: { workbook: Workbook }) {
  const edit = useSheetEdit()
  const accounts = moneyAccounts(workbook)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<'per_payday' | 'monthly'>('monthly')
  const [days, setDays] = useState('')
  const [toAccount, setToAccount] = useState(accounts[0]?.accountId ?? '')

  function add() {
    const cents = parsePositiveAmount(amount)
    const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const dayValues = dayList(days)
    const problem = !id ? 'Enter a name.' : cents === null ? 'Enter an amount more than 0.' : dayValues.length === 0 ? 'Enter the day(s) of the month.' : workbook.incomeSources.some((s) => s.sourceId === id) ? 'This name is already used.' : null
    if (problem) return edit.fail(problem)
    void edit.run(`Added ${label.trim()}.`, (sheetId, wb, token) =>
      addIncomeSource(sheetId, wb, { sourceId: id, label: label.trim(), amount: cents!, frequency, days: dayValues, toAccount, inPlan: true, active: true }, token),
    )
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-green-900">Add a recurring income</summary>
      <div className="mt-3 space-y-2">
        <Field label="Name" htmlFor="new-inc-label">
          <TextInput id="new-inc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rental" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Amount (₱)" htmlFor="new-inc-amount">
            <TextInput id="new-inc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Days" htmlFor="new-inc-days">
            <TextInput id="new-inc-days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="15" />
          </Field>
        </div>
        <Field label="How often" htmlFor="new-inc-freq">
          <Select id="new-inc-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as 'per_payday' | 'monthly')}>
            <option value="monthly">Once a month</option>
            <option value="per_payday">On each day listed</option>
          </Select>
        </Field>
        <Field label="Lands in" htmlFor="new-inc-to">
          <Select id="new-inc-to" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="secondary" disabled={edit.busy} onClick={add}>
          Add income
        </Button>
        <ErrorNote message={edit.error} />
        <SuccessNote message={edit.done} />
      </div>
    </details>
  )
}

function AccountRow({ account }: { account: Account }) {
  const edit = useSheetEdit()
  const [amount, setAmount] = useState(toPesos(account.openingBalance).toFixed(2))
  const [date, setDate] = useState(account.openingDate || todayIso())

  function save() {
    const cents = Math.round(Number(amount.replace(/,/g, '')) * 100)
    if (amount.trim() === '' || !Number.isFinite(cents)) return edit.fail('Enter a valid amount.')
    void edit.run(`Saved ${account.label}.`, (sheetId, wb, token) => saveAccountOpening(sheetId, wb, account.row, cents, date, token))
  }

  return (
    <li className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <p className="font-medium text-slate-900">
        {account.label} {account.isSavings && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">savings</span>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Starting balance (₱)" htmlFor={`acc-${account.accountId}`}>
          <TextInput id={`acc-${account.accountId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="As of" htmlFor={`accd-${account.accountId}`}>
          <TextInput id={`accd-${account.accountId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button variant="secondary" disabled={edit.busy} onClick={save}>
        Save
      </Button>
      <ErrorNote message={edit.error} />
      <SuccessNote message={edit.done} />
    </li>
  )
}

function SavingsGoal({ workbook }: { workbook: Workbook }) {
  const edit = useSheetEdit()
  const s = (key: string, fallback: string) => workbook.settings[key]?.value || fallback
  const [now, setNow] = useState(s('savings_goal_monthly', '1000'))
  const [month, setMonth] = useState(s('savings_goal_change_month', '2027-03'))
  const [after, setAfter] = useState(s('savings_goal_monthly_after', '15000'))

  function save() {
    const a = parsePositiveAmount(now)
    const b = parsePositiveAmount(after)
    if (a === null || b === null) return edit.fail('Enter amounts more than 0.')
    if (!/^\d{4}-\d{2}$/.test(month)) return edit.fail('Enter the month as YYYY-MM.')
    void edit.run('Saved savings goal.', (sheetId, wb, token) =>
      saveSettings(sheetId, wb, { savings_goal_monthly: toPesos(a), savings_goal_change_month: `'${month}`, savings_goal_monthly_after: toPesos(b) }, token),
    )
  }

  return (
    <div className={card}>
      <h2 className="font-medium text-slate-900">Savings goal</h2>
      <p className="mt-1 text-sm text-slate-600">Money moved into a savings account counts toward the goal. Home shows the progress each month.</p>
      <div className="mt-3 space-y-2">
        <Field label="Per month now (₱)" htmlFor="goal-now">
          <AmountInput id="goal-now" value={now} onChange={(e) => setNow(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From month" htmlFor="goal-month" hint="When interest stops">
            <TextInput id="goal-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Then per month (₱)" htmlFor="goal-after">
            <TextInput id="goal-after" inputMode="decimal" value={after} onChange={(e) => setAfter(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" disabled={edit.busy} onClick={save}>
          Save goal
        </Button>
        <ErrorNote message={edit.error} />
        <SuccessNote message={edit.done} />
      </div>
    </div>
  )
}

export function InstallCard() {
  const available = useSyncExternalStore(subscribeInstall, canInstall)
  if (isInstalled()) return null
  return (
    <div className={card}>
      <h2 className="font-medium text-slate-900">Install the app</h2>
      {available ? (
        <Button className="mt-3" onClick={() => void promptInstall()}>
          Install on this device
        </Button>
      ) : (
        <p className="mt-1 text-sm text-slate-600">
          In Chrome on Android, tap <b>⋮ → Install app</b> (or <b>Add to Home screen</b>). On iPhone, use Safari: <b>Share → Add to Home Screen</b>.
        </p>
      )}
    </div>
  )
}

export function MoneySettings({ workbook }: { workbook: Workbook }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const monthlyPlan = workbook.incomeSources
    .filter((s) => s.active && s.inPlan)
    .reduce((sum, s) => sum + s.amount * (s.frequency === 'per_payday' ? s.days.length : 1), 0)
  return (
    <>
      <div className={card}>
        <h2 className="font-medium text-slate-900">Income</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recurring income in the plan: <b>{formatPeso(monthlyPlan)}</b> per month. Record each payday in <b>Add → Income</b>.
        </p>
        <ul className="mt-3 space-y-3">
          {workbook.incomeSources.map((s) => (
            <IncomeRow key={s.sourceId} source={s} workbook={workbook} />
          ))}
        </ul>
        <NewIncomeSource workbook={workbook} />
      </div>
      <div className={card}>
        <h2 className="font-medium text-slate-900">Accounts</h2>
        <p className="mt-1 text-sm text-slate-600">Balances count entries after the "as of" date. Use aliases only, never account numbers.</p>
        <ul className="mt-3 space-y-3">
          {accounts.map((a) => (
            <AccountRow key={a.accountId} account={a} />
          ))}
        </ul>
      </div>
      <SavingsGoal workbook={workbook} />
    </>
  )
}
