// Minigames.js — タスク消化用の各種ミニゲームロジック
// 依存: constants.js

const Minigames = (() => {
  let activeGame = null;
  let onCompleteCallback = null;
  let onCancelCallback = null;

  // DOM 参照群
  const els = {
    overlay: null,
    title: null,
    contentBox: null,
    containerTyping: null,
    containerGauge: null,
    containerSequence: null,
    cleanupFns: [] // ゲーム終了時に呼ぶクリーンアップ関数群
  };

  function initDOM() {
    els.overlay = document.getElementById('minigame-overlay');
    els.title = document.getElementById('mg-title');
    els.contentBox = document.getElementById('mg-content');
    els.containerTyping = document.getElementById('mg-typing');
    els.containerGauge = document.getElementById('mg-gauge');
    els.containerSequence = document.getElementById('mg-sequence');

    document.getElementById('btn-mg-close')?.addEventListener('click', () => cancel());
  }

  // --- Core API ---

  function start(task, phase, onComplete, onCancel) {
    if (!els.overlay) initDOM();
    if (activeGame) cancel();

    activeGame = task.id;
    onCompleteCallback = onComplete;
    onCancelCallback = onCancel;

    // パラメータ未指定時のフォールバック
    if (typeof phase === 'function') {
      onCancelCallback = onComplete;
      onCompleteCallback = phase;
      phase = 1;
    }

    els.title.textContent = `⚡ ${task.name}`;
    els.containerTyping.style.display = 'none';
    els.containerGauge.style.display = 'none';
    els.containerSequence.style.display = 'none';
    els.contentBox.classList.remove('success', 'fail');
    els.cleanupFns = [];

    // タスクIDに基づくゲーム判定
    // t0, t4 = タイピング
    // t1, t3, t5 = 長押しゲージ止め
    // t2, t6, t7, t8, t9 = 順番タップ
    if (['t0', 't4'].includes(task.id)) {
      startTypingGame(phase);
    } else if (['t1', 't3', 't5'].includes(task.id)) {
      startGaugeGame(phase);
    } else {
      startSequenceGame(phase);
    }

    els.overlay.style.display = 'flex';
  }

  function complete() {
    els.contentBox.classList.add('success');
    cleanup();
    setTimeout(() => {
      els.overlay.style.display = 'none';
      if (onCompleteCallback) onCompleteCallback();
      resetState();
    }, 500); // 成功エフェクトを見せる
  }

  function cancel() {
    cleanup();
    els.overlay.style.display = 'none';
    if (onCancelCallback) onCancelCallback();
    resetState();
  }

  function resetState() {
    activeGame = null;
    onCompleteCallback = null;
    onCancelCallback = null;
    els.cleanupFns = [];
  }

  function cleanup() {
    els.cleanupFns.forEach(fn => fn());
    els.cleanupFns = [];
  }

  function isActive() {
    return activeGame !== null;
  }

  // --- Minigame: Typing ---
  // 指定された英単語をタイピングする
  function startTypingGame(phase) {
    const WORDS = ['AMEN', 'FAITH', 'PEACE', 'LIGHT', 'HOLY', 'BREAD', 'BLESS'];
    
    // フェーズに応じて単語数を増やす (1〜3語)
    const wordCount = Math.min(phase || 1, 3);
    let targetText = '';
    for (let i = 0; i < wordCount; i++) {
        targetText += WORDS[Math.floor(Math.random() * WORDS.length)];
    }
    
    let typedIndex = 0;

    els.containerTyping.style.display = 'block';
    
    // HTML構築
    let html = '';
    for (let i = 0; i < targetText.length; i++) {
      html += `<span class="ty-char" id="ty-char-${i}">${targetText[i]}</span>`;
    }
    document.getElementById('mg-typing-word').innerHTML = html;
    document.getElementById('mg-typing-inst').textContent = 'キーボードで文字を入力せよ';

    function onKeyDown(e) {
      if (e.key.length !== 1) return; // 修飾キー等を無視
      const char = e.key.toUpperCase();
      
      if (char === targetText[typedIndex]) {
        // 正解
        document.getElementById(`ty-char-${typedIndex}`).classList.add('typed');
        typedIndex++;
        if (typedIndex >= targetText.length) {
          complete();
        }
      } else {
        // ミス（画面揺れなど）
        els.contentBox.classList.remove('fail');
        void els.contentBox.offsetWidth; // reflow
        els.contentBox.classList.add('fail');
      }
    }

    document.addEventListener('keydown', onKeyDown);
    els.cleanupFns.push(() => document.removeEventListener('keydown', onKeyDown));
  }

  // --- Minigame: Gauge ---
  // マウス/スペース長押しでゲージを貯め、緑の範囲で離す
  function startGaugeGame(phase) {
    els.containerGauge.style.display = 'flex';
    
    const fillEl = document.getElementById('mg-gauge-fill');
    const targetEl = document.getElementById('mg-gauge-target');
    const instEl = document.getElementById('mg-gauge-inst');

    instEl.textContent = '「SPACE」またはクリックを長押しし、緑の範囲で離せ';

    // フェーズに応じた難易度
    const speeds = [0, 0.8, 1.2, 1.6];
    const widths = [0, 15, 12, 10];
    const lv = Math.min(phase || 1, 3);
    const speed = speeds[lv];
    const targetWidth = widths[lv];

    // 成功範囲をランダムに設定
    const targetStart = 20 + Math.random() * 50;
    const targetEnd = targetStart + targetWidth;
    
    targetEl.style.left = `${targetStart}%`;
    targetEl.style.width = `${targetWidth}%`;
    fillEl.style.width = '0%';
    fillEl.style.backgroundColor = '#E74C3C';

    let value = 0;
    let isPressing = false;
    let animationFrameId = null;

    function loop() {
      if (!isPressing) return;
      value += speed; // ゲージ上昇速度
      if (value > 100) {
        // 振り切れたら失敗
        value = 0;
        els.contentBox.classList.remove('fail');
        void els.contentBox.offsetWidth;
        els.contentBox.classList.add('fail');
        isPressing = false;
        fillEl.style.width = '0%';
        fillEl.style.backgroundColor = '#E74C3C';
        return;
      }
      fillEl.style.width = `${value}%`;

      if (value >= targetStart && value <= targetEnd) {
        fillEl.style.backgroundColor = '#2ECC71';
      } else {
        fillEl.style.backgroundColor = '#E74C3C';
      }

      animationFrameId = requestAnimationFrame(loop);
    }

    function press() {
      if (!isActive() || isPressing) return;
      isPressing = true;
      value = 0;
      loop();
    }

    function release() {
      if (!isPressing) return;
      isPressing = false;
      cancelAnimationFrame(animationFrameId);

      if (value >= targetStart && value <= targetEnd) {
        complete();
      } else {
        // 失敗
        value = 0;
        fillEl.style.width = '0%';
        fillEl.style.backgroundColor = '#E74C3C';
        els.contentBox.classList.remove('fail');
        void els.contentBox.offsetWidth;
        els.contentBox.classList.add('fail');
      }
    }

    // キーボードバインディング
    function onKeyDown(e) {
      if ((e.code === 'Space' || e.code === 'KeyE') && !isPressing) press();
    }
    function onKeyUp(e) {
      if (e.code === 'Space' || e.code === 'KeyE') release();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    const btnBox = els.containerGauge;
    btnBox.addEventListener('mousedown', press);
    btnBox.addEventListener('mouseup', release);
    btnBox.addEventListener('mouseleave', release);
    btnBox.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, {passive: false});
    btnBox.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, {passive: false});

    els.cleanupFns.push(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      btnBox.removeEventListener('mousedown', press);
      btnBox.removeEventListener('mouseup', release);
      btnBox.removeEventListener('mouseleave', release);
      cancelAnimationFrame(animationFrameId);
    });
  }

  // --- Minigame: Sequence ---
  // ランダムに配置されたボタンを順番に押す
  function startSequenceGame(phase) {
    els.containerSequence.style.display = 'block';
    const area = document.getElementById('mg-seq-area');
    area.innerHTML = '';
    
    const lv = Math.min(phase || 1, 3);
    const count = 4 + lv; // 5, 6, 7個
    let nextExpected = 1;

    // 衝突判定付きでランダム配置
    const buttons = [];
    for (let i = 1; i <= count; i++) {
        const btn = document.createElement('button');
        btn.className = 'mg-seq-btn';
        btn.textContent = String(i);
        
        let attempts = 0;
        let left, top;
        // 配置が被らないようにループ
        while (attempts < 50) {
            left = 10 + Math.random() * 70; // 10% ~ 80% (幅を避ける)
            top = 10 + Math.random() * 70;
            
            const collision = buttons.some(b => {
                return Math.abs(b.left - left) < 15 && Math.abs(b.top - top) < 15;
            });
            if (!collision) break;
            attempts++;
        }

        buttons.push({ left, top, el: btn, num: i });
        btn.style.left = `${left}%`;
        btn.style.top = `${top}%`;
        
        btn.onclick = () => {
            if (i === nextExpected) {
                btn.classList.add('correct');
                btn.disabled = true;
                nextExpected++;
                if (nextExpected > count) {
                    complete();
                }
            } else {
                els.contentBox.classList.remove('fail');
                void els.contentBox.offsetWidth;
                els.contentBox.classList.add('fail');
            }
        };

        area.appendChild(btn);
    }
  }

  return {
    start,
    isActive,
    cancel
  };
})();
