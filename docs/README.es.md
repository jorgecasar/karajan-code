<p align="center">
<<<<<<< HEAD
  <img src="karajan-code-logo-small.png" alt="Karajan Code" width="200">
=======
  <img src="karajan-code-logo-small.png" alt="Karajan Code" width="180">
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
</p>

<h1 align="center">Karajan Code</h1>

<p align="center">
<<<<<<< HEAD
  Orquestador local multi-agente con TDD, SonarQube y revision de codigo automatizada.
=======
  Orquestador local multi-agente. TDD-first, basado en MCP, JavaScript vanilla.
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/karajan-code"><img src="https://img.shields.io/npm/v/karajan-code.svg" alt="npm version"></a>
<<<<<<< HEAD
=======
  <a href="https://www.npmjs.com/package/karajan-code"><img src="https://img.shields.io/npm/dw/karajan-code.svg" alt="npm downloads"></a>
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
  <a href="https://github.com/manufosela/karajan-code/actions"><img src="https://github.com/manufosela/karajan-code/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js"></a>
</p>

<p align="center">
<<<<<<< HEAD
  <a href="../README.md">Read in English</a>
=======
  <a href="../README.md">Read in English</a> · <a href="https://karajancode.com">Documentacion</a>
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
</p>

---

<<<<<<< HEAD
## Que es Karajan Code?

Karajan Code (`kj`) orquesta multiples agentes de IA a traves de un pipeline automatizado: generacion de codigo, analisis estatico, revision de codigo, testing y auditorias de seguridad — todo en un solo comando.

En lugar de ejecutar un agente de IA y revisar manualmente su output, `kj` encadena agentes con quality gates. El coder escribe codigo, SonarQube lo analiza, el reviewer lo revisa, y si hay problemas, el coder recibe otra oportunidad. Este bucle se repite hasta que el codigo es aprobado o se alcanza el limite de iteraciones.

**Caracteristicas principales:**
- **Pipeline multi-agente** con 11 roles configurables
- **5 agentes de IA soportados**: Claude, Codex, Gemini, Aider, OpenCode
- **Servidor MCP** con 20 herramientas — usa `kj` desde Claude, Codex o cualquier host compatible con MCP sin salir de tu agente. [Ver configuracion MCP](#servidor-mcp)
- **Bootstrap obligatorio** — valida prerequisitos del entorno (git, remote, config, agentes, SonarQube) antes de cada ejecucion. Si algo falta, para con instrucciones claras
- **TDD obligatorio** — se exigen cambios en tests cuando se modifican ficheros fuente
- **Integracion con SonarQube** — analisis estatico con quality gates (requiere [Docker](#requisitos))
- **Perfiles de revision** — standard, strict, relaxed, paranoid
- **Tracking de presupuesto** — monitorizacion de tokens y costes por sesion con `--trace`
- **Automatizacion Git** — auto-commit, auto-push, auto-PR tras aprobacion
- **Gestion de sesiones** — pausa/reanudacion con deteccion fail-fast y limpieza automatica de sesiones expiradas
- **Sistema de plugins** — extiende con agentes custom via `.karajan/plugins/`
- **Checkpoints interactivos** — en lugar de matar tareas largas, pausa cada 5 minutos con un informe de progreso y te deja decidir: continuar, parar o ajustar el tiempo
- **Descomposicion de tareas** — triage detecta cuando una tarea debe dividirse y recomienda subtareas; con integracion Planning Game, crea cards vinculadas con bloqueo secuencial
- **Retry con backoff** — recuperacion automatica ante errores transitorios de API (429, 5xx) con backoff exponencial y jitter
- **Pipeline stage tracker** — vista de progreso acumulativo durante `kj_run` mostrando que stages estan completadas, en ejecucion o pendientes — tanto en CLI como via eventos MCP para renderizado en tiempo real en el host
- **Guardarrailes de observabilidad del planner** — telemetria continua de heartbeat/stall, proteccion configurable por silencio maximo (`session.max_agent_silence_minutes`) y limite duro de ejecucion (`session.max_planner_minutes`) para evitar bloqueos prolongados en `kj_plan`/planner
- **Standby por rate-limit** — cuando un agente alcanza limites de uso, Karajan parsea el tiempo de espera, espera con backoff exponencial y reanuda automaticamente en vez de fallar
- **Preflight handshake** — `kj_preflight` requiere confirmacion humana de la configuracion de agentes antes de ejecutar, previniendo que la IA cambie asignaciones silenciosamente
- **Config de 3 niveles** — sesion > proyecto > global con scoping de `kj_agents`
- **Mediacion inteligente del reviewer** — el scope filter difiere automaticamente issues del reviewer fuera de scope (ficheros no presentes en el diff) como deuda tecnica rastreada en vez de bloquear; Solomon media reviews estancados; el contexto diferido se inyecta en el prompt del coder
- **Integracion con Planning Game** — combina opcionalmente con [Planning Game](https://github.com/AgenteIA-Geniova/planning-game) para gestion agil de proyectos (tareas, sprints, estimacion) — como Jira, pero open-source y nativo XP

> **Mejor con MCP** — Karajan Code esta disenado para usarse como servidor MCP dentro de tu agente de IA (Claude, Codex, etc.). El agente envia tareas a `kj_run`, recibe notificaciones de progreso en tiempo real, y obtiene resultados estructurados — sin copiar y pegar.

## Requisitos

- **Node.js** >= 18
- **Docker** — necesario para el analisis estatico con SonarQube. Si no tienes Docker o no necesitas SonarQube, desactivalo con `--no-sonar` o `sonarqube.enabled: false` en la config
- Al menos un agente de IA instalado: Claude, Codex, Gemini o Aider

## Pipeline

```
triage? ─> researcher? ─> planner? ─> coder ─> refactorer? ─> sonar? ─> reviewer ─> tester? ─> security? ─> commiter?
```

| Rol | Descripcion | Por defecto |
|-----|-------------|-------------|
| **triage** | Director de pipeline — analiza la complejidad y activa roles dinamicamente | **On** |
| **researcher** | Investiga el contexto del codebase antes de planificar | Off |
| **planner** | Genera planes de implementacion estructurados | Off |
| **coder** | Escribe codigo y tests siguiendo metodologia TDD | **Siempre activo** |
| **refactorer** | Mejora la claridad del codigo sin cambiar comportamiento | Off |
| **sonar** | Ejecuta analisis estatico SonarQube y quality gates | On (si configurado) |
| **reviewer** | Revision de codigo con perfiles de exigencia configurables | **Siempre activo** |
| **tester** | Quality gate de tests y verificacion de cobertura | **On** |
| **security** | Auditoria de seguridad OWASP | **On** |
| **solomon** | Supervisor de sesion — monitoriza salud de iteraciones con 5 reglas (incl. reviewer overreach), media reviews estancados, escala ante anomalias | **On** |
| **commiter** | Automatizacion de git commit, push y PR tras aprobacion | Off |

Los roles marcados con `?` son opcionales y se pueden activar por ejecucion o via config.

## Instalacion

### Desde npm (recomendado)

```bash
npm install -g karajan-code
kj init
```

### Desde codigo fuente

```bash
git clone https://github.com/manufosela/karajan-code.git
cd karajan-code
./scripts/install.sh
```

### Setup no interactivo (CI/automatizacion)

```bash
./scripts/install.sh \
  --non-interactive \
  --kj-home /ruta/a/.karajan \
  --sonar-host http://localhost:9000 \
  --sonar-token "$KJ_SONAR_TOKEN" \
  --coder claude \
  --reviewer codex \
  --run-doctor true
```

### Setup multi-instancia

Guias completas: [`docs/multi-instance.md`](multi-instance.md) | [`docs/install-two-instances.md`](install-two-instances.md)

```bash
./scripts/setup-multi-instance.sh
```

## Agentes soportados

| Agente | CLI | Instalacion |
|--------|-----|-------------|
| **Claude** | `claude` | `npm install -g @anthropic-ai/claude-code` |
| **Codex** | `codex` | `npm install -g @openai/codex` |
| **Gemini** | `gemini` | Ver [Gemini CLI docs](https://github.com/google-gemini/gemini-cli) |
| **Aider** | `aider` | `pipx install aider-chat` (o `pip3 install aider-chat`) |

`kj init` auto-detecta los agentes instalados. Si solo hay uno disponible, se asigna a todos los roles automaticamente.
=======
Tu describes lo que quieres construir. Karajan orquesta multiples agentes de IA para planificarlo, implementarlo, testearlo, revisarlo con SonarQube e iterar. Sin que tengas que supervisar cada paso.

## Que es Karajan?

Karajan es un orquestador de codigo local. Corre en tu maquina, usa tus proveedores de IA existentes (Claude, Codex, Gemini, Aider, OpenCode) y coordina un pipeline de agentes especializados que trabajan juntos en tu codigo.

No es un servicio en la nube. No es una extension de VS Code. Es una herramienta que instalas una vez y usas desde la terminal o como servidor MCP dentro de tu agente de IA.

El nombre viene de Herbert von Karajan, el director de orquesta que creia que las mejores orquestas estan formadas por grandes musicos independientes que saben exactamente cuando tocar y cuando escuchar. La misma idea, aplicada a agentes de IA.

## Por que no usar solo Claude Code?

Claude Code es excelente. Usalo para codificacion interactiva basada en sesiones.

Usa Karajan cuando quieras:

- **TDD por defecto.** Los tests se escriben antes de la implementacion, no despues
- **Integracion con SonarQube.** Quality gates como parte del flujo, no como algo secundario
- **Solomon como jefe del pipeline.** Cada rechazo del reviewer es evaluado por un supervisor que decide si es valido o solo ruido de estilo
- **Enrutamiento multi-proveedor.** Claude como coder, Codex como reviewer, o cualquier combinacion
- **Operacion zero-config.** Auto-detecta frameworks de test, arranca SonarQube, simplifica el pipeline para tareas triviales
- **Arquitectura de roles composable.** Comportamientos de agente definidos como ficheros markdown que viajan con tu proyecto
- **Local-first.** Tu codigo, tus claves, tu maquina. Ningun dato sale salvo que tu lo digas
- **Zero costes de API.** Karajan usa CLIs de agentes de IA (Claude Code, Codex, Gemini CLI), no APIs. Pagas tu suscripcion existente (Claude Pro, ChatGPT Plus), no tarifas por token

Si Claude Code es un programador de pares inteligente, Karajan es el pipeline CI/CD para desarrollo asistido por IA. Funcionan genial juntos: Karajan esta disenado para usarse como servidor MCP dentro de Claude Code.

## Instalacion

```bash
npm install -g karajan-code
```

Eso es todo. No requiere Docker (SonarQube usa Docker, pero Karajan lo gestiona automaticamente). Sin ficheros de configuracion que copiar. `kj init` auto-detecta tus agentes instalados.
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920

## Tres formas de usar Karajan

Karajan instala **tres comandos**: `kj`, `kj-tail` y `karajan-mcp`.

<<<<<<< HEAD
### 1. CLI — Directamente desde terminal

```bash
kj run "Implementar autenticacion de usuario con JWT"
kj code "Anadir validacion de inputs al formulario de registro"
kj review "Revisar los cambios de autenticacion"
kj plan "Refactorizar la capa de base de datos"
```

### 2. MCP — Dentro de tu agente de IA

El caso de uso principal. Karajan corre como servidor MCP dentro de Claude Code, Codex o Gemini. El agente tiene acceso a 20 herramientas (`kj_run`, `kj_code`, `kj_review`, etc.) y delega el trabajo pesado al pipeline de Karajan.
=======
### 1. CLI: directamente desde terminal

Ejecuta Karajan directamente. Ves la salida completa del pipeline en tiempo real.

```bash
kj run "Crea una utilidad que valide numeros de DNI español, con tests"
kj code "Añade validacion de inputs al formulario de registro"     # Solo coder
kj review "Revisa los cambios de autenticacion"                     # Revisar diff actual
kj audit "Analisis completo de salud de este codebase"              # Auditoria solo-lectura
kj plan "Refactorizar la capa de base de datos"                     # Planificar sin codificar
```

### 2. MCP: dentro de tu agente de IA

Este es el caso de uso principal. Karajan corre como servidor MCP dentro de Claude Code, Codex o Gemini. Le pides algo a tu agente de IA y el delega el trabajo pesado al pipeline de Karajan.
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920

```
Tu → Claude Code → kj_run (via MCP) → triage → coder → sonar → reviewer → tester → security
```

<<<<<<< HEAD
**El problema**: cuando Karajan corre dentro de un agente de IA, pierdes visibilidad. El agente te muestra el resultado final, pero no las etapas del pipeline, iteraciones o decisiones de Solomon en tiempo real.

### 3. kj-tail — Monitorizar desde otro terminal

**La herramienta companera.** Abre un segundo terminal en el **mismo directorio del proyecto** donde esta trabajando tu agente de IA:
=======
El servidor MCP se auto-registra durante `npm install`. Tu agente de IA ve 20 herramientas (`kj_run`, `kj_code`, `kj_review`, etc.) y las usa segun necesite.

**El problema**: cuando Karajan corre dentro de un agente de IA, pierdes visibilidad. El agente te muestra el resultado final, pero no las etapas del pipeline, iteraciones o decisiones de Solomon en tiempo real.

### 3. kj-tail: monitorizar desde otro terminal

**La herramienta compañera.** Abre un segundo terminal en el **mismo directorio del proyecto** donde esta trabajando tu agente de IA:
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920

```bash
kj-tail
```

<<<<<<< HEAD
Veras la salida del pipeline en vivo — etapas, resultados, iteraciones, errores — tal como ocurren.

```bash
=======
Veras la salida del pipeline en vivo (etapas, resultados, iteraciones, errores) tal como ocurren. La misma vista que ejecutar `kj run` directamente.

```
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
kj-tail                  # Seguir pipeline en tiempo real (por defecto)
kj-tail -v               # Verbose: incluir heartbeats de agente y presupuesto
kj-tail -t               # Mostrar timestamps
kj-tail -s               # Snapshot: mostrar log actual y salir
kj-tail -n 50            # Mostrar ultimas 50 lineas y seguir
kj-tail --help           # Todas las opciones
```

> **Importante**: `kj-tail` debe ejecutarse desde el mismo directorio donde el agente de IA esta trabajando. Lee `<proyecto>/.kj/run.log`, que se crea cuando Karajan arranca un pipeline via MCP.

**Flujo tipico:**

```
┌──────────────────────────┐    ┌──────────────────────────┐
│  Terminal 1               │    │  Terminal 2               │
│                           │    │                           │
│  $ claude                 │    │  $ kj-tail                │
│  > implementa la          │    │                           │
│    siguiente tarea        │    │  ├─ 📋 Triage: medium     │
│    prioritaria            │    │  ├─ 🔬 Researcher ✅      │
│                           │    │  ├─ 🧠 Planner ✅         │
│  (Claude llama a kj_run   │    │  ├─ 🔨 Coder ✅           │
<<<<<<< HEAD
│   via MCP — solo ves      │    │  ├─ 🔍 Sonar: OK         │
=======
│   via MCP, solo ves       │    │  ├─ 🔍 Sonar: OK         │
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
│   el resultado final)     │    │  ├─ 👁️ Reviewer ❌        │
│                           │    │  ├─ ⚖️ Solomon: 2 cond.   │
│                           │    │  ├─ 🔨 Coder (iter 2) ✅  │
│                           │    │  ├─ ✅ Review: APPROVED    │
│                           │    │  ├─ 🧪 Tester: passed     │
│                           │    │  └─ 🏁 Result: APPROVED   │
└──────────────────────────┘    └──────────────────────────┘
```

<<<<<<< HEAD
**Ejemplo con pipeline completo** — tarea compleja con todos los roles:

```
┌─ Terminal 1 ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│  $ claude                                                                    │
│                                                                              │
│  > Construye una API REST para un sistema de reservas. Requisitos:           │
│  > - Express + TypeScript con validacion Zod en cada endpoint                │
│  > - Endpoints: POST /bookings, GET /bookings/:id,                           │
│  >   PATCH /bookings/:id/cancel                                              │
│  > - Una reserva tiene: id, guestName, roomType (standard|suite|penthouse),  │
│  >   checkIn, checkOut, status (confirmed|cancelled)                         │
│  > - Validar: checkOut posterior a checkIn, sin fechas pasadas,              │
│  >   roomType debe ser un valor valido del enum                              │
│  > - Cancelar devuelve 409 si ya esta cancelada                              │
│  > - Usa TDD. Ejecutalo con Karajan con architect y planner activos,         │
│  >   modo paranoid. Coder claude, reviewer codex.                            │
│                                                                              │
│  Claude llama a kj_run via MCP con:                                          │
│    --enable-architect --enable-researcher --enable-planner --mode paranoid    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Terminal 2: kj-tail ────────────────────────────────────────────────────────┐
│                                                                              │
│  kj-tail v1.36.1 — .kj/run.log                                              │
│                                                                              │
│  ├─ 📋 Triage: medium (sw) — activando researcher, architect, planner        │
│  ├─ ⚙️ Preflight passed — all checks OK                                     │
│  ├─ 🔬 Researcher: 8 ficheros, 3 patrones, 5 restricciones                  │
│  ├─ 🏗️ Architect: diseno 3 capas (routes → service → validators)            │
│  ├─ 🧠 Planner: 6 pasos — tests primero, luego rutas, servicio, validadores │
│  │                                                                           │
│  ▶ Iteracion 1/5                                                             │
│  ├─ 🔨 Coder (claude): 3 endpoints + 18 tests                               │
│  ├─ 📋 TDD: PASS (3 src, 2 test)                                            │
│  ├─ 🔍 Sonar: Quality gate OK                                               │
│  ├─ 👁️ Reviewer (codex): REJECTED (2 blocking)                              │
│  │   "Falta 404 para GET booking inexistente"                                │
│  │   "Endpoint cancel sin test de idempotencia"                              │
│  ├─ ⚖️ Solomon: approve_with_conditions (2 condiciones)                     │
│  │   "Anadir respuesta 404 y test para GET /bookings/:id con id desconocido" │
│  │   "Anadir test: cancelar reserva ya cancelada devuelve 409, no 500"       │
│  │                                                                           │
│  ▶ Iteracion 2/5                                                             │
│  ├─ 🔨 Coder (claude): corregido — 22 tests                                 │
│  ├─ 📋 TDD: PASS                                                            │
│  ├─ 🔍 Sonar: OK                                                            │
│  ├─ 👁️ Reviewer (codex): APPROVED                                           │
│  ├─ 🧪 Tester: passed — cobertura 94%, 22 tests                             │
│  ├─ 🔒 Security: passed — 0 criticos, 1 bajo (helmet recomendado)           │
│  ├─ 📊 Audit: CERTIFIED (3 advertencias)                                    │
│  │                                                                           │
│  🏁 Resultado: APPROVED                                                      │
│     🔬 Investigacion: 8 ficheros, 3 patrones                                 │
│     🗺 Plan: 6 pasos (tests primero)                                         │
│     🧪 Cobertura: 94%, 22 tests                                              │
│     🔒 Seguridad: OK                                                         │
│     🔍 Sonar: OK                                                             │
│     💰 Presupuesto: $0.42 (claude: $0.38, codex: $0.04)                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Comandos CLI

Consulta la [documentacion completa de comandos](../README.md#cli-commands) en el README principal (ingles). Resumen:

| Comando | Descripcion |
|---------|-------------|
| `kj init` | Wizard interactivo de configuracion |
| `kj run <task>` | Pipeline completo: coder → sonar → reviewer |
| `kj code <task>` | Solo coder (sin revision) |
| `kj review <task>` | Solo reviewer (sobre diff actual) |
| `kj plan <task>` | Generar plan de implementacion |
| `kj scan` | Ejecutar analisis SonarQube |
| `kj doctor` | Verificar entorno (git, Docker, agentes, SonarQube) |
| `kj config` | Mostrar configuracion actual |
| `kj report` | Informes de sesion con tracking de presupuesto |
| `kj resume <id>` | Reanudar sesion pausada |
| `kj roles` | Inspeccionar roles y templates del pipeline |
| `kj sonar` | Gestionar contenedor Docker de SonarQube |

## Servidor MCP

Karajan Code expone un servidor MCP para integracion con cualquier host compatible (Claude, Codex, agentes custom).

Tras `npm install -g karajan-code`, el servidor MCP se auto-registra en las configs de Claude y Codex. Config manual:

```json
{
  "mcpServers": {
    "karajan-mcp": {
      "command": "karajan-mcp"
    }
  }
}
```

### Herramientas MCP

| Herramienta | Descripcion |
|-------------|-------------|
| `kj_init` | Inicializar config y SonarQube |
| `kj_doctor` | Verificar dependencias del sistema |
| `kj_config` | Mostrar configuracion |
| `kj_scan` | Ejecutar analisis SonarQube |
| `kj_run` | Ejecutar pipeline completo (con notificaciones de progreso en tiempo real) |
| `kj_resume` | Reanudar sesion pausada |
| `kj_report` | Leer informes de sesion (soporta `--trace`) |
| `kj_roles` | Listar roles o mostrar templates |
| `kj_code` | Modo solo coder |
| `kj_review` | Modo solo reviewer |
| `kj_plan` | Generar plan de implementacion con telemetria heartbeat/stall y diagnostico mas claro |

### MCPs complementarios recomendados

Karajan Code funciona perfectamente solo, pero combinarlo con estos servidores MCP le da a tu agente un entorno de desarrollo completo:

| MCP | Para que | Caso de uso |
|-----|----------|-------------|
| [**Planning Game MCP**](https://github.com/AgenteIA-Geniova/planning-game-mcp) | Puente MCP para [Planning Game](https://github.com/AgenteIA-Geniova/planning-game), gestor agil open-source (tareas, sprints, estimacion, XP). Solo necesario si usas Planning Game | `kj_run` con `--pg-task` obtiene contexto completo de la tarea y actualiza el estado al completar |
| [**GitHub MCP**](https://github.com/modelcontextprotocol/servers/tree/main/src/github) | Crear PRs, gestionar issues, leer repos desde el agente | Combinar con `--auto-push` para flujo completo: codigo → revision → push → PR |
| [**Serena**](https://github.com/oramasearch/serena) | Navegacion a nivel de simbolo (find references, go-to-definition) para proyectos JS/TS | Activar con `--enable-serena` para inyectar contexto de simbolos en prompts de coder/reviewer |
| [**Chrome DevTools MCP**](https://github.com/anthropics/anthropic-quickstarts/tree/main/chrome-devtools-mcp) | Automatizacion de navegador, screenshots, inspeccion de consola/red | Verificar cambios de UI visualmente tras modificar codigo frontend |

## Templates de roles

Cada rol tiene un template `.md` con instrucciones que el agente de IA sigue. Los templates se resuelven en orden de prioridad:

1. **Override de proyecto**: `.karajan/roles/<rol>.md` (en la raiz del proyecto)
2. **Override de usuario**: `$KJ_HOME/roles/<rol>.md`
3. **Built-in**: `templates/roles/<rol>.md` (incluido en el paquete)

Usa `kj roles show <rol>` para inspeccionar cualquier template. Crea un override de proyecto para personalizar el comportamiento por proyecto.

**Variantes de revision**: `reviewer-strict`, `reviewer-relaxed`, `reviewer-paranoid` — seleccionables via flag `--mode` o config `review_mode`.
=======
[**Ver la demo completa del pipeline**](https://karajancode.com#demo): triage, arquitectura, TDD, SonarQube, code review, arbitraje de Solomon, auditoria de seguridad.

## El pipeline

```
hu-reviewer? → triage → discover? → architect? → planner? → coder → sonar? → impeccable? → reviewer → tester? → security? → solomon → commiter?
```

**15 roles**, cada uno ejecutado por el agente de IA que elijas:

| Rol | Que hace | Por defecto |
|-----|----------|-------------|
| **hu-reviewer** | Certifica historias de usuario antes de codificar (6 dimensiones, 7 antipatrones) | Auto (media/compleja) |
| **triage** | Clasifica complejidad, activa roles, auto-simplifica para tareas triviales | **On** |
| **discover** | Detecta huecos en requisitos (Mom Test, Wendel, JTBD) | Off |
| **architect** | Disena la arquitectura de la solucion antes de planificar | Off |
| **planner** | Genera planes de implementacion estructurados | Off |
| **coder** | Escribe codigo y tests siguiendo metodologia TDD | **Siempre on** |
| **refactorer** | Mejora la claridad del codigo sin cambiar comportamiento | Off |
| **sonar** | Analisis estatico SonarQube con quality gate enforcement | On (auto-gestionado) |
| **impeccable** | Auditoria UI/UX para tareas frontend (a11y, rendimiento, theming) | Auto (frontend) |
| **reviewer** | Code review con perfiles de exigencia configurables | **Siempre on** |
| **tester** | Quality gate de tests y verificacion de cobertura | **On** |
| **security** | Auditoria de seguridad OWASP | **On** |
| **solomon** | Jefe del pipeline: evalua cada rechazo, anula bloqueos solo de estilo | **On** |
| **commiter** | Automatizacion de git commit, push y PR tras aprobacion | Off |
| **audit** | Analisis de salud del codebase solo-lectura (5 dimensiones, scores A-F) | Standalone |

## 5 agentes de IA soportados

| Agente | CLI | Instalacion |
|--------|-----|-------------|
| **Claude** | `claude` | `npm install -g @anthropic-ai/claude-code` |
| **Codex** | `codex` | `npm install -g @openai/codex` |
| **Gemini** | `gemini` | Ver [Gemini CLI docs](https://github.com/google-gemini/gemini-cli) |
| **Aider** | `aider` | `pipx install aider-chat` (o `pip3 install aider-chat`) |
| **OpenCode** | `opencode` | Ver [OpenCode docs](https://github.com/nicepkg/opencode) |

Mezcla y combina. Usa Claude como coder y Codex como reviewer. Karajan auto-detecta agentes instalados durante `kj init`.

## Servidor MCP (20 herramientas)

Tras `npm install -g karajan-code`, el servidor MCP se auto-registra en Claude y Codex. Config manual si es necesario:

```bash
# Claude: anadir a ~/.claude.json → "mcpServers":
# { "karajan-mcp": { "command": "karajan-mcp" } }

# Codex: anadir a ~/.codex/config.toml → [mcp_servers."karajan-mcp"]
# command = "karajan-mcp"
```

**20 herramientas** disponibles: `kj_run`, `kj_code`, `kj_review`, `kj_plan`, `kj_audit`, `kj_scan`, `kj_doctor`, `kj_config`, `kj_report`, `kj_resume`, `kj_roles`, `kj_agents`, `kj_preflight`, `kj_status`, `kj_init`, `kj_discover`, `kj_triage`, `kj_researcher`, `kj_architect`, `kj_impeccable`.

Usa `kj-tail` en un terminal separado para ver lo que el pipeline esta haciendo en tiempo real (ver [Tres formas de usar Karajan](#tres-formas-de-usar-karajan)).

## La arquitectura de roles

Cada rol en Karajan esta definido por un fichero markdown: un documento plano que describe como debe comportarse el agente, que revisar y como es un buen output.

```
.karajan/roles/         # Overrides de proyecto (opcional)
~/.karajan/roles/       # Overrides globales (opcional)
templates/roles/        # Defaults built-in (incluidos en el paquete)
```

Puedes sobreescribir cualquier rol built-in o crear nuevos. Sin codigo. Los agentes leen los ficheros de rol y adaptan su comportamiento. Codifica las convenciones de tu equipo, reglas de dominio y estandares de calidad, y cada ejecucion de Karajan los aplica automaticamente.

Usa `kj roles show <rol>` para inspeccionar cualquier template.

## Zero-config por diseño

Karajan auto-detecta y auto-configura todo lo que puede:

- **TDD**: Detecta framework de tests (vitest, jest, mocha) y auto-activa TDD
- **Bootstrap gate**: Valida todos los prerequisitos (repo git, remote, config, agentes, SonarQube) antes de ejecutar. Falla con instrucciones claras, nunca degrada silenciosamente
- **Injection guard**: Escanea diffs en busca de prompt injection antes del review de IA. Detecta directivas de override, Unicode invisible, payloads en comentarios sobredimensionados. Tambien como GitHub Action en cada PR
- **SonarQube**: Auto-arranca contenedor Docker, genera config si falta
- **Complejidad del pipeline**: Triage clasifica la tarea, las triviales saltan el loop del reviewer
- **Caidas de proveedor**: Reintentos en 500/502/503/504 con backoff (igual que rate limits)
- **Cobertura**: Fallos de quality gate solo por cobertura se tratan como advisory
- **HU Manager**: Las tareas complejas se descomponen automaticamente en historias de usuario formales con dependencias. Cada HU se ejecuta como su propio sub-pipeline con seguimiento de estado visible en el HU Board

Sin configuracion por proyecto requerida. Si quieres personalizar, la config se apila: sesion > proyecto > global.

## Por qué JavaScript vanilla?

No es nostalgia ni cabezonería. Es que llevo usando JavaScript desde 1997, cuando Brendan Eich lo creó en una semana y nos cambió la vida a los que hacíamos webs. Conozco sus tripas, sus bugs, sus rarezas. Y sé que quien conoce JS de verdad convierte esos bugs en features. TypeScript existe para que developers acostumbrados a lenguajes fuertemente tipados no entren en pánico al ver JS. Respeto eso. Pero yo no lo necesito. Los tests son mi seguridad de tipos. JSDoc y un buen IDE son mi intellisense. Y no tener un compilador entre el código y yo es lo que me permite moverme a 57 releases en 45 días sin miedo.

[Por qué JavaScript vanilla: la versión larga](why-vanilla-js.md)

## Compañeros recomendados

| Herramienta | Por que |
|-------------|---------|
| [**RTK**](https://github.com/rtk-ai/rtk) | Reduce consumo de tokens 60-90% en salidas de comandos Bash |
| [**Planning Game MCP**](https://github.com/AgenteIA-Geniova/planning-game-mcp) | Gestion agil de proyectos (tareas, sprints, estimacion), nativo XP |
| [**GitHub MCP**](https://github.com/modelcontextprotocol/servers/tree/main/src/github) | Crear PRs, gestionar issues directamente desde el agente |
| [**Chrome DevTools MCP**](https://github.com/anthropics/anthropic-quickstarts/tree/main/chrome-devtools-mcp) | Verificar cambios de UI visualmente tras modificar frontend |
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920

## Contribuir

```bash
git clone https://github.com/manufosela/karajan-code.git
cd karajan-code
npm install
<<<<<<< HEAD
npm test              # Ejecutar 1040+ tests con Vitest
npm run test:watch    # Modo watch
npm run validate      # Lint + test
```

- Tests: [Vitest](https://vitest.dev/)
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`)
- PRs: un solo proposito por PR, < 300 lineas cambiadas
=======
npm test              # Ejecutar 2093 tests con Vitest
npm run validate      # Lint + test
```

Issues y pull requests bienvenidos. Si algo no funciona como esta documentado, [abre un issue](https://github.com/manufosela/karajan-code/issues). Es la contribucion mas util en esta fase.
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920

## Enlaces

- [Web](https://karajancode.com) (tambien [kj-code.com](https://kj-code.com))
<<<<<<< HEAD
- [Changelog](../CHANGELOG.md)
- [Politica de seguridad](../SECURITY.md)
- [Licencia (AGPL-3.0)](../LICENSE)
- [Issues](https://github.com/manufosela/karajan-code/issues)
=======
- [Documentacion completa](https://karajancode.com/docs/)
- [Changelog](../CHANGELOG.md)
- [Politica de seguridad](../SECURITY.md)
- [Licencia (AGPL-3.0)](../LICENSE)

---

Construido por [@manufosela](https://github.com/manufosela). Head of Engineering en Geniova Technologies, co-organizador de NodeJS Madrid, autor de [Liderazgo Afectivo](https://www.liderazgoafectivo.com). 90+ paquetes npm publicados.
>>>>>>> 8792e49efcdc75995e024d81339b100c7b253920
