import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />
}

/** Peso amount: numeric keypad on phones. */
export function AmountInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'>) {
  return <input type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" className={`${inputClass} text-2xl font-semibold`} {...props} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={inputClass} {...props}>
      {children}
    </select>
  )
}

/** Tap-to-pick buttons for short lists (category, account). */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              o.value === value ? 'border-green-900 bg-green-900 text-white' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function SuccessNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">
      {message}
    </p>
  )
}
