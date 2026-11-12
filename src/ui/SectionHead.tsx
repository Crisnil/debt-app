/** A card title with an optional "+ Add …" link on the right. */
export function SectionHead({ title, addLabel, onAdd }: { title: string; addLabel?: string; onAdd?: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="font-medium text-slate-900">{title}</h2>
      {onAdd && (
        <button type="button" className="text-sm text-green-900 underline" onClick={onAdd}>
          {addLabel}
        </button>
      )}
    </div>
  )
}
