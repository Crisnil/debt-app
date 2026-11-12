import { Link } from 'react-router-dom'
import { useState, useSyncExternalStore } from 'react'
import { addAccount, addIncomeSource, saveAccountOpening, saveCreditLimit, saveIncomeSource, saveSettings } from '../../data/actions'
import { dayList } from '../../data/cells'
import { accountLabel, moneyAccounts } from '../../domain/accounts'
import { incomeByMonth } from '../../domain/payday'
import { monthLabel } from '../../ui/charts/palette'
import { accountBalances } from '../../domain/balances'
import { todayIso } from '../../domain/dues'
import type { Account, Card, IncomeSource, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { canInstall, isInstalled, promptInstall, subscribeInstall } from '../../pwa/install'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Field, Select, SuccessNote, TextInput } from '../../ui/form'
import { SectionHead } from '../../ui/SectionHead'
import { editButton, th, type Editing } from '../../ui/table'
import { parsePositiveAmount } from '../add/parseAmount'

const card = 'rounded-xl bg-white p-4 shadow-sm'

const pesoCents = (text: string) => (text.trim() === '' ? 0 : Math.round(Number(text.replace(/,/g, '')) * 100))

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

// ---- income ---------------------------------------------------------------

const incomeId = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Add or edit a recurring income. Name and how often are set when it is added. */
function IncomeForm({ workbook, source, onSaved }: { workbook: Workbook; source: IncomeSource | null; onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const accounts = moneyAccounts(workbook)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState(source ? toPesos(source.amount).toFixed(2) : '')
  const [frequency, setFrequency] = useState<'per_payday' | 'monthly'>(source?.frequency ?? 'monthly')
  const [days, setDays] = useState(source ? source.days.join(',') : '')
  const [toAccount, setToAccount] = useState(source?.toAccount ?? accounts[0]?.accountId ?? '')
  const [active, setActive] = useState(source?.active ?? true)

  async function save() {
    const cents = parsePositiveAmount(amount)
    const dayValues = dayList(days)
    if (source) {
      if (cents === null) return edit.fail('Enter an amount more than 0.')
      if (dayValues.length === 0) return edit.fail('Enter the pay days, e.g. 14,28.')
      const message = `Saved ${source.label}.`
      const ok = await edit.run(message, (sheetId, wb, token) =>
        saveIncomeSource(sheetId, wb, { row: source.row, amount: cents, days: dayValues, active, inPlan: source.inPlan, toAccount }, token),
      )
      if (ok) onSaved(message)
      return
    }
    const id = incomeId(label)
    const problem = !id ? 'Enter a name.' : cents === null ? 'Enter an amount more than 0.' : dayValues.length === 0 ? 'Enter the day(s) of the month.' : workbook.incomeSources.some((s) => s.sourceId === id) ? 'This name is already used.' : null
    if (problem) return edit.fail(problem)
    const message = `Added ${label.trim()}.`
    const ok = await edit.run(message, (sheetId, wb, token) =>
      addIncomeSource(sheetId, wb, { sourceId: id, label: label.trim(), amount: cents!, frequency, days: dayValues, toAccount, inPlan: true, active: true }, token),
    )
    if (ok) onSaved(message)
  }

  const perPayday = (source?.frequency ?? frequency) === 'per_payday'
  return (
    <div className="space-y-3">
      {!source && (
        <Field label="Name" htmlFor="inc-label">
          <TextInput id="inc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rental" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={perPayday ? 'Net per payday (₱)' : 'Net per month (₱)'} htmlFor="inc-amount">
          <TextInput id="inc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Days" htmlFor="inc-days">
          <TextInput id="inc-days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="14,28" />
        </Field>
      </div>
      {!source && (
        <Field label="How often" htmlFor="inc-freq">
          <Select id="inc-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as 'per_payday' | 'monthly')}>
            <option value="monthly">Once a month</option>
            <option value="per_payday">On each day listed</option>
          </Select>
        </Field>
      )}
      <Field label="Lands in" htmlFor="inc-to">
        <Select id="inc-to" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      {source && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (Home reminds you on its days)
        </label>
      )}
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : source ? 'Save' : 'Add income'}
      </Button>
      <ErrorNote message={edit.error} />
    </div>
  )
}

function IncomeTable({ workbook }: { workbook: Workbook }) {
  const [editing, setEditing] = useState<Editing<IncomeSource>>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const open = (item: IncomeSource | null) => {
    setSaved(null)
    setEditing({ item })
  }
  return (
    <>
      <SectionHead title="Income" addLabel="+ Add income" onAdd={() => open(null)} />
      {workbook.incomeSources.length > 0 && (
        <table className="mt-2 w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className={th}>Income</th>
              <th className={`${th} text-right`}>Net</th>
              <th className={`${th} hidden sm:table-cell`}>Lands in</th>
              <th className={th}>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workbook.incomeSources.map((s) => (
              <tr key={s.sourceId} className={s.active ? '' : 'text-slate-400'}>
                <td className="py-2">
                  <span className={`font-medium ${s.active ? 'text-slate-900' : ''}`}>{s.label}</span>
                  <span className="block text-xs text-slate-500">
                    Day {s.days.join(', ')}
                    {s.active ? '' : ' · off'}
                    <span className="sm:hidden"> → {accountLabel(workbook, s.toAccount)}</span>
                  </span>
                </td>
                <td className="py-2 text-right">
                  {formatPeso(s.amount)}
                  <span className="block text-xs text-slate-500">{s.frequency === 'per_payday' ? 'per payday' : 'per month'}</span>
                </td>
                <td className="hidden py-2 pl-3 sm:table-cell">{accountLabel(workbook, s.toAccount)}</td>
                <td className="py-2 text-right">
                  <button type="button" className={editButton} aria-label={`Edit ${s.label}`} onClick={() => open(s)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SuccessNote message={saved} />
      <Modal title={editing?.item ? `Edit ${editing.item.label}` : 'Add a recurring income'} open={editing !== null} onClose={() => setEditing(null)}>
        <IncomeForm
          key={editing?.item?.sourceId ?? 'new'}
          workbook={workbook}
          source={editing?.item ?? null}
          onSaved={(message) => {
            setEditing(null)
            setSaved(message)
          }}
        />
      </Modal>
    </>
  )
}

// ---- accounts -------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = { bank: 'Bank', cash: 'Cash', 'e-wallet': 'E-wallet' }

/** Add an account, or edit the starting balance and maintaining balance of one. */
function AccountForm({ workbook, account, onSaved }: { workbook: Workbook; account: Account | null; onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const canMaintain = (workbook.headers.Accounts ?? []).includes('maintaining_balance')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'bank' | 'cash' | 'e-wallet'>('bank')
  const [isSavings, setIsSavings] = useState(false)
  const [opening, setOpening] = useState(account ? toPesos(account.openingBalance).toFixed(2) : '')
  const [date, setDate] = useState(account?.openingDate || todayIso())
  const [maintaining, setMaintaining] = useState(account?.maintainingBalance ? toPesos(account.maintainingBalance).toFixed(2) : '')
  const accountType = account?.type ?? type

  async function save() {
    const cents = pesoCents(opening)
    const keep = pesoCents(maintaining)
    if (account) {
      if (opening.trim() === '' || !Number.isFinite(cents)) return edit.fail('Enter a valid amount.')
      if (!Number.isFinite(keep) || keep < 0) return edit.fail('Enter a valid maintaining balance, or leave it empty.')
      const message = `Saved ${account.label}.`
      const ok = await edit.run(message, (sheetId, wb, token) => saveAccountOpening(sheetId, wb, account.row, cents, date, token, canMaintain ? keep : undefined))
      if (ok) onSaved(message)
      return
    }
    if (!label.trim()) return edit.fail('Enter a name, for example "BPI Savings".')
    if (!Number.isFinite(cents) || !Number.isFinite(keep) || keep < 0) return edit.fail('Enter valid amounts.')
    if (workbook.accounts.some((a) => a.label.toLowerCase() === label.trim().toLowerCase())) return edit.fail('This name is already used.')
    const message = `Added ${label.trim()}.`
    const ok = await edit.run(message, (sheetId, wb, token) =>
      addAccount(sheetId, wb, { label: label.trim(), type, isSavings, openingBalance: cents, openingDate: date, maintainingBalance: type === 'bank' ? keep : 0 }, token),
    )
    if (ok) onSaved(message)
  }

  return (
    <div className="space-y-3">
      {!account && (
        <>
          <Field label="Name" htmlFor="acc-label" hint="An alias only, never the account number.">
            <TextInput id="acc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. BPI Savings" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type" htmlFor="acc-type">
              <Select id="acc-type" value={type} onChange={(e) => setType(e.target.value as 'bank' | 'cash' | 'e-wallet')}>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="e-wallet">E-wallet</option>
              </Select>
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isSavings} onChange={(e) => setIsSavings(e.target.checked)} /> Savings account
            </label>
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={account ? 'Starting balance (₱)' : 'Balance now (₱)'} htmlFor="acc-opening">
          <TextInput id="acc-opening" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="As of" htmlFor="acc-date">
          <TextInput id="acc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {accountType === 'bank' && (!account || canMaintain) && (
        <Field label="Maintaining balance (₱, optional)" htmlFor="acc-keep" hint="Required by the bank; not counted as spendable. Empty = none.">
          <TextInput id="acc-keep" inputMode="decimal" value={maintaining} onChange={(e) => setMaintaining(e.target.value)} />
        </Field>
      )}
      {account && (
        <p className="text-xs text-slate-500">
          The starting balance counts until the first balance check. To type today&apos;s real balance, use{' '}
          <Link to="/balances" className="text-green-900 underline">
            Check balances
          </Link>
          .
        </p>
      )}
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : account ? 'Save' : 'Add account'}
      </Button>
      <ErrorNote message={edit.error} />
    </div>
  )
}

function AccountsTable({ workbook }: { workbook: Workbook }) {
  const [editing, setEditing] = useState<Editing<Account>>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const balances = new Map(accountBalances(workbook).map((b) => [b.account.accountId, b.balance]))
  const lastCheck = (id: string) =>
    workbook.balanceChecks
      .filter((c) => c.accountId === id)
      .map((c) => c.date)
      .sort()
      .at(-1)
  const open = (item: Account | null) => {
    setSaved(null)
    setEditing({ item })
  }
  return (
    <>
      <SectionHead title="Accounts" addLabel="+ Add account" onAdd={() => open(null)} />
      <p className="mt-1 text-xs text-slate-500">
        Balance now = last balance check (or starting balance) + entries after it.{' '}
        <Link to="/balances" className="text-green-900 underline">
          Check balances
        </Link>
      </p>
      <table className="mt-2 w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className={th}>Account</th>
            <th className={`${th} text-right`}>Balance now</th>
            <th className={`${th} hidden pl-3 sm:table-cell`}>Last check</th>
            <th className={th}>
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accounts.map((a) => {
            const checked = lastCheck(a.accountId)
            return (
              <tr key={a.accountId}>
                <td className="py-2">
                  <span className="font-medium text-slate-900">{a.label}</span>
                  <span className="block text-xs text-slate-500">
                    {TYPE_LABEL[a.type] ?? a.type}
                    {a.isSavings && <span className="ml-1 rounded-full bg-green-100 px-1.5 text-green-900">savings</span>}
                    {a.maintainingBalance > 0 && ` · 🔒 ${formatPeso(a.maintainingBalance)}`}
                    <span className="sm:hidden">{checked ? ` · checked ${shortDay(checked)}` : ''}</span>
                  </span>
                </td>
                <td className="py-2 text-right text-slate-900">{formatPeso(balances.get(a.accountId) ?? 0)}</td>
                <td className="hidden py-2 pl-3 text-slate-600 sm:table-cell">{checked ? shortDay(checked) : '—'}</td>
                <td className="py-2 text-right">
                  <button type="button" className={editButton} aria-label={`Edit ${a.label}`} onClick={() => open(a)}>
                    Edit
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <SuccessNote message={saved} />
      <Modal title={editing?.item ? `Edit ${editing.item.label}` : 'Add account'} open={editing !== null} onClose={() => setEditing(null)}>
        <AccountForm
          key={editing?.item?.accountId ?? 'new'}
          workbook={workbook}
          account={editing?.item ?? null}
          onSaved={(message) => {
            setEditing(null)
            setSaved(message)
          }}
        />
      </Modal>
    </>
  )
}

// ---- credit limits --------------------------------------------------------

function CreditLimitForm({ card: c, onSaved }: { card: Card; onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const [limit, setLimit] = useState(c.creditLimit !== null ? toPesos(c.creditLimit).toFixed(2) : '')

  async function save() {
    const cents = parsePositiveAmount(limit)
    if (cents === null) return edit.fail('Enter the credit limit, more than 0.')
    const message = `Saved ${c.name} limit.`
    if (await edit.run(message, (sheetId, wb, token) => saveCreditLimit(sheetId, wb, c.row, cents, token))) onSaved(message)
  }

  return (
    <div className="space-y-3">
      <Field label="Credit limit (₱)" htmlFor="limit">
        <TextInput id="limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 200,000" />
      </Field>
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : 'Save'}
      </Button>
      <ErrorNote message={edit.error} />
    </div>
  )
}

function CreditLimits({ workbook }: { workbook: Workbook }) {
  const [editing, setEditing] = useState<Card | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  return (
    <div className={card}>
      <SectionHead title="Credit limits" />
      <p className="mt-1 text-xs text-slate-500">Home shows how much of each limit you use. Update a limit when the bank changes it.</p>
      <table className="mt-2 w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <tbody className="divide-y divide-slate-100">
          {workbook.cards
            .filter((c) => c.active)
            .map((c) => (
              <tr key={c.cardId}>
                <td className="py-2 font-medium text-slate-900">{c.name}</td>
                <td className="py-2 text-right text-slate-900">{c.creditLimit !== null ? formatPeso(c.creditLimit) : <span className="text-slate-400">not set</span>}</td>
                <td className="w-16 py-2 text-right">
                  <button
                    type="button"
                    className={editButton}
                    aria-label={`Edit ${c.name} limit`}
                    onClick={() => {
                      setSaved(null)
                      setEditing(c)
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <SuccessNote message={saved} />
      <Modal title={editing ? `${editing.name} credit limit` : ''} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <CreditLimitForm
            key={editing.cardId}
            card={editing}
            onSaved={(message) => {
              setEditing(null)
              setSaved(message)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function YourName({ workbook }: { workbook: Workbook }) {
  const edit = useSheetEdit()
  const [name, setName] = useState(workbook.settings.display_name?.value ?? '')
  return (
    <div className={card}>
      <h2 className="font-medium text-slate-900">Your name</h2>
      <p className="mt-1 text-sm text-slate-600">Home greets you with it.</p>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Field label="Name" htmlFor="display-name">
            <TextInput id="display-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Crisnil" />
          </Field>
        </div>
        <Button variant="secondary" disabled={edit.busy} onClick={() => void edit.run('Saved your name.', (sheetId, wb, token) => saveSettings(sheetId, wb, { display_name: name.trim() }, token))}>
          Save
        </Button>
      </div>
      <ErrorNote message={edit.error} />
      <SuccessNote message={edit.done} />
    </div>
  )
}


/** Income received, by month: salary, allowance, and money received, with the month total against the plan. */
function IncomeReceived({ workbook, monthlyPlan }: { workbook: Workbook; monthlyPlan: number }) {
  const months = incomeByMonth(workbook, 3, todayIso())
  if (months.every((m) => m.entries.length === 0)) return <p className="mt-3 text-sm text-slate-500">No income recorded yet. Home reminds you on each payday.</p>
  const label = (e: (typeof months)[number]['entries'][number]) =>
    workbook.incomeSources.find((s) => s.sourceId === e.sourceId)?.label ?? (e.note || e.type.replace('_', ' '))
  return (
    <details className="mt-3" open>
      <summary className="cursor-pointer text-sm font-medium text-slate-900">Received</summary>
      {months.map((m) => (
        <div key={m.month} className="mt-2 text-sm">
          <p className="flex justify-between border-b border-slate-100 pb-1 text-slate-600">
            <span>{monthLabel(m.month)}</span>
            <span>
              <b className="text-slate-900">{formatPeso(m.total)}</b> of {formatPeso(monthlyPlan)} plan
            </span>
          </p>
          <ul className="mt-1 space-y-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {m.entries.map((e) => (
              <li key={e.incomeId} className="flex justify-between gap-2 text-slate-700">
                <span className="truncate">
                  {e.date.slice(5)} · {label(e)} → {accountLabel(workbook, e.toAccount)}
                </span>
                <span>{formatPeso(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
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
  const monthlyPlan = workbook.incomeSources
    .filter((s) => s.active && s.inPlan)
    .reduce((sum, s) => sum + s.amount * (s.frequency === 'per_payday' ? s.days.length : 1), 0)
  return (
    <>
      <YourName workbook={workbook} />
      <div className={card}>
        <IncomeTable workbook={workbook} />
        <p className="mt-2 text-xs text-slate-500">
          Recurring income in the plan: <b className="text-slate-700">{formatPeso(monthlyPlan)}</b> per month. Home reminds you to record each payday.
        </p>
        <IncomeReceived workbook={workbook} monthlyPlan={monthlyPlan} />
      </div>
      <div className={card}>
        <AccountsTable workbook={workbook} />
      </div>
      <CreditLimits workbook={workbook} />
      <SavingsGoal workbook={workbook} />
    </>
  )
}
