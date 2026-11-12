import { Link } from 'react-router-dom'
import type { CardForecast } from '../../domain/forecast'
import { formatPeso } from '../../lib/money'
import { debtHealth } from '../../domain/health'
import { STATUS, USED_WORD } from './palette'

/** What you owe on one card against its credit limit. showName: false when the card name is already shown above. */
export function CreditUsedBar({ forecast: { card, owed, used }, showName = true }: { forecast: CardForecast; showName?: boolean }) {
  if (used === null) {
    return (
      <div className="text-sm">
        <p className="flex justify-between">
          <span className="font-medium text-slate-900">{showName ? card.name : 'Credit used'}</span>
          <span className="text-slate-800">{formatPeso(owed)} owed</span>
        </p>
        <Link to="/settings" className="text-green-900 underline">
          Add a credit limit
        </Link>
      </div>
    )
  }
  const health = debtHealth(used)
  const s = STATUS[health]
  const pct = Math.round(used * 100)
  return (
    <div className="text-sm">
      <p className="flex items-baseline justify-between gap-2">
        <span className={showName ? 'font-medium text-slate-900' : 'text-slate-600'}>{showName ? card.name : 'Credit used'}</span>
        <span className="text-slate-800">
          <b>{pct}%</b>{' '}
          <span className="text-xs text-slate-600">
            {s.icon} {USED_WORD[health]}
          </span>
        </span>
      </p>
      <div
        className="mt-1 h-2.5 overflow-hidden rounded-full"
        style={{ background: s.track }}
        role="meter"
        aria-label={`${card.name} credit used`}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${pct}%${used > 1 ? ', over the limit' : ''}`}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: s.fill }} />
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {formatPeso(owed)} of {formatPeso(card.creditLimit!)}
        {used > 1 && ' · over the limit'}
      </p>
    </div>
  )
}

