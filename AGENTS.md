# AGENTS.md — Plataforma

## Propósito

Sistema SaaS de gestión operativa para depósitos de laboratorios veterinarios. Monorepo Turborepo con npm workspaces.

## Inicio obligatorio

Antes de planificar, modificar, probar o revisar una funcionalidad, leer en este orden:

1. `.agents/current.md`.
2. `docs/features/<feature>.md` (crear desde `docs/features/TEMPLATE.md` si aún no existe).
3. `docs/PRD.md`, `docs/CONTEXT.md`, `docs/ARCHITECTURE.md` y `docs/GLOSSARY.md` antes de escribir código.
4. El rol correspondiente en `.agents/`.

Este harness es fuente de verdad operativa compacta para Codex, Gemini, OpenCode y modelos OSS. No asumir que documentación no verificada refleja el estado actual.

## Flujo obligatorio

Todo cambio sigue SDD y TDD estricto:

```text
sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive
RED → GREEN → REFACTOR
```

Para ejecutar trabajo, respetar el protocolo: **Planner → Builder → Tester → Reviewer → Verify**. Cada rol entrega su salida al siguiente; ningún rol aprueba su propio trabajo. Ante un bloqueo, registrar evidencia y estado `bloqueado`; no avanzar.

## Reglas de colaboración y Git

- No hacer commits ni push sin pedido explícito del usuario.
- No trabajar directamente sobre `master`.
- Respetar un workspace sucio: no eliminar, resetear, restaurar ni sobrescribir cambios ajenos.
- No expandir scope sin autorización explícita.
- Commits, si se solicitan: Conventional Commits `type(scope): descripción`; sin `Co-Authored-By` ni atribución de IA.
- TypeScript estricto: sin `any`, `as unknown` ni `@ts-ignore`.

## Riesgo y aprobación

| Nivel | Alcance | Requisito |
|---|---|---|
| Bajo | Solo documentación o comentarios | Flujo normal y Verify. |
| Estándar | Código o tests normales | Flujo completo. |
| Alto | Stock, auth, transacciones, permisos, Prisma/schema o CI | Reviewer independiente y Verify obligatorios. |

Usar `.agents/current.md` para rutas, comandos, salvaguardas y evidencia vigente.
