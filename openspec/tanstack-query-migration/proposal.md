# Change Proposal: TanStack Query Migration

**Status**: proposal → spec → design → tasks → apply → verify → archive

## Intent
Migrate all 19 pages in Depósito and Ale-Bet modules from manual `useState`/`useEffect`/`fetch` patterns to `@tanstack/react-query` (`useQuery`/`useMutation`), following the pattern already established in the notifications module.

## Scope
19 pages total:
- **Depósito (13)**: DashboardPage, DrogasPage, EstuchesPage, EtiquetasPage, FrascosPage, ActasPage, ActaNuevaPage, ActaDetallePage, OrdenesPage, PendientesPage, MovimientosPage, MetricasPage, UsuariosPage
- **Ale-Bet (6)**: DashboardPage, ProductosPage, ClientesPage, PedidosPage, StockPage, HistorialPage

## Approach
- Create `queries/` directory in each module with custom hooks per resource
- Query key convention: `['app', 'resource', ...params]`
- Mutations with `invalidateQueries` on success
- Leverage existing typed API modules

## Out of Scope
- No business logic changes
- No Zustand store migration
- No new features
- No UI component refactors
- No server changes

## Risks
- Regression in complex forms (ActaNuevaPage, OrdenesPage)
- Mixed local state + server state in pages with sorting/filtering
- SSE + React Query refetch interaction
