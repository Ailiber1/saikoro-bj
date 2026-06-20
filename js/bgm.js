/* ============================================================
   bgm.js — 画面ごとのループBGM（Suno生成・クロスフェード切替）
   - home / bj / prospi / slot の4トラック＋確変専用トラック
   - 画面遷移で自動クロスフェード、スロット確変で曲チェンジ
   - 自動再生制限に対応（初回タップで開始）、ミュート連動
   ============================================================ */
(function (global) {
  'use strict';

  var DIR = 'assets/audio/';
  var FILES = {
    home:   'bgm_home.mp3',
    bj:     'bgm_bj.mp3',
    prospi: 'bgm_prospi.mp3',
    slot:   'bgm_slot.mp3',
    kaiten: 'bgm_kaiten.mp3'
  };
  var VOL = 0.4;          // 通常音量
  var FADE_MS = 650;
  var MUTE_KEY = 'saikoro-bj.mute';

  var pool = {};          // file -> HTMLAudioElement（遅延生成・キャッシュ）
  var current = null;     // 現在鳴っているAudio
  var currentKey = null;  // 現在のトラックキー
  var baseScreen = 'home';
  var kaitenOn = false;
  var muted = false;
  var fadeTimer = null;
  var started = false;    // 初回ジェスチャ後にtrue

  try { muted = global.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  function getAudio(file) {
    if (pool[file]) return pool[file];
    var a = new Audio(DIR + file);
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    pool[file] = a;
    return a;
  }

  function effectiveKey() {
    return (baseScreen === 'slot' && kaitenOn) ? 'kaiten' : baseScreen;
  }

  function apply() {
    var key = effectiveKey();
    if (key === currentKey && current && !current.paused) return;
    currentKey = key;
    if (muted || !started) return; // ミュート中／未解禁なら鳴らさない（キーだけ更新）
    crossfadeTo(FILES[key]);
  }

  function crossfadeTo(file) {
    var next = getAudio(file);
    var prev = current;
    if (prev === next) {
      // 同じトラック（ミュート解除等で一時停止中なら再開）
      next.volume = VOL;
      if (next.paused) { var pp = next.play(); if (pp && pp.catch) pp.catch(function () {}); }
      return;
    }

    next.preload = 'auto';
    next.volume = 0;
    var p = next.play();
    if (p && p.catch) p.catch(function () { /* ジェスチャ待ち */ });
    current = next;

    if (fadeTimer) clearInterval(fadeTimer);
    var steps = Math.max(1, Math.round(FADE_MS / 40));
    var i = 0;
    var fromV = prev ? prev.volume : 0;
    fadeTimer = setInterval(function () {
      i++;
      var t = i / steps;
      next.volume = Math.min(VOL, VOL * t);
      if (prev) prev.volume = Math.max(0, fromV * (1 - t));
      if (i >= steps) {
        clearInterval(fadeTimer); fadeTimer = null;
        next.volume = VOL;
        if (prev && prev !== next) { prev.pause(); try { prev.currentTime = 0; } catch (e) {} prev.volume = 0; }
      }
    }, 40);
  }

  /* --- 公開API --- */
  var BGM = {
    init: function () {
      // 初回ユーザー操作でBGM解禁（自動再生制限の回避）
      var unlock = function () {
        if (started) return;
        started = true;
        apply();
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
    },

    // 画面切替（home/bj/prospi/slot、その他はhome扱い）
    setScreen: function (name) {
      var s = FILES[name] ? name : 'home';
      if (s === baseScreen && (s !== 'slot')) { /* 同一画面は維持 */ }
      baseScreen = s;
      if (s !== 'slot') kaitenOn = false;
      apply();
    },

    // スロット確変の曲チェンジ（slot画面時のみ有効）
    setKaiten: function (on) {
      if (baseScreen !== 'slot') return;
      on = !!on;
      if (on === kaitenOn) return;
      kaitenOn = on;
      apply();
    },

    // 一時的にBGM音量を下げる（ボイス・見せ場用）
    duck: function (ms) {
      if (muted || !current) return;
      if (fadeTimer) clearInterval(fadeTimer);
      try { current.volume = VOL * 0.22; } catch (e) {}
      if (current._duckTimer) clearTimeout(current._duckTimer);
      var c = current;
      c._duckTimer = setTimeout(function () {
        // なだらかに戻す
        var steps = 14, i = 0, from = c.volume;
        var t = setInterval(function () {
          i++; c.volume = Math.min(VOL, from + (VOL - from) * (i / steps));
          if (i >= steps) { clearInterval(t); c.volume = VOL; }
        }, 40);
      }, ms || 2200);
    },

    setMute: function (v) {
      muted = !!v;
      try { global.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      if (muted) {
        if (current) current.pause();
      } else {
        started = true;
        apply();
      }
    },
    isMuted: function () { return muted; }
  };

  // 検証用フック（本番動作に影響しない）
  BGM._debug = function () {
    return {
      currentKey: currentKey, started: started, muted: muted,
      baseScreen: baseScreen, kaitenOn: kaitenOn,
      currentFile: current ? current.src.split('/').pop() : null,
      currentPaused: current ? current.paused : null,
      currentVol: current ? Math.round(current.volume * 100) / 100 : null,
      poolKeys: Object.keys(pool)
    };
  };

  global.BGM = BGM;
})(window);
