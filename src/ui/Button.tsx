import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }

const styles = {
  primary: 'bg-green-900 text-white active:bg-green-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 active:bg-slate-100',
  danger: 'border border-red-300 bg-white text-red-700 active:bg-red-50',
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  )
}
