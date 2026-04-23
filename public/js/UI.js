// UI.js — HUD、アクションボタン、各種オーバーレイ管理
// 依存: constants.js

const UI = (() => {
  // ── DOM参照 ──────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── ボタン制御 ───────────────────────────────────────────────────────────────
  function setButton(id, enabled, label) {
    const btn = $(id);
    if (!btn) return;
    btn.disabled    = !enabled;
    btn.textContent = label;
    btn.classList.toggle('active', !!enabled);
  }

  // ── タスク進捗バー（HTML オーバーレイ） ─────────────────────────────────────
  function updateTaskProgress(gs) {
    const bar  = $('task-bar-fill');
    const txt  = $('task-bar-text');
    if (!bar || !txt || !gs) return;
    const pct = (gs.taskProgress || 0) * 100;
    bar.style.width = `${pct}%`;
    const done  = gs.completedTasks ? gs.completedTasks.length : 0;
    txt.textContent = `${done} / ${PARAMS.TOTAL_TASKS}`;
  }

  // ── タスク進行UI（プログレスバー付き） ──────────────────────────────────────
  let _taskTimer = null;
  function showTaskProgress(taskName, durationMs, onComplete) {
    const panel = $('task-progress-panel');
    const fill  = $('task-anim-fill');
    const name  = $('task-anim-name');
    if (!panel) return;

    name.textContent   = taskName;
    panel.style.display = 'flex';
    fill.style.transition = 'none';
    fill.style.width   = '0%';

    // 次フレームでトランジション有効化
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.transition = `width ${durationMs}ms linear`;
        fill.style.width      = '100%';
      });
    });

    if (_taskTimer) clearTimeout(_taskTimer);
    _taskTimer = setTimeout(() => {
      panel.style.display = 'none';
      fill.style.transition = 'none';
      fill.style.width    = '0%';
      onComplete();
    }, durationMs);
  }

  function cancelTaskProgress() {
    if (_taskTimer) { clearTimeout(_taskTimer); _taskTimer = null; }
    const panel = $('task-progress-panel');
    if (panel) panel.style.display = 'none';
  }

  // ── サボタージュパネル ────────────────────────────────────────────────────────
  function showSabotagePanel(gs, onSelect) {
    const panel = $('sabotage-panel');
    if (!panel) return;

    const list = $('sabotage-options');
    list.innerHTML = '';

    const cdReady = !gs.activeSabotage;

    // 視界妨害
    const btnB = document.createElement('button');
    btnB.textContent = '👁 視界妨害 (Blindness)';
    btnB.disabled    = !cdReady || gs.blindnessActive;
    btnB.className   = 'sab-option';
    btnB.onclick = () => { onSelect(SABOTAGE.BLINDNESS); hideSabotagePanel(); };
    list.appendChild(btnB);

    // Critical Emergency
    const btnC = document.createElement('button');
    btnC.textContent = '⚠ 緊急事態 (Critical)';
    btnC.disabled    = gs.activeSabotage?.type === SABOTAGE.CRITICAL_EMERGENCY;
    btnC.className   = 'sab-option';
    btnC.onclick = () => { onSelect(SABOTAGE.CRITICAL_EMERGENCY); hideSabotagePanel(); };
    list.appendChild(btnC);

    // ドアロック
    DOOR_DEFS.forEach(door => {
      const locked = gs.lockedDoors && gs.lockedDoors.includes(`${door.col},${door.row}`);
      const btnD = document.createElement('button');
      btnD.textContent = `🔒 ${door.name}`;
      btnD.disabled    = !cdReady || locked;
      btnD.className   = 'sab-option';
      btnD.onclick = () => { onSelect(SABOTAGE.DOOR_LOCK, door.id); hideSabotagePanel(); };
      list.appendChild(btnD);
    });

    panel.style.display = 'flex';
  }

  function hideSabotagePanel() {
    const panel = $('sabotage-panel');
    if (panel) panel.style.display = 'none';
  }

  // ── サボタージュ警告 ──────────────────────────────────────────────────────────
  function showSabotageAlert(data) {
    const alert = $('sabotage-alert');
    const txt   = $('sabotage-alert-text');
    if (!alert || !txt) return;

    const messages = {
      [SABOTAGE.BLINDNESS]:          '⚠ 視界が妨害されました！礼拝室の香炉を修理せよ！',
      [SABOTAGE.CRITICAL_EMERGENCY]: '🚨 緊急事態！2箇所のポイントを修理しなければ敗北！',
      [SABOTAGE.DOOR_LOCK]:          `🔒 ${data.doorName || 'ドア'} が施錠されました！`
    };

    txt.textContent     = messages[data.type] || '⚠ 妨害が発動しました！';
    alert.style.display = 'flex';

    if (data.type === SABOTAGE.DOOR_LOCK) {
      setTimeout(hideSabotageAlert, data.duration || 10000);
    }
  }

  function hideSabotageAlert() {
    const alert = $('sabotage-alert');
    if (alert) alert.style.display = 'none';
  }

  function updateCriticalTimer(remaining) {
    const timerEl = $('critical-timer-sec');
    if (timerEl) timerEl.textContent = Math.ceil(remaining / 1000);
  }

  // ── ゴーストフェード ─────────────────────────────────────────────────────────
  function showGhostFade() {
    const overlay = $('ghost-fade');
    if (!overlay) return;
    overlay.style.opacity = '1';
    setTimeout(() => { overlay.style.opacity = '0'; }, 1500);
  }

  // ── 会議 UI ──────────────────────────────────────────────────────────────────
  function showMeetingOverlay(data) {
    const overlay = $('meeting-overlay');
    if (!overlay) return;

    $('meeting-reason').textContent   = data.reason;
    $('meeting-timer-display').textContent = '';
    const chatEl = $('chat-messages');
    if (chatEl) chatEl.innerHTML = '';

    // プレイヤーリストを初期化（投票UI）
    buildPlayerVoteList(data.players);

    // ディスカッションフェーズに合わせてUIを調整
    setMeetingPhase(data.phase || 'discussion', data.timer);

    overlay.style.display = 'flex';
    overlay.classList.add('entering');
    setTimeout(() => overlay.classList.remove('entering'), 400);
  }

  function hideMeetingOverlay() {
    const overlay = $('meeting-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function buildPlayerVoteList(players) {
    const listEl = $('vote-player-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    players.forEach(p => {
      const li = document.createElement('div');
      li.className = 'vote-player-item';
      li.id        = `vote-player-${p.id}`;
      const svgHTML = `<svg viewBox="0 0 40 40" width="18" height="18" style="vertical-align: middle; margin-right: 6px;" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20,4 C 14,4 12,8 12,13 C 12,16 6,32 5,34 C 4,36 34,36 35,34 C 34,32 28,16 28,13 C 28,8 26,4 20,4 Z" fill="${p.color}" stroke="#111" stroke-width="2" stroke-linejoin="round" />
        <path d="M 20,8 C 16,8 15,11 15,14 C 15,17 18,20 20,20 C 22,20 25,17 25,14 C 25,11 24,8 20,8 Z" fill="#110C06" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />
        <path d="M 20,20 Q 20,27 17,35 M 20,20 Q 20,27 23,35" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;
      li.innerHTML = `
        ${svgHTML}
        <span class="vote-name ${p.status === STATUS.ARRESTED ? 'ghost-name' : ''}">${p.name}</span>
        <span class="vote-status">${p.status === STATUS.ARRESTED ? '👻' : ''}</span>
        <button class="vote-btn" data-id="${p.id}"
          ${p.status === STATUS.ARRESTED ? 'disabled' : ''}>投票</button>
      `;
      listEl.appendChild(li);
    });
  }

  function setMeetingPhase(phase, timer) {
    const chatInput  = $('chat-input-area');
    const voteArea   = $('vote-area');
    const phaseLbl   = $('phase-label');
    if (!chatInput || !voteArea) return;

    if (phase === 'discussion') {
      chatInput.style.display  = 'flex';
      voteArea.style.display   = 'none';
      if (phaseLbl) phaseLbl.textContent = '💬 議論タイム';
    } else {
      chatInput.style.display  = 'none';
      voteArea.style.display   = 'flex';
      if (phaseLbl) phaseLbl.textContent = '🗳 投票タイム';
    }
    updateMeetingTimer(timer);
  }

  function updateMeetingTimer(ms) {
    const el = $('meeting-timer-display');
    if (el) el.textContent = `残り ${Math.max(0, Math.ceil(ms / 1000))}秒`;
  }

  function addChatMessage(msg) {
    const chatEl = $('chat-messages');
    if (!chatEl) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
      const svgHTML = `<svg viewBox="0 0 40 40" width="14" height="14" style="vertical-align: middle; margin-right: 4px;" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20,4 C 14,4 12,8 12,13 C 12,16 6,32 5,34 C 4,36 34,36 35,34 C 34,32 28,16 28,13 C 28,8 26,4 20,4 Z" fill="${msg.color}" stroke="#111" stroke-width="2" stroke-linejoin="round" />
        <path d="M 20,8 C 16,8 15,11 15,14 C 15,17 18,20 20,20 C 22,20 25,17 25,14 C 25,11 24,8 20,8 Z" fill="#110C06" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />
      </svg>`;
      div.innerHTML = `
      ${svgHTML}
      <strong class="chat-name">${msg.name}</strong>
      <span class="chat-text">${_escapeHtml(msg.text)}</span>
    `;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function markVoted(voterId) {
    const item = document.getElementById(`vote-player-${voterId}`);
    if (item) item.classList.add('has-voted');
  }

  function showVoteResult(data) {
    const overlay = $('vote-result-overlay');
    const title   = $('vr-title');
    const details = $('vr-details');
    if (!overlay || !title || !details) return;

    if (data.ejected) {
      const roleLabel = data.ejected.role === ROLES.JUDAS ? '（ユダ！）' : '（使徒...）';
      title.textContent   = `${data.ejected.name} が追放されました ${roleLabel}`;
      title.style.color   = data.ejected.role === ROLES.JUDAS ? '#E74C3C' : '#3498DB';
    } else {
      title.textContent   = data.tied ? '同数票 — 誰も追放されませんでした' : 'スキップ — 誰も追放されませんでした';
      title.style.color   = '#AAA';
    }

    // 投票集計ログ
    details.innerHTML = (data.votes || [])
      .map(v => `<div class='vr-line'><b>${v.voterName}</b> → ${v.targetId === 'skip' ? 'スキップ' : (data.ejected?.id === v.targetId ? '🎯 ' : '') + v.targetId}</div>`)
      .join('');

    hideMeetingOverlay();
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.display = 'none'; }, 4500);
  }

  // ── 結果画面 ─────────────────────────────────────────────────────────────────
  function showResultScreen(data) {
    hideMeetingOverlay();
    const screen = $('result-screen');
    if (!screen) return;

    const title   = $('result-title');
    const reason  = $('result-reason');
    const plList  = $('result-player-list');

    const isApostleWin = data.winner === WINNER.APOSTLE;
    title.textContent = isApostleWin ? '🕊 使徒陣営の勝利！' : '🗡 ユダの勝利！';
    title.className   = isApostleWin ? 'win-apostle' : 'win-judas';
    reason.textContent = data.reason;

    plList.innerHTML = (data.players || []).map(p => {
      const svgHTML = `<svg viewBox="0 0 40 40" width="24" height="24" style="vertical-align: middle; margin-right: 12px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20,4 C 14,4 12,8 12,13 C 12,16 6,32 5,34 C 4,36 34,36 35,34 C 34,32 28,16 28,13 C 28,8 26,4 20,4 Z" fill="${p.color}" stroke="#111" stroke-width="2" stroke-linejoin="round" />
        <path d="M 20,8 C 16,8 15,11 15,14 C 15,17 18,20 20,20 C 22,20 25,17 25,14 C 25,11 24,8 20,8 Z" fill="#110C06" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />
        <path d="M 20,20 Q 20,27 17,35 M 20,20 Q 20,27 23,35" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;
      return `
      <div class="result-player ${p.role === ROLES.JUDAS ? 'is-judas' : ''}">
        ${svgHTML}
        <span>${p.name}</span>
        <span class="rp-role">${p.role === ROLES.JUDAS ? '🗡 ユダ' : '✝ 使徒'}</span>
        <span class="rp-status">${p.status === STATUS.ALIVE ? '生存' : '捕縛'}</span>
      </div>
    `}).join('');

    screen.style.display = 'flex';
  }

  function hideResultScreen() {
    const screen = $('result-screen');
    if (screen) screen.style.display = 'none';
  }

  // ── ロビー ────────────────────────────────────────────────────────────────────
  function updateLobbyPlayers(players) {
    const listEl = $('lobby-player-list');
    if (!listEl) return;
    listEl.innerHTML = players.map(p => {
      const svgHTML = `<svg viewBox="0 0 40 40" width="20" height="20" style="vertical-align: middle; margin-right: 8px;" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20,4 C 14,4 12,8 12,13 C 12,16 6,32 5,34 C 4,36 34,36 35,34 C 34,32 28,16 28,13 C 28,8 26,4 20,4 Z" fill="${p.color}" stroke="#111" stroke-width="2" stroke-linejoin="round" />
        <path d="M 20,8 C 16,8 15,11 15,14 C 15,17 18,20 20,20 C 22,20 25,17 25,14 C 25,11 24,8 20,8 Z" fill="#110C06" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" />
        <path d="M 20,20 Q 20,27 17,35 M 20,20 Q 20,27 23,35" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;
      return `
      <div class="lobby-player">
        ${svgHTML}
        <span>${p.name}</span>
      </div>
      `;
    }).join('');
    const cnt = $('lobby-player-count');
    if (cnt) cnt.textContent = `${players.length} / 10 人`;
  }

  // ── ユーティリティ ────────────────────────────────────────────────────────────
  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    setButton, updateTaskProgress, showTaskProgress, cancelTaskProgress,
    showSabotagePanel, hideSabotagePanel, showSabotageAlert, hideSabotageAlert,
    updateCriticalTimer, showGhostFade,
    showMeetingOverlay, hideMeetingOverlay, setMeetingPhase, updateMeetingTimer,
    addChatMessage, markVoted, showVoteResult,
    showResultScreen, hideResultScreen,
    updateLobbyPlayers
  };
})();
