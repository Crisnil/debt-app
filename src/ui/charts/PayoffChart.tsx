import { useLayoutEffect, useRef, useState } from 'react'
import type { PayoffMonth } from '../../domain/payoff'
import { formatPeso } from '../../lib/money'
import { monthLabel, niceStep, shortPeso, STATUS } from './palette'

const OWED = STATUS.bad.fill
const SAVED = STATUS.good.fill
const H = 220
const PAD = { left: 48, right: 12, top: 16, bottom: 24 }

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.clientWidth > 0) setWidth(Math.max(el.clientWidth, 280))
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(Math.round(entry.contentRect.width), 280)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Two lines on one peso axis: what we still owe and total savings, month by month. Tap a month for both values. */
export function PayoffChart({ months }: { months: PayoffMonth[] }) {
  const [ref, W] = useWidth(360)
  const [active, setActive] = useState(0)
  const max = Math.max(1, ...months.map((m) => Math.max(m.owed, m.savedTotal)))
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (months.length > 1 ? (i / (months.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const line = (f: (m: PayoffMonth) => number) => months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(m)).toFixed(1)}`).join('')
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(months.length / Math.floor(plotW / 44)))
  const cross = months.findIndex((m) => m.savedTotal >= m.owed && m.savedTotal > 0)
  const sel = months[active]

  return (
    <div ref={ref}>
      <ul className="flex flex-wrap gap-x-4 text-xs text-slate-600" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: OWED }} /> Still owed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: SAVED }} /> Savings
        </li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="mt-2 block max-w-full" role="img" aria-label="What we still owe and savings, month by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {shortPeso(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) =>
          i % labelEvery === 0 ? (
            <text key={m.month} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">
              {monthLabel(m.month, false)}
              {m.month.endsWith('-01') || i === 0 ? ` ’${m.month.slice(2, 4)}` : ''}
            </text>
          ) : null,
        )}
        <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="#cbd5e1" strokeWidth="1" />
        <path d={line((m) => m.owed)} fill="none" stroke={OWED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line((m) => m.savedTotal)} fill="none" stroke={SAVED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {cross > 0 && (
          <g>
            <circle cx={x(cross)} cy={y(months[cross].savedTotal)} r="5" fill={SAVED} stroke="#ffffff" strokeWidth="2" />
            <text x={Math.min(x(cross) + 8, W - PAD.right)} y={y(months[cross].savedTotal) - 8} textAnchor={x(cross) > W - 120 ? 'end' : 'start'} fontSize="11" fill="#0f172a">
              Savings pass debt
            </text>
          </g>
        )}
        {months.map((m, i) => (
          <rect
            key={m.month}
            x={x(i) - plotW / Math.max(months.length - 1, 1) / 2}
            y={PAD.top}
            width={plotW / Math.max(months.length - 1, 1)}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${monthLabel(m.month)}: still owed ${formatPeso(m.owed)}, savings ${formatPeso(m.savedTotal)}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
            style={{ outline: 'none', cursor: 'pointer' }}
          />
        ))}
      </svg>
      {sel && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">
          <p className="col-span-2 text-slate-600">After the {monthLabel(sel.month)} bills</p>
          <p className="flex justify-between">
            <span className="text-slate-600">Still owed</span>
            <b className="text-slate-900">{formatPeso(sel.owed)}</b>
          </p>
          <p className="flex justify-between">
            <span className="text-slate-600">Savings</span>
            <b className="text-slate-900">{formatPeso(sel.savedTotal)}</b>
          </p>
          {sel.carried > 0 && <p className="col-span-2 text-amber-900">! {formatPeso(sel.carried)} carried to the next bill</p>}
          {sel.interest > 0 && <p className="col-span-2 text-slate-600">Interest this month (est.): {formatPeso(sel.interest)}</p>}
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-green-900">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 text-left font-normal">Month</th>
                <th className="py-1 font-normal">Card bill</th>
                <th className="py-1 font-normal">Carried</th>
                <th className="py-1 font-normal">Interest</th>
                <th className="py-1 font-normal">Saved</th>
                <th className="py-1 font-normal">Still owed</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {months.map((m) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="py-1 text-left">{monthLabel(m.month)}</td>
                  <td className="py-1">{formatPeso(m.cardBill)}</td>
                  <td className="py-1">{formatPeso(m.carried)}</td>
                  <td className="py-1">{formatPeso(m.interest)}</td>
                  <td className="py-1">{formatPeso(m.saved)}</td>
                  <td className="py-1">{formatPeso(m.owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
