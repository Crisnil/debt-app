import { Navigate, useSearchParams } from 'react-router-dom'

/** Old "Other entries" links (/add/other?type=…) open the same entry on the Add page. */
export function OtherEntriesPage() {
  const [params] = useSearchParams()
  return <Navigate to={oldAddLink(params.get('type'))} replace />
}

/** Old /add/other links: income and received money are Money in; savings is a move to the savings account. */
function oldAddLink(type: string | null): string {
  if (type === 'move') return '/add?type=move'
  if (type === 'save') return '/add?type=move&to=savings'
  return '/add?type=in'
}
