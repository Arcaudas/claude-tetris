# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ejecutar el juego

Sin build, sin dependencias. Abrir directamente o usar servidor estático:

```bash
python3 -m http.server 8000   # luego http://localhost:8000
```

## Arquitectura

Tres archivos cooperando, toda la lógica en `game.js` (~305 líneas, sin módulos):

- `index.html` — DOM: `<canvas id="board">` (300×600 px), `<canvas id="next-canvas">` (vista previa), panel HUD lateral, overlay pausa/game-over.
- `style.css` — dark retro theme, flexbox layout, backdrop-filter en overlays.
- `game.js` — lógica completa, estado global mutable.

### Estado global en `game.js`

Variables sueltas (no objeto): `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`.

### Flujo principal

```
init() → spawn() → requestAnimationFrame(loop)
loop(ts): acumula dt → baja pieza o lockPiece() → draw() → rAF(loop)
lockPiece(): merge() → clearLines() → spawn()
spawn(): si colisión al aparecer → endGame()
```

### Puntos clave

- `PIECES[type]` — matrices cuadradas indexadas 1–7; valor 0=vacío, 1–7=índice de color.
- `collide(shape, ox, oy)` — comprueba límites y solapamiento con el tablero.
- `rotateCW(shape)` — transposición + reverso de filas; devuelve nueva matriz.
- `tryRotate()` — wall kicks: prueba offsets `[0, -1, 1, -2, 2]` antes de descartar.
- `ghostY()` — proyecta la pieza hacia abajo; dibujada con `globalAlpha = 0.2`.
- Velocidad: `max(100, 1000 − (level − 1) × 90)` ms; sube cada 10 líneas.
- Puntuación hard drop: +2 pts/celda; soft drop: +1 pt/fila.

### Parámetros tuneable (top de `game.js`)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array 8 pos), `LINE_SCORES` ([0,100,300,500,800]).  
Si cambias `COLS`/`ROWS`/`BLOCK`, ajustar también `width`/`height` del canvas en `index.html`.
