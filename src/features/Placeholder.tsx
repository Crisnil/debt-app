type PlaceholderProps = {
  title: string
  phase: number
  detail: string
}

export function Placeholder({ title, phase, detail }: PlaceholderProps) {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{detail}</p>
      <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Coming in phase {phase}.
      </p>
    </section>
  )
}
