/* ============================================================
   dice3d.js — Three.js による本物の3Dサイコロ
   - 振ると転がり、指定された出目で着地する（ゲームロジックはそのまま・演出のみ）
   - 1コンテナ＝1キャンバス。複数個を横並びで転がす
   - THREE未読込・WebGL不可なら使えない（呼び出し側でCSSダイスにフォールバック）
   ============================================================ */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var available = !!THREE;

  // 出目→「その面を正面(+Z)に向ける」オイラー角
  var FACE_EULER = {
    1: [0, 0, 0],
    2: [Math.PI / 2, 0, 0],
    3: [0, -Math.PI / 2, 0],
    4: [0, Math.PI / 2, 0],
    5: [-Math.PI / 2, 0, 0],
    6: [Math.PI, 0, 0]
  };
  // BoxGeometryの面順 [ +x,-x,+y,-y,+z,-z ] に割り当てる出目（対面の和=7）
  var FACE_VALUE = [3, 4, 2, 5, 1, 6];

  /* --- ピップ面テクスチャ生成（白地に赤ピップ・CSSダイスと同色） --- */
  var texCache = {};
  function pipTexture(value) {
    if (texCache[value]) return texCache[value];
    var s = 128;
    var c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    // 面取り風の暗いフチ
    x.fillStyle = '#b89a86';
    roundRect(x, 2, 2, s - 4, s - 4, 26); x.fill();
    // 白い面（わずかにグラデ）
    var g = x.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#f4ebeb'); g.addColorStop(1, '#dccbcb');
    x.fillStyle = g; roundRect(x, 9, 9, s - 18, s - 18, 20); x.fill();
    // 内側の柔らかいハイライト＋陰
    x.save();
    roundRect(x, 9, 9, s - 18, s - 18, 20); x.clip();
    var hg = x.createLinearGradient(0, 9, 0, s - 9);
    hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(0.25, 'rgba(255,255,255,0)');
    hg.addColorStop(0.8, 'rgba(120,90,90,0)'); hg.addColorStop(1, 'rgba(110,80,80,0.22)');
    x.fillStyle = hg; x.fillRect(0, 0, s, s);
    x.restore();
    // ピップ配置
    var P = {
      1: [[.5, .5]],
      2: [[.28, .28], [.72, .72]],
      3: [[.28, .28], [.5, .5], [.72, .72]],
      4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
      5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
      6: [[.28, .26], [.28, .5], [.28, .74], [.72, .26], [.72, .5], [.72, .74]]
    };
    (P[value] || []).forEach(function (p) {
      var px = p[0] * s, py = p[1] * s, r = s * 0.083;
      var rg = x.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.2, px, py, r);
      rg.addColorStop(0, '#c8203f'); rg.addColorStop(0.7, '#8d1228'); rg.addColorStop(1, '#52091a');
      x.fillStyle = rg; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    });
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    texCache[value] = t;
    return t;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function dieMaterials() {
    return FACE_VALUE.map(function (v) {
      return new THREE.MeshStandardMaterial({ map: pipTexture(v), roughness: 0.42, metalness: 0.06 });
    });
  }

  // 接地影（黒の放射状グラデ）
  var _shadowTex = null;
  function makeShadowTex() {
    if (_shadowTex) return _shadowTex;
    var s = 128, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.55, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    _shadowTex = new THREE.CanvasTexture(c);
    return _shadowTex;
  }

  /* --- インスタンス管理 --- */
  var pool = []; // {el, renderer, scene, camera, dice, raf, count}

  function getInst(el, count) {
    // DOMから切り離された旧インスタンスを掃除（リーク防止）
    pool.slice().forEach(function (p) { if (!document.contains(p.el)) dispose(p); });
    var inst = pool.filter(function (p) { return p.el === el; })[0];
    if (inst && inst.count === count) return inst;
    if (inst) { dispose(inst); }
    inst = build(el, count);
    pool.push(inst);
    return inst;
  }

  function build(el, count) {
    var w = el.clientWidth || 240, h = el.clientHeight || 92;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(33, w / h, 0.1, 100);
    camera.position.set(0, 0.95, 3.05);
    camera.lookAt(0, 0.02, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var key = new THREE.DirectionalLight(0xfff2dc, 1.25);
    key.position.set(3, 7, 5); scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-2, 3, 4); scene.add(fill);
    var rim = new THREE.DirectionalLight(0xff7a96, 0.55);
    rim.position.set(-4, 2, -4); scene.add(rim);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = h + 'px';
    renderer.domElement.style.display = 'block';
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    var geo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
    // 接地影テクスチャ
    var shadowTex = makeShadowTex();
    var shadowGeo = new THREE.PlaneGeometry(1.9, 1.9);
    var dice = [], shadows = [];
    var spacing = count >= 3 ? 1.5 : 1.65;
    var startX = -spacing * (count - 1) / 2;
    for (var i = 0; i < count; i++) {
      var mesh = new THREE.Mesh(geo, dieMaterials());
      var x = startX + i * spacing;
      mesh.position.set(x, 0, 0);
      scene.add(mesh);
      dice.push(mesh);
      // 影
      var sm = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false }));
      sm.rotation.x = -Math.PI / 2;
      sm.position.set(x, -0.56, 0.1);
      scene.add(sm);
      shadows.push(sm);
    }
    var inst = { el: el, renderer: renderer, scene: scene, camera: camera, dice: dice, shadows: shadows, raf: 0, count: count, geo: geo };
    renderOnce(inst);
    return inst;
  }

  function renderOnce(inst) { inst.renderer.render(inst.scene, inst.camera); }

  function eulerQuat(e) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* --- 振る --- */
  function roll(el, values, onDone) {
    if (!available) { if (onDone) onDone(); return; }
    var count = values.length;
    var inst;
    try { inst = getInst(el, count); } catch (e) { available = false; if (onDone) onDone(); return; }

    var DUR = 1050; // ms
    var start = null;
    var perDie = inst.dice.map(function (mesh, i) {
      var startQ = mesh.quaternion.clone();
      var targetQ = eulerQuat(FACE_EULER[values[i]] || [0, 0, 0]);
      var axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      var turns = 2 + Math.floor(Math.random() * 2); // 2〜3回転
      var delay = i * 70;
      return { idx: i, mesh: mesh, startQ: startQ, targetQ: targetQ, axis: axis, turns: turns, delay: delay, baseX: mesh.position.x };
    });

    if (inst.raf) cancelAnimationFrame(inst.raf);

    function frame(ts) {
      if (start === null) start = ts;
      var t = ts - start;
      var allDone = true;
      perDie.forEach(function (d) {
        var lt = Math.min(1, Math.max(0, (t - d.delay) / DUR));
        if (lt < 1) allDone = false;
        var e = easeOutCubic(lt);
        // 着地姿勢へslerp＋減衰スピンで転がり感
        var q = d.startQ.clone().slerp(d.targetQ, e);
        var spinAngle = (1 - e) * d.turns * Math.PI * 2;
        var spin = new THREE.Quaternion().setFromAxisAngle(d.axis, spinAngle);
        q.multiply(spin);
        d.mesh.quaternion.copy(q);
        // バウンド＋着地
        var yy = Math.sin(e * Math.PI) * 0.9 + (1 - e) * 0.2;
        d.mesh.position.y = yy;
        d.mesh.position.x = d.baseX;
        // 影は高さに応じて縮小・薄く
        if (inst.shadows[d.idx]) {
          var sh = inst.shadows[d.idx];
          var k = 1 - Math.min(1, yy * 0.7);
          sh.scale.set(k, k, k);
          sh.material.opacity = 0.45 * k;
        }
      });
      inst.renderer.render(inst.scene, inst.camera);
      if (!allDone) { inst.raf = requestAnimationFrame(frame); }
      else {
        // 最終姿勢を厳密にtargetへ
        perDie.forEach(function (d) { d.mesh.quaternion.copy(d.targetQ); d.mesh.position.y = 0; });
        inst.renderer.render(inst.scene, inst.camera);
        inst.raf = 0;
        if (onDone) onDone();
      }
    }
    inst.raf = requestAnimationFrame(frame);
  }

  /* --- 静止表示（出目を即セット） --- */
  function show(el, values) {
    if (!available) return;
    var inst;
    try { inst = getInst(el, values.length); } catch (e) { return; }
    inst.dice.forEach(function (mesh, i) {
      mesh.quaternion.copy(eulerQuat(FACE_EULER[values[i]] || [0, 0, 0]));
      mesh.position.y = 0;
    });
    renderOnce(inst);
  }

  function resize(el) {
    var inst = pool.filter(function (p) { return p.el === el; })[0];
    if (!inst) return;
    var w = el.clientWidth, h = el.clientHeight || 92;
    inst.camera.aspect = w / h; inst.camera.updateProjectionMatrix();
    inst.renderer.setSize(w, h, false);
    renderOnce(inst);
  }

  function dispose(inst) {
    if (inst.raf) cancelAnimationFrame(inst.raf);
    try { inst.renderer.dispose(); } catch (e) {}
    try { if (inst.el.contains(inst.renderer.domElement)) inst.el.removeChild(inst.renderer.domElement); } catch (e) {}
    pool = pool.filter(function (p) { return p !== inst; });
  }
  function disposeEl(el) {
    var inst = pool.filter(function (p) { return p.el === el; })[0];
    if (inst) dispose(inst);
  }

  global.Dice3D = {
    available: function () { return available; },
    roll: roll, show: show, resize: resize, disposeEl: disposeEl,
    DURATION: 1050
  };
})(window);
