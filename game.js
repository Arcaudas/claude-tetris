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

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
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
  return cleared;
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
  const cleared = clearLines();
  registerCombo(cleared);
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
  updateComboHUD();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  showGameOverRecords();
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
    hideRecordsUI();
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
  resetCombo();
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
  // Sin tablero la partida aún no ha empezado (pantalla de inicio): ignorar teclas.
  if (!board) return;
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

initTheme();

/* ===== TABLA DE RECORDS ===== */

const RECORDS_STORAGE_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const DEFAULT_PLAYER_NAME = 'ANÓNIMO';

const comboEl = document.getElementById('combo');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsStartBtn = document.getElementById('reset-records-start');
const gameOverRecordsEl = document.getElementById('gameover-records');
const recordForm = document.getElementById('record-form');
const playerNameInput = document.getElementById('player-name');
const saveRecordBtn = document.getElementById('save-record-btn');
const resetRecordsGameOverBtn = document.getElementById('reset-records-gameover');

// Combo: número de piezas consecutivas que han limpiado al menos una línea.
let combo = 0;
let maxComboThisGame = 0;

/* ---- Combo ---- */

function resetCombo() {
  combo = 0;
  maxComboThisGame = 0;
  updateComboHUD();
}

function registerCombo(clearedLines) {
  if (clearedLines > 0) {
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
  } else {
    combo = 0;
  }
  updateComboHUD();
}

function updateComboHUD() {
  comboEl.textContent = combo;
}

/* ---- Persistencia ---- */

function createEmptyRecordsData() {
  return { records: [], bestCombo: 0, maxLines: 0 };
}

function toSafeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toSafeName(value) {
  const name = typeof value === 'string' ? value.trim().slice(0, 12) : '';
  return name || DEFAULT_PLAYER_NAME;
}

// Un JSON corrupto o manipulado no debe romper el juego: validamos la forma
// de cada campo y descartamos lo que no encaje.
function normalizeRecordsData(rawData) {
  if (!rawData || typeof rawData !== 'object') return createEmptyRecordsData();

  const rawRecords = Array.isArray(rawData.records) ? rawData.records : [];
  const records = rawRecords
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      name: toSafeName(entry.name),
      score: toSafeNumber(entry.score),
      lines: toSafeNumber(entry.lines),
      level: toSafeNumber(entry.level),
      date: typeof entry.date === 'string' ? entry.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);

  return {
    records,
    bestCombo: toSafeNumber(rawData.bestCombo),
    maxLines: toSafeNumber(rawData.maxLines),
  };
}

function loadRecordsData() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return createEmptyRecordsData();
    return normalizeRecordsData(JSON.parse(raw));
  } catch (error) {
    // localStorage bloqueado (modo privado) o JSON inválido: seguimos sin records.
    return createEmptyRecordsData();
  }
}

function saveRecordsData(data) {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Si no se puede persistir, la partida continúa igualmente.
  }
}

function qualifiesForTop(candidateScore, data) {
  if (candidateScore <= 0) return false;
  if (data.records.length < MAX_RECORDS) return true;
  return candidateScore > data.records[data.records.length - 1].score;
}

/* ---- Render de la tabla ---- */

function createCell(tagName, text, className) {
  const cell = document.createElement(tagName);
  cell.textContent = text; // textContent: nunca innerHTML con entrada del usuario.
  if (className) cell.className = className;
  return cell;
}

function createRecordsTable(records, highlightedIndex) {
  const table = document.createElement('table');
  table.className = 'records-table';

  const headerRow = document.createElement('tr');
  headerRow.appendChild(createCell('th', '#'));
  headerRow.appendChild(createCell('th', 'NOMBRE'));
  headerRow.appendChild(createCell('th', 'PUNTOS'));
  headerRow.appendChild(createCell('th', 'LÍNEAS'));
  table.appendChild(headerRow);

  records.forEach((record, index) => {
    const row = document.createElement('tr');
    if (index === highlightedIndex) row.className = 'record-highlight';
    row.appendChild(createCell('td', String(index + 1)));
    row.appendChild(createCell('td', record.name, 'record-name'));
    row.appendChild(createCell('td', record.score.toLocaleString()));
    row.appendChild(createCell('td', String(record.lines)));
    table.appendChild(row);
  });

  return table;
}

function renderRecordsPanel(container, data, highlightedIndex) {
  container.replaceChildren();

  container.appendChild(createCell('p', 'MEJORES PUNTUACIONES', 'records-title'));

  if (data.records.length === 0) {
    container.appendChild(createCell('p', 'Todavía no hay records', 'records-empty'));
  } else {
    container.appendChild(createRecordsTable(data.records, highlightedIndex));
  }

  const stats = document.createElement('p');
  stats.className = 'records-stats';
  stats.textContent = `Mejor combo: ${data.bestCombo} · Líneas máximas: ${data.maxLines}`;
  container.appendChild(stats);
}

function renderStartRecords() {
  renderRecordsPanel(startRecordsEl, loadRecordsData(), -1);
}

/* ---- Game over ---- */

// Guarda combo y líneas máximas de la partida aunque la puntuación no entre en el top.
function updateGlobalStats(data) {
  if (maxComboThisGame > data.bestCombo) data.bestCombo = maxComboThisGame;
  if (lines > data.maxLines) data.maxLines = lines;
  saveRecordsData(data);
}

function hideRecordsUI() {
  recordForm.classList.add('hidden');
  gameOverRecordsEl.classList.add('hidden');
  resetRecordsGameOverBtn.classList.add('hidden');
}

function showGameOverRecords() {
  const data = loadRecordsData();
  updateGlobalStats(data);

  gameOverRecordsEl.classList.remove('hidden');
  resetRecordsGameOverBtn.classList.remove('hidden');
  renderRecordsPanel(gameOverRecordsEl, data, -1);

  if (qualifiesForTop(score, data)) {
    playerNameInput.value = '';
    saveRecordBtn.disabled = false;
    recordForm.classList.remove('hidden');
    playerNameInput.focus();
  } else {
    recordForm.classList.add('hidden');
  }
}

function saveCurrentScore() {
  const data = loadRecordsData();
  if (!qualifiesForTop(score, data)) return;

  const newRecord = {
    name: toSafeName(playerNameInput.value),
    score: score,
    lines: lines,
    level: level,
    date: new Date().toISOString(),
  };

  data.records.push(newRecord);
  data.records.sort((a, b) => b.score - a.score);
  data.records = data.records.slice(0, MAX_RECORDS);
  saveRecordsData(data);

  // Resaltamos la fila recién insertada localizándola por identidad de objeto.
  const highlightedIndex = data.records.indexOf(newRecord);
  renderRecordsPanel(gameOverRecordsEl, data, highlightedIndex);

  saveRecordBtn.disabled = true;
  recordForm.classList.add('hidden');
  renderStartRecords();
}

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  const emptyData = createEmptyRecordsData();
  saveRecordsData(emptyData);
  renderStartRecords();
  renderRecordsPanel(gameOverRecordsEl, emptyData, -1);
}

/* ---- Arranque ---- */

function startGame() {
  startScreen.classList.add('hidden');
  init();
}

playBtn.addEventListener('click', startGame);
saveRecordBtn.addEventListener('click', saveCurrentScore);
playerNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') saveCurrentScore();
});
resetRecordsStartBtn.addEventListener('click', resetRecords);
resetRecordsGameOverBtn.addEventListener('click', resetRecords);

renderStartRecords();
updateComboHUD();
