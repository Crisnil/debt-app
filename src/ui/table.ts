/** Shared look for the compact tables on Settings, Plan, and Bills. */
export const th = 'py-1.5 text-xs font-medium text-slate-500'
export const editButton = 'rounded-md px-2 py-1 text-sm text-green-900 underline hover:bg-green-50'

/** Which pop-up is open: a new item, an item to edit, or none. */
export type Editing<T> = { item: T | null } | null
