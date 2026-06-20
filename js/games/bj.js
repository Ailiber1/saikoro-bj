/* ============================================================
   games/bj.js — サイコロBJ（魔王のダイスカジノ）
   設計書 3-1 準拠:
   - 目標数(1〜18)をラウンド開始時にランダム提示
   - プレイヤーは1〜3個を選んで振り、合計に加算
   - 目標数を超えたら即ドボン（BET没収）
   - ストップで確定 → 魔王が同ルールで振る
   - 判定: 目標数に近い方が勝ち / ジャスト＝最強 / 同点はプレイヤー勝ち
   - 配当: 勝ち=BET×2 / ジャスト勝ち=BET×3 / 負け・ドボン=没収
   ============================================================ */
(function (global) {
  'use strict';

  var BET_PRESETS = [500, 1000, 2000, 5000, 10000];

  // ゲーム状態（画面に入るたびリセット）
  var S = null;

  function freshState() {
    return {
      target: 1,
      betIdx: 1,                 // BET_PRESETS のインデックス（既定1=1000）
      bet: 1000,
      committed: false,          // BET確定（最初の振り）済みか
      phase: 'ready',            // ready | playing | maou | result
      playerSum: 0,
      playerDice: [],            // 直近の出目
      playerBust: false,
      maouSum: 0,
      maouDice: [],
      maouBust: false,
      diceCount: 1,              // 振る個数 1〜3
      busy: false                // アニメ中ロック
    };
  }

  /* ----------------------------------------------------------
     画面描画
     ---------------------------------------------------------- */
  function render(mount) {
    S = freshState();
    S.target = randomTarget();
    // BET初期値をコインに合わせて調整
    clampBet();

    var v = UI.el('div', 'view bj');
    v.appendChild(UI.bg('bg_bj'));

    v.innerHTML +=
      '<div class="screen-title"><button class="linkback" id="bjBack">‹</button> サイコロBJ' +
      '<button class="help-btn" id="bjHelp" aria-label="遊び方">？</button></div>';

    // 目標数バー
    var targetWrap = UI.el('div', 'bj-target panel panel--gold');
    targetWrap.innerHTML =
      '<div class="bj-target__label">目標数</div>' +
      '<div class="bj-target__nums" id="bjTargetNums"></div>';
    v.appendChild(targetWrap);

    // 対戦エリア（プレイヤー / 魔王）
    var arena = UI.el('div', 'bj-arena');
    arena.innerHTML =
      '<div class="bj-side bj-side--maou" id="bjMaouSide">' +
        '<div class="bj-side__head"><span class="bj-side__name">👑 魔王</span><span class="bj-side__sum" id="bjMaouSum">—</span></div>' +
        '<div class="dice-row bj-dice" id="bjMaouDice"></div>' +
        '<div class="bj-side__status" id="bjMaouStatus"></div>' +
      '</div>' +
      '<div class="bj-side bj-side--player">' +
        '<div class="bj-side__head"><span class="bj-side__name">🧑 あなた</span><span class="bj-side__sum" id="bjPlayerSum">0</span></div>' +
        '<div class="dice-row bj-dice" id="bjPlayerDice"></div>' +
        '<div class="bj-side__status" id="bjPlayerStatus"></div>' +
      '</div>';
    v.appendChild(arena);

    // 個数セレクタ
    var counts = UI.el('div', 'bj-counts', '');
    counts.innerHTML =
      '<span class="bj-counts__label">振る個数</span>' +
      '<div class="seg" id="bjCountSeg">' +
        '<button class="seg__btn" data-c="1">1</button>' +
        '<button class="seg__btn" data-c="2">2</button>' +
        '<button class="seg__btn" data-c="3">3</button>' +
      '</div>';
    v.appendChild(counts);

    // アクションボタン
    var actions = UI.el('div', 'bj-actions');
    actions.innerHTML =
      '<button class="btn btn--primary btn--lg" id="bjRoll">振る</button>' +
      '<button class="btn btn--ghost btn--lg" id="bjStop" disabled>ストップ</button>';
    v.appendChild(actions);

    // BETバー
    var betbar = UI.el('div', 'bj-betbar');
    betbar.innerHTML =
      '<span class="bj-betbar__label">BET</span>' +
      '<button class="bet-step" id="bjBetMinus" aria-label="BETを下げる">−</button>' +
      '<span class="bj-betbar__val" id="bjBetVal">1,000</span>' +
      '<button class="bet-step" id="bjBetPlus" aria-label="BETを上げる">＋</button>';
    v.appendChild(betbar);

    mount.appendChild(v);

    // 結果オーバーレイ（最初は隠す）
    var overlay = UI.el('div', 'bj-overlay hidden');
    overlay.id = 'bjOverlay';
    mount.appendChild(overlay);

    // イベント
    UI.$('#bjBack').addEventListener('click', function () { Router.go('home'); });
    UI.$('#bjHelp').addEventListener('click', showHelp);
    UI.$('#bjRoll').addEventListener('click', onRoll);
    UI.$('#bjStop').addEventListener('click', onStop);
    UI.$('#bjBetMinus').addEventListener('click', function () { changeBet(-1); });
    UI.$('#bjBetPlus').addEventListener('click', function () { changeBet(1); });
    UI.$('#bjCountSeg').addEventListener('click', function (e) {
      var b = e.target.closest('.seg__btn'); if (!b) return;
      setDiceCount(parseInt(b.getAttribute('data-c'), 10));
    });

    setDiceCount(1);
    paintTargetNums();
    paintSums();
    refreshControls();
  }

  /* ----------------------------------------------------------
     ヘルパー
     ---------------------------------------------------------- */
  function randomTarget() {
    // 1〜18 を均等乱数で
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        var a = new Uint8Array(1);
        do { global.crypto.getRandomValues(a); } while (a[0] >= 252); // 252=18*14
        return (a[0] % 18) + 1;
      }
    } catch (e) {}
    return Math.floor(Math.random() * 18) + 1;
  }

  function clampBet() {
    // コインで払える最大プリセットに丸める。最低でも最小BETは表示（足りなければ振る時に弾く）
    var coins = Store.coins();
    // 現在のbetIdxが払えないなら下げる
    while (S.betIdx > 0 && BET_PRESETS[S.betIdx] > coins) S.betIdx--;
    S.bet = BET_PRESETS[S.betIdx];
  }

  function changeBet(dir) {
    if (S.committed || S.busy) return; // 振った後は変更不可
    var next = S.betIdx + dir;
    if (next < 0 || next >= BET_PRESETS.length) return;
    if (dir > 0 && BET_PRESETS[next] > Store.coins()) { UI.toast('コインが足りません', 'bad'); return; }
    S.betIdx = next;
    S.bet = BET_PRESETS[next];
    UI.$('#bjBetVal').textContent = UI.fmt(S.bet);
  }

  function setDiceCount(c) {
    S.diceCount = c;
    var seg = UI.$('#bjCountSeg');
    if (!seg) return;
    seg.querySelectorAll('.seg__btn').forEach(function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-c'), 10) === c);
    });
  }

  function paintTargetNums() {
    var box = UI.$('#bjTargetNums');
    if (!box) return;
    var html = '';
    for (var i = 1; i <= 18; i++) {
      html += '<span class="bj-num' + (i === S.target ? ' is-target' : '') + '">' + i + '</span>';
    }
    box.innerHTML = html;
  }

  function paintSums() {
    var ps = UI.$('#bjPlayerSum');
    if (ps) {
      ps.textContent = S.playerSum;
      ps.classList.toggle('is-bust', S.playerBust);
      ps.classList.toggle('is-just', !S.playerBust && S.playerSum === S.target);
    }
    var ms = UI.$('#bjMaouSum');
    if (ms) {
      ms.textContent = (S.phase === 'ready' || S.phase === 'playing') ? '—' : S.maouSum;
      ms.classList.toggle('is-bust', S.maouBust);
      ms.classList.toggle('is-just', !S.maouBust && S.maouSum === S.target && S.phase !== 'playing');
    }
  }

  function renderDiceInto(elId, dice, rolling) {
    var box = UI.$(elId);
    if (!box) return;
    box.innerHTML = '';
    dice.forEach(function (val) {
      var d = UI.die(rolling ? UI.rollDie() : val, 'md', rolling);
      if (!rolling) d.classList.add('is-set');
      box.appendChild(d);
    });
  }

  function refreshControls() {
    var roll = UI.$('#bjRoll'), stop = UI.$('#bjStop');
    var betMinus = UI.$('#bjBetMinus'), betPlus = UI.$('#bjBetPlus');
    var canAct = (S.phase === 'ready' || S.phase === 'playing') && !S.busy;
    if (roll) roll.disabled = !canAct;
    if (stop) stop.disabled = !(S.phase === 'playing' && !S.busy); // 1回以上振ってから
    if (betMinus) betMinus.disabled = S.committed || S.busy;
    if (betPlus) betPlus.disabled = S.committed || S.busy;
  }

  /* ----------------------------------------------------------
     プレイヤー操作
     ---------------------------------------------------------- */
  function onRoll() {
    if (S.busy) return;
    if (S.phase !== 'ready' && S.phase !== 'playing') return;

    // 最初の振りでBET確定・没収
    if (!S.committed) {
      if (!Store.canBet(S.bet)) { UI.toast('コインが足りません', 'bad'); return; }
      Store.addCoins(-S.bet, 'bj-bet');
      S.committed = true;
      S.phase = 'playing';
    }

    S.busy = true;
    refreshControls();

    var dice = UI.rollMany(S.diceCount);
    // 振りアニメ → 確定
    renderDiceInto('#bjPlayerDice', dice, true);
    var statusEl = UI.$('#bjPlayerStatus');
    if (statusEl) statusEl.textContent = '';

    UI.sleep(620).then(function () {
      renderDiceInto('#bjPlayerDice', dice, false);
      var add = dice.reduce(function (a, b) { return a + b; }, 0);
      S.playerSum += add;
      S.playerDice = dice;
      paintSums();

      if (S.playerSum > S.target) {
        // ドボン
        S.playerBust = true;
        paintSums();
        if (statusEl) { statusEl.textContent = 'ドボン！ (' + add + '加算)'; statusEl.className = 'bj-side__status is-bad'; }
        S.busy = false;
        UI.sleep(700).then(function () { finish(); });
        return;
      }

      if (statusEl) { statusEl.textContent = '+' + add + (S.playerSum === S.target ? ' ジャスト！' : ''); statusEl.className = 'bj-side__status' + (S.playerSum === S.target ? ' is-just' : ''); }
      S.busy = false;
      refreshControls();
    });
  }

  function onStop() {
    if (S.busy || S.phase !== 'playing') return;
    S.phase = 'maou';
    S.busy = true;
    refreshControls();
    runMaouTurn();
  }

  /* ----------------------------------------------------------
     魔王AI（設計書: あと何点必要かで振る個数を判断）
     プレイヤーの合計を上回る(=より近い)ことを狙う。同点はプレイヤー勝ちなので上回りを目指す。
     ---------------------------------------------------------- */
  function decideMaouCount(target, sum, playerSum) {
    var room = target - sum;           // バーストせず加算できる上限
    if (room <= 0) return 0;
    var need = playerSum - sum + 1;     // 逆転に最低限必要な点
    if (room <= 4) return 1;            // 余裕が小さい→1個で慎重に
    if (need >= 9 && room >= 14) return 3;
    if (need >= 5 && room >= 9) return 2;
    return 1;
  }

  function runMaouTurn() {
    var statusEl = UI.$('#bjMaouStatus');
    var side = UI.$('#bjMaouSide');
    if (side) side.classList.add('is-active');
    paintSums();

    function step() {
      // 魔王が勝っている（より近い＝合計が大きく目標以下）なら止める
      var beating = S.maouSum > S.playerSum && S.maouSum <= S.target;
      var count = decideMaouCount(S.target, S.maouSum, S.playerSum);

      if (beating || count === 0) {
        // 振らずに確定（勝ち確 or これ以上振れない）
        UI.sleep(500).then(function () { finish(); });
        return;
      }

      var dice = UI.rollMany(count);
      renderDiceInto('#bjMaouDice', dice, true);
      if (statusEl) { statusEl.textContent = count + '個 振る…'; statusEl.className = 'bj-side__status'; }

      UI.sleep(640).then(function () {
        renderDiceInto('#bjMaouDice', dice, false);
        var add = dice.reduce(function (a, b) { return a + b; }, 0);
        S.maouSum += add;
        S.maouDice = dice;
        paintSums();

        if (S.maouSum > S.target) {
          S.maouBust = true;
          paintSums();
          if (statusEl) { statusEl.textContent = '魔王ドボン！'; statusEl.className = 'bj-side__status is-good'; }
          UI.sleep(700).then(function () { finish(); });
          return;
        }
        if (statusEl) { statusEl.textContent = '+' + add + (S.maouSum === S.target ? ' ジャスト' : ''); statusEl.className = 'bj-side__status'; }
        UI.sleep(520).then(step);
      });
    }
    step();
  }

  /* ----------------------------------------------------------
     判定・配当
     ---------------------------------------------------------- */
  function finish() {
    S.phase = 'result';
    var result = judge();
    payout(result);
    showResult(result);
    refreshControls();
  }

  function judge() {
    // 戻り値: { outcome: 'bust'|'win'|'justWin'|'lose'|'maouBust', mult, label, sub }
    if (S.playerBust) {
      return { outcome: 'bust', mult: 0, label: 'ドボン…', sub: '目標数を超えてしまった' };
    }
    if (S.maouBust) {
      // 魔王バースト＝プレイヤー勝ち。プレイヤーがジャストなら×3
      if (S.playerSum === S.target) return { outcome: 'justWin', mult: 3, label: 'ジャスト勝ち！', sub: '魔王はドボン' };
      return { outcome: 'win', mult: 2, label: '勝ち！', sub: '魔王はドボン' };
    }
    var pDist = S.target - S.playerSum;
    var mDist = S.target - S.maouSum;
    if (pDist < mDist) {
      if (S.playerSum === S.target) return { outcome: 'justWin', mult: 3, label: 'ジャスト勝ち！', sub: '完璧だ' };
      return { outcome: 'win', mult: 2, label: '勝ち！', sub: '魔王より目標に近い' };
    }
    if (pDist === mDist) {
      // 同点はプレイヤー勝ち
      if (S.playerSum === S.target) return { outcome: 'justWin', mult: 3, label: 'ジャスト勝ち！', sub: '同点はあなたの勝ち' };
      return { outcome: 'win', mult: 2, label: '勝ち！', sub: '同点はあなたの勝ち' };
    }
    return { outcome: 'lose', mult: 0, label: '敗北…', sub: '魔王の方が近かった' };
  }

  function payout(result) {
    if (result.mult > 0) {
      var gain = S.bet * result.mult; // BETは没収済み。配当として BET×mult を払い戻し
      Store.addCoins(gain, 'bj-win');
      result.gain = gain;
      result.net = gain - S.bet;
      Store.set('bjWins', (Store.get().bjWins || 0) + 1);
    } else {
      result.gain = 0;
      result.net = -S.bet;
    }
  }

  /* ----------------------------------------------------------
     結果オーバーレイ
     ---------------------------------------------------------- */
  function showResult(result) {
    var ov = UI.$('#bjOverlay');
    if (!ov) return;

    // 演出・効果音
    if (global.FX) {
      if (result.outcome === 'bust') FX.ev.bjBust();
      else if (result.outcome === 'justWin') FX.ev.bjJustWin();
      else if (result.outcome === 'win') FX.ev.bjWin();
      else FX.ev.bjLose();
    }

    var win = result.mult > 0;
    var netStr = (result.net >= 0 ? '+' : '') + UI.fmt(result.net);
    ov.className = 'bj-overlay ' + (win ? 'is-win' : 'is-lose');
    ov.innerHTML =
      '<div class="bj-result">' +
        '<div class="bj-result__label">' + result.label + '</div>' +
        '<div class="bj-result__sub">' + result.sub + '</div>' +
        '<div class="bj-result__detail">目標 ' + S.target + ' ／ あなた ' + (S.playerBust ? 'ドボン' : S.playerSum) +
          ' ・ 魔王 ' + (S.maouBust ? 'ドボン' : S.maouSum) + '</div>' +
        '<div class="bj-result__coins ' + (result.net >= 0 ? 'plus' : 'minus') + '">🪙 ' + netStr + '</div>' +
        '<button class="btn btn--gold btn--lg btn--block" id="bjNext">次のラウンド</button>' +
        '<button class="btn btn--ghost btn--block" id="bjToHome">ホームへ</button>' +
      '</div>';
    UI.$('#bjNext').addEventListener('click', function () { Router.go('bj'); });
    UI.$('#bjToHome').addEventListener('click', function () { Router.go('home'); });
  }

  /* ----------------------------------------------------------
     遊び方
     ---------------------------------------------------------- */
  function showHelp() {
    var ov = UI.$('#bjOverlay');
    if (!ov) return;
    ov.className = 'bj-overlay is-help';
    ov.innerHTML =
      '<div class="bj-result bj-help">' +
        '<div class="bj-result__label" style="font-size:22px">遊び方</div>' +
        '<ul class="bj-help__list">' +
          '<li>合計を<b>目標数</b>に近づけよう（超えたら<b>ドボン</b>＝負け）</li>' +
          '<li>サイコロを<b>1〜3個</b>選んで「振る」を繰り返す</li>' +
          '<li>良いところで「ストップ」。次に魔王が振る</li>' +
          '<li>目標に近い方が勝ち。<b>ジャスト＝最強</b></li>' +
          '<li>同点はあなたの勝ち</li>' +
          '<li>配当: 勝ち <b>×2</b> ／ ジャスト勝ち <b>×3</b> ／ 負け・ドボンはBET没収</li>' +
        '</ul>' +
        '<button class="btn btn--gold btn--block" id="bjHelpClose">とじる</button>' +
      '</div>';
    UI.$('#bjHelpClose').addEventListener('click', function () {
      ov.className = 'bj-overlay hidden';
    });
  }

  global.GameBJ = { navKey: 'home', bgm: 'bj', render: render };

  // 検証用の内部ロジック公開（本番動作には影響しない・テスト専用）
  global.GameBJ._logic = {
    randomTarget: randomTarget,
    decideMaouCount: decideMaouCount,
    // 純粋判定（状態Sに依存しない版）をテスト用に再現
    judgePure: function (target, playerSum, playerBust, maouSum, maouBust) {
      var saved = S; S = { target: target, playerSum: playerSum, playerBust: playerBust, maouSum: maouSum, maouBust: maouBust };
      var r = judge(); S = saved; return r;
    }
  };
})(window);
