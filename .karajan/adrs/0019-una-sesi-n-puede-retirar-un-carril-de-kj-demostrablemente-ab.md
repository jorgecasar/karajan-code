# Una sesión puede retirar un carril de kj demostrablemente abandonado

Status: proposed
Date: 2026-10-14

## Context

Decisión del owner (14-oct, opción 1). Los runs de kj dejan carriles en .kj/worktrees que ninguna sesión podía retirar: el guard de carriles bloquea tocar otro worktree y la limpieza caía siempre en la terminal del usuario.

## Decision

kj worktree prune retira, también desde una sesión de agente, los worktrees de kj y las ramas kj-hu-* que pasan tres pruebas: árbol limpio, cero commits fuera de origin/<base> y ningún proceso vivo con el directorio dentro. Lo que no las pasa se lista con su motivo y no se toca; lo dudoso sigue siendo de la persona. Cada retirada queda en el acta. Matiza el aislamiento de carriles (ADR 0002) y el cruce solo humano (ADR 0015) para este caso, que no puede contener trabajo de nadie.

## Consequences

Detectar procesos vivos por /proc solo vale en Linux: en otros sistemas ningún carril es demostrablemente abandonado y no se retira. Un carril con trabajo sin commitear o commits propios sigue necesitando a la persona.
