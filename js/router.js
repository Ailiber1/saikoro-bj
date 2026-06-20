/* ============================================================
   router.js — SPA画面遷移（ページリロードなし・フェード切替）
   各画面は { render(mount), title } を持つモジュールとして登録。
   ============================================================ */
(function (global) {
  'use strict';

  var screens = {};       // name -> module
  var current = null;     // 現在の画面名
  var mountEl = null;

  /** 画面登録 */
  function register(name, mod) { screens[name] = mod; }

  /** プレースホルダ画面（準備中）を生成 */
  function soonScreen(icon, title, msg) {
    return {
      navKey: null,
      render: function (mount) {
        var wrap = UI.el('div', 'view');
        wrap.appendChild(UI.bg('bg_home'));
        var box = UI.el('div', 'soon');
        box.innerHTML =
          '<div class="soon__icon">' + icon + '</div>' +
          '<div class="soon__title">' + title + '</div>' +
          '<div class="soon__msg">' + msg + '</div>' +
          '<div class="soon__tag">COMING SOON</div>';
        wrap.appendChild(box);
        mount.appendChild(wrap);
      }
    };
  }

  /** 画面遷移 */
  function go(name, params) {
    var mod = screens[name];
    if (!mod) { console.warn('unknown screen:', name); return; }

    // 離脱フック
    if (current && screens[current] && typeof screens[current].leave === 'function') {
      try { screens[current].leave(); } catch (e) {}
    }

    current = name;
    mountEl.innerHTML = '';
    mountEl.scrollTop = 0;
    try {
      mod.render(mountEl, params || {});
    } catch (e) {
      console.error('render error on', name, e);
    }

    // 下部ナビのアクティブ表示
    updateNav(mod.navKey !== undefined ? mod.navKey : name);
    // 画面トップへ
    mountEl.scrollTop = 0;

    // BGM自動切替（screenモジュールの bgm キー、無ければ home）
    if (global.BGM) BGM.setScreen(mod.bgm || 'home');
  }

  function updateNav(activeKey) {
    var btns = document.querySelectorAll('.navbtn');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === activeKey);
    });
  }

  function init(mount) {
    mountEl = mount;
    // 下部ナビのクリック
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-nav')); });
    });
  }

  global.Router = {
    register: register, go: go, init: init, soonScreen: soonScreen,
    current: function () { return current; }
  };
})(window);
