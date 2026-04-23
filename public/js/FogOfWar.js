// FogOfWar.js — 視界制限（Fog of War）レイキャスト実装
// 依存: constants.js, Map.js

class FogOfWar {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width  = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  /**
   * 霧を描画してメインキャンバスに合成する
   * @param {CanvasRenderingContext2D} mainCtx  - ゲームキャンバスのコンテキスト
   * @param {number}   playerPx       - プレイヤー X座標 (ワールド)
   * @param {number}   playerPy       - プレイヤー Y座標 (ワールド)
   * @param {number}   camX           - カメラ X オフセット
   * @param {number}   camY           - カメラ Y オフセット
   * @param {GameMap}  gameMap        - マップオブジェクト
   * @param {boolean}  isGhost        - ゴースト状態か
   * @param {boolean}  blindnessActive- 盲目サボタージュ中か
   * @param {boolean}  isJudas        - ユダか
   */
  draw(mainCtx, playerPx, playerPy, camX, camY, gameMap, isGhost, blindnessActive, isJudas = false) {
    if (isGhost) {
      // ゴーストは全体視野（薄い青みがかったオーバーレイ）
      mainCtx.save();
      mainCtx.fillStyle = 'rgba(30,50,100,0.18)';
      mainCtx.fillRect(0, 0, mainCtx.canvas.width, mainCtx.canvas.height);
      mainCtx.restore();
      return;
    }

    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;

    // スクリーン座標でのプレイヤー位置
    const spx = playerPx - camX;
    const spy = playerPy - camY;

    // 有効半径 (ユダは視界喪失の影響を受けない)
    const radius = (blindnessActive && !isJudas)
      ? PARAMS.FOV_RADIUS * 0.28
      : PARAMS.FOV_RADIUS;

    // 霧キャンバスをリセット（完全に暗く）
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.fillRect(0, 0, W, H);

    // 視野ポリゴンを destination-out でくり抜く
    this._castAndDraw(ctx, spx, spy, radius, playerPx, playerPy, camX, camY, gameMap);

    // 霧をメインキャンバスに重ね合わせ
    mainCtx.drawImage(this.canvas, 0, 0);
  }

  _castAndDraw(ctx, spx, spy, radius, worldX, worldY, camX, camY, gameMap) {
    const ts      = PARAMS.TILE_SIZE;
    const NUM_RAYS = 240;  // 精度と性能のバランス
    const STEP    = 3;     // px 単位のレイマーチ刻み

    // 各レイの終点を収集
    const pts = [];

    for (let i = 0; i <= NUM_RAYS; i++) {
      const angle = (i / NUM_RAYS) * Math.PI * 2;
      const cosA  = Math.cos(angle);
      const sinA  = Math.sin(angle);

      let ex = spx, ey = spy;

      for (let r = STEP; r <= radius; r += STEP) {
        const wx = worldX + cosA * r;
        const wy = worldY + sinA * r;

        const tc = Math.floor(wx / ts);
        const tr = Math.floor(wy / ts);

        if (gameMap.isWall(tc, tr)) break;

        ex = wx - camX;
        ey = wy - camY;
      }
      pts.push(ex, ey);
    }

    // Destination-out でポリゴンをくり抜き ＋ ラジアルグラデーションで端をソフトに
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    // まずソリッドな視野コアを塗る
    ctx.beginPath();
    ctx.moveTo(spx, spy);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();

    const grad = ctx.createRadialGradient(spx, spy, 0, spx, spy, radius);
    grad.addColorStop(0,    'rgba(0,0,0,1)');
    grad.addColorStop(0.78, 'rgba(0,0,0,1)');
    grad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }
}
