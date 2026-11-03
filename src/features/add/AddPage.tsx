import { Link, useSearchParams } from 'react-router-dom'
import { useLiveWorkbook, useSession } from '../../state/hooks'
import { Chips } from '../../ui/form'
import { ExpenseForm } from './ExpenseForm'
import { IncomeForm } from './IncomeForm'
import { PaymentForm } from './PaymentForm'
import { StatementLineForm } from './StatementLineForm'
import { TransferForm } from './TransferForm'

const kinds = [
  { value: 'expense', label: 'Expense' },
  { value: 'move', label: 'Move money' },
  { value: 'pay', label: 'Pay card' },
  { value: 'income', label: 'Income' },
  { value: 'statement', label: 'Statement line' },
] as const

type Kind = (typeof kinds)[number]['value']

export function AddPage() {
  const { sheet, signedIn } = useSession()
  const { workbook, query } = useLiveWorkbook()
  const [params, setParams] = useSearchParams()
  const kind = (kinds.find((k) => k.value === params.get('type'))?.value ?? 'expense') as Kind

  if (!sheet || !workbook) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Add</h1>
        {query.error ? (
          <p className="mt-2 text-red-800">{query.error.message}</p>
        ) : signedIn && sheet ? (
          <p className="mt-2 text-slate-600">Reading your sheet…</p>
        ) : (
          <p className="mt-2 text-slate-600">
            Sign in and select your sheet in{' '}
            <Link to="/settings" className="text-green-900 underline">
              Settings
            </Link>{' '}
            first.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">Add</h1>
      <Chips label="What" options={[...kinds]} value={kind} onChange={(v) => setParams({ type: v }, { replace: true })} />
      {/* key: reset the form when the type changes */}
      {kind === 'expense' && <ExpenseForm key="expense" sheetId={sheet.id} workbook={workbook} />}
      {kind === 'move' && <TransferForm key="move" sheetId={sheet.id} workbook={workbook} />}
      {kind === 'pay' && <PaymentForm key="pay" sheetId={sheet.id} workbook={workbook} />}
      {kind === 'income' && <IncomeForm key="income" sheetId={sheet.id} workbook={workbook} />}
      {kind === 'statement' && <StatementLineForm key="statement" sheetId={sheet.id} workbook={workbook} />}
    </section>
  )
}
