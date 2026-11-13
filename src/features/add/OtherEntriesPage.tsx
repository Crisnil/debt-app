import { Link, useSearchParams } from 'react-router-dom'
import { Chips } from '../../ui/form'
import { WithWorkbook } from '../WithWorkbook'
import { IncomeForm } from './IncomeForm'
import { MoveMoneyForm } from './MoveMoneyForm'
import { ReceivedForm } from './ReceivedForm'
import { SavingsForm } from './SavingsForm'

const kinds = ['income', 'received', 'save', 'move'] as const

type Kind = (typeof kinds)[number]

export function OtherEntriesPage() {
  const [params, setParams] = useSearchParams()
  const kind = kinds.find((k) => k === params.get('type')) ?? 'income'

  return (
    <WithWorkbook title="Other entries">
      {(sheetId, workbook) => {
        const savings = workbook.accounts.filter((a) => a.active && a.isSavings)
        const labels: Record<Kind, string> = {
          income: 'Income',
          received: 'Received money',
          save: `Save to ${savings.length === 1 ? savings[0].label : 'savings'}`,
          move: 'Move money',
        }
        return (
          <section className="max-w-xl space-y-5">
            <Link to="/add" className="text-sm text-green-900 underline">
              ← Add expense
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">Other entries</h1>
            <Chips label="What" options={kinds.map((k) => ({ value: k, label: labels[k] }))} value={kind} onChange={(v) => setParams({ type: v }, { replace: true })} />
            {/* key: reset the form when the type changes */}
            {kind === 'income' && <IncomeForm key="income" sheetId={sheetId} workbook={workbook} />}
            {kind === 'received' && <ReceivedForm key="received" sheetId={sheetId} workbook={workbook} />}
            {kind === 'save' && <SavingsForm key="save" sheetId={sheetId} workbook={workbook} />}
            {kind === 'move' && <MoveMoneyForm key="move" sheetId={sheetId} workbook={workbook} />}
            <p className="text-sm text-slate-600">Card payments and statement lines are on each card&apos;s page. Bills and money you owe are on Bills.</p>
          </section>
        )
      }}
    </WithWorkbook>
  )
}
