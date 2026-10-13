import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

export function clearPrivateQueryCache(): void {
  // Cancellation prevents an old account's in-flight query repopulating the cache.
  void queryClient.cancelQueries();
  queryClient.clear();
}
