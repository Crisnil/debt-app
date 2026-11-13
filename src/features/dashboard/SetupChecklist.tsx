import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setupSteps } from '../../domain/setup'
import type { Workbook } from '../../domain/types'

const HIDDEN_KEY = 'debt-app.setup-hidden'

/** First steps for a new sheet, until they are done or hidden. */
export function SetupChecklist({ workbook }: { workbook: Workbook }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1')
  const steps = setupSteps(workbook)
  const left = steps.filter((s) => !s.done).length
  if (hidden || left === 0) return null
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-green-900">Get started · {steps.length - left} of {steps.length} done</h2>
        <button
          type="button"
          className="text-sm text-slate-600 underline"
          onClick={() => {
            localStorage.setItem(HIDDEN_KEY, '1')
            setHidden(true)
          }}
        >
          Hide
        </button>
      </div>
      <ol className="mt-2 space-y-2 text-sm">
        {steps.map((s) => (
          <li key={s.key} className="flex gap-2">
            <span aria-hidden="true" className={s.done ? 'text-green-900' : 'text-slate-400'}>
              {s.done ? '✓' : '○'}
            </span>
            <span>
              {s.done ? (
                <span className="text-slate-500 line-through">{s.label}</span>
              ) : (
                <Link to={s.to} className="font-medium text-green-900 underline">
                  {s.label}
                </Link>
              )}
              {!s.done && <span className="block text-xs text-slate-600">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
