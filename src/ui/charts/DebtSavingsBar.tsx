import { formatPeso } from '../../lib/money'
import { OWED_COLOR, SAVED_COLOR } from './palette'

// Same colors as the payoff chart. Both ends are labeled with words and amounts.
const DEBT = OWED_COLOR
const SAVINGS = SAVED_COLOR

/**
 * One bar split in two: what we owe and what we saved, each as its share of both together.
 * As debt goes down and savings go up, the savings part grows; when savings are more, it is the longer part.
 */
export function DebtSavingsBar({ owed, saved }: { owed: number; saved: number }) {
  const total = owed + saved
  const savedPct = total > 0 ? (saved / total) * 100 : 0
  // Keep a visible sliver for a small non-zero part.
  const savedWidth = saved > 0 ? Math.max(savedPct, 1.5) : 0
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DEBT }} />
            Owed
          </p>
          <p className="text-2xl font-semibold text-slate-900">{formatPeso(owed)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">
            Savings
            <span className="ml-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SAVINGS }} />
          </p>
          <p className="text-2xl font-semibold text-slate-900">{formatPeso(saved)}</p>
        </div>
      </div>
      <div
        className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`Owed ${formatPeso(owed)}, savings ${formatPeso(saved)}`}
      >
        {owed > 0 && <div className="h-full rounded-l-full" style={{ width: `${100 - savedWidth}%`, background: DEBT }} />}
        {saved > 0 && <div className="h-full rounded-r-full" style={{ width: `${savedWidth}%`, background: SAVINGS }} />}
      </div>
    </div>
  )
}
