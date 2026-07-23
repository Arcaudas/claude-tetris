'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;

// El color de la rejilla vive en CSS, así que lo releemos cada vez que
// cambia algo que pueda afectarlo (tema claro/oscuro o skin visual).
function refreshGridColor() {
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  refreshGridColor();
  localStorage.setItem('tetris-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('tetris-theme');
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  if (board) draw();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Punto único de dibujado de bloque: delega en la skin activa.
// Ver el bloque "SKINS VISUALES" al final del fichero.
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  SKINS[currentSkin].drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

/* ===== SKINS VISUALES ===== */

// Paletas indexadas 1–7 igual que COLORS (la posición 0 siempre es null).
const RETRO_COLORS = COLORS;

const PASTEL_COLORS = [
  null,
  '#a8e6e2', // I
  '#ffe9a8', // O
  '#d9bde8', // T
  '#bfe6c3', // S
  '#f5b7b7', // Z
  '#bcd4f2', // J
  '#ffd6a8', // L
];

const NEON_COLORS = [
  null,
  '#00fff7', // I
  '#fff700', // O
  '#e000ff', // T
  '#00ff6a', // S
  '#ff0055', // Z
  '#3d8bff', // J
  '#ff9500', // L
];

const PIXEL_COLORS = [
  null,
  '#2ec4d6', // I
  '#e8bd2a', // O
  '#a55cc4', // T
  '#5cb85c', // S
  '#d64545', // Z
  '#4a7fd6', // J
  '#e8892a', // L
];

// Cada skin aporta su paleta y su propia forma de pintar un bloque.
// Firma común: drawBlock(context, x, y, colorIndex, size, alpha).
const SKINS = {
  retro: {
    label: 'Retro',
    colors: RETRO_COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1;
      const py = y * size + 1;
      const side = size - 2;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = RETRO_COLORS[colorIndex];
      context.fillRect(px, py, side, side);
      // banda de brillo superior
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px, py, side, 4);
      context.globalAlpha = 1;
    },
  },

  neon: {
    label: 'Neon',
    colors: NEON_COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = NEON_COLORS[colorIndex];
      const px = x * size + 2;
      const py = y * size + 2;
      const side = size - 4;
      context.globalAlpha = alpha ?? 1;
      // relleno oscuro para que sólo destaque el contorno luminoso
      context.fillStyle = 'rgba(10,10,20,0.85)';
      context.fillRect(px, py, side, side);
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px, py, side, side);
      // el glow es estado global del contexto: hay que apagarlo siempre
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = 1;
    },
  },

  pastel: {
    label: 'Pastel',
    colors: PASTEL_COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 2;
      const py = y * size + 2;
      const side = size - 4;
      const radius = Math.max(2, Math.floor(size / 5));
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = PASTEL_COLORS[colorIndex];
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(px, py, side, side, radius);
        context.fill();
      } else {
        // navegadores sin roundRect: esquinas rectas, mismo color
        context.fillRect(px, py, side, side);
      }
      context.globalAlpha = 1;
    },
  },

  pixel: {
    label: 'Pixel art',
    colors: PIXEL_COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 1;
      const py = y * size + 1;
      const side = size - 2;
      const dot = Math.max(2, Math.floor(size / 8)); // tamaño del "píxel" de textura
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = PIXEL_COLORS[colorIndex];
      context.fillRect(px, py, side, side);
      // luces arriba/izquierda
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, side, dot);
      context.fillRect(px, py, dot, side);
      // sombras abajo/derecha
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px, py + side - dot, side, dot);
      context.fillRect(px + side - dot, py, dot, side);
      // pequeños píxeles sueltos para dar textura
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(px + dot * 2, py + dot * 2, dot, dot);
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(px + side - dot * 3, py + side - dot * 3, dot, dot);
      context.globalAlpha = 1;
    },
  },
};

const DEFAULT_SKIN = 'retro';
const SKIN_STORAGE_KEY = 'tetris-skin';

let currentSkin = DEFAULT_SKIN;

const skinSelect = document.getElementById('skin-select');

function loadSavedSkin() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    return saved && SKINS[saved] ? saved : DEFAULT_SKIN;
  } catch (error) {
    // localStorage puede lanzar en modo privado o con cookies bloqueadas
    return DEFAULT_SKIN;
  }
}

function saveSkin(skinName) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skinName);
  } catch (error) {
    // sin persistencia, pero el juego debe seguir funcionando
  }
}

function applySkin(skinName) {
  currentSkin = SKINS[skinName] ? skinName : DEFAULT_SKIN;
  // el atributo permite a CSS cambiar fondo y rejilla del canvas
  document.documentElement.setAttribute('data-skin', currentSkin);
  skinSelect.value = currentSkin;
  refreshGridColor();
  saveSkin(currentSkin);
  // repinta al momento aunque el juego esté en pausa
  if (board) {
    draw();
    drawNext();
  }
}

function initSkin() {
  for (const [name, skin] of Object.entries(SKINS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = skin.label;
    skinSelect.appendChild(option);
  }
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
  applySkin(loadSavedSkin());
}

initTheme();
initSkin();
init();
