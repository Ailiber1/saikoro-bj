/* ============================================================
   fx.js — 演出・効果音・ボイス（すべてコード内蔵・無料・オフライン）
   - 効果音: Web Audio API で合成（mp3アセット不要）
   - ボイス: SpeechSynthesis（日本語・低ピッチの重厚な魔王調）
   - 演出: 魔王キャラPNGのポップイン＋画面フラッシュ＋コイン/❤️飛散
   見せ場のみ・数秒で通常復帰・preloadでカクつき防止
   ============================================================ */
(function (global) {
  'use strict';

  var ASSET = 'assets/images/';
  var MUTE_KEY = 'saikoro-bj.mute';

  var ac = null;            // AudioContext（初回ジェスチャで生成）
  var master = null;
  var layer = null;         // 演出オーバーレイ
  var jaVoice = null;       // 日本語ボイス
  var muted = false;

  try { muted = global.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  /* --- 初期化 --- */
  function init() {
    // 演出レイヤー
    layer = document.createElement('div');
    layer.className = 'fxlayer';
    layer.id = 'fxlayer';
    (document.querySelector('.app') || document.body).appendChild(layer);

    // 画像preload（キャラ）
    ['maou_laugh', 'maou_vexed', 'maou_throne', 'maou_pitch'].forEach(function (n) {
      var im = new Image(); im.src = ASSET + n + '.webp';
    });

    // 音声ジェスチャ解禁（初回タップでAudioContext resume）
    var unlock = function () { ensureAudio(); if (ac && ac.state === 'suspended') ac.resume(); };
    document.addEventListener('pointerdown', unlock, { once: false });

    // 全ボタンに最適な効果音を自動付与（種別で出し分け・配線漏れ防止）
    document.addEventListener('pointerdown', buttonSound, true);

    // ボイス一覧（非同期で揃う）
    loadVoices();
    if (global.speechSynthesis) global.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function loadVoices() {
    if (!global.speechSynthesis) return;
    var vs = global.speechSynthesis.getVoices();
    jaVoice = vs.filter(function (v) { return /ja|JP/i.test(v.lang); })[0] || null;
  }

  function ensureAudio() {
    if (ac) return ac;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.32;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }

  /* --- 低レベル音合成 --- */
  function tone(freq, dur, type, when, gain) {
    if (muted || !ensureAudio()) return;
    when = when || 0;
    var t0 = ac.currentTime + when;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function sweep(f0, f1, dur, type, when, gain) {
    if (muted || !ensureAudio()) return;
    when = when || 0;
    var t0 = ac.currentTime + when;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'sawtooth';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.4, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, when, gain) {
    if (muted || !ensureAudio()) return;
    when = when || 0;
    var t0 = ac.currentTime + when;
    var n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ac.createBufferSource(); src.buffer = buf;
    var g = ac.createGain(); g.gain.value = gain || 0.3;
    var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  function chord(freqs, dur, type, gain) {
    freqs.forEach(function (f, i) { tone(f, dur, type || 'triangle', i * 0.005, gain || 0.3); });
  }

  /* --- 名前付き効果音 --- */
  var SFX = {
    dice: function () { noise(0.18, 0, 0.25); tone(180, 0.08, 'square', 0.02, 0.15); },
    // UIタップ音（カジノ的な上品なゴールドのコツッ）
    tap: function () { tone(880, 0.045, 'triangle', 0, 0.22); tone(1320, 0.05, 'sine', 0.012, 0.12); },
    // 決定・選択（少し明るく確定感）
    select: function () { tone(660, 0.05, 'triangle', 0, 0.28); tone(990, 0.07, 'triangle', 0.04, 0.2); },
    // 戻る・閉じる（下降）
    back: function () { tone(520, 0.05, 'triangle', 0, 0.22); tone(330, 0.08, 'sine', 0.04, 0.18); },
    // BET増減（コツッと軽い）
    tick: function () { tone(740, 0.035, 'square', 0, 0.18); },
    coin: function () { tone(988, 0.07, 'square', 0, 0.25); tone(1319, 0.09, 'square', 0.06, 0.22); },
    heart: function () { tone(784, 0.09, 'sine', 0, 0.3); tone(1175, 0.12, 'sine', 0.07, 0.26); },
    win: function () { chord([523, 659, 784], 0.5, 'triangle', 0.28); tone(1047, 0.4, 'triangle', 0.12, 0.22); },
    bigWin: function () { chord([523, 659, 784, 1047], 0.7, 'triangle', 0.3); sweep(400, 1200, 0.5, 'sawtooth', 0.1, 0.18); },
    lose: function () { sweep(380, 120, 0.5, 'sawtooth', 0, 0.3); tone(110, 0.4, 'sine', 0.1, 0.25); },
    kaiten: function () { for (var i = 0; i < 6; i++) tone(440 * Math.pow(1.18, i), 0.12, 'square', i * 0.07, 0.22); sweep(300, 1400, 0.7, 'sawtooth', 0, 0.16); },
    land: function () { tone(120, 0.12, 'sine', 0, 0.32); noise(0.08, 0, 0.12); }
  };

  /* --- 着地インパクト（要素を軽く振動） --- */
  function shake(elOrSel) {
    var el = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
    if (!el) return;
    el.classList.remove('fx-shake'); void el.offsetWidth; el.classList.add('fx-shake');
    setTimeout(function () { el.classList.remove('fx-shake'); }, 360);
  }

  function play(name) { if (SFX[name]) try { SFX[name](); } catch (e) {} }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* --- サイコロの転がる音（減速するカラカラ音をスケジュール） --- */
  function rollSound(ms) {
    if (muted || !ensureAudio()) return;
    ms = (ms || 1000) / 1000;
    var t = 0, n = 0;
    while (t < ms - 0.04 && n < 26) {
      var prog = t / ms;
      // 木質のカチッ＋短いノイズ
      tone(rnd(150, 320) * (1 - prog * 0.3), 0.028, 'square', t, (0.18 - prog * 0.08));
      noise(0.018, t, 0.16 - prog * 0.08);
      t += 0.04 + prog * prog * 0.16; // 進むほど間隔が広がる＝減速感
      n++;
    }
  }

  /* --- 祝祭（噴水＋光線） --- */
  function celebrate(emoji, count) {
    if (!layer) return;
    rays();
    fountain(emoji || '🪙', count || 26);
  }
  function rays() {
    var r = document.createElement('div');
    r.className = 'fx-rays';
    layer.appendChild(r);
    setTimeout(function () { r.remove(); }, 1100);
  }
  function fountain(emoji, count) {
    for (var i = 0; i < count; i++) {
      (function () {
        var p = document.createElement('span');
        p.className = 'fx-fountain';
        p.textContent = emoji;
        p.style.left = (50 + rnd(-8, 8)) + '%';
        p.style.setProperty('--fx', rnd(-160, 160) + 'px');
        p.style.setProperty('--fy', rnd(-260, -120) + 'px');
        p.style.fontSize = rnd(16, 30) + 'px';
        p.style.animationDelay = rnd(0, 0.25) + 's';
        layer.appendChild(p);
        setTimeout(function () { p.remove(); }, 1700);
      })();
    }
  }

  /* --- 触覚フィードバック --- */
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

  /* --- BGMダッキング（見せ場・ボイス中はBGMを下げる） --- */
  function duck(ms) { if (global.BGM && global.BGM.duck) global.BGM.duck(ms || 2200); }

  /* --- 全ボタン共通の効果音（種別で最適音を選択） --- */
  function classify(el) {
    if (el.matches('#bjRoll, #ppSwing, #slRoll')) return 'dice';                 // 振る＝サイコロ音
    if (el.matches('.bet-step')) return 'tick';                                  // BET±＝軽いコツッ
    if (el.matches('.linkback') || /ホームへ|とじる|戻る|閉じる/.test(el.textContent || '')) return 'back'; // 戻る・閉じる
    if (el.matches('.gamecard, .navbtn, .sl-pos__btn, .sl-reel, .btn--gold, .btn--primary')) return 'select'; // 決定・選択・遷移
    return 'tap';                                                               // その他すべて
  }
  function buttonSound(e) {
    var el = e.target && e.target.closest && e.target.closest('button, .sl-reel');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    play(classify(el));
  }

  /* --- ボイス（重厚な魔王調・日本語） --- */
  function speak(text, opts) {
    if (muted || !global.speechSynthesis || !text) return;
    try {
      var u = new global.SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (jaVoice) u.voice = jaVoice;
      u.pitch = (opts && opts.pitch != null) ? opts.pitch : 0.4; // 低く重く
      u.rate = (opts && opts.rate != null) ? opts.rate : 0.92;
      u.volume = 1.0;
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* --- 画面フラッシュ --- */
  function flash(color, ms) {
    if (!layer) return;
    var f = document.createElement('div');
    f.className = 'fx-flash';
    f.style.background = color || 'rgba(230,50,82,0.5)';
    layer.appendChild(f);
    setTimeout(function () { f.classList.add('out'); }, 30);
    setTimeout(function () { f.remove(); }, (ms || 600));
  }

  /* --- 粒子飛散（🪙 / ❤️ など） --- */
  function burst(emoji, count) {
    if (!layer) return;
    count = count || 14;
    for (var i = 0; i < count; i++) {
      (function (i) {
        var p = document.createElement('span');
        p.className = 'fx-particle';
        p.textContent = emoji;
        var ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        var dist = 90 + Math.random() * 140;
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', (Math.sin(ang) * dist - 80) + 'px');
        p.style.left = (45 + Math.random() * 10) + '%';
        p.style.top = '46%';
        p.style.fontSize = (16 + Math.random() * 16) + 'px';
        p.style.animationDelay = (Math.random() * 0.12) + 's';
        layer.appendChild(p);
        setTimeout(function () { p.remove(); }, 1300);
      })(i);
    }
  }

  /* --- 魔王キャラのポップイン＋セリフ --- */
  function character(name, line, opts) {
    if (!layer) return;
    opts = opts || {};
    var dur = opts.duration || 2400;
    var wrap = document.createElement('div');
    wrap.className = 'fx-char fx-char--' + (opts.side || 'center');
    var img = '<img class="fx-char__img" src="' + ASSET + name + '.webp" alt="">';
    var bubble = line ? '<div class="fx-char__bubble">' + line + '</div>' : '';
    wrap.innerHTML = img + bubble;
    layer.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('in'); });
    if (line) speak(line, opts.voice);
    setTimeout(function () { wrap.classList.remove('in'); wrap.classList.add('out'); }, dur - 350);
    setTimeout(function () { wrap.remove(); }, dur);
  }

  /* --- 映画的カットイン（見せ場で魔王が大きく登場） --- */
  function cutin(name, line, opts) {
    if (!layer) return;
    opts = opts || {};
    var dur = opts.duration || 2600;
    var tone = opts.tone || 'crimson'; // crimson | gold
    var wrap = document.createElement('div');
    wrap.className = 'fx-cutin fx-cutin--' + tone;
    wrap.innerHTML =
      '<div class="fx-cutin__band"></div>' +
      '<img class="fx-cutin__img" src="' + ASSET + name + '.webp" alt="">' +
      (opts.title ? '<div class="fx-cutin__title">' + opts.title + '</div>' : '') +
      (line ? '<div class="fx-cutin__line">' + line + '</div>' : '');
    layer.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('in'); });
    if (line) speak(line, opts.voice);
    setTimeout(function () { wrap.classList.add('out'); }, dur - 420);
    setTimeout(function () { wrap.remove(); }, dur);
  }

  /* --- 合成イベント（各ゲームから呼ぶ） --- */
  var Events = {
    diceRoll: function () { play('dice'); },
    select: function () { play('select'); },

    rolling: function (ms) { rollSound(ms || 1050); },
    diceLand: function () { play('land'); vibrate(14); },

    // BJ
    bjWin: function () { play('win'); celebrate('🪙', 22); vibrate([20, 40, 20]); },
    bjJustWin: function () { play('bigWin'); flash('rgba(243,205,107,0.5)', 800); celebrate('🪙', 34); vibrate([30, 50, 30, 50, 30]); duck(); cutin('maou_vexed', 'おのれ……ジャストだと！', { title: 'JUST WIN', tone: 'gold', duration: 2600 }); },
    bjBust: function () { play('lose'); flash('rgba(120,10,30,0.6)', 800); vibrate([60, 30, 60]); duck(); cutin('maou_laugh', 'ぐははは、貴様の負けだ！', { title: 'DOBON', tone: 'crimson', duration: 2600 }); },
    bjLose: function () { play('lose'); vibrate(40); duck(); cutin('maou_laugh', '貴様の負けだ。', { tone: 'crimson', duration: 2300 }); },

    // プロスピ
    homerun: function () { play('bigWin'); flash('rgba(243,205,107,0.45)', 800); celebrate('🪙', 30); vibrate([30, 50, 30, 50, 40]); duck(); cutin('maou_vexed', '下等な……！', { title: 'HOME RUN', tone: 'gold', duration: 2500 }); },
    hit: function () { play('coin'); vibrate(16); },
    setClear: function (runs) { play(runs > 0 ? 'bigWin' : 'win'); if (runs > 0) celebrate('🪙', 20); },
    strikeout: function () { play('lose'); vibrate(40); },

    // スロット
    slotWin: function (hearts) { play(hearts >= 2 ? 'bigWin' : 'heart'); celebrate('❤️', 10 + hearts * 5); vibrate(hearts >= 2 ? [20, 40, 20] : 16); },
    kaiten: function () { play('kaiten'); flash('rgba(230,50,82,0.55)', 1000); celebrate('❤️', 26); vibrate([40, 60, 40, 60, 60]); duck(1200); cutin('maou_laugh', 'ぐははは、運命は私のものだ！', { title: '確変', tone: 'crimson', duration: 3000 }); },
    slotMiss: function () { /* 無音（テンポ優先） */ },
    maouTaunt: function () { play('dice'); }
  };

  /* --- ミュート切替 --- */
  function setMute(v) {
    muted = !!v;
    try { global.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (muted && global.speechSynthesis) global.speechSynthesis.cancel();
    if (global.BGM) global.BGM.setMute(muted); // BGMも連動
  }
  function isMuted() { return muted; }

  global.FX = {
    init: init, play: play, speak: speak, flash: flash, burst: burst, character: character,
    ev: Events, setMute: setMute, isMuted: isMuted, shake: shake, cutin: cutin,
    _classify: classify // 検証用
  };
})(window);
