// Map.js — クライアント側マップ生成・描画
// 依存: constants.js (グローバル変数)

class GameMap {
  constructor() {
    this.tileSize = PARAMS.TILE_SIZE;
    this.grid     = this._generateGrid();
    this._buildTorches();
  }

  // ── グリッド生成（サーバー側 MapData.js と完全一致）──────────────────────
  _generateGrid() {
    const W = PARAMS.MAP_WIDTH;
    const H = PARAMS.MAP_HEIGHT;
    const T = TILES;
    const grid = Array.from({ length: H }, () => new Array(W).fill(T.WALL));

    const fill = (x1, y1, x2, y2, tile = T.FLOOR) => {
      for (let r = y1; r <= y2; r++)
        for (let c = x1; c <= x2; c++)
          if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = tile;
    };

    // 部屋
    fill( 1,  1, 14, 11); // Court (中庭)
    fill(16,  1, 31, 11); // Dining (食堂)
    fill( 1, 14, 14, 27); // Chapel (礼拝室)
    fill(16, 14, 31, 27); // Storage (倉庫)
    fill(33,  8, 43, 21); // Cloakroom (外套の間)

    // 廊下
    fill(15,  4, 15,  8);
    fill( 6, 12, 10, 13);
    fill(22, 12, 26, 13);
    fill(32, 15, 32, 19);

    // ドア
    grid[ 6][15] = T.DOOR;
    grid[13][ 8] = T.DOOR;
    grid[13][24] = T.DOOR;
    grid[17][32] = T.DOOR;

    // タスク
    TASK_DEFS.forEach(t => {
      if (t.row >= 0 && t.row < H && t.col >= 0 && t.col < W)
        grid[t.row][t.col] = T.TASK;
    });

    // 緊急招集ボタン
    grid[6][24] = T.EMERGENCY;

    // ベント
    VENT_DEFS.forEach(v => {
      if (v.row >= 0 && v.row < H && v.col >= 0 && v.col < W)
        grid[v.row][v.col] = T.VENT;
    });

    return grid;
  }

  // 松明の位置（装飾）
  _buildTorches() {
    this.torches = [
      { col: 1,  row: 1  }, { col: 14, row: 1  }, { col: 1,  row: 11 }, { col: 14, row: 11 },
      { col: 16, row: 1  }, { col: 31, row: 1  }, { col: 16, row: 11 }, { col: 31, row: 11 },
      { col: 1,  row: 14 }, { col: 14, row: 14 }, { col: 1,  row: 27 }, { col: 14, row: 27 },
      { col: 16, row: 14 }, { col: 31, row: 14 }, { col: 16, row: 27 }, { col: 31, row: 27 },
      { col: 33, row: 8  }, { col: 43, row: 8  }, { col: 33, row: 21 }, { col: 43, row: 21 }
    ];
    this._torchPhase = 0;
  }

  getTile(col, row) {
    if (row < 0 || row >= PARAMS.MAP_HEIGHT || col < 0 || col >= PARAMS.MAP_WIDTH)
      return TILES.WALL;
    return this.grid[row][col];
  }

  isWall(col, row) { return this.getTile(col, row) === TILES.WALL; }

  /** ピクセル座標が歩行可能か（ドアロック状態考慮） */
  isWalkable(px, py, lockedDoors = []) {
    const col  = Math.floor(px / this.tileSize);
    const row  = Math.floor(py / this.tileSize);
    const tile = this.getTile(col, row);
    if (tile === TILES.WALL) return false;
    if (tile === TILES.DOOR) {
      return !lockedDoors.includes(`${col},${row}`);
    }
    return true;
  }

  // ── 描画 ─────────────────────────────────────────────────────────────────
  draw(ctx, camX, camY, canvasW, canvasH, lockedDoors = [], completedTasks = []) {
    const ts = this.tileSize;
    this._torchPhase += 0.05;

    const startC = Math.max(0, Math.floor(camX / ts) - 1);
    const endC   = Math.min(PARAMS.MAP_WIDTH  - 1, Math.ceil((camX + canvasW) / ts) + 1);
    const startR = Math.max(0, Math.floor(camY / ts) - 1);
    const endR   = Math.min(PARAMS.MAP_HEIGHT - 1, Math.ceil((camY + canvasH) / ts) + 1);

    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        const tile = this.grid[r][c];
        const sx   = Math.round(c * ts - camX);
        const sy   = Math.round(r * ts - camY);
        this._drawTile(ctx, tile, sx, sy, ts, c, r, lockedDoors, completedTasks);
      }
    }

    // 部屋名ラベル
    this._drawRoomLabels(ctx, camX, camY);

    // 松明の炎エフェクト
    this._drawTorches(ctx, camX, camY);
  }

  _drawTile(ctx, tile, sx, sy, ts, col, row, lockedDoors, completedTasks) {
    switch (tile) {
      case TILES.WALL: {
        // 石壁
        ctx.fillStyle = '#1C1209';
        ctx.fillRect(sx, sy, ts, ts);
        ctx.fillStyle = '#261810';
        ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);
        // ハイライトエッジ
        ctx.fillStyle = '#3A2518';
        ctx.fillRect(sx, sy, ts, 1);
        ctx.fillRect(sx, sy, 1, ts);
        break;
      }
      case TILES.FLOOR: {
        // 石床（タイル模様）
        const shade = ((col + row) % 2 === 0) ? '#3D2A18' : '#362415';
        ctx.fillStyle = shade;
        ctx.fillRect(sx, sy, ts, ts);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(sx, sy + ts - 1, ts, 1);
        ctx.fillRect(sx + ts - 1, sy, 1, ts);
        break;
      }
      case TILES.DOOR: {
        const locked = lockedDoors.includes(`${col},${row}`);
        if (locked) {
          ctx.fillStyle = '#5A1010';
          ctx.fillRect(sx, sy, ts, ts);
          // 赤い錠前の模様
          ctx.fillStyle = '#8B1A1A';
          ctx.fillRect(sx + 3, sy + 3, ts - 6, ts - 6);
          ctx.fillStyle = '#FF3333';
          ctx.font = '16px serif';
          ctx.textAlign = 'center';
          ctx.fillText('🔒', sx + ts / 2, sy + ts / 2 + 5);
        } else {
          ctx.fillStyle = '#4A3220';
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = '#6B4A2A';
          ctx.fillRect(sx + 5, sy + 2, ts - 10, ts - 4);
          ctx.fillStyle = '#8B6A40';
          ctx.fillRect(sx + 5, sy + 2, ts - 10, 3);
        }
        break;
      }
      case TILES.VENT: {
        const shade = ((col + row) % 2 === 0) ? '#3D2A18' : '#362415';
        ctx.fillStyle = shade;
        ctx.fillRect(sx, sy, ts, ts);
        // 金属格子
        ctx.fillStyle = '#1A2838';
        ctx.fillRect(sx + 3, sy + 3, ts - 6, ts - 6);
        ctx.strokeStyle = '#2A4A6A';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 3, sy + 3, ts - 6, ts - 6);
        ctx.strokeStyle = '#1E3A5A';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const ly = sy + 6 + i * 5;
          ctx.beginPath(); ctx.moveTo(sx + 4, ly); ctx.lineTo(sx + ts - 4, ly); ctx.stroke();
        }
        break;
      }
      case TILES.TASK: {
        const taskObj = TASK_DEFS.find(t => t.col === col && t.row === row);
        const done    = taskObj && completedTasks.includes(taskObj.id);
        const shade   = ((col + row) % 2 === 0) ? '#3D2A18' : '#362415';
        ctx.fillStyle = shade;
        ctx.fillRect(sx, sy, ts, ts);
        if (done) {
          ctx.fillStyle = 'rgba(46,139,87,0.35)';
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = '#2E8B57';
          ctx.font = 'bold 15px serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', sx + ts / 2, sy + ts / 2 + 5);
        } else {
          ctx.fillStyle = 'rgba(218,165,32,0.25)';
          ctx.fillRect(sx, sy, ts, ts);
          // 輝くエッジ
          ctx.strokeStyle = 'rgba(218,165,32,0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
          ctx.fillStyle = '#DAA520';
          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚡', sx + ts / 2, sy + ts / 2 + 5);
        }
        break;
      }
      case TILES.EMERGENCY: {
        const shade = ((col + row) % 2 === 0) ? '#3D2A18' : '#362415';
        ctx.fillStyle = shade;
        ctx.fillRect(sx, sy, ts, ts);
        // 赤い招集ボタン
        ctx.fillStyle = '#6B1010';
        ctx.beginPath();
        ctx.arc(sx + ts / 2, sy + ts / 2, ts / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF3030';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FF6060';
        ctx.font = 'bold 11px serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', sx + ts / 2, sy + ts / 2 + 4);
        break;
      }
    }
    ctx.textAlign = 'left'; // リセット
  }

  _drawRoomLabels(ctx, camX, camY) {
    const ts = this.tileSize;
    const labels = [
      { cx:  7.5, cy:  1.5, text: '中　庭' },
      { cx: 23.5, cy:  1.5, text: '食　堂' },
      { cx:  7.5, cy: 14.5, text: '礼 拝 室' },
      { cx: 23.5, cy: 14.5, text: '倉　庫' },
      { cx: 38.0, cy:  8.5, text: '外套の間' }
    ];
    ctx.save();
    ctx.font = '700 11px Cinzel, Georgia, serif';
    ctx.fillStyle = 'rgba(210,180,120,0.45)';
    ctx.textAlign = 'center';
    labels.forEach(l => {
      ctx.fillText(l.text, l.cx * ts - camX, l.cy * ts - camY);
    });
    ctx.restore();
  }

  _drawTorches(ctx, camX, camY) {
    const ts  = this.tileSize;
    const flicker = 0.85 + Math.sin(this._torchPhase * 3.7) * 0.15;
    this.torches.forEach(t => {
      const sx = t.col * ts - camX;
      const sy = t.row * ts - camY;
      // 炎の輝き
      const grd = ctx.createRadialGradient(sx, sy, 1, sx, sy, 18 * flicker);
      grd.addColorStop(0,   `rgba(255,200, 80,${0.65 * flicker})`);
      grd.addColorStop(0.5, `rgba(255,120, 20,${0.35 * flicker})`);
      grd.addColorStop(1,   'rgba(255,80,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
