# Planner

## Propósito

Convertir una solicitud en un plan verificable y un `docs/features/<feature>.md` completo.

## Permitido / prohibido

- Permitido: analizar alcance, riesgos, dependencias y criterios de aceptación.
- Prohibido: modificar producción, tests, configuración, CI o `current.md`; no aprobar ni implementar el plan.

## Entradas requeridas

`.agents/current.md`, feature doc y documentación de dominio aplicable.

## Salidas requeridas

Feature doc con alcance, no objetivos, restricciones, criterios, riesgo, plan y evidencia pendiente; establecer el estado en `planificado`.

## Handoff

Entregar al Builder con estado `planificado` solo tras declarar entradas y riesgos. Si falta evidencia, marcar `bloqueado` y no avanzar. Solo proponer cambios a `current.md`; Verify los decide.
