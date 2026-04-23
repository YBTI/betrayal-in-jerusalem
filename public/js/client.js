// client.js — Socket.io クライアント、メインエントリーポイント
// 依存: constants.js, Map.js, FogOfWar.js, Renderer.js, GameClient.js, UI.js

const socket = io();
let myId       = null;
let gameClient = null;

// ── 画面切り替えヘルパー ────────────────────────────────────────────────────
function showScreen(id) {
  ['lobby-screen', 'game-screen', 'result-screen'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? 'flex' : 'none';
  });
}

// ── ロビー ────────────────────────────────────────────────────────────────────
let lobbyPlayers = [];
let selectedColor = null;

// ロビーカラーピッカーの初期化
function initColorPicker() {
  const colorPicker = document.getElementById('color-picker');
  if (!colorPicker) return;
  PLAYER_COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'color-btn';
    btn.dataset.color = c;
    btn.innerHTML = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M 20,4 C 14,4 12,8 12,13 C 12,16 6,32 5,34 C 4,36 34,36 35,34 C 34,32 28,16 28,13 C 28,8 26,4 20,4 Z" fill="${c}" stroke="#111" stroke-width="2" stroke-linejoin="round" />
      <path d="M 20,8 C 16,8 15,11 15,14 C 15,17 18,20 20,20 C 22,20 25,17 25,14 C 25,11 24,8 20,8 Z" fill="#110C06" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />
      <path d="M 20,20 Q 20,27 17,35 M 20,20 Q 20,27 23,35" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('taken')) return;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = c;
    });
    colorPicker.appendChild(btn);
  });
  // 初期選択
  selectedColor = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  colorPicker.querySelector(`[data-color="${selectedColor}"]`)?.classList.add('selected');
}
initColorPicker();

// 選択済みの色を更新
function updateColorPickerAvailability() {
  const usedColors = new Set(lobbyPlayers.map(p => p.color));
  document.querySelectorAll('.color-btn').forEach(btn => {
    if (usedColors.has(btn.dataset.color)) {
      btn.classList.add('taken');
      if (btn.classList.contains('selected')) {
        btn.classList.remove('selected');
        // 他の空いている色を自動選択
        const nextColor = PLAYER_COLORS.find(c => !usedColors.has(c));
        if (nextColor) {
           selectedColor = nextColor;
           document.querySelector(`.color-btn[data-color="${nextColor}"]`)?.classList.add('selected');
        }
      }
    } else {
      btn.classList.remove('taken');
    }
  });
}

document.getElementById('btn-join').addEventListener('click', () => {
  const nameInput = document.getElementById('name-input');
  const name      = (nameInput.value || '').trim() || `プレイヤー${Math.floor(Math.random()*1000)}`;
  socket.emit('joinGame', { name, color: selectedColor });
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame');
});

document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ── ゲーム内アクションボタン ──────────────────────────────────────────────────
function bindActionButton(id, method) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => {
    if (gameClient) gameClient[method]();
  });
}
bindActionButton('btn-task',      'onTaskClick');
bindActionButton('btn-kill',      'onKillClick');
bindActionButton('btn-report',    'onReportClick');
bindActionButton('btn-emergency', 'onEmergencyClick');
bindActionButton('btn-vent',      'onVentClick');
bindActionButton('btn-sabotage',  'onSabotageClick');
bindActionButton('btn-repair',    'onRepairClick');

document.getElementById('btn-sab-close')?.addEventListener('click', () => {
  UI.hideSabotagePanel();
});

// ── 会議チャット ─────────────────────────────────────────────────────────────
document.getElementById('btn-send-chat')?.addEventListener('click', sendChat);
document.getElementById('chat-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  socket.emit('sendChat', { text });
  input.value = '';
}

// スキップ投票
document.getElementById('btn-skip-vote')?.addEventListener('click', () => {
  socket.emit('vote', { targetId: 'skip' });
});

// 投票ボタン（vote-player-list に動的に追加されるので委譲）
document.getElementById('vote-player-list')?.addEventListener('click', e => {
  const btn = e.target.closest('.vote-btn');
  if (!btn || btn.disabled) return;
  socket.emit('vote', { targetId: btn.dataset.id });
  // 全ての投票ボタンを無効化
  document.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);
  document.getElementById('btn-skip-vote').disabled = true;
});

// 結果画面 → ロビーに戻る
document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
  UI.hideResultScreen();
  showScreen('lobby-screen');
});

// ── Socket.io イベントハンドラ ────────────────────────────────────────────────

// 接続時に自分のIDを取得
socket.on('connect', () => {
  myId = socket.id;
  console.log('[接続] myId =', myId);
});

// ゲーム状態の全量受信（参加時・フェーズ変更時）
socket.on('gameState', gs => {
  // ロビー上のプレイヤーリストを更新
  lobbyPlayers = gs.players || [];
  UI.updateLobbyPlayers(lobbyPlayers);

  if (!gameClient && gs.state === GAME_STATE.ACTION_PHASE) {
    _initGameClient(gs);
    return;
  }
  if (gameClient) gameClient.updateGameState(gs);
});

// フェーズ変更
socket.on('phaseChange', ({ phase }) => {
  if (phase === GAME_STATE.ACTION_PHASE) {
    if (gameClient) {
      UI.hideMeetingOverlay();
      showScreen('game-screen');
    }
    // gameClient がなければ gameState イベント受信時に初期化される
  } else if (phase === GAME_STATE.LOBBY) {
    if (gameClient) { gameClient.destroy(); gameClient = null; }
    UI.hideResultScreen();
    UI.hideMeetingOverlay();
    showScreen('lobby-screen');
  }
});

function _initGameClient(gs) {
  showScreen('game-screen');
  gameClient = new GameClient(socket, myId);
  gameClient.updateGameState(gs);
}

// 他プレイヤーが参加
socket.on('playerJoined', data => {
  if (myId && data.id === myId) return;
  lobbyPlayers.push(data);
  updateColorPickerAvailability();
  if (gameClient && gameClient.gs) {
    gameClient.gs.players.push(data);
  }
  UI.updateLobbyPlayers(lobbyPlayers);
});

// プレイヤー退場
socket.on('playerLeft', data => {
  lobbyPlayers = lobbyPlayers.filter(p => p.id !== data.playerId);
  updateColorPickerAvailability();
  if (gameClient && gameClient.gs) {
    gameClient.gs.players = gameClient.gs.players.filter(p => p.id !== data.playerId);
    gameClient._updateActionButtons();
  }
  UI.updateLobbyPlayers(lobbyPlayers);
});

// 位置一括更新（20Hz）と足跡
socket.on('positions', data => {
  if (!gameClient) return;
  // 古い配列形式と新しいオブジェクト形式の両対応
  if (Array.isArray(data)) {
    data.forEach(p => gameClient.updatePlayerPos(p.id, p.px, p.py, p.status));
  } else {
    data.positions.forEach(p => gameClient.updatePlayerPos(p.id, p.px, p.py, p.status));
    if (data.footprints) gameClient.updateFootprints(data.footprints);
  }
});

// フェーズ進行
socket.on('phaseAdvanced', ({ phase }) => {
  if (gameClient) gameClient.handlePhaseAdvanced(phase);
});

// 捕縛イベント
socket.on('playerArrested', data => {
  if (gameClient) gameClient.handlePlayerArrested(data);
});

// ベント使用
socket.on('ventUsed', data => {
  if (gameClient) gameClient.handleVentUsed(data);
});

// タスク進捗
socket.on('taskProgress', data => {
  if (gameClient) gameClient.handleTaskProgress(data);
});

// サボタージュ発動
socket.on('sabotageActivated', data => {
  if (gameClient) gameClient.handleSabotageActivated(data);
});

// サボタージュ解除
socket.on('sabotageEnded', data => {
  if (gameClient) gameClient.handleSabotageEnded(data);
});

// Criticalタイマー更新
socket.on('criticalTimerUpdate', data => {
  if (gameClient) gameClient.handleCriticalTimerUpdate(data);
});

// 会議開始
socket.on('meetingStart', data => {
  UI.showMeetingOverlay(data);
});

// 議論→投票フェーズ切り替え
socket.on('meetingPhaseChange', ({ phase, timer }) => {
  UI.setMeetingPhase(phase, timer);
});

// 会議タイマー更新
socket.on('meetingTimer', ({ remaining }) => {
  UI.updateMeetingTimer(remaining);
});

// チャットメッセージ受信
socket.on('chatMessage', msg => {
  UI.addChatMessage(msg);
});

// 投票提出通知
socket.on('voteSubmitted', ({ voterId }) => {
  UI.markVoted(voterId);
});

// 投票結果
socket.on('voteResult', data => {
  UI.showVoteResult(data);
});

// ゲーム終了
socket.on('gameResult', data => {
  if (gameClient) { gameClient.destroy(); gameClient = null; }
  UI.showResultScreen(data);
});

// エラー
socket.on('joinError',  ({ message }) => alert(message));
socket.on('startError', ({ message }) => alert(message));
