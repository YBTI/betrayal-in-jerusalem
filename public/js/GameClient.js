// GameClient.js — クライアント側 ゲームループ・入力・インタラクション検出
// 依存: constants.js, Map.js, FogOfWar.js, Renderer.js

class GameClient {
  constructor(socket, myId) {
    this.socket   = socket;
    this.myId     = myId;
    this.gs       = null;       // 最新ゲーム状態
    this.gameMap  = new GameMap();
    this.renderer = null;
    this.alive    = true;       // ゲームクライアントは有効か

    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0 };

    this.currentPhase = 1;
    this.footprints = [];
    this.lastDx = 0;
    this.lastDy = 0;
    this.destroyingTaskId = null;
    this.destroyTimer = 0;

    // 入力
    this.lastMoveEmit = 0;
    this.MOVE_THROTTLE = 40; // ms

    // タスク進行中
    this.taskInProgress = null; // { taskId, startMs, durationMs }

    // キャンバスセットアップ
    this._initCanvas();
    this._setupInput();
    this._loop();
  }

  _initCanvas() {
    this.canvas = document.getElementById('gameCanvas');
    this._resizeCanvas();
    this.renderer = new Renderer(this.canvas);
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const gameScreen = document.getElementById('game-screen');
    this.canvas.width  = gameScreen.clientWidth  || window.innerWidth;
    this.canvas.height = gameScreen.clientHeight || window.innerHeight;
    if (this.renderer) this.renderer.resize(this.canvas.width, this.canvas.height);
  }

  _setupInput() {
    document.addEventListener('keydown', e => {
      if (!this.alive) return;
      this.keys[e.code] = true;
      // E キー: 近くにあるアクションを実行
      if (e.code === 'KeyE') this._triggerNearestAction();
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  destroy() {
    this.alive = false;
    document.removeEventListener('keydown', () => {});
    document.removeEventListener('keyup',   () => {});
  }

  // ── 外部からの状態更新 ─────────────────────────────────────────────────────
  updateGameState(gs) {
    this.gs = gs;
    this.gs.completedTasks = Array.isArray(gs.completedTasks) ? gs.completedTasks : [];
    if (gs.currentPhase) {
      this.handlePhaseAdvanced(gs.currentPhase);
    }
    this._updateActionButtons();
    UI.updateTaskProgress(gs);
  }

  updateFootprints(tracks) {
    this.footprints = tracks || [];
  }

  handlePhaseAdvanced(phase) {
    this.currentPhase = phase;
    if (typeof UI !== 'undefined' && UI.updatePhaseDisplay) {
      UI.updatePhaseDisplay(phase);
    }
  }

  updatePlayerPos(id, px, py, status) {
    if (!this.gs) return;
    const p = this.gs.players.find(p => p.id === id);
    if (p) { p.px = px; p.py = py; p.status = status; }
  }

  handlePlayerArrested(data) {
    if (!this.gs) return;
    const target = this.gs.players.find(p => p.id === data.targetId);
    if (target) {
      target.status = STATUS.ARRESTED;
      if (data.body) this.gs.bodies.push(data.body);
      if (this.renderer) this.renderer.addKillAnim(data.body.px, data.body.py);
    }
    // 被捕縛者が自分ならフラッシュ警告
    if (data.targetId === this.myId) UI.showGhostFade();
    this._updateActionButtons();
  }

  handleVentUsed(data) {
    if (!this.gs) return;
    const p = this.gs.players.find(p => p.id === data.playerId);
    if (p) { p.px = data.destPx; p.py = data.destPy; }
    if (this.renderer) this.renderer.addVentAnim(data.destPx, data.destPy);
  }

  handleTaskProgress(data) {
    if (!this.gs) return;
    this.gs.completedTasks = data.completedTasks;
    UI.updateTaskProgress(data.totalCompleted, data.total);
    if (!data.destroyed) {
      // 破壊でない場合のみメッセージ
      UI.addLogMessage(`タスクが進行しました (${data.totalCompleted}/${data.total})`);
    } else {
      UI.addLogMessage('⚠️ 誰かの手によってタスクが破壊されました！', '#E74C3C');
    }
    if (this.renderer) {
      const task = TASK_DEFS.find(t => t.id === data.taskId);
      if (task) {
        const px = task.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
        const py = task.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
        this.renderer.addTaskCompleteAnim(px, py);
      }
    }
    UI.updateTaskProgress(this.gs);
    this._updateActionButtons();
  }

  handleSabotageActivated(data) {
    if (!this.gs) return;
    this.gs.activeSabotage = { type: data.type, timer: data.duration || 0 };
    if (data.type === SABOTAGE.BLINDNESS) this.gs.blindnessActive = true;
    UI.showSabotageAlert(data);
    this._updateActionButtons();
  }

  handleSabotageEnded(data) {
    if (!this.gs) return;
    if (data.type === SABOTAGE.BLINDNESS) this.gs.blindnessActive = false;
    this.gs.activeSabotage = null;
    if (data.type === SABOTAGE.DOOR_LOCK && data.doorKey) {
      this.gs.lockedDoors = this.gs.lockedDoors.filter(k => k !== data.doorKey);
    }
    UI.hideSabotageAlert();
  }

  handleCriticalTimerUpdate(data) {
    if (this.gs && this.gs.activeSabotage) {
      this.gs.activeSabotage.timer = data.remaining;
    }
    UI.updateCriticalTimer(data.remaining);
  }

  // ── ゲームループ ─────────────────────────────────────────────────────────────
  _loop() {
    if (!this.alive) return;
    requestAnimationFrame(() => this._loop());

    if (!this.gs || this.gs.state !== GAME_STATE.ACTION_PHASE) return;

    this._processInput();
    this.renderer.render(this.gs, this.myId, this.gameMap, this.footprints, this.destroyTimer);
    this.renderer.drawHUD(this.renderer.ctx, this.gs, this.myId);
    this._processPendingTask();
  }

  // ── 入力処理 ─────────────────────────────────────────────────────────────────
  _processInput() {
    // ミニゲーム中は移動入力を受け付けない
    if (typeof Minigames !== 'undefined' && Minigames.isActive()) return;

    const now = Date.now();
    let dx = 0, dy = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dy = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dy =  1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dx = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx =  1;

    // 破壊アクション判断
    if (this.nearestInteractable && this.nearestInteractable.type === 'SABOTAGE_TASK') {
       if (this.keys['KeyE']) {
          if (!this.destroyingTaskId) {
             this.destroyingTaskId = this.nearestInteractable.data.id;
             this.destroyTimer = 0;
          }
          this.destroyTimer += PARAMS.GAME_TICK_MS;
          if (this.destroyTimer >= 2000) { // 2秒長押しで破壊
             this.socket.emit('destroyTask', { taskId: this.destroyingTaskId });
             this.destroyingTaskId = null;
             this.destroyTimer = 0;
             this.keys['KeyE'] = false; // 連続発動を防ぐ
          }
       } else {
          this.destroyingTaskId = null;
          this.destroyTimer = 0;
       }
    } else {
       this.destroyingTaskId = null;
       this.destroyTimer = 0;
    }

    if (dx !== this.lastDx || dy !== this.lastDy) {
      if (now - this.lastMoveEmit >= this.MOVE_THROTTLE) {
        this.socket.emit('move', { dx, dy });
        this.lastMoveEmit = now;
        this.lastDx = dx;
        this.lastDy = dy;
      }
    }

    // クライアント予測移動（サーバー補正で上書きされる）
    if (!this.gs) return;
    const me = this.gs.players.find(p => p.id === this.myId);
    if (!me) return;

    if (dx !== 0 || dy !== 0) {
      const mag   = Math.hypot(dx, dy);
      const speed = (me.status === STATUS.ARRESTED ? PARAMS.GHOST_SPEED : PARAMS.PLAYER_SPEED);
      const ndx   = (dx / mag) * speed;
      const ndy   = (dy / mag) * speed;
      const r     = PARAMS.PLAYER_COLLISION_RADIUS;

      if (me.status === STATUS.ARRESTED) {
        me.px = Math.max(0, Math.min(me.px + ndx, (PARAMS.MAP_WIDTH  - 1) * PARAMS.TILE_SIZE));
        me.py = Math.max(0, Math.min(me.py + ndy, (PARAMS.MAP_HEIGHT - 1) * PARAMS.TILE_SIZE));
      } else {
        const ld = this.gs.lockedDoors || [];
        if (this.gameMap.isWalkable(me.px + ndx - r, me.py - r, ld) &&
            this.gameMap.isWalkable(me.px + ndx + r, me.py - r, ld) &&
            this.gameMap.isWalkable(me.px + ndx - r, me.py + r, ld) &&
            this.gameMap.isWalkable(me.px + ndx + r, me.py + r, ld)) {
          me.px += ndx;
        }
        if (this.gameMap.isWalkable(me.px - r, me.py + ndy - r, ld) &&
            this.gameMap.isWalkable(me.px + r, me.py + ndy - r, ld) &&
            this.gameMap.isWalkable(me.px - r, me.py + ndy + r, ld) &&
            this.gameMap.isWalkable(me.px + r, me.py + ndy + r, ld)) {
          me.py += ndy;
        }
      }
    }
  }

  // ── アクションボタン可否更新 ──────────────────────────────────────────────
  _updateActionButtons() {
    if (!this.gs) return;
    const me = this.gs.players.find(p => p.id === this.myId);
    if (!me) return;

    const isGhost  = me.status === STATUS.ARRESTED;
    const isJudas  = me.role   === ROLES.JUDAS;
    const cdReady  = (me.killCooldown || 0) <= 0;

    // タスクボタン
    const nearTask = this._nearestTask();
    UI.setButton('btn-task', !isJudas && !!nearTask,
      nearTask ? `⚡ ${nearTask.name}` : '⚡ タスクを行う');

    // 捕縛ボタン
    const nearTarget = isJudas && !isGhost ? this._nearestKillTarget() : null;
    UI.setButton('btn-kill', !!nearTarget && cdReady,
      nearTarget ? `⚔ ${nearTarget.name} を捕縛` : '⚔ 捕縛する');

    // レポートボタン
    const nearBody = !isGhost ? this._nearestBody() : null;
    UI.setButton('btn-report', !!nearBody,
      nearBody ? `📜 ${nearBody.name} を報告` : '📜 遺体を報告');

    // 緊急招集
    const nearEmerg = !isGhost && (me.emergencyCallsLeft > 0) && this._nearEmergency();
    UI.setButton('btn-emergency', nearEmerg, `🔔 緊急招集の鐘 (${me.emergencyCallsLeft || 0})`);

    // ベント（Judas のみ）
    const nearVent = isJudas && !isGhost ? this._nearestVent() : null;
    UI.setButton('btn-vent', !!nearVent, nearVent ? `🌀 抜け道` : '🌀 抜け道');

    // 妨害（Judas のみ）
    UI.setButton('btn-sabotage', isJudas && !isGhost, '⚡ 妨害する');

    // 修理（Apostle/Judas どちらも可能）
    const hasCritical = this.gs.activeSabotage?.type === SABOTAGE.CRITICAL_EMERGENCY;
    const nearRepair  = !isGhost && hasCritical ? this._nearestRepair() : null;
    UI.setButton('btn-repair', !!nearRepair,
      nearRepair ? `🔧 ${nearRepair.name} を修理` : '🔧 修理する');
  }

  // ── 最近傍検索 ───────────────────────────────────────────────────────────────
  _myPlayer() {
    return this.gs?.players.find(p => p.id === this.myId);
  }

  _nearestTask() {
    this.me = this._myPlayer(); if (!this.me) return null;
    this.nearestInteractable = null;
    let minDist = Infinity;
    const canInteract = this.me.status === STATUS.ALIVE;

    // タスク (使徒：未完了、ユダ：完了済み)
    TASK_DEFS.forEach(t => {
      const isCompleted = this.gs.completedTasks.includes(t.id);
      if (this.me.role === ROLES.APOSTLE && isCompleted) return;
      if (this.me.role === ROLES.JUDAS   && !isCompleted) return;

      const tpX = t.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      const tpY = t.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      const dist = Math.hypot(this.me.px - tpX, this.me.py - tpY);
      if (dist <= PARAMS.INTERACT_RANGE_PX * 1.5) { // 少し広めにする
        if (dist < minDist) {
          minDist = dist;
          this.nearestInteractable = { 
            type: this.me.role === ROLES.JUDAS ? 'SABOTAGE_TASK' : 'TASK', 
            data: t 
          };
        }
      }
    });
    return this.nearestInteractable ? this.nearestInteractable.data : null;
  }

  _nearestKillTarget() {
    const me = this._myPlayer(); if (!me) return null;
    const rng = PARAMS.KILL_RANGE_PX;
    for (const p of (this.gs.players || [])) {
      if (p.id === this.myId) continue;
      if (p.role === ROLES.JUDAS) continue; // 同士討ち不可
      if (p.status !== STATUS.ALIVE) continue;
      if (Math.hypot(me.px - p.px, me.py - p.py) <= rng) return p;
    }
    return null;
  }

  _nearestBody() {
    const me  = this._myPlayer(); if (!me) return null;
    const rng = PARAMS.INTERACT_RANGE_PX * 1.5;
    for (const b of (this.gs.bodies || [])) {
      if (Math.hypot(me.px - b.px, me.py - b.py) <= rng) return b;
    }
    return null;
  }

  _nearEmergency() {
    const me  = this._myPlayer(); if (!me) return false;
    const ePx = EMERGENCY_TILE.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const ePy = EMERGENCY_TILE.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    return Math.hypot(me.px - ePx, me.py - ePy) <= PARAMS.INTERACT_RANGE_PX * 2;
  }

  _nearestVent() {
    const me  = this._myPlayer(); if (!me) return null;
    const rng = PARAMS.INTERACT_RANGE_PX;
    for (const v of VENT_DEFS) {
      const px = v.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      const py = v.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      if (Math.hypot(me.px - px, me.py - py) <= rng) return v;
    }
    return null;
  }

  _nearestRepair() {
    const me  = this._myPlayer(); if (!me) return null;
    const rng = PARAMS.INTERACT_RANGE_PX * 1.5;
    for (const r of REPAIR_POINTS) {
      const px = r.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      const py = r.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      if (Math.hypot(me.px - px, me.py - py) <= rng) return r;
    }
    return null;
  }

  // ── アクション実行 ───────────────────────────────────────────────────────────
  _triggerNearestAction() {
    const nearTask = this._nearestTask();
    if (nearTask) { this._startTask(nearTask); return; }
    const nearBody = this._nearestBody();
    if (nearBody) { this.socket.emit('reportBody', { bodyId: nearBody.id }); }
  }

  _startTask(task) {
    if (this.taskInProgress) return;
    if (typeof Minigames !== 'undefined' && Minigames.isActive()) return;

    this.taskInProgress = { taskId: task.id, startMs: Date.now() }; // フラグ用
    
    // 現在のフェーズをミニゲームに渡す（難易度用）
    Minigames.start(task, this.currentPhase,
      () => {
        // 成功コールバック
        this.socket.emit('completeTask', { taskId: task.id });
        this.taskInProgress = null;
      },
      () => {
        // キャンセルコールバック
        this.taskInProgress = null;
      }
    );
  }

  _processPendingTask() { /* 不要になったので空 */ }

  // ── ボタンクリックハンドラ（UI.js から呼ばれる） ─────────────────────────
  onKillClick() {
    const target = this._nearestKillTarget();
    if (target) this.socket.emit('kill', { targetId: target.id });
  }

  onReportClick() {
    const body = this._nearestBody();
    if (body) this.socket.emit('reportBody', { bodyId: body.id });
  }

  onEmergencyClick() {
    if (this._nearEmergency()) this.socket.emit('callEmergency');
  }

  onVentClick() {
    const vent = this._nearestVent();
    if (vent) this.socket.emit('useVent', { ventId: vent.id });
  }

  onTaskClick() {
    const task = this._nearestTask();
    if (task) this._startTask(task);
  }

  onSabotageClick() {
    UI.showSabotagePanel(this.gs, (type, targetId) => {
      this.socket.emit('sabotage', { type, targetId });
    });
  }

  onRepairClick() {
    const rp = this._nearestRepair();
    if (rp) this.socket.emit('repair', { repairId: rp.id });
  }
}
