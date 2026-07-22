# Spec: TanStack Query Migration

## Requirements

### R1 — Consistent query key convention
Pattern: `[app, resource, ...filters/params]`

### R2 — Typed hooks per resource
Each resource needs list, detail, create, update, delete hooks

### R3 — Mutation invalidation
Invalidate list queries on successful mutations

### R4 — Error handling
Use react-query error states, keep toast notifications

### R5 — Zero regression
No business logic or UI changes. All tests must pass.

## Scenarios
S1: List with filters → useQuery with filter deps
S2: Detail page → useQuery with id
S3: Create/Edit form → useMutation + invalidate
S4: Dashboard multi-source → parallel useQuery
S5: Table with sorting → local sort state + useQuery
