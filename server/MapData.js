'use strict';

const {
  TILES, PARAMS, TASK_DEFS, VENT_DEFS, DOOR_DEFS
} = require('./constants');

// ── マップグリッド生成 ────────────────────────────────────────────────────────
// MAP_WIDTH=45, MAP_HEIGHT=29  (col 0-44, row 0-28)
// 部屋レイアウト:
//   Court(中庭):     col 1-14,  row 1-11
//   Dining(食堂):    col 16-31, row 1-11
//   Chapel(礼拝室): col 1-14,  row 14-27
//   Storage(倉庫):  col 16-31, row 14-27
//   Cloakroom(外套): col 33-43, row 8-21
function generateMapGrid() {
  const W = PARAMS.MAP_WIDTH;
  const H = PARAMS.MAP_HEIGHT;
  const T = TILES;

  // 全てWALLで初期化
  const grid = Array.from({ length: H }, () => new Array(W).fill(T.WALL));

  const fill = (x1, y1, x2, y2, tile = T.FLOOR) => {
    for (let r = y1; r <= y2; r++)
      for (let c = x1; c <= x2; c++)
        if (r >= 0 && r < H && c >= 0 && c < W)
          grid[r][c] = tile;
  };

  // ── 部屋 ─────────────────────────────────────────
  fill( 1,  1, 14, 11); // Court (中庭)
  fill(16,  1, 31, 11); // Dining (食堂)
  fill( 1, 14, 14, 27); // Chapel (礼拝室)
  fill(16, 14, 31, 27); // Storage (倉庫)
  fill(33,  8, 43, 21); // Cloakroom (外套の間)

  // ── 廊下 ─────────────────────────────────────────
  fill(15,  4, 15,  8); // Court ↔ Dining (縦)
  fill( 6, 12, 10, 13); // Court ↔ Chapel (横)
  fill(22, 12, 26, 13); // Dining ↔ Storage (横)
  fill(32, 15, 32, 19); // Storage ↔ Cloakroom (縦)

  // ── ドア ─────────────────────────────────────────
  grid[ 6][15] = T.DOOR;  // Court-Dining
  grid[13][ 8] = T.DOOR;  // Court-Chapel
  grid[13][24] = T.DOOR;  // Dining-Storage
  grid[17][32] = T.DOOR;  // Storage-Cloakroom

  // ── タスク ────────────────────────────────────────
  TASK_DEFS.forEach(t => {
    if (t.row >= 0 && t.row < H && t.col >= 0 && t.col < W)
      grid[t.row][t.col] = T.TASK;
  });

  // ── 緊急招集ボタン ────────────────────────────────
  grid[6][24] = T.EMERGENCY;

  // ── ベント ────────────────────────────────────────
  VENT_DEFS.forEach(v => {
    if (v.row >= 0 && v.row < H && v.col >= 0 && v.col < W)
      grid[v.row][v.col] = T.VENT;
  });

  return grid;
}

const MAP_GRID = generateMapGrid();

/**
 * ピクセル座標が歩行可能かチェック
 * @param {number} px - ピクセルX
 * @param {number} py - ピクセルY
 * @param {Set<string>} lockedDoors - ロック中ドアキー "col,row" の Set
 * @returns {boolean}
 */
function isWalkable(px, py, lockedDoors = new Set()) {
  const col = Math.floor(px / PARAMS.TILE_SIZE);
  const row = Math.floor(py / PARAMS.TILE_SIZE);

  if (row < 0 || row >= PARAMS.MAP_HEIGHT || col < 0 || col >= PARAMS.MAP_WIDTH)
    return false;

  const tile = MAP_GRID[row][col];
  if (tile === TILES.WALL) return false;
  if (tile === TILES.DOOR) {
    return !lockedDoors.has(`${col},${row}`);
  }
  return true;
}

module.exports = { MAP_GRID, generateMapGrid, isWalkable };
