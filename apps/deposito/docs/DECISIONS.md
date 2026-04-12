# DECISIONS.md — Depósito

Registro de decisiones arquitectónicas y de producto. Cada decisión incluye contexto, opciones evaluadas y motivo de elección.

---

## D001 — Backend: Node + Express (no Supabase)

**Fecha:** 02/04/2026
**Contexto:** Se evaluó Supabase por sus features out-of-the-box (auth, realtime, RLS) vs Node + Express por control total.
**Decisión:** Node + Express.
**Motivo:** Lógica de negocio compleja (distribución parcial de actas, FIFO, órdenes de producción) se resuelve mejor en código propio. Experiencia previa del developer con este stack. Sin dependencia de servicio externo.

## D002 — ORM: Prisma (no Drizzle ni SQL raw)

**Fecha:** 02/04/2026
**Decisión:** Prisma.
**Motivo:** Estándar de la industria, genera tipos TypeScript automáticamente, schema declarativo, buena documentación. Curva de aprendizaje suave para el developer.

## D003 — Base de datos: PostgreSQL (no MongoDB)

**Fecha:** 02/04/2026
**Decisión:** PostgreSQL.
**Motivo:** Datos altamente relacionales (actas → items → inventario → movimientos). FIFO se resuelve con queries ordenados por fecha de vencimiento. Integridad referencial nativa.

## D004 — Autenticación: JWT propio (no Clerk/Auth0)

**Fecha:** 02/04/2026
**Decisión:** JWT propio.
**Motivo:** Pocos usuarios (~5-10), roles simples (encargado, observador, solicitante). No justifica dependencia externa ni costo potencial.

## D005 — Realtime: SSE (no Socket.io ni Polling)

**Fecha:** 02/04/2026
**Contexto:** Se necesita que observadores vean cambios en tiempo real sin refrescar. Se evaluó Socket.io (experiencia previa en ChecAR con race condition), SSE, y polling.
**Decisión:** SSE (Server-Sent Events).
**Motivo:** Unidireccional (servidor→cliente) es suficiente para notificaciones. Las consultas de observadores van por HTTP REST normal. Sin la complejidad bidireccional de Socket.io. Sin las race conditions experimentadas en ChecAR.

## D006 — Component Library: shadcn/ui + cmdk

**Fecha:** 02/04/2026
**Decisión:** shadcn/ui para componentes generales, cmdk para command palette.
**Motivo:** shadcn/ui es copy-paste (sin dependencia npm), Tailwind-native, accesible. cmdk es del mismo autor, se integra naturalmente. Ambos compatibles con Google Stitch + DESIGN.md.

## D007 — Design System: Google Stitch + DESIGN.md

**Fecha:** 02/04/2026
**Decisión:** Usar Stitch para prototipar pantallas y exportar DESIGN.md como referencia persistente para Claude Code.
**Motivo:** AI-native, exporta tokens legibles por agentes. El DESIGN.md vive en el repo y Claude Code lo lee en cada sesión para mantener consistencia visual.

## D008 — Buscador: fuzzy search local (no server-side)

**Fecha:** 02/04/2026
**Decisión:** fuse.js para fuzzy search en el frontend.
**Motivo:** ~150 productos totales. No justifica búsqueda server-side ni servicios como Algolia. Fuzzy matching local es instantáneo, sin costo, y soporta búsqueda por fragmentos ("comp b 100" → "Complejo B B12 B15 100 ML"). Índice de frecuencia en localStorage.

## D009 — Memoria de desarrollo: Engram standalone (no SDD/Agent Teams)

**Fecha:** 02/04/2026
**Contexto:** Se evaluó el ecosistema completo de Gentleman Programming (gentle-ai install) vs Engram solo.
**Decisión:** Solo Engram como MCP server para Claude Code.
**Motivo:** SDD/Agent Teams usa sub-agentes que consumen tokens extra. Con plan Pro de $20, el budget es limitado. Engram solo es un binario Go local que no consume tokens — solo persiste memorias en SQLite.

## D010 — Scope Fase 1: Drogas como primer módulo

**Fecha:** 02/04/2026
**Contexto:** Se debatió entre arrancar por drogas (más simple) o estuches/etiquetas (dolor más grande).
**Decisión:** Drogas primero.
**Motivo:** Es el módulo más simple (producto + cantidad), permite validar toda la arquitectura (auth, CRUD, acta, command palette, movimientos) sin la complejidad de mercados de exportación. Estuches/etiquetas se agregan en Fase 2 sobre una base probada.

## D011 — Pricing: $200 USD/mes como piso

**Fecha:** 02/04/2026
**Decisión:** Professional a $200/mes, Enterprise a $350/mes, Enterprise+ cotización.
**Motivo:** No se vende como "app de inventario" sino como sistema operativo integral. Incluye depósito + logística (Ale-Bet). El valor se justifica por eliminación de procesos manuales, trazabilidad para auditorías, y predicción de consumo. Margen bruto estimado: 85-95%.
