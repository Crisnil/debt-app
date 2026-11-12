import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PayoffMonth } from '../../domain/payoff'
import { formatPeso } from '../../lib/money'
import { monthLabel, niceStep, OWED_COLOR, SAVED_COLOR, shortPeso } from './palette'

const OWED = OWED_COLOR
const SAVED = SAVED_COLOR
const H = 240
// Right padding holds the Owed / Saved words beside the line ends.
const PAD = { left: 48, right: 44, top: 16, bottom: 24 }

/** One payoff path. The first path is the main one (marker and table). Dashed: a plan; solid: actual. */
export type ChartPath = { key: string; label: string; dashed: boolean; months: PayoffMonth[] }

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

/**
 * What we still owe (orange) and savings (blue) month by month, on one peso axis, for one or more paths.
 * Line style tells the paths apart (solid / dashed), so color keeps one meaning. The line ends have words too.
 * Tap a month for all values. Keyboard: one tab stop, then the arrow keys (Home / End) move between months.
 */
export function PayoffChart({ paths }: { paths: ChartPath[] }) {
  const [ref, W] = useWidth(360)
  const [active, setActive] = useState(0)
  const months = paths[0]?.months ?? []
  const max = Math.max(1, ...paths.flatMap((p) => p.months.map((m) => Math.max(m.owed, m.savedTotal))))
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (months.length > 1 ? (i / (months.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const line = (ms: PayoffMonth[], f: (m: PayoffMonth) => number) => ms.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(m)).toFixed(1)}`).join('')
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(months.length / Math.floor(plotW / 44)))
  const main = paths[0]?.months ?? []
  const cross = main.findIndex((m) => m.savedTotal >= m.owed && m.savedTotal > 0)
  const band = plotW / Math.max(months.length - 1, 1)
  // Word labels beside the end of the main path, kept 14px apart so they never overlap.
  const last = main.length - 1
  let owedY = last >= 0 ? y(main[last].owed) + 4 : 0
  let savedY = last >= 0 ? y(main[last].savedTotal) + 4 : 0
  if (Math.abs(owedY - savedY) < 14) {
    const mid = (owedY + savedY) / 2
    const owedAbove = main[last].owed >= main[last].savedTotal
    owedY = Math.min(mid + (owedAbove ? -7 : 7), PAD.top + plotH + 4)
    savedY = Math.min(mid + (owedAbove ? 7 : -7), PAD.top + plotH + 4)
  }

  function onKey(e: KeyboardEvent<SVGRectElement>, i: number) {
    const next = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, Home: 0, End: months.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const to = Math.min(Math.max(next, 0), months.length - 1)
    setActive(to)
    ;(e.currentTarget.parentNode?.querySelectorAll<SVGRectElement>('[data-month]')[to])?.focus()
  }

  return (
    <div ref={ref}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: OWED }} /> Still owed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: SAVED }} /> Savings
        </li>
        {paths.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden="true">
                <line x1="0" x2="18" y1="2" y2="2" stroke="#475569" strokeWidth="2" strokeDasharray={p.dashed ? '4 3' : undefined} />
              </svg>
              {p.label}
            </li>
          ))}
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
            <text key={m.month} x={x(i)} y={H - 6} textAnchor={x(i) > W - PAD.right - 24 ? 'end' : 'middle'} fontSize="11" fill="#64748b">
              {monthLabel(m.month, false)}
              {m.month.endsWith('-01') || i === 0 ? ` ’${m.month.slice(2, 4)}` : ''}
            </text>
          ) : null,
        )}
        <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="#cbd5e1" strokeWidth="1" />
        {/* Draw the main path last so it sits on top. */}
        {[...paths].reverse().map((p) => (
          <g key={p.key}>
            <path d={line(p.months, (m) => m.owed)} fill="none" stroke={OWED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dashed ? '6 4' : undefined} />
            <path d={line(p.months, (m) => m.savedTotal)} fill="none" stroke={SAVED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dashed ? '6 4' : undefined} />
          </g>
        ))}
        {last > 0 && (
          <g fontSize="11" fill="#334155" pointerEvents="none">
            <text x={x(last) + 6} y={owedY}>
              Owed
            </text>
            <text x={x(last) + 6} y={savedY}>
              Saved
            </text>
          </g>
        )}
        {cross > 0 && (
          <g>
            <circle cx={x(cross)} cy={y(main[cross].savedTotal)} r="5" fill={SAVED} stroke="#ffffff" strokeWidth="2" />
            <text x={x(cross) + (x(cross) > W - 130 ? -8 : 8)} y={y(main[cross].savedTotal) - 8} textAnchor={x(cross) > W - 130 ? 'end' : 'start'} fontSize="11" fill="#0f172a">
              Savings pass debt
            </text>
          </g>
        )}
        {months.map((m, i) => (
          <rect
            key={m.month}
            x={x(i) - band / 2}
            y={PAD.top}
            width={band}
            height={plotH}
            fill="transparent"
            data-month={m.month}
            tabIndex={i === active ? 0 : -1}
            role="button"
            aria-label={`${monthLabel(m.month)}: ${paths.map((p) => `${p.label} still owed ${formatPeso(p.months[i]?.owed ?? 0)}, savings ${formatPeso(p.months[i]?.savedTotal ?? 0)}`).join('; ')}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            style={{ outline: 'none', cursor: 'pointer' }}
          />
        ))}
      </svg>
      {months[active] && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">
          <p className="text-slate-600">After the {monthLabel(months[active].month)} bills</p>
          <table className="mt-1 w-full text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left font-normal">{paths.length > 1 ? 'Path' : ''}</th>
                <th className="font-normal">Still owed</th>
                <th className="font-normal">Savings</th>
              </tr>
            </thead>
            <tbody>
              {paths.map((p) => {
                const m = p.months[active]
                return (
                  <tr key={p.key}>
                    <td className="text-left text-slate-600">{paths.length > 1 ? p.label : ''}</td>
                    <td className="font-semibold text-slate-900">{formatPeso(m.owed)}</td>
                    <td className="font-semibold text-slate-900">{formatPeso(m.savedTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {paths
            .filter((p) => (p.months[active]?.carried ?? 0) > 0)
            .map((p) => (
              <p key={p.key} className="mt-1 text-amber-900">
                ! {formatPeso(p.months[active].carried)} carried to the next bill ({p.label.toLowerCase()})
              </p>
            ))}
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-green-900">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 text-left font-normal">Month</th>
                {paths.map((p) => (
                  <th key={p.key} className="py-1 font-normal" colSpan={2}>
                    {p.label}: owed · saved
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {months.map((m, i) => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="py-1 text-left">{monthLabel(m.month)}</td>
                  {paths.map((p) => (
                    <td key={p.key} className="py-1" colSpan={2}>
                      {formatPeso(p.months[i].owed)} · {formatPeso(p.months[i].savedTotal)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
