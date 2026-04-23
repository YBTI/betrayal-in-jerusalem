'use strict';

const { ROLES, STATUS, PARAMS } = require('./constants');

class Player {
  constructor(id, name, color) {
    this.id    = id;
    this.name  = (name || 'プレイヤー').slice(0, 16);
    this.color = color || '#FFD700';

    // 役割・状態
    this.role   = ROLES.APOSTLE;
    this.status = STATUS.ALIVE;

    // 位置（ピクセル）
    this.px = 0;
    this.py = 0;

    // 移動方向（毎ティック更新）
    this.dx = 0;
    this.dy = 0;

    // クールダウン
    this.killCooldown         = PARAMS.KILL_COOLDOWN_MS; // ゲーム開始時は満クールダウン
    this.emergencyCallsLeft   = PARAMS.EMERGENCY_CALLS_PER_PLAYER;

    // 接続状態
    this.isConnected = true;
  }

  isAlive()  { return this.status === STATUS.ALIVE; }
  isGhost()  { return this.status === STATUS.ARRESTED; }
  isJudas()  { return this.role   === ROLES.JUDAS; }
  isApostle(){ return this.role   === ROLES.APOSTLE; }

  getSpeed() {
    return this.isGhost() ? PARAMS.GHOST_SPEED : PARAMS.PLAYER_SPEED;
  }

  /** 相手プレイヤー・視聴者 ID に応じた公開情報を返す */
  toPublic(viewerId, revealAll = false) {
    const isSelf = this.id === viewerId;
    return {
      id:                   this.id,
      name:                 this.name,
      color:                this.color,
      status:               this.status,
      px:                   this.px,
      py:                   this.py,
      role:                 (isSelf || revealAll) ? this.role : undefined,
      killCooldown:         isSelf ? this.killCooldown      : undefined,
      killCooldownMax:      isSelf ? PARAMS.KILL_COOLDOWN_MS : undefined,
      emergencyCallsLeft:   isSelf ? this.emergencyCallsLeft : undefined
    };
  }
}

module.exports = Player;
