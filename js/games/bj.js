/* ============================================================
   games/bj.js — サイコロBJ（P1で本実装予定・現在はスタブ）
   ============================================================ */
(function (global) {
  'use strict';
  global.GameBJ = {
    navKey: 'home',
    render: function (mount) {
      var v = UI.el('div', 'view');
      v.appendChild(UI.bg('bg_bj'));
      v.innerHTML += '<div class="screen-title">‹ サイコロBJ</div>';
      var p = UI.el('div', 'soon');
      p.innerHTML =
        '<div class="soon__icon">🎲</div>' +
        '<div class="soon__title">サイコロBJ</div>' +
        '<div class="soon__msg">Phase 1 で実装します。</div>';
      v.appendChild(p);
      var back = UI.el('button', 'btn btn--gold btn--block', 'ホームへ');
      back.style.marginTop = '16px';
      back.addEventListener('click', function () { Router.go('home'); });
      v.appendChild(back);
      mount.appendChild(v);
    }
  };
})(window);
