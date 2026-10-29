import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './state/session.tsx'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } })

// HashRouter: GitHub Pages has no server rewrites, so deep links use #/path.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
