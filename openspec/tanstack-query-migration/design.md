# Design: TanStack Query Migration

## File Structure
```
modules/deposito/queries/     ← NEW (11 files)
modules/ale-bet/queries/      ← NEW (6 files)
```

## Query Key Factory
```ts
export const drogasKeys = {
  all: ['deposito', 'drogas'] as const,
  list: (filters?) => [...drogasKeys.all, 'list', filters] as const,
  detail: (id: string) => [...drogasKeys.all, 'detail', id] as const,
}
```

## Hook Pattern
- `useDrogas(filters?)` → `useQuery({ queryKey, queryFn })`
- `useCreateDroga()` → `useMutation({ mutationFn, onSuccess: invalidate })`

## Config
staleTime: 30s, gcTime: 5min, retry: 1
