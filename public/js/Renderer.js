// Renderer.js — Canvas 描画エンジン
// 依存: constants.js, Map.js, FogOfWar.js

class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.camX     = 0;
    this.camY     = 0;
    this.fog      = new FogOfWar(canvas.width, canvas.height);
    this._taskCompleteAnims = []; // [{taskId, px, py, t}]
    this._ventAnims          = []; // [{px, py, t}]
    this._killAnims          = []; // [{px, py, t}]
  }

  resize(w, h) {
    this.fog.resize(w, h);
  }

  _updateCamera(px, py) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const mapPxW = PARAMS.MAP_WIDTH  * PARAMS.TILE_SIZE;
    const mapPxH = PARAMS.MAP_HEIGHT * PARAMS.TILE_SIZE;
    this.camX = Math.max(0, Math.min(px - W / 2, mapPxW - W));
    this.camY = Math.max(0, Math.min(py - H / 2, mapPxH - H));
  }

  // ── メインレンダループ ───────────────────────────────────────────────────────
  render(gs, myId, gameMap, footprints = [], destroyTimer = 0) {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    const me = gs.players.find(p => p.id === myId);
    if (!me) return;

    this._updateCamera(me.px, me.py);

    // 背景
    ctx.fillStyle = '#110C06';
    ctx.fillRect(0, 0, W, H);

    // マップ
    gameMap.draw(ctx, this.camX, this.camY, W, H, gs.lockedDoors, gs.completedTasks);

    // 足跡（ユダ用）
    if (footprints && footprints.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(231, 76, 60, 0.4)'; // 赤い足跡
      footprints.forEach(f => {
         const sx = f.px - this.camX;
         const sy = f.py - this.camY;
         ctx.beginPath();
         ctx.ellipse(sx, sy + 13, 8, 4, 0, 0, Math.PI * 2);
         ctx.fill();
      });
      ctx.restore();
    }

    // 死体
    gs.bodies.forEach(b => this._drawBody(ctx, b));

    // 他プレイヤー（自分より先に描画）
    gs.players.forEach(p => {
      if (p.id === myId) return;
      this._drawPlayer(ctx, p, me);
    });

    // 自分
    this._drawPlayer(ctx, me, me, true, destroyTimer);

    // エフェクト
    this._drawEffects(ctx);

    // Fog of War
    const isGhost = me.status === STATUS.ARRESTED;
    const isJudas = me.role === ROLES.JUDAS;
    this.fog.draw(ctx, me.px, me.py, this.camX, this.camY, gameMap, isGhost, gs.blindnessActive, isJudas);
  }

  // ── プレイヤー描画 ───────────────────────────────────────────────────────────
  _drawPlayer(ctx, p, me, isSelf = false, destroyTimer = 0) {
    const isGhost  = p.status === STATUS.ARRESTED;
    const viewerIsGhost = me.status === STATUS.ARRESTED;

    // ゴーストは自分か、自分もゴーストのときのみ表示
    if (isGhost && !isSelf && !viewerIsGhost) return;

    const sx = Math.round(p.px - this.camX);
    const sy = Math.round(p.py - this.camY);
    const R  = 13;

    ctx.save();
    ctx.globalAlpha = isGhost ? 0.45 : 1.0;

    // 影
    ctx.beginPath();
    ctx.ellipse(sx, sy + R, R * 0.75, R * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // --- ロビーで使用しているものに近いローブの描画 ---
    // 下地のマント
    ctx.beginPath();
    // (x, y) = (sx, sy) を中心として描画
    // 左肩(12, 13) -> 下(6, 32) -> 右下(34, 32) -> 右肩(28, 13) -> 頭巾頂点(20, 4) から相対座標へ変換
    // スケール調整: R=13 なので 40x40 を 1.5倍 程度
    const s = 0.8;
    ctx.moveTo(sx + (12-20)*s, sy + (13-20)*s);
    ctx.bezierCurveTo(sx + (6-20)*s, sy + (20-20)*s, sx + (5-20)*s, sy + (34-20)*s, sx + (5-20)*s, sy + (34-20)*s);
    ctx.lineTo(sx + (35-20)*s, sy + (34-20)*s);
    ctx.bezierCurveTo(sx + (34-20)*s, sy + (34-20)*s, sx + (28-20)*s, sy + (20-20)*s, sx + (28-20)*s, sy + (13-20)*s);
    ctx.bezierCurveTo(sx + (28-20)*s, sy + (8-20)*s, sx + (26-20)*s, sy + (4-20)*s, sx + (20-20)*s, sy + (4-20)*s);
    ctx.bezierCurveTo(sx + (14-20)*s, sy + (4-20)*s, sx + (12-20)*s, sy + (8-20)*s, sx + (12-20)*s, sy + (13-20)*s);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 顔部分の暗がり（フードの内側）
    ctx.beginPath();
    ctx.moveTo(sx + (20-20)*s, sy + (8-20)*s);
    ctx.bezierCurveTo(sx + (16-20)*s, sy + (8-20)*s, sx + (15-20)*s, sy + (11-20)*s, sx + (15-20)*s, sy + (14-20)*s);
    ctx.bezierCurveTo(sx + (15-20)*s, sy + (17-20)*s, sx + (18-20)*s, sy + (20-20)*s, sx + (20-20)*s, sy + (20-20)*s);
    ctx.bezierCurveTo(sx + (22-20)*s, sy + (20-20)*s, sx + (25-20)*s, sy + (17-20)*s, sx + (25-20)*s, sy + (14-20)*s);
    ctx.bezierCurveTo(sx + (25-20)*s, sy + (11-20)*s, sx + (24-20)*s, sy + (8-20)*s, sx + (20-20)*s, sy + (8-20)*s);
    ctx.closePath();
    ctx.fillStyle = '#110C06';
    ctx.fill();

    // 目の輝き
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(sx - 3*s, sy - 6*s, 1.2*s, 0, Math.PI*2);
    ctx.arc(sx + 3*s, sy - 6*s, 1.2*s, 0, Math.PI*2);
    ctx.fill();

    // ユダのみの強調などが必要ならここに追加
    if (p.id === me.id && p.role === ROLES.JUDAS) {
       // 自分だけにわかるユダ演出
    }

    // 長押し破壊プログレス
    if (isSelf && destroyTimer > 0) {
       const pct = Math.min(1, destroyTimer / 2000);
       ctx.beginPath();
       ctx.arc(sx, sy, R + 10, -Math.PI/2, -Math.PI/2 + (Math.PI*2*pct));
       ctx.strokeStyle = '#E74C3C';
       ctx.lineWidth = 4;
       ctx.stroke();
    }

    // 名前ラベル
    ctx.globalAlpha = isGhost ? 0.5 : 0.95;
    const labelY = sy - R - 6;
    ctx.font      = 'bold 10px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(p.name, sx + 1, labelY + 1);
    ctx.fillStyle = isGhost ? '#99CCFF' : '#FFFFFF';
    ctx.fillText(p.name, sx, labelY);

    // 破壊アクションリング描画
    if (isSelf && destroyTimer > 0) {
       const progress = Math.min(destroyTimer / 2000, 1.0);
       ctx.strokeStyle = `rgba(231, 76, 60, ${0.4 + progress * 0.6})`;
       ctx.lineWidth = 3;
       ctx.beginPath();
       ctx.arc(sx, sy, R + 8, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * progress));
       ctx.stroke();
       ctx.fillStyle = ctx.strokeStyle;
       ctx.font = 'bold 10px sans-serif';
       ctx.fillText(`${Math.round(progress * 100)}%`, sx, sy - R - 18);
    }

    ctx.restore();
  }

  // ── 死体描画 ─────────────────────────────────────────────────────────────────
  _drawBody(ctx, body) {
    const sx = Math.round(body.px - this.camX);
    const sy = Math.round(body.py - this.camY);

    ctx.save();
    ctx.globalAlpha = 0.85;

    // 外套（体が倒れた形）
    ctx.translate(sx, sy);
    const angle = Math.sin(body.px * 0.05 + body.py * 0.03) * 0.6 + 0.5;
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = body.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.resetTransform();

    // もぬけの殻マーク
    ctx.font      = '13px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,60,60,0.9)';
    ctx.fillText('✕', sx, sy + 5);

    // 名前
    ctx.font      = '9px "Cinzel", serif';
    ctx.fillStyle = 'rgba(200,80,80,0.9)';
    ctx.fillText(body.name, sx, sy - 16);

    ctx.restore();
  }

  // ── エフェクト ───────────────────────────────────────────────────────────────
  addTaskCompleteAnim(px, py)  { this._taskCompleteAnims.push({ px, py, t: 0 }); }
  addVentAnim(px, py)          { this._ventAnims.push({ px, py, t: 0 }); }
  addKillAnim(px, py)          { this._killAnims.push({ px, py, t: 0 }); }

  _drawEffects(ctx) {
    const DT = 1 / 60;

    // タスク完了エフェクト（緑の上昇テキスト）
    this._taskCompleteAnims = this._taskCompleteAnims.filter(a => {
      a.t += DT;
      const sx = a.px - this.camX;
      const sy = a.py - this.camY - a.t * 60;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - a.t * 2);
      ctx.font        = 'bold 14px "Cinzel", serif';
      ctx.fillStyle   = '#2ECC71';
      ctx.textAlign   = 'center';
      ctx.fillText('✓ 完了!', sx, sy);
      ctx.restore();
      return a.t < 0.8;
    });

    // キル／捕縛エフェクト（赤フラッシュ）
    this._killAnims = this._killAnims.filter(a => {
      a.t += DT;
      const sx = a.px - this.camX;
      const sy = a.py - this.camY - a.t * 40;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - a.t * 2.5);
      ctx.font        = 'bold 20px serif';
      ctx.fillStyle   = '#E74C3C';
      ctx.textAlign   = 'center';
      ctx.fillText('⚔', sx, sy);
      ctx.restore();
      return a.t < 0.6;
    });

    // ベントエフェクト（渦）
    this._ventAnims = this._ventAnims.filter(a => {
      a.t += DT;
      const sx = a.px - this.camX;
      const sy = a.py - this.camY;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - a.t * 3);
      ctx.strokeStyle = '#2A4A6A';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, a.t * 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return a.t < 0.5;
    });
  }

  // ── HUD 描画 (キャンバス上部レイヤー) ───────────────────────────────────────
  drawHUD(ctx, gs, myId) {
    const me = gs.players.find(p => p.id === myId);
    if (!me || gs.state !== GAME_STATE.ACTION_PHASE) return;

    const W = ctx.canvas.width;

    // タスク進捗バー（上部）
    const barW  = Math.min(W - 40, 420);
    const barH  = 16;
    const barX  = (W - barW) / 2;
    const barY  = 14;
    const prog  = gs.taskProgress;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 5);
    ctx.fill();

    ctx.fillStyle = '#1a1208';
    this._roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();

    const grd = ctx.createLinearGradient(barX, 0, barX + barW * prog, 0);
    grd.addColorStop(0,   '#2E8B57');
    grd.addColorStop(0.6, '#3CB371');
    grd.addColorStop(1,   '#66CDAA');
    ctx.fillStyle = grd;
    this._roundRect(ctx, barX, barY, barW * prog, barH, 4);
    ctx.fill();

    ctx.font      = 'bold 10px "Cinzel", serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.fillText(
      `タスク ${gs.completedTasks ? gs.completedTasks.length : 0} / ${PARAMS.TOTAL_TASKS}`,
      W / 2, barY + barH - 3
    );

    // 役割インジケーター（左上）
    const roleText  = me.role === ROLES.JUDAS ? '🗡 ユダ' : '✝ 使徒';
    const roleColor = me.role === ROLES.JUDAS ? '#E74C3C' : '#3498DB';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    this._roundRect(ctx, 12, 10, 82, 22, 6);
    ctx.fill();
    ctx.font      = 'bold 12px "Cinzel", serif';
    ctx.fillStyle = roleColor;
    ctx.textAlign = 'left';
    ctx.fillText(roleText, 18, 26);

    // キルクールダウン（Judas のみ、右上）
    if (me.role === ROLES.JUDAS && me.killCooldown !== undefined) {
      const cdSec = Math.ceil(me.killCooldown / 1000);
      const ready = cdSec <= 0;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      this._roundRect(ctx, W - 130, 10, 118, 22, 6);
      ctx.fill();
      ctx.font      = 'bold 11px "Cinzel", serif';
      ctx.fillStyle = ready ? '#E74C3C' : '#888';
      ctx.textAlign = 'right';
      ctx.fillText(
        ready ? '⚔ 捕縛可能' : `⚔ CD: ${cdSec}s`,
        W - 16, 26
      );
    }

    // フェーズ（運命の刻）インジケーター（右側上部・キルCDの下あたり）
    const phaseData = typeof PHASE_SETTINGS !== 'undefined' 
        ? PHASE_SETTINGS.find(p => p.level === gs.currentPhase) || PHASE_SETTINGS[0]
        : { name: `フェーズ ${gs.currentPhase || 1}` };
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    this._roundRect(ctx, W - 130, 38, 118, 20, 6);
    ctx.fill();
    ctx.font      = 'bold 11px sans-serif';
    ctx.fillStyle = '#F1C40F';
    ctx.textAlign = 'right';
    ctx.fillText(`${phaseData.name}`, W - 16, 52);

    // ゴーストラベル
    if (me.status === STATUS.ARRESTED) {
      ctx.fillStyle = 'rgba(30,50,100,0.7)';
      this._roundRect(ctx, W / 2 - 80, barY + barH + 6, 160, 20, 5);
      ctx.fill();
      ctx.font      = 'bold 11px "Cinzel", serif';
      ctx.fillStyle = '#99CCFF';
      ctx.textAlign = 'center';
      ctx.fillText('👻 ゴーストモード', W / 2, barY + barH + 20);
    }

    // Critical Emergency タイマー（サボタージュ中）
    if (gs.activeSabotage && gs.activeSabotage.type === SABOTAGE.CRITICAL_EMERGENCY) {
      const sec = Math.ceil((gs.activeSabotage.timer || 0) / 1000);
      ctx.fillStyle = `rgba(${sec < 15 ? '180,20,20' : '100,10,10'},0.85)`;
      this._roundRect(ctx, W / 2 - 110, barY + barH + 10, 220, 30, 6);
      ctx.fill();
      ctx.font      = 'bold 14px "Cinzel", serif';
      ctx.fillStyle = sec < 15 ? '#FF6060' : '#FF3030';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠ 緊急事態 残り ${sec}秒`, W / 2, barY + barH + 30);
    }

    ctx.restore();
  }

  // ── ユーティリティ ─────────────────────────────────────────────────────────
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
