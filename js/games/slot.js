/* ============================================================
   games/slot.js — スロット（555 / 777）
   設計書 3-3 準拠 + §8確定（④⑤⑥777=❤️+1 / ⑧⑨⑩=❤️+1）

   コア:
   - 親(魔王)が3リールを提示（555=各1個振り / 777=各2個振りの縦合計2〜12）
   - プレイヤーが 左・中・右 から1つ選び、振り直して3つ揃えれば ❤️
   - 役テーブル（揃い・順子）で ❤️ボーナス・確変・リプレイ等が発動
   - 確変: 親ボードがペア保証＋振り直しに補正＋魔王妨害なし＋専用演出
   - 魔王妨害: 確変外で揃わなかった時に魔王が対抗ロール（演出・煽り）
   ============================================================ */
(function (global) {
  'use strict';

  // 役テーブル（キー= 揃いは値の3連結 / 順子は昇順値の連結）
  // hearts: 獲得❤️ / kaiten: 確変発動 / extend: 確変延長 / nextMult: 次の揃いで揃い値ぶん / replay: もう一度
  // label は❤️数値を含めない（hearts と二重表示しないため）。役一覧・結果表示で hearts を別途付与
  var ROLE_555 = {
    '222': { hearts: 1, kaiten: true,  label: '②②② 確変！' },
    '444': { hearts: 1, nextMult: true, label: '④④④ 次の揃いで枚数ぶん' },
    '666': { hearts: 2,                 label: '⑥⑥⑥' },
    '123': { hearts: 0, replay: true,   label: '①②③ リプレイ' },
    '234': { hearts: 0,                 label: '②③④ 巻き戻し' },
    '345': { hearts: 0, extend: true,   label: '③④⑤ 確変延長' },
    '456': { hearts: 1,                 label: '④⑤⑥' }
  };
  var ROLE_777 = {
    '777':     { hearts: 3, kaiten: true,  label: '⑦⑦⑦ 確変！' },
    '101010':  { hearts: 1, kaiten: true,  label: '⑩⑩⑩ 確変！' },
    '111111':  { hearts: 1, nextMult: true, label: '⑪⑪⑪ 次の揃いで数ぶん' },
    '121212':  { hearts: 2,                 label: '⑫⑫⑫' },
    '789':     { hearts: 1,                 label: '⑦⑧⑨' },
    '8910':    { hearts: 1,                 label: '⑧⑨⑩' },
    '101112':  { hearts: 2,                 label: '⑩⑪⑫' },
    '234':     { hearts: 0,                 label: '②③④ 巻き戻し' },
    '345':     { hearts: 0, extend: true,   label: '③④⑤ 確変延長' },
    '456':     { hearts: 1,                 label: '④⑤⑥' }
  };

  var KAITEN_SPINS = 5;
  var POS_LABELS = ['左', '中', '右'];

  var S = null;

  function freshState(mode) {
    return {
      mode: mode || '555',
      board: [1, 1, 1],
      selected: null,
      playerVal: null,
      kaiten: 0,
      nextMult: false,
      phase: 'select',     // select | rolling | result
      busy: false
    };
  }

  /* ----------------------------------------------------------
     役判定（純粋関数）
     ---------------------------------------------------------- */
  function detectRole(vals, mode) {
    var s = vals.slice().sort(function (a, b) { return a - b; });
    var triple = s[0] === s[1] && s[1] === s[2];
    var straight = (s[1] === s[0] + 1 && s[2] === s[1] + 1);
    var table = mode === '777' ? ROLE_777 : ROLE_555;
    var key = null;
    if (triple) key = '' + s[0] + s[0] + s[0];
    else if (straight) key = '' + s[0] + s[1] + s[2];
    var role = (key && table[key]) ? assign({}, table[key]) : null;
    if (!role && triple) role = { hearts: 1, label: '揃った！' }; // 基本役
    return { triple: triple, straight: straight, role: role, key: key, sortedVal: s[0] };
  }

  function assign(t, s) { for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; return t; }

  /* ----------------------------------------------------------
     親ボード生成 / プレイヤーの振り
     ---------------------------------------------------------- */
  function cellRoll(mode) {
    return mode === '777' ? (UI.rollDie() + UI.rollDie()) : UI.rollDie();
  }

  function rollParentBoard(mode, kaiten) {
    var b = [cellRoll(mode), cellRoll(mode), cellRoll(mode)];
    if (kaiten > 0) {
      // 確変中はペア保証（揃えやすく）
      var hasPair = b[0] === b[1] || b[1] === b[2] || b[0] === b[2];
      if (!hasPair) { var i = Math.floor(Math.random() * 3); var j = (i + 1) % 3; b[j] = b[i]; }
    }
    return b;
  }

  // 非選択2リールがペアならその値、なければ null
  function pairValueExcept(board, sel) {
    var others = [];
    for (var i = 0; i < 3; i++) if (i !== sel) others.push(board[i]);
    return others[0] === others[1] ? others[0] : null;
  }

  // プレイヤーの振り（確変中はペア値へ補正）
  function playerRoll(mode, target, kaiten) {
    var biased = kaiten > 0 && target != null && Math.random() < 0.65;
    if (mode === '777') {
      if (biased) { var combo = combosForSum(target); if (combo) return { dice: combo, val: target }; }
      var d = [UI.rollDie(), UI.rollDie()];
      return { dice: d, val: d[0] + d[1] };
    } else {
      if (biased && target >= 1 && target <= 6) return { dice: [target], val: target };
      var x = UI.rollDie();
      return { dice: [x], val: x };
    }
  }

  // 2個の和が sum になる組（2〜12）。無ければ null
  function combosForSum(sum) {
    for (var a = 1; a <= 6; a++) { var b = sum - a; if (b >= 1 && b <= 6) return [a, b]; }
    return null;
  }

  /* ----------------------------------------------------------
     画面描画
     ---------------------------------------------------------- */
  function render(mount) {
    S = freshState((global.__slotMode) || '555');

    var v = UI.el('div', 'view slot');
    v.appendChild(UI.bg('bg_slot'));
    v.innerHTML +=
      '<div class="screen-title"><button class="linkback" id="slBack">‹</button> スロット' +
      '<button class="help-btn" id="slHelp" aria-label="遊び方">？</button></div>';

    // モード切替
    var modeBar = UI.el('div', 'sl-mode');
    modeBar.innerHTML =
      '<button class="sl-mode__btn" data-m="555">#555#<small>1個振り</small></button>' +
      '<button class="sl-mode__btn" data-m="777">#777#<small>2個振り</small></button>';
    v.appendChild(modeBar);

    // 確変バナー
    var kaiten = UI.el('div', 'sl-kaiten hidden', '<span>確変</span><b id="slKaitenN"></b>');
    kaiten.id = 'slKaiten';
    v.appendChild(kaiten);

    // リール盤
    var board = UI.el('div', 'sl-board panel panel--gold');
    board.innerHTML =
      '<div class="sl-reels" id="slReels">' +
        '<div class="sl-reel" data-i="0"><span class="sl-reel__val">?</span><span class="sl-reel__pos">左</span></div>' +
        '<div class="sl-reel" data-i="1"><span class="sl-reel__val">?</span><span class="sl-reel__pos">中</span></div>' +
        '<div class="sl-reel" data-i="2"><span class="sl-reel__val">?</span><span class="sl-reel__pos">右</span></div>' +
      '</div>' +
      '<div class="sl-outcome" id="slOutcome">振り直す位置を選んでね</div>';
    v.appendChild(board);

    // 位置選択
    var posSel = UI.el('div', 'sl-pos');
    posSel.innerHTML =
      '<button class="sl-pos__btn" data-i="0">左</button>' +
      '<button class="sl-pos__btn" data-i="1">中</button>' +
      '<button class="sl-pos__btn" data-i="2">右</button>';
    v.appendChild(posSel);

    // コントロール
    var ctrl = UI.el('div', 'sl-ctrl');
    ctrl.innerHTML = '<button class="btn btn--primary btn--lg btn--block" id="slRoll" disabled>振る</button>';
    v.appendChild(ctrl);

    // 役一覧
    var roles = UI.el('div', 'sl-roles', '<div class="sl-roles__title">役一覧</div><div class="sl-roles__list" id="slRoleList"></div>');
    v.appendChild(roles);

    mount.appendChild(v);

    var overlay = UI.el('div', 'bj-overlay hidden');
    overlay.id = 'slOverlay';
    mount.appendChild(overlay);

    // イベント
    UI.$('#slBack').addEventListener('click', function () { Router.go('home'); });
    UI.$('#slHelp').addEventListener('click', showHelp);
    modeBar.addEventListener('click', function (e) { var b = e.target.closest('.sl-mode__btn'); if (b) setMode(b.getAttribute('data-m')); });
    UI.$('#slReels').addEventListener('click', function (e) { var r = e.target.closest('.sl-reel'); if (r) selectPos(parseInt(r.getAttribute('data-i'), 10)); });
    posSel.addEventListener('click', function (e) { var b = e.target.closest('.sl-pos__btn'); if (b) selectPos(parseInt(b.getAttribute('data-i'), 10)); });
    UI.$('#slRoll').addEventListener('click', onRoll);

    setMode(S.mode, true);
  }

  function setMode(mode, force) {
    if (S.busy) return;
    if (!force && mode === S.mode) return;
    S.mode = mode;
    global.__slotMode = mode;
    document.querySelectorAll('.sl-mode__btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-m') === mode);
    });
    paintRoleList();
    newBoard();
  }

  function paintRoleList() {
    var table = S.mode === '777' ? ROLE_777 : ROLE_555;
    var list = UI.$('#slRoleList');
    if (!list) return;
    var html = '';
    for (var k in table) if (Object.prototype.hasOwnProperty.call(table, k)) {
      var r = table[k];
      html += '<span class="sl-role">' + r.label + (r.hearts > 0 ? ' ❤️+' + r.hearts : '') + '</span>';
    }
    list.innerHTML = html;
  }

  function newBoard() {
    S.board = rollParentBoard(S.mode, S.kaiten);
    S.selected = null;
    S.playerVal = null;
    S.phase = 'select';
    paintReels();
    paintKaiten();
    var oc = UI.$('#slOutcome');
    if (oc) { oc.textContent = '振り直す位置を選んでね'; oc.className = 'sl-outcome'; }
    refreshRoll();
  }

  function paintReels() {
    var reels = UI.$('#slReels');
    if (!reels) return;
    for (var i = 0; i < 3; i++) {
      var r = reels.querySelector('.sl-reel[data-i="' + i + '"]');
      var valEl = r.querySelector('.sl-reel__val');
      valEl.textContent = (S.selected === i && S.playerVal == null && S.phase === 'select') ? '?' : S.board[i];
      r.classList.toggle('is-selected', S.selected === i);
      r.querySelector('.sl-reel__pos').textContent = POS_LABELS[i];
    }
  }

  function paintKaiten() {
    var k = UI.$('#slKaiten');
    if (!k) return;
    k.classList.toggle('hidden', S.kaiten <= 0);
    var n = UI.$('#slKaitenN');
    if (n) n.textContent = S.kaiten > 0 ? ('あと' + S.kaiten + '回') : '';
    var view = document.querySelector('.view.slot');
    if (view) view.classList.toggle('is-kaiten', S.kaiten > 0);
    if (global.BGM) BGM.setKaiten(S.kaiten > 0); // 確変でBGMチェンジ
  }

  function selectPos(i) {
    if (S.phase !== 'select' || S.busy) return;
    S.selected = i;
    document.querySelectorAll('.sl-pos__btn').forEach(function (b) {
      b.classList.toggle('is-active', parseInt(b.getAttribute('data-i'), 10) === i);
    });
    paintReels();
    refreshRoll();
  }

  function refreshRoll() {
    var btn = UI.$('#slRoll');
    if (btn) btn.disabled = !(S.phase === 'select' && S.selected != null && !S.busy);
  }

  /* ----------------------------------------------------------
     振る → 判定
     ---------------------------------------------------------- */
  function onRoll() {
    if (S.busy || S.phase !== 'select' || S.selected == null) return;
    S.busy = true;
    S.phase = 'rolling';
    refreshRoll();

    var sel = S.selected;
    var pairV = pairValueExcept(S.board, sel);
    var roll = playerRoll(S.mode, pairV, S.kaiten);

    // 選択リールの振りアニメ
    var reel = document.querySelector('.sl-reel[data-i="' + sel + '"]');
    reel.classList.add('is-rolling');
    var valEl = reel.querySelector('.sl-reel__val');
    var spins = 0;
    var spinTimer = setInterval(function () {
      valEl.textContent = cellRoll(S.mode);
      spins++;
    }, 90);

    UI.sleep(720).then(function () {
      clearInterval(spinTimer);
      reel.classList.remove('is-rolling');
      S.board[sel] = roll.val;
      S.playerVal = roll.val;
      valEl.textContent = roll.val;
      reel.classList.add('is-set');
      evaluate();
    });
  }

  function evaluate() {
    var det = detectRole(S.board, S.mode);
    var oc = UI.$('#slOutcome');

    // 確変カウント消化（この振りが確変中だったら）
    var wasKaiten = S.kaiten > 0;
    if (wasKaiten) S.kaiten--;

    var hearts = 0;
    var didReplay = false;
    var triggerKaiten = false;
    var msg = '';

    if (det.role) {
      var h = det.role.hearts || 0;
      if (det.triple && S.nextMult) {
        h = Math.min(12, det.sortedVal);   // 次の揃いで揃い値ぶん
        S.nextMult = false;
        msg = 'ボーナス！ ';
      }
      hearts = h;
      if (det.role.kaiten) triggerKaiten = true;
      if (det.role.extend && S.kaiten > 0) S.kaiten += 3;
      if (det.role.nextMult) S.nextMult = true;
      if (det.role.replay) didReplay = true;
      msg += det.role.label;
    } else {
      msg = '揃わず…';
    }

    if (hearts > 0) Store.addHearts(hearts, 'slot');
    if (triggerKaiten) S.kaiten = KAITEN_SPINS;

    // 演出・効果音
    if (global.FX) {
      if (triggerKaiten) FX.ev.kaiten();
      else if (det.triple) FX.ev.slotWin(hearts);
    }

    if (oc) {
      oc.textContent = msg + (hearts > 0 ? '　❤️+' + hearts : '');
      oc.className = 'sl-outcome ' + (det.triple ? 'is-win' : (det.role ? 'is-role' : 'is-miss'));
    }

    paintKaiten();
    S.phase = 'result';

    // 揃い演出
    if (det.triple) flashReels();

    UI.sleep(det.triple ? 1100 : 800).then(function () {
      if (didReplay) {
        // リプレイ: 同じ盤面で位置だけ選び直して再挑戦
        S.selected = null; S.playerVal = null; S.phase = 'select';
        document.querySelectorAll('.sl-pos__btn').forEach(function (b) { b.classList.remove('is-active'); });
        document.querySelectorAll('.sl-reel').forEach(function (r) { r.classList.remove('is-set'); });
        if (oc) { oc.textContent = 'リプレイ！もう一度どうぞ'; oc.className = 'sl-outcome is-role'; }
        S.busy = false; refreshRoll();
        return;
      }
      // 確変外で揃わなかったら魔王妨害（演出）
      if (!det.triple && S.kaiten <= 0) {
        maouInterfere(function () { S.busy = false; nextRound(); });
      } else {
        S.busy = false; nextRound();
      }
    });
  }

  function nextRound() {
    document.querySelectorAll('.sl-reel').forEach(function (r) { r.classList.remove('is-set'); });
    newBoard();
  }

  function flashReels() {
    var reels = document.querySelectorAll('.sl-reel');
    reels.forEach(function (r) { r.classList.add('is-hit'); });
    UI.sleep(900).then(function () { reels.forEach(function (r) { r.classList.remove('is-hit'); }); });
  }

  /* ----------------------------------------------------------
     魔王妨害（演出・煽り。理不尽な没収はしない）
     ---------------------------------------------------------- */
  function maouInterfere(done) {
    var maouRoll = [cellRoll(S.mode), cellRoll(S.mode), cellRoll(S.mode)];
    var maouTriple = maouRoll[0] === maouRoll[1] && maouRoll[1] === maouRoll[2];
    var oc = UI.$('#slOutcome');
    if (oc) {
      oc.textContent = maouTriple ? '魔王: ぐははは、揃えさせぬ！' : '魔王: ちっ…次は妨害してくれる';
      oc.className = 'sl-outcome is-maou';
    }
    if (global.FX) { FX.ev.maouTaunt(); if (maouTriple) FX.speak('揃えさせぬ！', { pitch: 0.3 }); }
    UI.sleep(750).then(done);
  }

  /* ----------------------------------------------------------
     遊び方
     ---------------------------------------------------------- */
  function showHelp() {
    var ov = UI.$('#slOverlay');
    ov.className = 'bj-overlay is-help';
    ov.innerHTML =
      '<div class="bj-result bj-help">' +
        '<div class="bj-result__label" style="font-size:22px">遊び方</div>' +
        '<ul class="bj-help__list">' +
          '<li>親(魔王)が3つのリールを提示</li>' +
          '<li><b>左・中・右</b>から1つ選び「振る」で振り直す</li>' +
          '<li>3つ揃えば <b>❤️ 獲得</b>！</li>' +
          '<li><b>#555#</b>=1個振り / <b>#777#</b>=2個の和で合わせる</li>' +
          '<li>役で <b>確変</b>（揃いやすくなる）やボーナス❤️</li>' +
          '<li>確変中は魔王の妨害なし・揃えやすい</li>' +
        '</ul>' +
        '<button class="btn btn--gold btn--block" id="slHelpClose">とじる</button>' +
      '</div>';
    UI.$('#slHelpClose').addEventListener('click', function () { ov.className = 'bj-overlay hidden'; });
  }

  global.GameSlot = { navKey: 'home', bgm: 'slot', render: render };

  // 検証用ロジック公開
  global.GameSlot._logic = {
    detectRole: detectRole, pairValueExcept: pairValueExcept,
    combosForSum: combosForSum, rollParentBoard: rollParentBoard,
    ROLE_555: ROLE_555, ROLE_777: ROLE_777
  };
})(window);
