'use strict';

const Player = require('./Player');
const { isWalkable } = require('./MapData');
const {
  ROLES, STATUS, GAME_STATE, SABOTAGE, TILES, WINNER, PARAMS, PHASE_SETTINGS,
  TASK_DEFS, VENT_DEFS, VENT_PAIRS, DOOR_DEFS, REPAIR_POINTS,
  PLAYER_COLORS, SPAWN_TILE, EMERGENCY_TILE
} = require('./constants');

class GameRoom {
  constructor(io) {
    this.io          = io;
    this.players     = new Map();   // Map<socketId, Player>
    this.bodies      = new Map();   // Map<bodyId, bodyObject>
    this.state       = GAME_STATE.LOBBY;
    this.winner      = null;
    this.bodyCounter = 0;

    // タスク
    this.completedTasks = new Set();

    // サボタージュ
    this.lockedDoors    = new Set();   // Set<"col,row">
    this.activeSabotage = null;        // {type, timer, ...}
    this.blindnessActive= false;
    this.criticalRepairs= new Set();
    this.sabotageCooldown = 0;

    // 会議
    this.votes        = new Map();
    this.chatMessages = [];
    this.meetingTimer = 0;
    this.meetingPhase = null;  // 'discussion' | 'voting'

    // フェーズ・ユダの痕跡
    this.elapsedActionTime = 0;
    this.currentPhase      = 1;
    this.judasHistory      = []; // { time, id, px, py }
    this.activeFootprints  = []; // { id, px, py }

    // ゲームティック
    this.tickInterval = null;
  }

  // ─────────────────────────────────────────────────────────────────
  // プレイヤー管理
  // ─────────────────────────────────────────────────────────────────

  addPlayer(socket, name, requestedColor) {
    if (this.state !== GAME_STATE.LOBBY) return false;
    if (this.players.size >= PARAMS.MAX_PLAYERS) return false;

    // カラーの決定（重複チェック）
    const usedColors = new Set(Array.from(this.players.values()).map(p => p.color));
    let color = requestedColor;
    if (!color || usedColors.has(color)) {
      color = PLAYER_COLORS.find(c => !usedColors.has(c)) || PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
    }

    const player = new Player(socket.id, name, color);
    this.players.set(socket.id, player);
    socket.join('gameRoom');

    // 新参加者に現在の状態を送信
    socket.emit('gameState', this.buildState(socket.id));

    // 他全員に参加通知
    socket.to('gameRoom').emit('playerJoined', {
      id: player.id, name: player.name, color: player.color
    });

    return true;
  }

  removePlayer(socketId) {
    if (!this.players.has(socketId)) return;
    this.players.delete(socketId);
    this.io.to('gameRoom').emit('playerLeft', { playerId: socketId });

    if (this.state === GAME_STATE.ACTION_PHASE) this.checkVictory();
    if (this.players.size === 0) this.resetGame();
  }

  tryStartGame(requesterId) {
    if (this.state !== GAME_STATE.LOBBY) return;
    if (this.players.size < PARAMS.MIN_PLAYERS) {
      const s = this.io.sockets.sockets.get(requesterId);
      if (s) s.emit('startError', {
        message: `最低${PARAMS.MIN_PLAYERS}人必要です（現在${this.players.size}人）`
      });
      return;
    }
    this.startGame();
  }

  // ─────────────────────────────────────────────────────────────────
  // ゲーム開始
  // ─────────────────────────────────────────────────────────────────

  startGame() {
    this.state         = GAME_STATE.ACTION_PHASE;
    this.winner        = null;
    this.bodyCounter   = 0;
    this.bodies.clear();
    this.completedTasks.clear();
    this.lockedDoors.clear();
    this.activeSabotage  = null;
    this.blindnessActive = false;
    this.criticalRepairs.clear();
    this.sabotageCooldown = 0;
    this.chatMessages  = [];
    this.votes.clear();

    this.elapsedActionTime = 0;
    this.currentPhase      = 1;
    this.judasHistory      = [];
    this.activeFootprints  = [];

    this.assignRoles();
    this.placePlayersAtSpawn();

    // ゲームループ開始
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this.tick(), PARAMS.GAME_TICK_MS);

    // 全員にゲーム状態を（役割付きで）送信
    this.broadcastGameState();
    this.io.to('gameRoom').emit('phaseChange', { phase: GAME_STATE.ACTION_PHASE });
  }

  assignRoles() {
    const ids = Array.from(this.players.keys()).sort(() => Math.random() - 0.5);
    const judasCount = ids.length >= 8 ? 2 : 1;
    this.players.forEach(p => { p.role = ROLES.APOSTLE; });
    for (let i = 0; i < judasCount && i < ids.length; i++) {
      this.players.get(ids[i]).role = ROLES.JUDAS;
    }
  }

  placePlayersAtSpawn() {
    const basePx = SPAWN_TILE.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const basePy = SPAWN_TILE.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    let i = 0;
    this.players.forEach(p => {
      const angle = (i / this.players.size) * Math.PI * 2;
      p.px = basePx + Math.cos(angle) * 60;
      p.py = basePy + Math.sin(angle) * 40;
      p.status             = STATUS.ALIVE;
      p.killCooldown       = PARAMS.KILL_COOLDOWN_MS;
      p.emergencyCallsLeft = PARAMS.EMERGENCY_CALLS_PER_PLAYER;
      p.dx = 0; p.dy = 0;
      i++;
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // ゲームティック (20Hz)
  // ─────────────────────────────────────────────────────────────────

  tick() {
    if (this.state === GAME_STATE.ACTION_PHASE) {
      this.elapsedActionTime += PARAMS.GAME_TICK_MS;
      this.updatePhase();
      this.updateFootprints();

      this.updateMovement();
      this.updateCooldowns();
      this.updateSabotage();
      this.broadcastPositions();
    } else if (this.state === GAME_STATE.MEETING_PHASE) {
      this.updateMeetingTimer();
    }
  }

  updatePhase() {
    const elapsedSec = this.elapsedActionTime / 1000;
    let newPhase = 1;
    for (const p of PHASE_SETTINGS) {
      if (elapsedSec >= p.startTimeSec) newPhase = p.level;
    }
    if (newPhase !== this.currentPhase) {
      this.currentPhase = newPhase;
      this.io.to('gameRoom').emit('phaseAdvanced', { phase: newPhase });
    }
  }

  updateFootprints() {
    const now = this.elapsedActionTime;
    this.players.forEach(p => {
      if (p.isAlive() && p.isJudas()) {
        this.judasHistory.push({ time: now, id: p.id, px: p.px, py: p.py });
      }
    });

    // 履歴保持期間を最大遅延 + 3秒に設定
    const maxDelay = Math.max(...PHASE_SETTINGS.map(p => p.footprintDelayMs));
    while (this.judasHistory.length > 0 && now - this.judasHistory[0].time > maxDelay + 3000) {
      this.judasHistory.shift();
    }
    
    const phaseParams = PHASE_SETTINGS.find(p => p.level === this.currentPhase) || PHASE_SETTINGS[0];
    const delay = phaseParams.footprintDelayMs;
    
    this.activeFootprints = [];
    const targetStartTime = now - delay - 2500; // 2.5秒間表示
    const targetEndTime   = now - delay;

    // この時間範囲にある履歴を抽出
    for (const h of this.judasHistory) {
      if (h.time >= targetStartTime && h.time <= targetEndTime) {
         this.activeFootprints.push({ px: h.px, py: h.py });
      }
    }
  }

  updateMovement() {
    this.players.forEach(player => {
      const mag = Math.hypot(player.dx, player.dy);
      if (mag === 0) return;

      const speed = player.getSpeed();
      const ndx = player.dx / mag;
      const ndy = player.dy / mag;
      const newPx = player.px + ndx * speed;
      const newPy = player.py + ndy * speed;

      if (player.isGhost()) {
        // ゴーストは壁もドアも無視
        player.px = Math.max(0, Math.min(newPx, (PARAMS.MAP_WIDTH  - 1) * PARAMS.TILE_SIZE));
        player.py = Math.max(0, Math.min(newPy, (PARAMS.MAP_HEIGHT - 1) * PARAMS.TILE_SIZE));
        return;
      }

      const r = PARAMS.PLAYER_COLLISION_RADIUS;
      // X 軸衝突判定（4点チェック）
      const okX = isWalkable(newPx - r, player.py - r, this.lockedDoors) &&
                  isWalkable(newPx + r, player.py - r, this.lockedDoors) &&
                  isWalkable(newPx - r, player.py + r, this.lockedDoors) &&
                  isWalkable(newPx + r, player.py + r, this.lockedDoors);
      // Y 軸衝突判定
      const okY = isWalkable(player.px - r, newPy - r, this.lockedDoors) &&
                  isWalkable(player.px + r, newPy - r, this.lockedDoors) &&
                  isWalkable(player.px - r, newPy + r, this.lockedDoors) &&
                  isWalkable(player.px + r, newPy + r, this.lockedDoors);

      if (okX) player.px = newPx;
      if (okY) player.py = newPy;
    });
  }

  updateCooldowns() {
    const dt = PARAMS.GAME_TICK_MS;
    this.players.forEach(p => {
      if (p.killCooldown > 0) p.killCooldown = Math.max(0, p.killCooldown - dt);
    });
    if (this.sabotageCooldown > 0)
      this.sabotageCooldown = Math.max(0, this.sabotageCooldown - dt);
  }

  updateSabotage() {
    if (!this.activeSabotage) return;
    const dt = PARAMS.GAME_TICK_MS;

    if (this.activeSabotage.type === SABOTAGE.DOOR_LOCK) {
      this.activeSabotage.timer -= dt;
      if (this.activeSabotage.timer <= 0) {
        this.lockedDoors.delete(this.activeSabotage.doorKey);
        this.activeSabotage = null;
        this.io.to('gameRoom').emit('sabotageEnded', { type: SABOTAGE.DOOR_LOCK });
      }
    } else if (this.activeSabotage.type === SABOTAGE.CRITICAL_EMERGENCY) {
      this.activeSabotage.timer -= dt;

      // 1秒ごとにタイマー配信
      const prevSec = Math.ceil((this.activeSabotage.timer + dt) / 1000);
      const currSec = Math.ceil(this.activeSabotage.timer       / 1000);
      if (currSec !== prevSec) {
        this.io.to('gameRoom').emit('criticalTimerUpdate', {
          remaining: Math.max(0, this.activeSabotage.timer)
        });
      }

      if (this.activeSabotage.timer <= 0) {
        this.endGame(WINNER.JUDAS, 'Critical_Emergencyのカウントダウンが0になりました！');
        return;
      }

      // 2箇所修理完了 → 解除
      if (this.criticalRepairs.size >= 2) {
        this.activeSabotage = null;
        this.criticalRepairs.clear();
        this.sabotageCooldown = PARAMS.SABOTAGE_COOLDOWN_MS;
        this.io.to('gameRoom').emit('sabotageEnded', { type: SABOTAGE.CRITICAL_EMERGENCY });
      }
    }
  }

  broadcastPositions() {
    const positions = [];
    this.players.forEach(p => {
      positions.push({ id: p.id, px: p.px, py: p.py, status: p.status });
    });
    this.io.to('gameRoom').emit('positions', {
      positions,
      footprints: this.activeFootprints.map(f => ({px: f.px, py: f.py}))
    });
  }

  broadcastGameState() {
    this.players.forEach((_, id) => {
      const sock = this.io.sockets.sockets.get(id);
      if (sock) sock.emit('gameState', this.buildState(id));
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // アクション
  // ─────────────────────────────────────────────────────────────────

  setPlayerMovement(socketId, dx, dy) {
    const p = this.players.get(socketId);
    if (!p) return;
    p.dx = dx;
    p.dy = dy;
  }

  processKill(killerId, targetId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const killer = this.players.get(killerId);
    const target = this.players.get(targetId);
    if (!killer || !target) return;
    if (!killer.isAlive() || !killer.isJudas()) return;
    if (!target.isAlive() || target.isJudas()) return;
    if (killer.killCooldown > 0) return;

    const dist = Math.hypot(killer.px - target.px, killer.py - target.py);
    if (dist > PARAMS.KILL_RANGE_PX) return;

    target.status    = STATUS.ARRESTED;
    killer.killCooldown = PARAMS.KILL_COOLDOWN_MS;

    const bodyId = `body_${this.bodyCounter++}`;
    const body   = {
      id: bodyId, px: target.px, py: target.py,
      color: target.color, name: target.name, playerId: target.id
    };
    this.bodies.set(bodyId, body);

    this.io.to('gameRoom').emit('playerArrested', { targetId, killerId, body });
    this.checkVictory();
  }

  processReport(reporterId, bodyId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const reporter = this.players.get(reporterId);
    const body     = this.bodies.get(bodyId);
    if (!reporter || !body || !reporter.isAlive()) return;

    const dist = Math.hypot(reporter.px - body.px, reporter.py - body.py);
    if (dist > PARAMS.INTERACT_RANGE_PX * 2) return;

    this.startMeeting(`${reporter.name} が ${body.name} の遺体を発見しました！`);
  }

  processEmergency(callerId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const caller = this.players.get(callerId);
    if (!caller || !caller.isAlive() || caller.emergencyCallsLeft <= 0) return;

    const ePx = EMERGENCY_TILE.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const ePy = EMERGENCY_TILE.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    if (Math.hypot(caller.px - ePx, caller.py - ePy) > PARAMS.INTERACT_RANGE_PX * 2) return;

    caller.emergencyCallsLeft--;
    this.startMeeting(`${caller.name} が緊急招集の鐘を鳴らしました！`);
  }

  processTaskComplete(socketId, taskId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const player = this.players.get(socketId);
    if (!player) return;
    // APOSTLEのみグローバル進捗に寄与。ゴーストも可
    const task = TASK_DEFS.find(t => t.id === taskId);
    if (!task) return;

    const taskPx = task.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const taskPy = task.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    if (Math.hypot(player.px - taskPx, player.py - taskPy) > PARAMS.INTERACT_RANGE_PX * 2) return;

    if (player.isApostle() && !this.completedTasks.has(taskId)) {
      this.completedTasks.add(taskId);
      this.io.to('gameRoom').emit('taskProgress', {
        taskId,
        completedByName: player.name,
        totalCompleted:  this.completedTasks.size,
        total:           PARAMS.TOTAL_TASKS,
        completedTasks:  Array.from(this.completedTasks)
      });
      this.checkVictory();
    }

    // 盲目サボタージュの修理タスク (t5: 礼拝室の香炉)
    if (this.blindnessActive && taskId === 't5') {
      this.blindnessActive = false;
      if (this.activeSabotage?.type === SABOTAGE.BLINDNESS)
        this.activeSabotage = null;
      this.sabotageCooldown = PARAMS.SABOTAGE_COOLDOWN_MS;
      this.io.to('gameRoom').emit('sabotageEnded', { type: SABOTAGE.BLINDNESS });
    }
  }

  processDestroyTask(socketId, taskId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const player = this.players.get(socketId);
    if (!player || !player.isJudas() || !player.isAlive()) return;
    if (this.sabotageCooldown > 0) return;

    if (!this.completedTasks.has(taskId)) return;

    const task = TASK_DEFS.find(t => t.id === taskId);
    if (!task) return;
    const taskPx = task.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const taskPy = task.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    if (Math.hypot(player.px - taskPx, player.py - taskPy) > PARAMS.INTERACT_RANGE_PX * 2) return;

    this.completedTasks.delete(taskId);
    
    this.io.to('gameRoom').emit('taskProgress', {
      taskId,
      destroyed: true, // タスク破壊フラグ
      totalCompleted: this.completedTasks.size,
      total: PARAMS.TOTAL_TASKS,
      completedTasks: Array.from(this.completedTasks)
    });
    
    // 短めのクールダウン
    this.sabotageCooldown = 10000; 
  }

  processVent(socketId, ventId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive() || !player.isJudas()) return;

    const vent = VENT_DEFS.find(v => v.id === ventId);
    if (!vent) return;

    const vPx  = vent.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const vPy  = vent.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    if (Math.hypot(player.px - vPx, player.py - vPy) > PARAMS.INTERACT_RANGE_PX * 1.5) return;

    // 接続先ベント探索
    let destId = null;
    for (const pair of VENT_PAIRS) {
      if (pair[0] === ventId) { destId = pair[1]; break; }
      if (pair[1] === ventId) { destId = pair[0]; break; }
    }
    if (!destId) return;

    const dest = VENT_DEFS.find(v => v.id === destId);
    const destPx = dest.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    const destPy = dest.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
    player.px = destPx;
    player.py = destPy;

    this.io.to('gameRoom').emit('ventUsed', {
      playerId: socketId, fromVent: ventId, toVent: destId, destPx, destPy
    });
  }

  processSabotage(socketId, type, targetId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const player = this.players.get(socketId);
    if (!player || !player.isJudas() || !player.isAlive()) return;

    switch (type) {
      case SABOTAGE.DOOR_LOCK: {
        if (this.sabotageCooldown > 0) return;
        const door = DOOR_DEFS.find(d => d.id === targetId);
        if (!door) return;
        const key = `${door.col},${door.row}`;
        if (this.lockedDoors.has(key)) return;
        this.lockedDoors.add(key);
        this.activeSabotage   = { type, timer: PARAMS.DOOR_LOCK_MS, doorKey: key, doorId: targetId };
        this.sabotageCooldown = PARAMS.SABOTAGE_COOLDOWN_MS;
        this.io.to('gameRoom').emit('sabotageActivated', {
          type, doorId: targetId, doorName: door.name, duration: PARAMS.DOOR_LOCK_MS
        });
        break;
      }
      case SABOTAGE.BLINDNESS: {
        if (this.sabotageCooldown > 0 || this.blindnessActive) return;
        this.blindnessActive  = true;
        this.activeSabotage   = { type };
        this.sabotageCooldown = PARAMS.SABOTAGE_COOLDOWN_MS;
        this.io.to('gameRoom').emit('sabotageActivated', { type });
        break;
      }
      case SABOTAGE.CRITICAL_EMERGENCY: {
        if (this.activeSabotage?.type === SABOTAGE.CRITICAL_EMERGENCY) return;
        this.criticalRepairs.clear();
        this.activeSabotage = { type, timer: PARAMS.CRITICAL_TIMER_MS };
        this.io.to('gameRoom').emit('sabotageActivated', {
          type,
          duration: PARAMS.CRITICAL_TIMER_MS,
          repairPoints: REPAIR_POINTS
        });
        break;
      }
    }
  }

  processRepair(socketId, repairId) {
    if (this.state !== GAME_STATE.ACTION_PHASE) return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive()) return; // ユダも修理アクションに参加可能（偽装のため）

    if (this.activeSabotage?.type === SABOTAGE.CRITICAL_EMERGENCY) {
      const rp = REPAIR_POINTS.find(r => r.id === repairId);
      if (!rp) return;
      const rPx = rp.col * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      const rPy = rp.row * PARAMS.TILE_SIZE + PARAMS.TILE_SIZE / 2;
      if (Math.hypot(player.px - rPx, player.py - rPy) > PARAMS.INTERACT_RANGE_PX * 1.5) return;

      if (!this.criticalRepairs.has(repairId)) {
        this.criticalRepairs.add(repairId);
        this.io.to('gameRoom').emit('repairProgress', {
          repairId, repairedCount: this.criticalRepairs.size
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 会議フェーズ
  // ─────────────────────────────────────────────────────────────────

  startMeeting(reason) {
    this.state      = GAME_STATE.MEETING_PHASE;
    this.meetingPhase = 'discussion';
    this.meetingTimer = PARAMS.DISCUSSION_TIME_MS;
    this.votes.clear();
    this.chatMessages = [];

    // 全プレイヤーを停止させる
    this.players.forEach(p => { p.dx = 0; p.dy = 0; });

    // スポーン地点に集合
    this.placePlayersAtSpawn();

    const playerList = this.getPlayerList();
    this.io.to('gameRoom').emit('meetingStart', {
      reason, players: playerList,
      phase: 'discussion', timer: PARAMS.DISCUSSION_TIME_MS
    });
    this.io.to('gameRoom').emit('phaseChange', { phase: GAME_STATE.MEETING_PHASE });
  }

  updateMeetingTimer() {
    const dt = PARAMS.GAME_TICK_MS;
    this.meetingTimer -= dt;

    // 1秒ごとにタイマー配信
    const prevSec = Math.ceil((this.meetingTimer + dt) / 1000);
    const currSec = Math.ceil(this.meetingTimer       / 1000);
    if (currSec !== prevSec) {
      this.io.to('gameRoom').emit('meetingTimer', { remaining: Math.max(0, this.meetingTimer) });
    }

    if (this.meetingPhase === 'discussion' && this.meetingTimer <= 0) {
      this.meetingPhase = 'voting';
      this.meetingTimer = PARAMS.VOTING_TIME_MS;
      this.io.to('gameRoom').emit('meetingPhaseChange', {
        phase: 'voting', timer: PARAMS.VOTING_TIME_MS
      });
    } else if (this.meetingPhase === 'voting' && this.meetingTimer <= 0) {
      this.tallyVotes();
    }
  }

  processChatMessage(socketId, text) {
    if (this.state !== GAME_STATE.MEETING_PHASE || this.meetingPhase !== 'discussion') return;
    const player = this.players.get(socketId);
    if (!player || !player.isAlive()) return;

    const msg = {
      playerId: socketId,
      name: player.name,
      color: player.color,
      text: String(text).slice(0, 200)
    };
    this.chatMessages.push(msg);
    this.io.to('gameRoom').emit('chatMessage', msg);
  }

  processVote(voterId, targetId) {
    if (this.state !== GAME_STATE.MEETING_PHASE || this.meetingPhase !== 'voting') return;
    const voter = this.players.get(voterId);
    if (!voter || !voter.isAlive() || this.votes.has(voterId)) return;
    if (targetId !== 'skip' && !this.players.has(targetId)) return;
    if (targetId !== 'skip' && !this.players.get(targetId).isAlive()) return;

    this.votes.set(voterId, targetId);
    this.io.to('gameRoom').emit('voteSubmitted', { voterId, voterName: voter.name });

    // 全員投票済みなら即集計
    const aliveCount = Array.from(this.players.values()).filter(p => p.isAlive()).length;
    if (this.votes.size >= aliveCount) this.tallyVotes();
  }

  tallyVotes() {
    if (this.state !== GAME_STATE.MEETING_PHASE) return;

    const alive = Array.from(this.players.values()).filter(p => p.isAlive());
    const tally = new Map();
    alive.forEach(p => tally.set(p.id, 0));
    tally.set('skip', 0);

    this.votes.forEach(tid => {
      tally.set(tid, (tally.get(tid) ?? 0) + 1);
    });

    // 最多票を検索
    let maxVotes = 0, maxId = null, tied = false;
    tally.forEach((count, id) => {
      if (count > maxVotes) { maxVotes = count; maxId = id; tied = false; }
      else if (count === maxVotes && count > 0) tied = true;
    });

    let ejected = null;
    if (!tied && maxId && maxId !== 'skip' && maxVotes > 0) {
      const p = this.players.get(maxId);
      if (p) {
        p.status = STATUS.ARRESTED;
        ejected  = { id: p.id, name: p.name, role: p.role };
      }
    }

    const voteLog = [];
    this.votes.forEach((tid, vid) => {
      const voter = this.players.get(vid);
      voteLog.push({ voterId: vid, voterName: voter?.name ?? '?', targetId: tid });
    });

    this.io.to('gameRoom').emit('voteResult', {
      ejected, tied,
      tally: Object.fromEntries(tally),
      votes: voteLog
    });

    setTimeout(() => this.endMeeting(), 5000);
  }

  endMeeting() {
    this.bodies.clear();
    this.placePlayersAtSpawn();
    this.judasHistory = []; // 足跡リセット

    // 勝利判定
    const vc = this.checkVictoryConditions();
    if (vc) { this.endGame(vc.winner, vc.reason); return; }

    this.state = GAME_STATE.ACTION_PHASE;
    this.broadcastGameState();
    this.io.to('gameRoom').emit('phaseChange', { phase: GAME_STATE.ACTION_PHASE });
  }

  // ─────────────────────────────────────────────────────────────────
  // 勝利判定
  // ─────────────────────────────────────────────────────────────────

  checkVictory() {
    const vc = this.checkVictoryConditions();
    if (vc) this.endGame(vc.winner, vc.reason);
  }

  checkVictoryConditions() {
    if (this.state === GAME_STATE.RESULT_PHASE) return null;

    const alive         = Array.from(this.players.values()).filter(p => p.isAlive());
    const aliveApostles = alive.filter(p => p.isApostle());
    const aliveJudas    = alive.filter(p => p.isJudas());

    // 使徒陣営の勝利
    if (this.completedTasks.size >= PARAMS.TOTAL_TASKS)
      return { winner: WINNER.APOSTLE, reason: '全てのタスクが完了しました！' };
    if (aliveJudas.length === 0 && this.players.size > 0)
      return { winner: WINNER.APOSTLE, reason: '全てのユダが捕らえられました！' };

    // ユダ陣営の勝利
    if (aliveJudas.length > 0 && aliveApostles.length <= aliveJudas.length)
      return { winner: WINNER.JUDAS, reason: '使徒の数がユダ以下になりました。' };

    return null;
  }

  endGame(winner, reason) {
    if (this.state === GAME_STATE.RESULT_PHASE) return;
    this.state  = GAME_STATE.RESULT_PHASE;
    this.winner = winner;

    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }

    const playerData = [];
    this.players.forEach(p => {
      playerData.push({ id: p.id, name: p.name, role: p.role, status: p.status, color: p.color });
    });

    this.io.to('gameRoom').emit('gameResult', { winner, reason, players: playerData });
    this.io.to('gameRoom').emit('phaseChange', { phase: GAME_STATE.RESULT_PHASE });

    // 30秒後にロビーへ
    setTimeout(() => this.resetGame(), 30000);
  }

  resetGame() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    this.state          = GAME_STATE.LOBBY;
    this.bodies.clear();
    this.completedTasks.clear();
    this.lockedDoors.clear();
    this.activeSabotage = null;
    this.blindnessActive= false;
    this.criticalRepairs.clear();
    this.sabotageCooldown = 0;
    this.votes.clear();
    this.chatMessages   = [];
    this.winner         = null;
    this.elapsedActionTime = 0;
    this.currentPhase      = 1;
    this.judasHistory      = [];
    this.activeFootprints  = [];
    this.players.forEach(p => {
      p.role               = ROLES.APOSTLE;
      p.status             = STATUS.ALIVE;
      p.killCooldown       = 0;
      p.emergencyCallsLeft = PARAMS.EMERGENCY_CALLS_PER_PLAYER;
      p.dx = 0; p.dy = 0;
    });
    this.io.to('gameRoom').emit('phaseChange', { phase: GAME_STATE.LOBBY });
    this.broadcastGameState();
  }

  // ─────────────────────────────────────────────────────────────────
  // ヘルパー
  // ─────────────────────────────────────────────────────────────────

  getPlayerList() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id, name: p.name, color: p.color, status: p.status
    }));
  }

  buildState(viewerId) {
    const revealAll = this.state === GAME_STATE.RESULT_PHASE;
    const players = [];
    this.players.forEach((p, id) => players.push(p.toPublic(viewerId, revealAll)));

    return {
      state:          this.state,
      players,
      bodies:         Array.from(this.bodies.values()),
      taskProgress:   this.completedTasks.size / PARAMS.TOTAL_TASKS,
      completedTasks: Array.from(this.completedTasks),
      lockedDoors:    Array.from(this.lockedDoors),
      blindnessActive: this.blindnessActive,
      activeSabotage: this.activeSabotage
        ? { type: this.activeSabotage.type, timer: this.activeSabotage.timer }
        : null,
      playerCount:    this.players.size,
      winner:         this.winner,
      currentPhase:   this.currentPhase
    };
  }
}

module.exports = GameRoom;
