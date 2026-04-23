// ── クライアント側共有定数 ─────────────────────────────────────────────────────
// サーバー側の constants.js と値を完全に一致させること

const ROLES = { APOSTLE: 'APOSTLE', JUDAS: 'JUDAS' };
const STATUS = { ALIVE: 'ALIVE', ARRESTED: 'ARRESTED' };
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
const TILES = { WALL: 0, FLOOR: 1, DOOR: 2, VENT: 3, TASK: 4, EMERGENCY: 5 };
const WINNER = { APOSTLE: 'APOSTLE', JUDAS: 'JUDAS' };

const PARAMS = {
  TILE_SIZE:           32,
  MAP_WIDTH:           45,
  MAP_HEIGHT:          29,
  FOV_RADIUS:          170,
  KILL_RANGE_PX:       55,
  INTERACT_RANGE_PX:   65,
  PLAYER_SPEED:        4,
  GHOST_SPEED:         7,
  KILL_COOLDOWN_MS:    30000,
  TOTAL_TASKS:         10,
  PLAYER_COLLISION_RADIUS: 10
};

const PHASE_SETTINGS = [
  { level: 1, startTimeSec: 0,   name: '🌙 宵',   footprintDelayMs: 10000 },
  { level: 2, startTimeSec: 90,  name: '🌑 深夜', footprintDelayMs: 5000 },
  { level: 3, startTimeSec: 180, name: '🌅 暁',   footprintDelayMs: 3000 }
];

// タスク定義（サーバーと同一）
const TASK_DEFS = [
  { id: 't0', col: 4,  row: 4,  room: '中庭',     name: '祈りの石板を清める' },
  { id: 't1', col: 11, row: 8,  room: '中庭',     name: '蝋燭に火を灯す' },
  { id: 't2', col: 20, row: 4,  room: '食堂',     name: '食事の準備をする' },
  { id: 't3', col: 28, row: 8,  room: '食堂',     name: '水を汲む' },
  { id: 't4', col: 4,  row: 18, room: '礼拝室',   name: '聖典を整頓する' },
  { id: 't5', col: 11, row: 24, room: '礼拝室',   name: '香炉に炭を足す(修理)' },
  { id: 't6', col: 20, row: 19, room: '倉庫',     name: '物資を仕分ける' },
  { id: 't7', col: 28, row: 24, room: '倉庫',     name: '乾燥食料を補充する' },
  { id: 't8', col: 37, row: 12, room: '外套の間', name: '外套を修繕する' },
  { id: 't9', col: 40, row: 18, room: '外套の間', name: '荷物を整理する' }
];

const VENT_DEFS = [
  { id: 'v0', col: 13, row: 3  },
  { id: 'v1', col: 30, row: 20 },
  { id: 'v2', col:  2, row: 21 },
  { id: 'v3', col: 42, row: 18 }
];

const VENT_PAIRS = [['v0', 'v1'], ['v2', 'v3']];

const DOOR_DEFS = [
  { id: 'd0', col: 15, row:  6, name: '中庭の扉（食堂側）' },
  { id: 'd1', col:  8, row: 13, name: '礼拝室の扉' },
  { id: 'd2', col: 24, row: 13, name: '倉庫の扉' },
  { id: 'd3', col: 32, row: 17, name: '外套の間の扉' }
];

const REPAIR_POINTS = [
  { id: 'r0', col: 4,  row: 8, name: '中庭の祭壇' },
  { id: 'r1', col: 28, row: 4, name: '食堂の柱' }
];

const SPAWN_TILE     = { col: 23, row: 6 };
const EMERGENCY_TILE = { col: 24, row: 6 };

// プレイヤーカラーパレット
const PLAYER_COLORS = [
  '#E74C3C', '#3498DB', '#F1C40F', '#2ECC71',
  '#9B59B6', '#E67E22', '#1ABC9C', '#EC407A',
  '#FF7043', '#26C6DA'
];
