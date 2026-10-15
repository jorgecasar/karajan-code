# Sin móvil enrolado, kj init lo enrola guiado y bajar de nivel vale con las capas humanas

Status: proposed
Date: 2026-10-15

## Context

Campo (15-oct-2026): un usuario actualizó kj, se encontró con la seguridad máxima por defecto pidiendo firma de móvil, kj init no lo enrolaba, kj doctor lo listaba como opcional y para bajar a normal necesitaba justo el móvil que no tenía.

## Decision

Uno: kj init, cuando hay una persona en la terminal y ningún móvil enrolado, ofrece enrolarlo en el momento (enlace o QR y clave pública, con las mismas validaciones que el enrolamiento de siempre); sin terminal solo informa. Dos: si no hay ningún móvil enrolado (ni en la home ni en el padrón del repo), bajar de máxima a normal vale con las capas humanas de la terminal y el código tecleado en /dev/tty; el registro queda marcado sin firma y vale solo mientras no exista ningún móvil: al enrolar uno vuelve a leerse como máxima hasta bajarlo firmado.

## Consequences

Sin móvil, la máxima solo bloqueaba; ahora deja salir a una persona y no a un agente, porque cada acto en normal sigue exigiendo las capas humanas. Riesgo residual: el fichero del nivel no está entre los ficheros de gobierno del Sentinel, así que un agente podría escribir el registro sin firma; no le sirve para firmar actos, y protegerlo en el Sentinel queda como card aparte porque toca su plantilla y necesita el sello. Alternativa descartada: exigir siempre el móvil, máximo rigor a costa de dejar atascado a quien no lo tiene.
