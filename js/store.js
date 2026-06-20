/* ============================================================
   store.js — 状態管理（localStorage / デバイスID方式）
   コイン・ハート・進捗を端末ローカルに保存。サーバー不要。
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'saikoro-bj.v1';

  var DEFAULTS = {
    deviceId: null,
    coins: 12345,   // 初期コイン（モック準拠）
    hearts: 12,     // 初期ハート
    bestProspi: 0,  // プロスピ最高得点
    bjWins: 0,
    createdAt: 0,
    updatedAt: 0
  };

  function genDeviceId() {
    // crypto優先・フォールバックで擬似ID（衝突しても致命的でない用途）
    try {
      if (global.crypto && global.crypto.randomUUID) return 'dev-' + global.crypto.randomUUID();
      if (global.crypto && global.crypto.getRandomValues) {
        var a = new Uint8Array(16);
        global.crypto.getRandomValues(a);
        return 'dev-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      }
    } catch (e) { /* noop */ }
    return 'dev-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  }

  function nowTs() { return Date.now(); }

  function load() {
    var data;
    try {
      var raw = global.localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = {};
    }
    if (!data || typeof data !== 'object') data = {};
    // 既定値で穴埋め（新フィールド追加時の後方互換）
    var merged = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
      merged[k] = (data[k] === undefined || data[k] === null) ? DEFAULTS[k] : data[k];
    }
    if (!merged.deviceId) { merged.deviceId = genDeviceId(); merged.createdAt = nowTs(); }
    // 数値の健全性チェック（破損・改ざん対策で負値・NaNを丸める）
    merged.coins = sanitizeNum(merged.coins, DEFAULTS.coins);
    merged.hearts = sanitizeNum(merged.hearts, DEFAULTS.hearts);
    merged.bestProspi = sanitizeNum(merged.bestProspi, 0);
    merged.bjWins = sanitizeNum(merged.bjWins, 0);
    return merged;
  }

  function sanitizeNum(v, fallback) {
    v = Number(v);
    if (!isFinite(v) || v < 0) return fallback;
    return Math.floor(v);
  }

  var state = load();

  var listeners = [];
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function emit(detail) { listeners.forEach(function (fn) { try { fn(state, detail); } catch (e) {} }); }

  function persist() {
    state.updatedAt = nowTs();
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 容量超過等は黙殺 */ }
  }

  /* --- 公開API --- */
  var Store = {
    get: function () { return state; },
    coins: function () { return state.coins; },
    hearts: function () { return state.hearts; },
    deviceId: function () { return state.deviceId; },

    /** コイン増減（負残高にはしない）。amount は増分（負で減算）。戻り値=実際の増減後残高 */
    addCoins: function (amount, reason) {
      amount = Math.floor(Number(amount) || 0);
      state.coins = Math.max(0, state.coins + amount);
      persist();
      emit({ type: 'coins', amount: amount, reason: reason });
      return state.coins;
    },

    /** BETできるか（残高が足りるか） */
    canBet: function (amount) { return state.coins >= Math.floor(Number(amount) || 0); },

    /** ハート増減 */
    addHearts: function (amount, reason) {
      amount = Math.floor(Number(amount) || 0);
      state.hearts = Math.max(0, state.hearts + amount);
      persist();
      emit({ type: 'hearts', amount: amount, reason: reason });
      return state.hearts;
    },

    /** 任意フィールド更新（ベストスコア等） */
    set: function (key, value) {
      if (!(key in DEFAULTS)) return;
      state[key] = value;
      persist();
      emit({ type: 'set', key: key });
    },

    /** プロスピ最高得点を更新（より高ければ） */
    reportProspiScore: function (score) {
      if (score > state.bestProspi) { state.bestProspi = score; persist(); emit({ type: 'set', key: 'bestProspi' }); return true; }
      return false;
    },

    subscribe: subscribe,

    /** デバッグ/リセット用（メニューから呼ぶ） */
    resetWallet: function () {
      state.coins = DEFAULTS.coins;
      state.hearts = DEFAULTS.hearts;
      persist();
      emit({ type: 'reset' });
    }
  };

  global.Store = Store;
})(window);
