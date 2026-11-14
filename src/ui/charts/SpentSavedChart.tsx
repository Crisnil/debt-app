import { useState } from 'react'
import type { MonthFlow } from '../../domain/home'
import { formatPeso } from '../../lib/money'
import { monthLabel, niceStep, SAVED_COLOR, shortPeso, SPENT_COLOR } from './palette'
import { topRounded, useWidth } from './shapes'

const H = 200
const PAD = { left: 44, right: 8, top: 12, bottom: 24 }

/**
 * Per month, two bars side by side: what we spent and what we moved to savings.
 * A month with more moved out of savings than in shows no saved bar; the note below says so.
 * Tap or focus a month to see its amounts below the chart. The last month is this month, so far.
 */
export function SpentSavedChart({ months }: { months: MonthFlow[] }) {
  const [active, setActive] = useState(months.length - 1)
  const [ref, W] = useWidth(360)
  const max = Math.max(...months.flatMap((m) => [m.spent, m.saved]), 1)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / months.length
  const barW = Math.min(18, band * 0.3)
  const y = (v: number) => PAD.top + plotH - (Math.max(v, 0) / top) * plotH
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const selected = months[active]
  const current = active === months.length - 1

  return (
    <div ref={ref}>
      <ul className="flex gap-4 text-xs text-slate-600" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SPENT_COLOR }} /> Spent
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SAVED_COLOR }} /> Moved to savings
        </li>
      </ul>

      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="mt-2 block max-w-full" role="img" aria-label={`Spent and moved to savings, last ${months.length} months`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {shortPeso(t)}
            </text>
          </g>
        ))}

        {months.map((m, mi) => {
          const x = PAD.left + mi * band + band / 2
          const bars = [
            { key: 'spent', value: m.spent, x: x - barW - 1, fill: SPENT_COLOR },
            { key: 'saved', value: m.saved, x: x + 1, fill: SAVED_COLOR },
          ].filter((b) => b.value > 0)
          return (
            <g key={m.month}>
              {mi === active && <rect x={PAD.left + mi * band + 1} y={PAD.top} width={band - 2} height={plotH} fill="#f1f5f9" rx="4" />}
              {bars.map((b) => (
                <path key={b.key} d={topRounded(b.x, y(b.value), barW, Math.max(y(0) - y(b.value), 1), 4)} fill={b.fill} />
              ))}
              <text x={x} y={H - 6} textAnchor="middle" fontSize="11" fill={mi === active ? '#0f172a' : '#64748b'}>
                {monthLabel(m.month, false)}
              </text>
              {/* Hit area: the whole month band, bigger than the bars. */}
              <rect
                x={PAD.left + mi * band}
                y={PAD.top}
                width={band}
                height={plotH + PAD.bottom}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${monthLabel(m.month)}: spent ${formatPeso(m.spent)}, moved to savings ${formatPeso(m.saved)}`}
                aria-pressed={mi === active}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(mi)}
                onClick={() => setActive(mi)}
                onFocus={() => setActive(mi)}
                style={{ outline: 'none', cursor: 'pointer' }}
              />
            </g>
          )
        })}
      </svg>

      {selected && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <p className="text-slate-600">
            {monthLabel(selected.month)}
            {current && ' (so far)'}
          </p>
          <p className="mt-1 flex justify-between">
            <span className="text-slate-600">Spent</span>
            <b className="text-slate-900">{formatPeso(selected.spent)}</b>
          </p>
          <p className="flex justify-between">
            <span className="text-slate-600">Moved to savings</span>
            <b className={selected.saved < 0 ? 'text-red-800' : 'text-slate-900'}>{formatPeso(selected.saved)}</b>
          </p>
          {selected.saved < 0 && <p className="mt-1 text-xs text-amber-900">! More was taken out of savings than put in.</p>}
        </div>
      )}
    </div>
  )
}
