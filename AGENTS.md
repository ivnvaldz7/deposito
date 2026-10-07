# AGENTS.md — Plataforma

## Propósito

Sistema SaaS de gestión operativa para depósitos de laboratorios veterinarios. Monorepo Turborepo con npm workspaces.

## Inicio obligatorio

Antes de planificar, modificar, probar o revisar una funcionalidad, leer en este orden:

1. `.agents/current.md`.
2. `docs/features/<feature>.md` (crear desde `docs/features/TEMPLATE.md` si aún no existe).
3. `docs/PRD.md`, `docs/CONTEXT.md`, `docs/ARCHITECTURE.md` y `docs/GLOSSARY.md` antes de escribir código.
4. El rol correspondiente en `.agents/`.

Este harness es fuente de verdad operativa compacta para OpenCode, Gemini y modelos OSS que sigan el workflow Gentle/SDD. Para Codex, estos archivos son contexto del repositorio, no un gatillo automático de SDD. No asumir que documentación no verificada refleja el estado actual.

## Política de ejecución

### Codex — ejecución nativa

Codex no está obligado a ejecutar el workflow SDD/Gentle del repositorio. Por defecto trabaja de forma nativa:

1. Inspect.
2. Plan solo cuando la complejidad o el riesgo lo justifique.
3. Implement.
4. Test.
5. Review.

Codex puede inspeccionar primero el código y los contratos reales, hacer planes breves cuando hagan falta, implementar cambios acotados, usar sus propios subagentes cuando aporten valor real, ejecutar tests focalizados, y escalar planificación, testing o review según riesgo. Puede consultar toda la documentación histórica del proyecto como contexto.

TDD para Codex es una herramienta recomendada, no una ceremonia obligatoria. Úsalo especialmente en bugs reproducibles, lógica de negocio, autorización/RBAC, stock o inventario, concurrencia, idempotencia, transacciones, seguridad y regresiones complejas. En cambios visuales simples, copy, imports, refactors mecánicos o configuración trivial no se exige RED → GREEN → REFACTOR como gate artificial; los tests deben demostrar comportamiento, no satisfacer ceremonia.

Codex no está obligado a ejecutar `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify` ni `sdd-archive`, ni a recorrer Planner → Builder → Tester → Reviewer → Verify, ni a ejecutar Gentle-AI, ni a crear artefactos SDD, ni a esperar gates/metodología Gentle, ni a delegar por ceremonia cuando puede resolver el cambio directamente.

Codex ejecuta SDD/Gentle únicamente cuando el usuario lo solicita explícitamente o cuando una tarea específica lo exige de forma expresa. La sola existencia de `.agents/`, OpenSpec, documentos SDD, estados Gentle o roles de agentes no activa automáticamente SDD para Codex.

### OpenCode y Gemini — Gentle/SDD vigente

OpenCode y Gemini conservan el workflow actual del repositorio. Todo cambio sigue SDD y TDD estricto:

```text
sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive
RED → GREEN → REFACTOR
```

Para ejecutar trabajo con esos agentes, respetar el protocolo: **Planner → Builder → Tester → Reviewer → Verify**. Cada rol entrega su salida al siguiente; ningún rol aprueba su propio trabajo. Ante un bloqueo, registrar evidencia y estado `bloqueado`; no avanzar.

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
