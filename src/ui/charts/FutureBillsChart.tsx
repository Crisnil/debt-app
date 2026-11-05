import { useLayoutEffect, useRef, useState } from 'react'
import type { MonthBills } from '../../domain/forecast'
import { formatPeso } from '../../lib/money'
import { monthLabel, niceStep, seriesColor, shortPeso } from './palette'

type Series = { cardId: string; name: string }

const H = 220
const PAD = { left: 44, right: 8, top: 22, bottom: 24 }
const GAP = 2

/** Rectangle with rounded top corners (the data end) and a square base. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/**
 * Bills per due month, stacked by card. Solid = committed (statement, installments, logged, carried);
 * hatched = usual spending not logged yet (estimate). The line is the monthly income in the plan.
 * Tap or focus a month to see its breakdown below the chart.
 */
/** Width of the element in CSS pixels, so the chart draws at its real size and text stays 11px on phones. */
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

export function FutureBillsChart({ months, series, income }: { months: MonthBills[]; series: Series[]; income: number }) {
  const [active, setActive] = useState(0)
  const [ref, W] = useWidth(360)
  const max = Math.max(income, ...months.map((m) => m.total), 1)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / months.length
  const barW = Math.min(24, band * 0.6)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const selected = months[active]

  return (
    <div ref={ref}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s.cardId} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(i) }} /> {s.name}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            <rect width="10" height="10" fill="url(#hatch-legend)" />
            <defs>
              <pattern id="hatch-legend" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" fill="#ffffff" />
                <rect width="2" height="4" fill="#64748b" />
              </pattern>
            </defs>
          </svg>
          Usual spending (estimate)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-slate-700" /> Income
        </li>
      </ul>

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="mt-2 block max-w-full" role="img" aria-label="Card bills per month for the next 12 months">
        <defs>
          {series.map((s, i) => (
            <pattern key={s.cardId} id={`hatch-${i}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="#ffffff" />
              <rect width="2" height="5" fill={seriesColor(i)} />
            </pattern>
          ))}
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {shortPeso(t)}
            </text>
          </g>
        ))}

        {months.map((m, mi) => {
          const x = PAD.left + mi * band + (band - barW) / 2
          // Segments bottom to top: each card's committed part, then its estimate.
          const segments = m.byCard.flatMap((c, ci) => [
            { key: `${c.cardId}-c`, value: c.committed, fill: seriesColor(ci) },
            { key: `${c.cardId}-e`, value: c.estimate, fill: `url(#hatch-${ci})` },
          ]).filter((s) => s.value > 0)
          let base = 0
          return (
            <g key={m.month} opacity={mi === active ? 1 : 0.85}>
              {mi === active && <rect x={PAD.left + mi * band + 1} y={PAD.top} width={band - 2} height={plotH} fill="#f1f5f9" rx="4" />}
              {segments.map((s, si) => {
                const y0 = y(base)
                base += s.value
                const y1 = y(base)
                const h = Math.max(y0 - y1 - (si < segments.length - 1 ? GAP : 0), 1)
                return si === segments.length - 1 ? (
                  <path key={s.key} d={topRounded(x, y1, barW, h, 4)} fill={s.fill} />
                ) : (
                  <rect key={s.key} x={x} y={y0 - h} width={barW} height={h} fill={s.fill} />
                )
              })}
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={mi === active ? '#0f172a' : '#64748b'}>
                {monthLabel(m.month, false)}
              </text>
              {mi === 0 && m.total > 0 && (
                <text x={x + barW / 2} y={y(m.total) - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">
                  {shortPeso(m.total)}
                </text>
              )}
              {/* Hit area: the whole month band, bigger than the bar. */}
              <rect
                x={PAD.left + mi * band}
                y={PAD.top}
                width={band}
                height={plotH + PAD.bottom}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${monthLabel(m.month)}: ${formatPeso(m.total)}`}
                aria-pressed={mi === active}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(mi)}
                onClick={() => setActive(mi)}
                onFocus={() => setActive(mi)}
                style={{ outline: 'none', cursor: 'pointer' }}
              />
            </g>
          )
        })}

        {income > 0 && (
          <g pointerEvents="none">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(income)} y2={y(income)} stroke="#334155" strokeWidth="1.5" />
            <text x={W - PAD.right} y={y(income) - 5} textAnchor="end" fontSize="11" fill="#334155">
              Income {shortPeso(income)}
            </text>
          </g>
        )}
      </svg>

      {selected && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">
          <p className="flex items-baseline justify-between">
            <span className="text-slate-600">Bills due in {monthLabel(selected.month)}</span>
            <b className="text-base text-slate-900">{formatPeso(selected.total)}</b>
          </p>
          {income > 0 && selected.total > income && (
            <p className="mt-1 text-amber-900">! {formatPeso(selected.total - income)} more than your monthly income.</p>
          )}
          <ul className="mt-2 space-y-1.5">
            {selected.byCard.map((c, ci) =>
              c.committed + c.estimate === 0 ? null : (
                <li key={c.cardId}>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span className="inline-block h-0.5 w-3" style={{ background: seriesColor(ci) }} />
                      {series[ci].name}
                      {c.bills[0] && <span className="text-xs text-slate-500">due {c.bills.map((b) => b.bill.dueDate.slice(5)).join(', ')}</span>}
                    </span>
                    <b className="text-slate-900">{formatPeso(c.committed + c.estimate)}</b>
                  </p>
                  <p className="pl-4 text-xs text-slate-500">
                    {c.items?.map((i) => `${i.label} ${formatPeso(i.amount)}`).join(' · ')}
                    {c.bills
                      .flatMap((b) => [
                        b.statementLeft && `statement ${formatPeso(b.statementLeft)}`,
                        b.installments && `installments ${formatPeso(b.installments)}`,
                        b.purchases && `${b.fromStatement ? 'purchases' : 'logged'} ${formatPeso(b.purchases)}`,
                        b.fees && `interest/fees ${formatPeso(b.fees)}`,
                        b.carried && `carried + interest ${formatPeso(b.carried)}`,
                        b.estimate && `usual spending (est.) ${formatPeso(b.estimate)}`,
                      ])
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-green-900">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 text-left font-normal">Month</th>
                {series.map((s) => (
                  <th key={s.cardId} className="py-1 font-normal">
                    {s.name}
                  </th>
                ))}
                <th className="py-1 font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {months.map((m) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="py-1 text-left">{monthLabel(m.month)}</td>
                  {m.byCard.map((c) => (
                    <td key={c.cardId} className="py-1">
                      {formatPeso(c.committed + c.estimate)}
                    </td>
                  ))}
                  <td className="py-1 font-medium">{formatPeso(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Includes usual spending (estimate) for months without a statement.</p>
        </div>
      </details>
    </div>
  )
}
