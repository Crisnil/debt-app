import { Link } from 'react-router-dom'
import { WithWorkbook } from '../WithWorkbook'
import { ExpenseForm } from './ExpenseForm'

export function AddPage() {
  return (
    <WithWorkbook title="Add expense">
      {(sheetId, workbook) => (
        <section className="max-w-xl space-y-5">
          <h1 className="text-2xl font-semibold text-slate-900">Add expense</h1>
          <ExpenseForm sheetId={sheetId} workbook={workbook} />
          <p className="text-sm text-slate-600">
            Income, savings, or GCash back to the bank?{' '}
            <Link to="/add/other" className="text-green-900 underline">
              Other entries
            </Link>
          </p>
        </section>
      )}
    </WithWorkbook>
  )
}
