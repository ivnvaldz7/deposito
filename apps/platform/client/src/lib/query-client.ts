import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s antes de considerar stale
      gcTime: 5 * 60_000,       // 5min en caché después de desuscribirse
      retry: 1,                 // 1 reintento antes de error
      refetchOnWindowFocus: false,
    },
  },
})
