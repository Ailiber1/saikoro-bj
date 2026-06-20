/* ============================================================
   ui.js — 共通UI部品（残高表示・トースト・サイコロ描画・効果音フック）
   ============================================================ */
(function (global) {
  'use strict';

  var ASSET = 'assets/images/';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }

  /* --- 残高バーの再描画（Storeの変化に追従） --- */
  function renderWallet(detail) {
    var coinEl = $('#coinVal'), heartEl = $('#heartVal');
    if (coinEl) {
      coinEl.textContent = fmt(Store.coins());
      if (detail && detail.type === 'coins' && detail.amount) bump(coinEl);
    }
    if (heartEl) {
      heartEl.textContent = fmt(Store.hearts());
      if (detail && detail.type === 'hearts' && detail.amount) bump(heartEl);
    }
  }
  function bump(node) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }

  /* --- トースト --- */
  var toastTimer = null;
  function toast(msg, kind, ms) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' toast--' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, ms || 1800);
  }

  /* --- サイコロ描画（CSSのみ・1〜6のピップ配置） ---
     valueは1〜6。size: 'sm'|'md'|'lg'。rolling=true で振り中アニメ */
  var PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };
  function die(value, size, rolling) {
    var d = el('div', 'die die--' + (size || 'md') + (rolling ? ' is-rolling' : ''));
    d.setAttribute('data-value', value);
    var face = el('div', 'die__face');
    var set = PIPS[value] || [];
    for (var i = 0; i < 9; i++) {
      var cell = el('span', 'die__cell');
      if (set.indexOf(i) !== -1) cell.appendChild(el('span', 'die__pip'));
      face.appendChild(cell);
    }
    d.appendChild(face);
    return d;
  }

  /* --- 乱数（サイコロ1個 1〜6） --- */
  function rollDie() {
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        var a = new Uint8Array(1);
        do { global.crypto.getRandomValues(a); } while (a[0] >= 252); // 252=6*42 で剰余バイアス除去
        return (a[0] % 6) + 1;
      }
    } catch (e) {}
    return Math.floor(Math.random() * 6) + 1;
  }
  function rollMany(n) { var r = []; for (var i = 0; i < n; i++) r.push(rollDie()); return r; }

  /* --- 背景レイヤー生成 --- */
  function bg(name) {
    var b = el('div', 'bglayer');
    b.style.backgroundImage = "url('" + ASSET + name + ".webp')";
    return b;
  }

  /* --- 軽い遅延（Promise） --- */
  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  global.UI = {
    $: $, el: el, fmt: fmt, ASSET: ASSET,
    renderWallet: renderWallet, toast: toast, bump: bump,
    die: die, rollDie: rollDie, rollMany: rollMany,
    bg: bg, sleep: sleep
  };
})(window);
