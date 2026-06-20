/* ============================================================
   main.js — 起動・ホーム画面・メニュー・ナビ登録
   ============================================================ */
(function (global) {
  'use strict';

  /* --- ホーム画面（ハブ） --- */
  var GAMES = [
    { id: 'bj',     badge: '🎲', title: 'サイコロBJ',     sub: 'DICE BLACKJACK' },
    { id: 'prospi', badge: '⚾', title: 'サイコロプロスピ', sub: 'DICE BASEBALL' },
    { id: 'slot',   badge: '🎰', title: 'スロット 555/777', sub: 'DICE SLOT' }
  ];

  var Home = {
    navKey: 'home',
    render: function (mount) {
      var v = UI.el('div', 'view');
      v.appendChild(UI.bg('bg_home'));

      var logo = UI.el('img', 'home__logo');
      logo.src = UI.ASSET + 'logo_casino.webp';
      logo.alt = '魔王のダイスカジノ';
      logo.style.mixBlendMode = 'screen'; // 焼き込み背景を馴染ませる
      v.appendChild(logo);

      var cards = UI.el('div', 'home__cards');
      GAMES.forEach(function (g) {
        var c = UI.el('button', 'gamecard');
        c.type = 'button';
        c.innerHTML =
          '<div class="gamecard__badge">' + g.badge + '</div>' +
          '<div class="gamecard__body">' +
            '<div class="gamecard__title">' + g.title + '</div>' +
            '<div class="gamecard__sub">' + g.sub + '</div>' +
          '</div>' +
          '<div class="gamecard__arrow">›</div>';
        c.addEventListener('click', function () { Router.go(g.id); });
        cards.appendChild(c);
      });
      v.appendChild(cards);
      mount.appendChild(v);
    }
  };

  /* --- メニュー画面 --- */
  var Menu = {
    navKey: 'menu',
    render: function (mount) {
      var v = UI.el('div', 'view');
      v.appendChild(UI.bg('bg_home'));
      v.innerHTML += '<div class="screen-title">≡ メニュー</div>';

      var p = UI.el('div', 'panel panel--gold');
      p.style.display = 'flex';
      p.style.flexDirection = 'column';
      p.style.gap = '12px';

      var info = UI.el('div', 'muted');
      info.style.fontSize = '13px';
      info.style.lineHeight = '1.8';
      info.innerHTML =
        '🪙 コイン: <b style="color:var(--gold-bright)">' + UI.fmt(Store.coins()) + '</b><br>' +
        '❤️ ハート: <b style="color:var(--crimson-bright)">' + UI.fmt(Store.hearts()) + '</b><br>' +
        '⚾ プロスピ最高得点: <b style="color:var(--gold-bright)">' + UI.fmt(Store.get().bestProspi) + '</b><br>' +
        '<span style="color:var(--text-mute);font-size:11px">端末ID: ' + Store.deviceId() + '</span>';
      p.appendChild(info);

      if (global.FX) {
        var soundBtn = UI.el('button', 'btn btn--ghost btn--block', FX.isMuted() ? '🔇 サウンド: OFF' : '🔊 サウンド: ON');
        soundBtn.addEventListener('click', function () {
          FX.setMute(!FX.isMuted());
          soundBtn.textContent = FX.isMuted() ? '🔇 サウンド: OFF' : '🔊 サウンド: ON';
          if (!FX.isMuted()) FX.play('select');
        });
        p.appendChild(soundBtn);
      }

      var resetBtn = UI.el('button', 'btn btn--ghost btn--block', '残高をリセット');
      resetBtn.addEventListener('click', function () {
        if (confirm('コイン・ハートを初期値に戻します。よろしいですか？')) {
          Store.resetWallet();
          UI.toast('残高をリセットしました', 'good');
          Router.go('menu');
        }
      });
      p.appendChild(resetBtn);

      var homeBtn = UI.el('button', 'btn btn--gold btn--block', 'ホームへ戻る');
      homeBtn.addEventListener('click', function () { Router.go('home'); });
      p.appendChild(homeBtn);

      v.appendChild(p);

      var note = UI.el('div', 'center muted');
      note.style.cssText = 'margin-top:16px;font-size:11px;letter-spacing:1px';
      note.innerHTML = '魔王のダイスカジノ v0.1<br>すべてのデータはこの端末内にのみ保存されます';
      v.appendChild(note);

      mount.appendChild(v);
    }
  };

  /* --- 起動 --- */
  function boot() {
    var mount = UI.$('#screen');

    // 演出・効果音の初期化
    if (global.FX) FX.init();

    // 画面登録
    Router.register('home', Home);
    Router.register('menu', Menu);
    // ゲーム画面（各モジュールが自己登録 or ここで登録）
    if (global.GameBJ)     Router.register('bj', global.GameBJ);
    if (global.GameProspi) Router.register('prospi', global.GameProspi);
    if (global.GameSlot)   Router.register('slot', global.GameSlot);
    // 準備中（後回し機能）
    Router.register('mission', Router.soonScreen('🎯', 'ミッション', '日替わりミッションでコイン・ハートを獲得できる機能を準備しています。'));
    Router.register('shop',    Router.soonScreen('🛒', 'ショップ', 'コインでアイテムや演出を入手できるショップを準備しています。'));
    Router.register('ranking', Router.soonScreen('👑', 'ランキング', 'プロスピ最高得点などのランキングを準備しています。'));

    Router.init(mount);

    // 残高表示をStoreに同期
    Store.subscribe(function (state, detail) { UI.renderWallet(detail); });
    UI.renderWallet();

    // 上部バーのコイン/ハート/メニュー
    UI.$('#btnMenu').addEventListener('click', function () { Router.go('menu'); });
    UI.$('#chipCoin').addEventListener('click', function () { Router.go('shop'); });
    UI.$('#chipHeart').addEventListener('click', function () { Router.go('shop'); });

    // 初期画面
    Router.go('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})(window);
