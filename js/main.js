/**
 * main.js — запуск приложения, вход, навигация между экранами и вкладками.
 *
 * Каждый экран описан в teacher.js / student.js / parent.js так:
 *   App.screen('ключ', {
 *     title: 'Заголовок' или функция(data),
 *     load: params => Api.call(...),          // откуда брать данные
 *     render: (data, params) => '<html>',     // как нарисовать
 *     mount: (view, data, params) => {},      // (необязательно) что сделать после отрисовки
 *     actions: { имя: (element, data, params) => {} }  // реакции на кнопки с data-act="имя"
 *   });
 */
var App = (function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  var view = document.getElementById('view');
  var tabbar = document.getElementById('tabbar');
  var demobar = document.getElementById('demobar');
  var esc = UI.esc, icon = UI.icon;

  var Screens = {};
  var TABS = {
    teacher: [
      { key: 't.today', label: 'Сегодня', icon: 'home' },
      { key: 't.classes', label: 'Классы', icon: 'users' },
      { key: 't.week', label: 'Расписание', icon: 'calendar' },
      { key: 't.rewards', label: 'Награды', icon: 'gift', badge: function () { return state.pending; } },
      { key: 't.settings', label: 'Настройки', icon: 'settings' }
    ],
    student: [
      { key: 's.home', label: 'Главная', icon: 'home' },
      { key: 's.week', label: 'Уроки', icon: 'book' },
      { key: 's.rewards', label: 'Награды', icon: 'gift' },
      { key: 's.history', label: 'История', icon: 'history' }
    ],
    parent: [
      { key: 'p.summary', label: 'Сводка', icon: 'home' },
      { key: 'p.lessons', label: 'Уроки', icon: 'book' },
      { key: 'p.points', label: 'Баллы', icon: 'coin' }
    ]
  };
  var ROLE_NAMES = { teacher: 'Учитель', student: 'Ученик', parent: 'Родитель' };

  var state = { role: null, roles: [], user: null, stack: [], cache: {}, pending: 0, childId: null, dirty: false, token: 0, fresh: {} };
  var cur = null; // текущий экран: { key, params, data }

  function screen(key, def) { Screens[key] = def; }

  // ─── Память в телефоне: последние загруженные экраны ───
  // При следующем открытии приложение сразу показывает их, а свежие данные подгружает в фоне.
  var STORE_KEY = 'uchpom_cache_v1', MAX_SCREENS = 40;
  var Store = {
    snap: null,
    read: function () {
      if (Store.snap) return Store.snap;
      var x = null;
      try { x = Api.mode === 'demo' ? null : JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { x = null; }
      Store.snap = x && x.v === 1 ? x : { v: 1, boot: null, screens: {}, order: [] };
      return Store.snap;
    },
    put: function (key, data) {
      if (Api.mode === 'demo') return;
      var s = Store.read();
      s.screens[key] = data;
      s.order = s.order.filter(function (k) { return k !== key; }).concat(key);
      while (s.order.length > MAX_SCREENS) delete s.screens[s.order.shift()];
      Store.later();
    },
    setBoot: function (b) { if (Api.mode === 'demo') return; Store.read().boot = b; Store.later(); },
    later: function () { clearTimeout(Store.t); Store.t = setTimeout(Store.write, 400); },
    write: function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(Store.snap)); }
      catch (e) { // места мало — оставляем половину самых свежих экранов
        var s = Store.snap, drop = s.order.splice(0, Math.ceil(s.order.length / 2));
        drop.forEach(function (k) { delete s.screens[k]; });
        try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e2) { /* не страшно */ }
      }
    },
    clear: function () { Store.snap = { v: 1, boot: null, screens: {}, order: [] }; try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
  };
  function remember(key, data) { state.cache[key] = data; state.fresh[key] = true; Store.put(key, data); }

  // ─── Значок «обновляется… / ✓ обновлено» (данные грузятся в фоне, экран не блокируется) ───
  var syncEl = document.getElementById('sync'), syncBusy = 0, syncTimer = null;
  var Sync = {
    start: function () {
      syncBusy++; clearTimeout(syncTimer);
      if (syncEl) { syncEl.className = 'show'; syncEl.innerHTML = '<span class="spin">' + icon('refresh', 13) + '</span> обновляется'; }
    },
    end: function (ok) {
      syncBusy = Math.max(0, syncBusy - 1);
      if (syncBusy || !syncEl) return;
      syncEl.className = 'show ' + (ok ? 'ok' : 'err');
      syncEl.innerHTML = ok ? icon('check', 13) + ' обновлено' : icon('x', 13) + ' нет связи — показаны сохранённые данные';
      clearTimeout(syncTimer);
      syncTimer = setTimeout(function () { syncEl.className = ''; }, ok ? 1300 : 3500);
    }
  };
  function cacheKey(e) { return e.key + '|' + JSON.stringify(e.params || {}); }
  function top() { return state.stack[state.stack.length - 1]; }

  // ─── Навигация ───
  function showTab(key) { leave(); state.stack = [{ key: key, params: {} }]; render(); window.scrollTo(0, 0); }
  function go(key, params) { leave(); state.stack.push({ key: key, params: params || {} }); render(); window.scrollTo(0, 0); }
  function back() {
    if (UI.isSheetOpen()) { UI.closeSheet(); return; }
    if (state.stack.length < 2) return;
    leave(); state.stack.pop(); render();
  }
  function leave() {
    if (cur && Screens[cur.key] && Screens[cur.key].leave) { try { Screens[cur.key].leave(cur.data, cur.params); } catch (e) { /* ignore */ } }
  }
  // Заменить параметры текущего экрана (например, когда урок из шаблона получил настоящий ID)
  function replaceParams(params) {
    var e = top();
    if (!e) return;
    delete state.cache[cacheKey(e)];
    e.params = Object.assign({}, e.params, params);
    if (cur) cur.params = e.params;
  }

  // ─── Отрисовка ───
  function render() {
    var e = top(), s = Screens[e.key], key = cacheKey(e), token = ++state.token;
    var cached = state.cache[key];
    if (cached !== undefined) paint(e, cached);
    else view.innerHTML = '<div class="page">' + skeleton() + '</div>';
    syncChrome();
    if (!s.load) { if (cached === undefined) paint(e, null); return; }
    var bg = cached !== undefined; // экран уже на месте — грузим молча, со значком «обновляется»
    if (bg) Sync.start();
    s.load(e.params).then(function (data) {
      if (bg) Sync.end(true);
      var changed = JSON.stringify(data) !== JSON.stringify(cached);
      remember(key, data);
      if (token !== state.token) return; // пользователь уже ушёл на другой экран
      if (cached === undefined || (changed && !state.dirty && !UI.isSheetOpen())) paint(e, data);
      prefetchSoon();
    }).catch(function (err) {
      if (bg) Sync.end(false);
      if (token !== state.token) return;
      if (cached !== undefined) return; // остаёмся на сохранённых данных, значок уже сказал «нет связи»
      view.innerHTML = '<div class="page"><div class="card empty">' + icon('x', 28) + '<div>' + esc(err.message) +
        '</div><div style="height:12px"></div><button class="btn ghost sm" data-act="retry">Повторить</button></div></div>';
    });
  }
  function paint(e, data) {
    var s = Screens[e.key];
    cur = { key: e.key, params: e.params, data: data };
    state.dirty = false;
    var title = typeof s.title === 'function' ? s.title(data, e.params) : s.title;
    var showBack = state.stack.length > 1 && !Api.isTg;
    var head = title === null ? '' : '<div class="topline">' +
      (showBack ? '<button class="back" data-act="back" aria-label="Назад">' + icon('left') + '</button>' : '') +
      '<h1>' + esc(title) + '</h1>' + (s.right ? s.right(data, e.params) : '') + '</div>';
    view.innerHTML = '<div class="page">' + head + s.render(data, e.params, state) + '</div>';
    if (s.mount) s.mount(view, data, e.params);
    syncChrome();
  }
  // Перезагрузить данные текущего экрана (после изменения). Остальные экраны остаются в памяти,
  // но помечаются устаревшими: при переходе на них покажутся сразу и тихо обновятся.
  function reload() {
    state.fresh = {};
    state.dirty = false;
    render();
  }

  // ─── Подгрузка в фоне: остальные вкладки и уроки на сегодня, чтобы переходы были мгновенными ───
  var prefetchTimer = null, prefetching = false;
  function prefetchSoon() { clearTimeout(prefetchTimer); prefetchTimer = setTimeout(prefetch, 600); }
  function prefetch() {
    if (prefetching || !state.role) return;
    var list = (TABS[state.role] || []).map(function (t) { return { key: t.key, params: {} }; });
    var c = cur && Screens[cur.key];
    if (c && c.prefetch && cur.data) list = list.concat(c.prefetch(cur.data) || []);
    var role = state.role;
    var next = function () {
      if (state.role !== role) { prefetching = false; return; }
      var e = list.shift();
      if (!e) { prefetching = false; return; }
      var s = Screens[e.key], key = cacheKey(e);
      if (!s || !s.load || state.fresh[key]) return next();
      s.load(e.params).then(function (data) { remember(key, data); }, function () { list = []; }).then(next);
    };
    prefetching = true;
    next();
  }
  function repaint(force) { if (cur && (force || (!state.dirty && !UI.isSheetOpen()))) paint(top(), cur.data); }
  function skeleton() { return '<div class="skel" style="height:34px;width:55%;margin-bottom:16px"></div><div class="skel" style="height:120px"></div><div class="skel"></div><div class="skel"></div>'; }

  function syncChrome() {
    var e = top(), tabs = TABS[state.role] || [];
    var isRoot = state.stack.length === 1;
    tabbar.classList.toggle('hidden', !isRoot || !tabs.length);
    view.classList.toggle('no-tabs', !isRoot);
    if (isRoot && tabs.length) {
      tabbar.innerHTML = tabs.map(function (t) {
        var n = t.badge ? t.badge() : 0;
        return '<button class="' + (t.key === e.key ? 'on' : '') + '" data-tab="' + t.key + '">' + icon(t.icon, 23) +
          '<span>' + t.label + '</span>' + (n ? '<span class="cnt">' + n + '</span>' : '') + '</button>';
      }).join('');
    }
    syncBackButton();
  }
  function syncBackButton() {
    if (!tg || !tg.BackButton || !Api.isTg) return;
    if (state.stack.length > 1 || UI.isSheetOpen()) tg.BackButton.show(); else tg.BackButton.hide();
  }

  // ─── Нажатия на кнопки (одна общая «прослушка» для всех экранов) ───
  var Global = {
    back: back,
    retry: function () { render(); },
    go: function (el) {
      var p = el.dataset.params ? JSON.parse(el.dataset.params) : {};
      if (el.dataset.id) p.id = el.dataset.id;
      go(el.dataset.screen, p);
    },
    tab: function (el) { showTab(el.dataset.screen); },
    url: function (el) { UI.openLink(el.dataset.url); },
    hint: function (el) { UI.toast(el.dataset.hint); },
    cl: function (el) { Views.saveChecklist(el); },
    role: function (el) { setRole(el.dataset.role); }
  };
  function dispatch(type, e) {
    var attr = type === 'click' ? 'act' : 'change';
    var el = e.target.closest('[data-' + attr + ']');
    if (!el || !view.contains(el)) return;
    var name = el.dataset[attr], s = cur && Screens[cur.key];
    var h = (s && s.actions && s.actions[name]) || Global[name];
    if (!h) return;
    if (type === 'click') e.preventDefault();
    h(el, cur ? cur.data : null, cur ? cur.params : {}, e);
  }
  view.addEventListener('click', function (e) { dispatch('click', e); });
  view.addEventListener('change', function (e) { dispatch('change', e); });
  view.addEventListener('input', function (e) { if (e.target.matches('input, textarea')) state.dirty = true; });
  tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    UI.haptic('select');
    if (top() && top().key === b.dataset.tab && state.stack.length === 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    showTab(b.dataset.tab);
  });

  /** Выполнить действие на сервере: показать ошибку или «успех» и обновить экран. */
  function run(action, params, opts) {
    opts = opts || {};
    return Api.call(action, params).then(function (res) {
      if (opts.ok) UI.toast(opts.ok);
      UI.haptic('light');
      if (opts.reload !== false) reload();
      return res;
    }).catch(function (err) {
      UI.toast(err.message, true);
      return new Promise(function () {}); // ошибку уже показали; следующие шаги (закрыть окно, «назад») не выполняем
    });
  }

  // ─── Вход в приложение ───
  function start() {
    if (tg) {
      try {
        tg.ready(); tg.expand();
        if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); }
        if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); // чтобы свайпы в режиме урока не сворачивали приложение
        tg.BackButton.onClick(back);
      } catch (e) { /* старая версия Telegram — работаем без этих мелочей */ }
    }
    UI.onTimerEnd = function () { var s = cur && Screens[cur.key]; if (s && s.live) repaint(); };
    if (Api.needTelegram) return needTelegram();
    if (Api.mode === 'demo') drawDemoBar();
    boot();
  }
  function boot() {
    tabbar.classList.add('hidden');
    // Быстрый старт: тот же человек уже открывал приложение — сразу показываем сохранённое, проверяем вход в фоне
    var snap = Store.read(), me = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    var quick = Api.mode !== 'demo' && snap.boot && me && String(snap.boot.user.id) === String(me.id) && snap.boot.roles.length;
    if (!quick && snap.boot) Store.clear(); // другой аккаунт Telegram — старые данные не показываем
    if (quick) {
      state.user = snap.boot.user;
      Object.keys(snap.screens).forEach(function (k) { state.cache[k] = snap.screens[k]; });
      enter(snap.boot);
      Api.call('bootstrap').then(function (b) {
        Store.setBoot(b);
        if (JSON.stringify(b.roles) !== JSON.stringify(snap.boot.roles)) { // роли изменились (например, ученика убрали)
          state.cache = {}; Store.clear(); Store.setBoot(b);
          if (!b.roles.length) return welcome(b);
          enter(b);
        }
      }).catch(function () { /* нет связи — работаем на сохранённых данных */ });
      return;
    }
    view.innerHTML = '<div class="page">' + skeleton() + '</div>';
    Api.call('bootstrap').then(function (b) {
      state.user = b.user;
      if (b.roles.length) Store.setBoot(b);
      if (!b.roles.length && b.startParam) {
        return Api.call('redeem', { code: b.startParam }).then(function (r) { Store.setBoot(r); enter(r); }).catch(function (err) { welcome(b, err.message); });
      }
      if (!b.roles.length) return welcome(b);
      enter(b);
    }).catch(function (err) {
      view.innerHTML = '<div class="center-screen"><div class="logo">' + icon('x', 30) + '</div><h1>Не удалось загрузить</h1><p>' +
        esc(err.message) + '</p><button class="btn" onclick="App.boot()">Повторить</button></div>';
    });
  }
  function enter(b) {
    state.roles = b.roles;
    var saved = localStorage.getItem('uchpom_role');
    setRole(Api.mode !== 'demo' && b.roles.indexOf(saved) >= 0 ? saved : b.roles[0]);
  }
  function setRole(role) {
    state.role = role; state.stack = []; state.fresh = {};
    if (Api.mode === 'demo') state.cache = {}; // в демо при смене роли меняется и пользователь
    if (Api.mode !== 'demo') localStorage.setItem('uchpom_role', role);
    showTab(TABS[role][0].key);
  }
  function welcome(b, error) {
    tabbar.classList.add('hidden');
    view.innerHTML = '<div class="center-screen"><div class="logo">' + icon('school', 32) + '</div>' +
      '<h1>Здравствуйте' + (b.user && b.user.name ? ', ' + esc(b.user.name.split(' ')[0]) : '') + '!</h1>' +
      '<p>Это учебный помощник ' + esc(b.teacherName && b.teacherName !== 'Учитель' ? '(' + b.teacherName + ')' : '') +
      '. Чтобы войти, откройте ссылку-приглашение от учителя или введите код из неё.</p>' +
      (error ? '<div class="card" style="color:var(--bad);text-align:left">' + esc(error) + '</div>' : '') +
      '<form id="codeForm"><input class="input" name="code" placeholder="Например: s_ab12cd34" autocomplete="off" ' +
      'style="text-align:center;font-size:17px;margin-bottom:10px"><button class="btn block" type="submit">Войти</button></form>' +
      '<p class="sub" style="margin-top:16px">Код выдаёт учитель: отдельный для ученика и для родителя.</p></div>';
    document.getElementById('codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = e.target.code.value.trim();
      if (!code) return UI.toast('Введите код');
      Api.call('redeem', { code: code }).then(function (r) { UI.toast('Готово! Добро пожаловать'); Store.setBoot(r); enter(r); })
        .catch(function (err) { UI.toast(err.message, true); });
    });
  }
  function needTelegram() {
    view.innerHTML = '<div class="center-screen"><div class="logo">' + icon('lock', 30) + '</div><h1>Откройте через Telegram</h1>' +
      '<p>Вход выполняется через ваш аккаунт Telegram. Откройте ссылку-приглашение от учителя в приложении Telegram.</p>' +
      '<button class="btn ghost" id="demoBtn">Посмотреть демо-версию</button></div>';
    document.getElementById('demoBtn').onclick = function () { Api.useDemo(); drawDemoBar(); boot(); };
  }
  function drawDemoBar() {
    demobar.classList.remove('hidden');
    demobar.innerHTML = '<span>Демо</span><div class="seg">' + Demo.ROLES.map(function (r) {
      return '<button data-r="' + r[0] + '" class="' + (Demo.role === r[0] ? 'on' : '') + '">' + r[1] + '</button>';
    }).join('') + '</div>';
    demobar.onclick = function (e) {
      var b = e.target.closest('[data-r]');
      if (!b || b.dataset.r === Demo.role) return;
      Demo.setRole(b.dataset.r); drawDemoBar(); boot();
    };
  }

  // Переключатель ролей (если один человек — например, и учитель, и родитель)
  function roleSwitcher() {
    if (state.roles.length < 2 || Api.mode === 'demo') return '';
    return '<div class="card"><div class="sub" style="margin-bottom:8px">Войти как</div><div class="btn-row">' + state.roles.map(function (r) {
      return '<button class="btn sm ' + (r === state.role ? '' : 'plain') + '" data-act="role" data-role="' + r + '">' + ROLE_NAMES[r] + '</button>';
    }).join('') + '</div></div>';
  }

  return {
    start: start, boot: boot, screen: screen, go: go, back: back, showTab: showTab, reload: reload, repaint: repaint,
    replaceParams: replaceParams, run: run, syncBackButton: syncBackButton, action: function (name, fn) { Global[name] = fn; }, syncChrome: syncChrome, roleSwitcher: roleSwitcher,
    remember: function (e, data) { remember(cacheKey(e), data); },
    state: state, get current() { return cur; }
  };
})();
