import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatPeso } from '../../lib/money'
import { OTHER_COLOR } from './palette'

export type DonutPart = { id: string; name: string; amount: number; color: string; to?: string }

const GAP = 0.5 // % of the ring left as white surface between parts (about 2px at this size)
const MAX_PARTS = 6

/** At most 6 parts: the first 5 in the given order, then "Other" with the rest (and any gray part) together. */
function foldOther(parts: DonutPart[]): DonutPart[] {
  const colored = parts.filter((p) => p.color !== OTHER_COLOR)
  const keep = parts.length > MAX_PARTS ? colored.slice(0, MAX_PARTS - 1) : colored
  const rest = parts.filter((p) => !keep.includes(p))
  if (rest.length <= 1) return parts.length > MAX_PARTS ? [...keep, ...rest] : parts
  return [...keep, { id: 'other', name: `Other: ${rest.map((p) => p.name).join(', ')}`, amount: rest.reduce((s, p) => s + p.amount, 0), color: OTHER_COLOR }]
}

/** Ring of parts with the total in the middle and a legend with the amounts. The legend carries every value. */
export function Donut({ parts: given, centerLabel, children }: { parts: DonutPart[]; centerLabel: string; children?: ReactNode }) {
  const parts = foldOther(given)
  const total = parts.reduce((s, p) => s + p.amount, 0)
  const shares = parts.map((p) => (total > 0 ? (p.amount / total) * 100 : 0))
  const arcs = parts.map((p, i) => ({
    ...p,
    start: shares.slice(0, i).reduce((s, v) => s + v, 0),
    length: Math.max(shares[i] - (parts.length > 1 ? GAP : 0), 0.5),
  }))

  return (
    // Side by side only when the card itself is wide (container query), so two donuts next to each other stack inside.
    <div className="@container">
      <div className="grid items-center gap-4 @lg:grid-cols-[minmax(0,11rem)_1fr] @lg:gap-6">
        <svg viewBox="0 0 200 200" className="mx-auto w-44" role="img" aria-label={`${centerLabel}: ${formatPeso(total)}`}>
          <circle cx="100" cy="100" r="78" fill="none" stroke={total > 0 ? '#ffffff' : '#f1f5f9'} strokeWidth="26" />
          {arcs.map((a) => (
            <circle
              key={a.id}
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke={a.color}
              strokeWidth="26"
              pathLength={100}
              strokeDasharray={`${a.length} ${100 - a.length}`}
              strokeDashoffset={-a.start}
              transform="rotate(-90 100 100)"
            />
          ))}
          <text x="100" y="100" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">
            {formatPeso(total).replace(/\.\d{2}$/, '')}
          </text>
          <text x="100" y="122" textAnchor="middle" fontSize="12" fill="#64748b">
            {centerLabel}
          </text>
        </svg>
        <div>
          {children}
          <ul className="divide-y divide-slate-100 text-sm">
            {parts.map((p) => {
              const row = (
                <>
                  <span className="flex items-center gap-2 text-slate-700">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
                    {p.name}
                  </span>
                  <b className="text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatPeso(p.amount)}
                  </b>
                </>
              )
              return (
                <li key={p.id}>
                  {p.to ? (
                    <Link to={p.to} className="flex items-center justify-between py-2">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between py-2">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
