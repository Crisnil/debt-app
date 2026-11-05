import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Health } from '../../domain/health'
import { STATUS } from './palette'

type Props = {
  label: string
  /** Under the label: what the ratio compares, e.g. "₱120,000 of ₱200,000". */
  detail: ReactNode
  /** 0–1 (more than 1 fills the arc). null: not enough data; the arc stays gray. */
  ratio: number | null
  health: Health | null
  /** Status word, e.g. "Careful". Shown with the status icon. */
  word: string
  /** Up/down compared with last month, in text. */
  trend?: string
  to?: string
}

/** Half-circle gauge: the arc fills with the ratio in the status color; the number, icon, and word carry the meaning too. */
export function Gauge({ label, detail, ratio, health, word, trend, to }: Props) {
  const style = health ? STATUS[health] : { fill: '#94a3b8', track: '#e2e8f0', icon: '' }
  const pct = ratio === null ? null : Math.round(ratio * 100)
  const filled = ratio === null ? 0 : Math.max(Math.min(ratio, 1), 0) * 100
  const body = (
    <>
      <svg viewBox="0 0 120 70" className="mx-auto block w-full max-w-36" role="img" aria-label={`${label}: ${pct === null ? 'not set' : `${pct}%`}, ${word}`}>
        <path d="M12,62 A48,48 0 0 1 108,62" fill="none" stroke={style.track} strokeWidth="12" strokeLinecap="round" />
        {filled > 0 && (
          <path d="M12,62 A48,48 0 0 1 108,62" fill="none" stroke={style.fill} strokeWidth="12" strokeLinecap="round" pathLength={100} strokeDasharray={`${filled} 100`} />
        )}
        <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">
          {pct === null ? '—' : `${pct}%`}
        </text>
      </svg>
      <p className="mt-1 text-sm font-medium text-slate-900">
        {style.icon} {word}
      </p>
      <p className="text-sm text-slate-700">{label}</p>
      <p className="text-xs text-slate-500">{detail}</p>
      {trend && <p className="mt-0.5 text-xs text-slate-500">{trend}</p>}
    </>
  )
  const box = 'block rounded-xl bg-white p-3 text-center shadow-sm'
  return to ? (
    <Link to={to} className={`${box} active:bg-slate-50`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}
