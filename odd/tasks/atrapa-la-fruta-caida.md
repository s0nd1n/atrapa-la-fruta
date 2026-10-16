# Especificación Técnica: Juego Interactivo "Atrapa la Fruta Caída" (Webcam)

## Objetivo
Implementar un mini-juego arcade web en una sola página que use la cámara web del usuario y detección de movimiento por frame differencing para atrapar frutas y esquivar bombas.

## Branch
`feature/atrapa-la-fruta-caida`

## Delivery strategy
`ask-on-risk` (predeterminada)

## Commits
- `ccafe2a` — MVP completo (T1-T6)

## Test runner
Navegador (inspección manual de flujos BDD). No hay runner de tests automatizado configurado; la verificación es funcional en el navegador.

## Specs
S1: Gestión de cámara y permisos con `getUserMedia`, pantalla de solicitud, aviso de privacidad, efecto espejo, botón de apagar/encender, modo fallback con mouse/touch.
S2: Detección de movimiento por frame differencing en `<canvas>` oculto, umbral y área mínima configurables, mapeo de coordenadas con compensación de espejo.
S3: Lógica del juego: spawn aleatorio de frutas/bombas, colisión AABB con área de movimiento, puntuación +10 por fruta, -1 vida por bomba o fruta al suelo, game over en 0 vidas, cooldown breve tras colisión.
S4: UI/HUD: pantalla de inicio, HUD con puntuación y vidas, pantalla de Game Over con puntuación final y récord en `localStorage`, pausa con tecla `P`, textos en español.
S5: Requisitos no funcionales: bucle `requestAnimationFrame` a 60 FPS, procesamiento de cámara exclusivamente local (sin servidor), HTTPS requerido en producción, accesibilidad básica (ARIA, contraste), manejo de errores de permiso/cámara.
S6: Stack y estructura: Vanilla HTML5/CSS3/JS (ES6+), archivos `index.html`, `style.css`, `game.js`, `motion.js`, sonidos generados con Web Audio API (sin assets externos obligatorios).
S7: Dificultad progresiva: velocidad de caída y frecuencia de spawn aumentan con la puntuación.
S8: Flujo extendido: reinicio sin recargar la página, limpieza de tracks de cámara al salir, fallback sin cámara.

## Tasks
| ID | Specs | Route | Commit | Status |
|----|-------|-------|--------|--------|
| T1 | S6 | inline | ccafe2a | done |
| T2 | S1, S4 | inline | ccafe2a | done |
| T3 | S1, S4, S5 | inline | ccafe2a | done |
| T4 | S2 | inline | ccafe2a | done |
| T5 | S3, S7, S8 | inline | ccafe2a | done |
| T6 | S1-S8 | inline | ccafe2a | done (sintaxis JS verificada con `node --check`) |

## Log
L1: Usuario solicitó implementar todo `spec.md` de una vez (2026-10-16).
L2: MVP implementado en un solo commit `ccafe2a` sobre `feature/atrapa-la-fruta-caida`: index.html, style.css, motion.js, game.js. Verificación de sintaxis JS aprobada. Pendiente: prueba funcional en navegador (permisos de cámara, frame differencing, colisiones, game over y récord).