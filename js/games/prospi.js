/* ============================================================
   games/prospi.js — サイコロプロスピ（ダイス野球）
   設計書 3-2 準拠:
   - 魔王=ピッチャー / プレイヤー=バッター（打つだけ・的当て式）
   - 左・中・右のうち2つの位置の出目（各1〜6）を予想 ＋ 3個の合計値を予想
   - 魔王がサイコロ3個を振る
   - 位置1つ的中=ヒット / 2つ的中=二塁打 / 合計的中=ホームラン / 全外れ=アウト
   - 特殊出目（最優先）: ①①①=エラー / ⑥⑥⑥=三振
   - 3アウト1セット（確定: §8-3）→ 得点をコインに精算
   ============================================================ */
(function (global) {
  'use strict';

  var COIN_PER_RUN = 300; // 1得点ごとの獲得コイン

  var S = null;

  function freshState() {
    return {
      bases: [false, false, false], // [1塁, 2塁, 3塁]
      outs: 0,
      runs: 0,                       // このセットの得点
      pred: { positions: {}, sum: 10 }, // positions: {left|center|right: 1..6}, sum: 3..18
      phase: 'predict',              // predict | revealing | result | setover
      lastDice: null,
      busy: false
    };
  }

  var POS = [
    { key: 'left', label: '左' },
    { key: 'center', label: '中' },
    { key: 'right', label: '右' }
  ];

  /* ----------------------------------------------------------
     描画
     ---------------------------------------------------------- */
  function render(mount) {
    S = freshState();

    var v = UI.el('div', 'view prospi');
    v.appendChild(UI.bg('bg_baseball'));
    v.innerHTML +=
      '<div class="screen-title"><button class="linkback" id="ppBack">‹</button> サイコロ プロスピ' +
      '<button class="help-btn" id="ppHelp" aria-label="遊び方">？</button></div>';

    // スコアボード（アウト・得点・塁ダイヤ）
    var board = UI.el('div', 'pp-board panel');
    board.innerHTML =
      '<div class="pp-board__col">' +
        '<div class="pp-board__lbl">OUT</div>' +
        '<div class="pp-outs" id="ppOuts"></div>' +
      '</div>' +
      '<div class="pp-diamond" id="ppDiamond">' +
        '<span class="pp-base pp-base--2" data-b="1"></span>' +
        '<span class="pp-base pp-base--3" data-b="2"></span>' +
        '<span class="pp-base pp-base--1" data-b="0"></span>' +
        '<span class="pp-base pp-base--home"></span>' +
      '</div>' +
      '<div class="pp-board__col">' +
        '<div class="pp-board__lbl">得点</div>' +
        '<div class="pp-runs" id="ppRuns">0</div>' +
        '<div class="pp-coin-acc" id="ppCoinAcc"></div>' +
      '</div>';
    v.appendChild(board);

    // 出目表示エリア（振った後に表示）
    var diceArea = UI.el('div', 'pp-dicearea', '<div class="dice-row" id="ppDice"></div><div class="pp-outcome" id="ppOutcome"></div>');
    v.appendChild(diceArea);

    // 予想入力
    var pred = UI.el('div', 'pp-predict', '');
    pred.innerHTML =
      '<div class="pp-predict__hint" id="ppHint">位置を2つ選んで出目を予想 ＋ 合計を予想</div>' +
      '<div class="pp-positions" id="ppPositions"></div>' +
      '<div class="pp-sum">' +
        '<span class="pp-sum__lbl">合計予想</span>' +
        '<button class="bet-step" id="ppSumMinus">−</button>' +
        '<span class="pp-sum__val" id="ppSumVal">10</span>' +
        '<button class="bet-step" id="ppSumPlus">＋</button>' +
      '</div>';
    v.appendChild(pred);

    // アクション
    var actions = UI.el('div', 'pp-actions');
    actions.innerHTML = '<button class="btn btn--primary btn--lg btn--block" id="ppSwing" disabled>振る（打席へ）</button>';
    v.appendChild(actions);

    mount.appendChild(v);

    var overlay = UI.el('div', 'bj-overlay hidden');
    overlay.id = 'ppOverlay';
    mount.appendChild(overlay);

    // 位置ピッカー生成
    buildPositions();

    // イベント
    UI.$('#ppBack').addEventListener('click', function () { Router.go('home'); });
    UI.$('#ppHelp').addEventListener('click', showHelp);
    UI.$('#ppSumMinus').addEventListener('click', function () { changeSum(-1); });
    UI.$('#ppSumPlus').addEventListener('click', function () { changeSum(1); });
    UI.$('#ppSwing').addEventListener('click', onSwing);

    paintBoard();
    refreshSwing();
  }

  function buildPositions() {
    var box = UI.$('#ppPositions');
    box.innerHTML = '';
    POS.forEach(function (p) {
      var col = UI.el('div', 'pp-pos');
      col.setAttribute('data-pos', p.key);
      var grid = '';
      for (var n = 1; n <= 6; n++) grid += '<button class="pp-pip" data-v="' + n + '">' + n + '</button>';
      col.innerHTML = '<div class="pp-pos__head">' + p.label + '</div><div class="pp-pos__grid">' + grid + '</div>';
      col.querySelector('.pp-pos__grid').addEventListener('click', function (e) {
        var b = e.target.closest('.pp-pip'); if (!b) return;
        togglePred(p.key, parseInt(b.getAttribute('data-v'), 10));
      });
      box.appendChild(col);
    });
  }

  function togglePred(pos, val) {
    if (S.phase !== 'predict' || S.busy) return;
    var cur = S.pred.positions[pos];
    if (cur === val) {
      // 同じ値を再タップで解除
      delete S.pred.positions[pos];
    } else {
      var active = Object.keys(S.pred.positions);
      if (cur === undefined && active.length >= 2) {
        UI.toast('位置は2つまで予想できます', 'bad');
        return;
      }
      S.pred.positions[pos] = val;
    }
    paintPositions();
    refreshSwing();
  }

  function paintPositions() {
    POS.forEach(function (p) {
      var col = UI.$('#ppPositions').querySelector('[data-pos="' + p.key + '"]');
      var sel = S.pred.positions[p.key];
      col.classList.toggle('is-active', sel !== undefined);
      col.querySelectorAll('.pp-pip').forEach(function (b) {
        b.classList.toggle('is-sel', parseInt(b.getAttribute('data-v'), 10) === sel);
      });
    });
  }

  function changeSum(dir) {
    if (S.phase !== 'predict' || S.busy) return;
    var n = S.pred.sum + dir;
    if (n < 3 || n > 18) return;
    S.pred.sum = n;
    UI.$('#ppSumVal').textContent = n;
  }

  function refreshSwing() {
    var ok = Object.keys(S.pred.positions).length === 2 && S.phase === 'predict' && !S.busy;
    var btn = UI.$('#ppSwing');
    if (btn) btn.disabled = !ok;
    var hint = UI.$('#ppHint');
    if (hint) {
      var cnt = Object.keys(S.pred.positions).length;
      hint.textContent = cnt < 2 ? ('位置をあと' + (2 - cnt) + 'つ選んでください') : '準備OK！「振る」で打席へ';
      hint.classList.toggle('is-ready', cnt === 2);
    }
  }

  /* ----------------------------------------------------------
     スコアボード描画
     ---------------------------------------------------------- */
  function paintBoard() {
    // アウト
    var outsBox = UI.$('#ppOuts');
    if (outsBox) {
      var h = '';
      for (var i = 0; i < 3; i++) h += '<span class="pp-out-dot' + (i < S.outs ? ' is-on' : '') + '"></span>';
      outsBox.innerHTML = h;
    }
    // 得点
    var runsEl = UI.$('#ppRuns');
    if (runsEl) runsEl.textContent = S.runs;
    var accEl = UI.$('#ppCoinAcc');
    if (accEl) accEl.textContent = S.runs > 0 ? ('🪙' + UI.fmt(S.runs * COIN_PER_RUN)) : '';
    // 塁
    var dia = UI.$('#ppDiamond');
    if (dia) {
      for (var b = 0; b < 3; b++) {
        var node = dia.querySelector('.pp-base[data-b="' + b + '"]');
        if (node) node.classList.toggle('is-on', !!S.bases[b]);
      }
    }
  }

  /* ----------------------------------------------------------
     打席実行
     ---------------------------------------------------------- */
  function onSwing() {
    if (S.busy || S.phase !== 'predict') return;
    if (Object.keys(S.pred.positions).length !== 2) return;

    S.busy = true;
    S.phase = 'revealing';
    refreshSwing();
    if (global.FX) FX.ev.diceRoll();

    var dice = { left: UI.rollDie(), center: UI.rollDie(), right: UI.rollDie() };
    S.lastDice = dice;

    // 振りアニメ
    var box = UI.$('#ppDice');
    box.innerHTML = '';
    var order = ['left', 'center', 'right'];
    var dieEls = order.map(function () { var d = UI.die(UI.rollDie(), 'md', true); box.appendChild(d); return d; });
    UI.$('#ppOutcome').textContent = '';
    UI.$('#ppOutcome').className = 'pp-outcome';

    UI.sleep(680).then(function () {
      // 確定表示
      box.innerHTML = '';
      order.forEach(function (k) { var d = UI.die(dice[k], 'md', false); d.classList.add('is-set'); box.appendChild(d); });
      resolveAndApply(dice);
    });
  }

  /* ----------------------------------------------------------
     判定（純粋関数）
     ---------------------------------------------------------- */
  function resolve(dice, pred) {
    var d = [dice.left, dice.center, dice.right];
    // 特殊出目 最優先
    if (d[0] === 1 && d[1] === 1 && d[2] === 1) return { type: 'error' };
    if (d[0] === 6 && d[1] === 6 && d[2] === 6) return { type: 'strikeout' };
    var sum = d[0] + d[1] + d[2];
    if (pred.sum === sum) return { type: 'hr' };
    var m = 0;
    ['left', 'center', 'right'].forEach(function (pos) {
      if (pred.positions[pos] != null && pred.positions[pos] === dice[pos]) m++;
    });
    if (m === 2) return { type: 'double' };
    if (m === 1) return { type: 'single' };
    return { type: 'out' };
  }

  // 塁状況に結果を適用。bases配列を破壊的更新し {runs, outAdded, rebat, label, kind} を返す
  function applyResult(type, basesRef) {
    function advance(k, label, kind) {
      var r = 0; var nb = [false, false, false];
      for (var i = 0; i < 3; i++) {
        if (basesRef[i]) { var np = i + k; if (np >= 3) r++; else nb[np] = true; }
      }
      var bp = k - 1; if (bp < 3) nb[bp] = true; else r++; // 打者
      for (var j = 0; j < 3; j++) basesRef[j] = nb[j];
      return { runs: r, outAdded: 0, label: label, kind: kind };
    }
    switch (type) {
      case 'hr': {
        var r = basesRef.filter(Boolean).length + 1;
        basesRef[0] = basesRef[1] = basesRef[2] = false;
        return { runs: r, outAdded: 0, label: 'ホームラン！', kind: 'hr' };
      }
      case 'double': return advance(2, '二塁打！', 'double');
      case 'single': return advance(1, 'ヒット！', 'single');
      case 'error': {
        var hasRunner = basesRef[0] || basesRef[1] || basesRef[2];
        if (!hasRunner) { basesRef[0] = true; return { runs: 0, outAdded: 0, label: 'エラー（出塁）', kind: 'error' }; }
        var runs = 0; var nb = [false, false, false];
        for (var i = 2; i >= 0; i--) { if (basesRef[i]) { if (i + 1 >= 3) runs++; else nb[i + 1] = true; } }
        for (var j = 0; j < 3; j++) basesRef[j] = nb[j];
        return { runs: runs, outAdded: 0, rebat: true, label: 'エラー（走者進塁・振り直し）', kind: 'error' };
      }
      case 'strikeout': return { runs: 0, outAdded: 1, label: '三振…', kind: 'out' };
      default: return { runs: 0, outAdded: 1, label: 'アウト', kind: 'out' };
    }
  }

  function resolveAndApply(dice) {
    var verdict = resolve(dice, S.pred);
    var eff = applyResult(verdict.type, S.bases);

    S.runs += eff.runs;
    S.outs += eff.outAdded;

    paintBoard();

    var oc = UI.$('#ppOutcome');
    oc.textContent = eff.label + (eff.runs > 0 ? '　+' + eff.runs + '点' : '');
    oc.className = 'pp-outcome is-' + eff.kind + (eff.runs > 0 ? ' has-run' : '');

    // 演出・効果音
    if (global.FX) {
      if (eff.kind === 'hr') FX.ev.homerun();
      else if (eff.kind === 'out') FX.ev.strikeout();
      else FX.ev.hit();
    }

    S.phase = 'result';

    UI.sleep(900).then(function () {
      if (S.outs >= 3) { endSet(); return; }
      if (eff.rebat) {
        // 振り直し: 同じ打者・予想はリセットして再入力
        S.pred.positions = {};
        nextAtBat(true);
      } else {
        nextAtBat(false);
      }
    });
  }

  function nextAtBat(isRebat) {
    S.phase = 'predict';
    S.busy = false;
    S.pred.positions = {};
    paintPositions();
    if (!isRebat) {
      // 出目表示は次の振りまで残す（クリアしない）
    }
    refreshSwing();
  }

  /* ----------------------------------------------------------
     セット終了・精算
     ---------------------------------------------------------- */
  function endSet() {
    S.phase = 'setover';
    var coins = S.runs * COIN_PER_RUN;
    if (coins > 0) Store.addCoins(coins, 'prospi');
    var isBest = Store.reportProspiScore(S.runs);
    if (global.FX) FX.ev.setClear(S.runs);

    var ov = UI.$('#ppOverlay');
    ov.className = 'bj-overlay is-win';
    ov.innerHTML =
      '<div class="bj-result">' +
        '<div class="bj-result__label">セット終了</div>' +
        '<div class="bj-result__sub">3アウト・このセットの得点</div>' +
        '<div class="pp-finalruns">' + S.runs + ' 点</div>' +
        (isBest && S.runs > 0 ? '<div class="pp-best">🏆 自己ベスト更新！</div>' : '<div class="bj-result__detail">自己ベスト ' + Store.get().bestProspi + ' 点</div>') +
        '<div class="bj-result__coins ' + (coins > 0 ? 'plus' : 'minus') + '">🪙 ' + (coins > 0 ? '+' + UI.fmt(coins) : '0') + '</div>' +
        '<button class="btn btn--gold btn--lg btn--block" id="ppNext">次のセット</button>' +
        '<button class="btn btn--ghost btn--block" id="ppToHome">ホームへ</button>' +
      '</div>';
    UI.$('#ppNext').addEventListener('click', function () { Router.go('prospi'); });
    UI.$('#ppToHome').addEventListener('click', function () { Router.go('home'); });
  }

  /* ----------------------------------------------------------
     遊び方
     ---------------------------------------------------------- */
  function showHelp() {
    var ov = UI.$('#ppOverlay');
    ov.className = 'bj-overlay is-help';
    ov.innerHTML =
      '<div class="bj-result bj-help">' +
        '<div class="bj-result__label" style="font-size:22px">遊び方</div>' +
        '<ul class="bj-help__list">' +
          '<li>魔王の投球（サイコロ3個）の出目を予想して打つ</li>' +
          '<li><b>左・中・右から2つ</b>の位置の出目を予想</li>' +
          '<li>さらに<b>3個の合計</b>を予想</li>' +
          '<li>位置1つ的中=<b>ヒット</b> / 2つ的中=<b>二塁打</b></li>' +
          '<li>合計が的中=<b>ホームラン</b>（全員生還）</li>' +
          '<li>①①①=<b>エラー</b> / ⑥⑥⑥=<b>三振</b>（最優先）</li>' +
          '<li><b>3アウト</b>でセット終了。得点×' + COIN_PER_RUN + 'コイン獲得</li>' +
        '</ul>' +
        '<button class="btn btn--gold btn--block" id="ppHelpClose">とじる</button>' +
      '</div>';
    UI.$('#ppHelpClose').addEventListener('click', function () { ov.className = 'bj-overlay hidden'; });
  }

  global.GameProspi = { navKey: 'home', bgm: 'prospi', render: render };

  // 検証用ロジック公開（本番動作に影響しない）
  global.GameProspi._logic = { resolve: resolve, applyResult: applyResult, COIN_PER_RUN: COIN_PER_RUN };
})(window);
