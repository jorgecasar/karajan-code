# KJ Default Workflow (Claude Code)

## Objetivo
Usar Karajan Code (KJ) como orquestador por defecto para implementar tareas y corregir bugs.

## Regla por defecto
Si el usuario pide implementar/fix/refactor (o "hacer la siguiente tarea prioritaria"), no edites manualmente primero:
1. Obtener tarea (si aplica) desde Planning Game MCP.
2. Ejecutar KJ por MCP con `karajan-mcp` usando `kj_run`.

## Flujo operativo por defecto
1. Si la petición no trae tarea concreta:
   - Consultar Planning Game MCP y recuperar la tarea más prioritaria.
2. Ejecutar `kj_run` con estos defaults:
   - `mode: "standard"`
   - `methodology: "tdd"`
   - `coder: "claude"`
   - `reviewer: "codex"`
   - `reviewerFallback: "claude"`
   - `maxIterations: 5`
   - `maxIterationMinutes: 5`
3. Mostrar resultado y resumen de cambios.

## Cuándo cambiar el comportamiento
- Si el usuario pide máxima rigurosidad: usar `mode: "paranoid"`.
- Si el usuario pide explícitamente no TDD: usar `methodology: "standard"`.
- Si `kj_run` falla, diagnosticar (`kj_doctor`, `kj_config`) y reintentar.
- Solo editar manualmente si el usuario lo pide o KJ no puede completar.

## Troubleshooting y arquitectura de subprocesos

Ver `docs/troubleshooting.md` para problemas comunes. Puntos clave:

- **Claude como subproceso**: Claude Code 2.x requiere 3 workarounds al lanzar `claude -p` desde Node.js: strip `CLAUDECODE` env var, `stdin: "ignore"`, leer de stderr (no stdout). Ver `src/agents/claude-agent.js` → `cleanExecaOpts()` / `pickOutput()`.
- **Wizards interactivos**: El coder corre sin stdin. Tareas que requieren `pnpm create astro`, `npm init`, etc. deben usar flags `--yes`/`--no-input` o reportar que no pueden completarse.
- **Checkpoint**: Si `elicitInput` devuelve null, la sesión continúa (no se para). Solo "stop" o "4" explícito la detiene.
- **Resume**: `kj_resume` acepta sesiones stopped, failed y paused.

## Ejemplo natural
Input usuario: "realiza la tarea siguiente más prioritaria del proyecto".
Acción esperada:
1. Leer tarea prioritaria en PG MCP.
2. Lanzar `kj_run` con esa tarea y defaults anteriores.
