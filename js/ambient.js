/* ============================================================
   ambient.js — 金の残り火が漂うアンビエント粒子（全画面・軽量）
   雰囲気演出。UIの上に薄く重ねる（pointer-events none）。
   タブ非表示時は停止。動きを抑える設定では無効。
   ============================================================ */
(function (global) {
  'use strict';

  var canvas, ctx, raf = 0, parts = [], W = 0, H = 0, dpr = 1, running = false;
  var reduce = false;
  try { reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function rand(a, b) { return a + Math.random() * (b - a); }

  function init() {
    if (reduce) return;
    var host = document.querySelector('.app') || document.body;
    canvas = document.createElement('canvas');
    canvas.className = 'ambient';
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    spawn();
    global.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    start();
  }

  function resize() {
    if (!canvas) return;
    var host = canvas.parentNode;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn() {
    var n = Math.round(Math.max(14, Math.min(34, W / 16)));
    parts = [];
    for (var i = 0; i < n; i++) parts.push(makeP(true));
  }
  function makeP(initial) {
    return {
      x: rand(0, W),
      y: initial ? rand(0, H) : H + rand(0, 40),
      r: rand(0.6, 2.2),
      vy: rand(0.12, 0.5),
      vx: rand(-0.18, 0.18),
      a: rand(0.15, 0.6),
      tw: rand(0, Math.PI * 2),
      tws: rand(0.01, 0.04),
      hue: Math.random() < 0.22 ? 'c' : 'g' // たまにクリムゾン
    };
  }

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.y -= p.vy; p.x += p.vx; p.tw += p.tws;
      if (p.y < -8 || p.x < -12 || p.x > W + 12) { parts[i] = makeP(false); continue; }
      var flick = 0.55 + 0.45 * Math.sin(p.tw);
      var alpha = p.a * flick;
      var col = p.hue === 'c' ? '230,70,90' : '243,205,107';
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
      g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (reduce || running || !canvas) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  global.Ambient = { init: init };
})(window);
