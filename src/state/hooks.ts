import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { loadWorkbook } from '../data/workbook'
import { AuthError, currentToken } from '../google/auth'
import { SessionContext, type Session } from './sessionContext'

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

export function useWorkbook() {
  const { signedIn, sheet } = useSession()
  return useQuery({
    queryKey: ['workbook', sheet?.id],
    enabled: signedIn && sheet !== null,
    queryFn: async () => {
      const token = currentToken()
      if (!token) throw new AuthError('Sign in to load your sheet.')
      return loadWorkbook(sheet!.id, token)
    },
    retry: (count, error) => !(error instanceof AuthError) && count < 2,
    staleTime: 60_000,
  })
}
