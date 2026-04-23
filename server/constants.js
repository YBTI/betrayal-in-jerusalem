'use strict';

const ROLES = {
  APOSTLE: 'APOSTLE',
  JUDAS: 'JUDAS'
};

const STATUS = {
  ALIVE: 'ALIVE',
  ARRESTED: 'ARRESTED'
};

const GAME_STATE = {
  LOBBY: 'LOBBY',
  ACTION_PHASE: 'ACTION_PHASE',
  MEETING_PHASE: 'MEETING_PHASE',
  RESULT_PHASE: 'RESULT_PHASE'
};

const SABOTAGE = {
  DOOR_LOCK: 'DOOR_LOCK',
  BLINDNESS: 'BLINDNESS',
  CRITICAL_EMERGENCY: 'CRITICAL_EMERGENCY'
};

const TILES = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  VENT: 3,
  TASK: 4,
  EMERGENCY: 5
};

const WINNER = {
  APOSTLE: 'APOSTLE',
  JUDAS: 'JUDAS'
};

const PARAMS = {
  DEBUG_MODE: true,          // 2人でゲーム開始可能
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  GAME_TICK_MS: 50,          // 20Hz ゲームティック
  PLAYER_SPEED: 4,           // px / tick (80px/sec)
  GHOST_SPEED: 7,            // px / tick (140px/sec)
  KILL_COOLDOWN_MS: 30000,   // 30秒
  SABOTAGE_COOLDOWN_MS: 30000,
  DOOR_LOCK_MS: 10000,       // 10秒
  CRITICAL_TIMER_MS: 45000,  // 45秒
  EMERGENCY_CALLS_PER_PLAYER: 1,
  FOV_RADIUS: 170,           // px
  KILL_RANGE_PX: 55,
  INTERACT_RANGE_PX: 65,
  TILE_SIZE: 32,
  MAP_WIDTH: 45,
  MAP_HEIGHT: 29,
  DISCUSSION_TIME_MS: 60000,
  VOTING_TIME_MS: 30000,
  TOTAL_TASKS: 10,
  PLAYER_COLLISION_RADIUS: 10
};

// ── フェーズ設定（運命の刻） ────────────────────────────────────────────────
const PHASE_SETTINGS = [
  { level: 1, startTimeSec: 0,   name: '🌙 宵',   footprintDelayMs: 10000 },
  { level: 2, startTimeSec: 90,  name: '🌑 深夜', footprintDelayMs: 5000 },
  { level: 3, startTimeSec: 180, name: '🌅 暁',   footprintDelayMs: 3000 }
];

// ── タスク定義 [col, row] ──────────────────────────────────────────────────
// MAP: Court(1-14,1-11), Dining(16-31,1-11), Chapel(1-14,14-27),
//      Storage(16-31,14-27), Cloakroom(33-43,8-21)
const TASK_DEFS = [
  { id: 't0', col: 4,  row: 4,  room: '中庭',     name: '祈りの石板を清める' },
  { id: 't1', col: 11, row: 8,  room: '中庭',     name: '蝋燭に火を灯す' },
  { id: 't2', col: 20, row: 4,  room: '食堂',     name: '食事の準備をする' },
  { id: 't3', col: 28, row: 8,  room: '食堂',     name: '水を汲む' },
  { id: 't4', col: 4,  row: 18, room: '礼拝室',   name: '聖典を整頓する' },
  { id: 't5', col: 11, row: 24, room: '礼拝室',   name: '香炉に炭を足す' },
  { id: 't6', col: 20, row: 19, room: '倉庫',     name: '物資を仕分ける' },
  { id: 't7', col: 28, row: 24, room: '倉庫',     name: '乾燥食料を補充する' },
  { id: 't8', col: 37, row: 12, room: '外套の間', name: '外套を修繕する' },
  { id: 't9', col: 40, row: 18, room: '外套の間', name: '荷物を整理する' }
];

// ── ベント定義 ──────────────────────────────────────────────────────────────
const VENT_DEFS = [
  { id: 'v0', col: 13, row: 3  },  // 中庭
  { id: 'v1', col: 30, row: 20 },  // 倉庫
  { id: 'v2', col:  2, row: 21 },  // 礼拝室
  { id: 'v3', col: 42, row: 18 }   // 外套の間
];

// ベントペア [fromId, toId]
const VENT_PAIRS = [
  ['v0', 'v1'],  // 中庭 ↔ 倉庫
  ['v2', 'v3']   // 礼拝室 ↔ 外套の間
];

// ── ドア定義 [col, row] ─────────────────────────────────────────────────────
const DOOR_DEFS = [
  { id: 'd0', col: 15, row: 6,  name: '中庭の扉（食堂側）' },
  { id: 'd1', col:  8, row: 13, name: '礼拝室の扉' },
  { id: 'd2', col: 24, row: 13, name: '倉庫の扉' },
  { id: 'd3', col: 32, row: 17, name: '外套の間の扉' }
];

// ── Critical Emergency 修理ポイント ─────────────────────────────────────────
const REPAIR_POINTS = [
  { id: 'r0', col: 4,  row: 8, name: '中庭の祭壇' },
  { id: 'r1', col: 28, row: 4, name: '食堂の柱' }
];

// 緊急招集ボタン位置
const EMERGENCY_TILE = { col: 24, row: 6 };

// スポーン位置（食堂中央）
const SPAWN_TILE    = { col: 23, row: 6 };

// プレイヤーカラーパレット
const PLAYER_COLORS = [
  '#E74C3C', '#3498DB', '#F1C40F', '#2ECC71',
  '#9B59B6', '#E67E22', '#1ABC9C', '#EC407A',
  '#FF7043', '#26C6DA'
];

module.exports = {
  ROLES, STATUS, GAME_STATE, SABOTAGE, TILES, WINNER, PARAMS, PHASE_SETTINGS,
  TASK_DEFS, VENT_DEFS, VENT_PAIRS, DOOR_DEFS, REPAIR_POINTS,
  EMERGENCY_TILE, SPAWN_TILE, PLAYER_COLORS
};
