/**
 * game.js — игровая часть: уровни, значки, цель класса.
 *   Ученик: карточка уровня, «Мои значки», полоска цели класса, профиль одноклассника из топа.
 *   Учитель: значки в карточке ученика (дать / снять), экран «Цель класса».
 */
var Game = (function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  // ─────────── Блоки для экранов ───────────
  function bar(pct, cls) {
    return '<div class="gbar' + (cls ? ' ' + cls : '') + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }
  // look — образ (аватар, тема, титул); opts.edit — ученик может нажать и открыть «Мой образ»
  function levelCard(lv, look, opts) {
    if (!lv) return '';
    opts = opts || {};
    var av = look ? Avatar.svg(look, 60) : '<div class="lvl-badge">' + lv.level + '</div>';
    return '<div class="card lvl' + (look && look.theme ? ' theme-' + look.theme : '') + (opts.edit ? ' tap" data-act="go" data-screen="s.look' : '') + '">' + av +
      '<div class="row-main"><div class="row-title">Уровень ' + lv.level + ' · ' + esc(lv.name) + '</div>' +
      (look && look.titleText ? '<div class="look-title">' + esc(look.titleText) + '</div>' : '') +
      bar(lv.pct) + '<div class="sub">' + (lv.next ? 'До уровня «' + esc(lv.next) + '» — ещё ' + UI.pts(lv.toNext) : 'Максимальный уровень!') + '</div>' +
      (opts.edit ? '<div class="look-edit">' + icon('edit', 14) + ' Мой образ и украшения</div>' : '') + '</div></div>';
  }
  // Значки-кружки. opts.remove — у учителя кнопка «снять»; замечания выделены и подписаны «исчезнет через N дн.»
  function badgeList(list, opts) {
    opts = opts || {};
    if (!list.length) return '<div class="card empty" style="padding:16px">' + esc(opts.empty || 'Значков пока нет') + '</div>';
    return '<div class="gbadges">' + list.map(function (b) {
      var warn = b.kind === 'warn', off = warn && b.active === false;
      var sub = warn ? (off ? 'истекло' : b.daysLeft === 0 ? 'последний день' : 'ещё ' + b.daysLeft + ' дн.') : (b.note ? esc(b.note) : '');
      return '<div class="gb' + (warn ? ' warn' : '') + (off ? ' off' : '') + '"' + (b.note && !opts.remove ? ' data-act="hint" data-hint="' + esc(b.title + ': ' + b.note) + '"' : '') + '>' +
        '<div class="gb-ic">' + icon(b.icon || 'star', 20) + '</div><div class="t">' + esc(b.title) + '</div>' + (sub ? '<div class="p">' + sub + '</div>' : '') +
        (opts.remove && b.id ? '<button class="gb-x" data-act="removeBadge" data-id="' + esc(b.id) + '" aria-label="Снять значок">' + icon('x', 14) + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function goalCard(g, opts) {
    if (!g) return '';
    opts = opts || {};
    var done = g.status === 'done';
    var left = g.daysLeft === null ? '' : g.daysLeft > 0 ? ' · осталось ' + g.daysLeft + ' ' + UI.plural(g.daysLeft, ['день', 'дня', 'дней']) : g.daysLeft === 0 ? ' · последний день' : '';
    return '<div class="card goal' + (done ? ' done' : '') + '"><div class="sub">' + icon('users', 14) + ' Цель класса' + (done ? '' : left) + '</div>' +
      '<div class="row-title" style="font-size:17px;margin:2px 0 8px">' + (done ? '🎉 ' : '') + esc(g.title) + '</div>' + bar(g.pct, done ? 'ok' : '') +
      '<div class="goal-nums"><b>' + g.progress + '</b> из ' + g.target + ' баллов' + (done ? ' — цель достигнута!' : ' · ' + g.pct + '%') + '</div>' +
      (g.mine !== undefined ? '<div class="sub">' + (done ? 'Твой вклад: ' + g.mine + ' б. Спасибо!' : 'Твой вклад: ' + g.mine + ' б. Все заработанные баллы идут в копилку, твой баланс не тратится.') + '</div>' : '') +
      (opts.footer || '') + '</div>';
  }
  // Блоки для главной ученика / родителя
  function pupilTop(game, opts) { return game ? levelCard(game.level, game.look, { edit: !(opts && opts.parent) }) + goalCard(game.goal) : ''; }
  function pupilBadges(game, opts) {
    if (!game) return '';
    opts = opts || {};
    var html = '';
    var warn = game.badges.filter(function (b) { return b.kind === 'warn'; }), good = game.badges.filter(function (b) { return b.kind !== 'warn'; });
    html += '<div class="section-title">' + icon('star', 15) + (opts.parent ? ' Значки от учителя' : ' Мои значки') + '</div>' +
      badgeList(good, { empty: opts.parent ? 'Значков пока нет' : 'Учитель выдаёт значки за помощь, лучшие ответы и другие успехи' });
    if (warn.length) {
      html += '<div class="section-title" style="color:var(--bad)">' + icon('bell', 15) + ' Замечания</div>' +
        '<div class="sub" style="margin:-4px 4px 8px">Видны только ' + (opts.parent ? 'вам и ребёнку' : 'тебе и родителям') + '. Исчезают сами через неделю.</div>' + badgeList(warn);
    }
    return html;
  }

  // ─────────── Ученик: профиль одноклассника (нажатие на имя в топе) ───────────
  App.action('mate', function (el) {
    if (!el.dataset.id) return;
    Api.call('s.classmate', { id: el.dataset.id }).then(function (p) {
      UI.info(p.name, '<div class="card lvl' + (p.look.theme ? ' theme-' + p.look.theme : '') + '" style="margin-bottom:10px">' + Avatar.svg(p.look, 64) + '<div class="row-main"><div class="row-title">Уровень ' +
        p.level.level + ' · ' + esc(p.level.name) + '</div>' + (p.look.titleText ? '<div class="look-title">' + esc(p.look.titleText) + '</div>' : '') + '</div></div>' + badgeList(p.badges, { empty: 'Значков пока нет' }));
    }, function (e) { UI.toast(e.message, true); });
  });

  // ─────────── Ученик: «Мой образ» (аватар и украшения) ───────────
  var CATS = [['char', 'Персонаж'], ['color', 'Цвет'], ['hat', 'Шапка'], ['acc', 'Аксессуар'], ['frame', 'Рамка'], ['theme', 'Тема'], ['title', 'Титул']];
  var RARITY = { rare: ['rare', 'редкое'], epic: ['epic', 'эпическое'], legend: ['legend', 'легендарное'], season: ['season', 'сезонное'] };
  var THEME_NAMES = { space: 'Космос', ocean: 'Океан', forest: 'Лес', sunset: 'Закат' };
  App.state.lookCat = 'char';
  function preview(d, it) {
    var l = Object.assign({}, d.look);
    if (it.type === 'theme') return '<div class="theme-chip theme-' + it.id + '">' + esc(it.name) + '</div>';
    if (it.type === 'title') return '<div class="title-chip">' + esc(it.name) + '</div>';
    l[it.type] = it.id;
    if (it.type === 'char') { l.hat = ''; l.acc = ''; } // персонажа видно целиком
    return Avatar.svg(l, 58);
  }
  function seasonEnd(mmdd) { return mmdd ? 'до ' + (+mmdd.slice(2)) + '.' + mmdd.slice(0, 2) : ''; }
  App.screen('s.look', {
    title: 'Мой образ',
    load: function () { return Api.call('s.shop'); },
    render: function (d) {
      var cat = App.state.lookCat, l = d.look;
      var html = '<div class="card look-hero' + (l.theme ? ' theme-' + l.theme : '') + '">' + Avatar.svg(l, 110) +
        '<div class="row-title" style="font-size:18px;margin-top:6px">' + esc(d.name) + '</div>' +
        (l.titleText ? '<div class="look-title">' + esc(l.titleText) + '</div>' : '') +
        '<div class="sub">Уровень ' + d.level.level + ' · ' + esc(d.level.name) + ' · можно потратить <b>' + d.available + '</b> б.</div></div>';
      html += '<div class="chips">' + CATS.map(function (c) {
        return '<button class="chip' + (c[0] === cat ? ' on' : '') + '" data-act="cat" data-c="' + c[0] + '">' + c[1] + '</button>';
      }).join('') + '</div>';
      var list = d.items.filter(function (i) { return i.type === cat; });
      var canOff = ['hat', 'acc', 'frame', 'theme', 'title'].indexOf(cat) >= 0;
      html += '<div class="shop-grid">' + (canOff ? '<button class="shop-it' + (!l[cat] ? ' worn' : '') + '" data-act="off"><div class="shop-pv"><div class="none-chip">' + icon('x', 22) + '</div></div><div class="t">Без украшения</div></button>' : '') +
        list.map(function (it) {
          var r = RARITY[it.rarity], state;
          if (it.worn) state = '<span class="pill ok">надето</span>';
          else if (it.owned) state = '<span class="pill">надеть</span>';
          else if (it.locked) state = '<span class="pill">' + icon('lock', 12) + ' ' + it.level + ' уровень</span>';
          else state = '<span class="pill ' + (it.price > d.available ? '' : 'accent') + '">' + it.price + ' б.</span>';
          return '<button class="shop-it' + (it.worn ? ' worn' : '') + (it.locked ? ' locked' : '') + (r ? ' r-' + r[0] : '') + '" data-act="item" data-id="' + it.id + '">' +
            '<div class="shop-pv">' + preview(d, it) + '</div><div class="t">' + esc(it.name) + '</div>' +
            (r ? '<div class="rar">' + r[1] + (it.season ? ' · ' + seasonEnd(it.season) : '') + '</div>' : '') + state + '</button>';
        }).join('') + '</div>';
      html += '<div class="sub" style="margin:4px 4px 12px">Украшения покупаются сразу, без одобрения учителя, и остаются навсегда. Уровень от покупок не падает.</div>';
      return html;
    },
    actions: {
      cat: function (el) { App.state.lookCat = el.dataset.c; App.repaint(true); },
      off: function () { wear(App.state.lookCat, ''); },
      item: function (el, d) {
        var it = d.items.find(function (x) { return x.id === el.dataset.id; });
        if (it.worn) return;
        if (it.owned) return wear(it.type, it.id);
        if (it.locked) return UI.toast('Откроется на ' + it.level + ' уровне. Сейчас у тебя ' + d.level.level + '-й.');
        if (it.price > d.available) return UI.toast('Не хватает ' + (it.price - d.available) + ' б. Копи дальше!');
        UI.confirm('Купить «' + it.name + '» за ' + it.price + ' ' + UI.plural(it.price, ['балл', 'балла', 'баллов']) + '? Баллы спишутся сразу.', 'Купить').then(function (ok) {
          if (ok) App.run('s.shop.buy', { item: it.id }, { ok: 'Готово! «' + it.name + '» теперь твоё' });
        });
      }
    }
  });
  function wear(slot, id) {
    UI.haptic('select');
    App.run('s.look.save', { slot: slot, item: id });
  }

  // ─────────── Учитель: значки в карточке ученика ───────────
  function teacherSection(d) {
    var html = '<div class="section-title">' + icon('star', 15) + ' Уровень и значки<span class="grow"></span><a data-act="giveBadge">+ Дать значок</a></div>';
    html += levelCard(d.level, d.look);
    var good = d.badges.filter(function (b) { return b.kind !== 'warn'; }), warn = d.badges.filter(function (b) { return b.kind === 'warn'; });
    html += badgeList(good, { remove: true, empty: 'Значков пока нет — нажмите «Дать значок»' });
    if (warn.length) html += '<div class="sub" style="margin:10px 4px 6px">Замечания (видят только ученик и родитель):</div>' + badgeList(warn, { remove: true });
    return html;
  }
  App.action('giveBadge', function (el, d) {
    var kinds = [['good', 'Похвала — видят одноклассники'], ['warn', 'Замечание — видят только ученик и родитель, исчезает через неделю']];
    var s = UI.openSheet('<h2>Дать значок · ' + esc(d.student.name) + '</h2>' + kinds.map(function (k) {
      return '<div class="sub" style="margin:12px 2px 8px">' + k[1] + '</div><div class="gbadges pick">' + d.catalog.filter(function (c) { return c.kind === k[0]; }).map(function (c) {
        return '<button class="gb' + (c.kind === 'warn' ? ' warn' : '') + '" data-key="' + c.key + '"><div class="gb-ic">' + icon(c.icon, 20) + '</div><div class="t">' + esc(c.title) + '</div></button>';
      }).join('') + '</div>';
    }).join('') + '<div class="btn-row" style="margin-top:14px"><button class="btn plain" data-close>Отмена</button></div>');
    s.el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) return s.close();
      var b = e.target.closest('[data-key]');
      if (!b) return;
      var c = d.catalog.find(function (x) { return x.key === b.dataset.key; });
      s.close();
      var fields = [];
      if (c.custom) fields.push({ name: 'title', label: 'Название', required: true, autofocus: true, placeholder: c.kind === 'warn' ? 'Например: Разговоры на уроке' : 'Например: Знаток физики' });
      fields.push({ name: 'note', label: 'За что (необязательно)', placeholder: c.kind === 'warn' ? 'три раза за неделю' : 'помог провести опыт' });
      if (c.kind === 'warn') fields.push({ name: 'days', type: 'number', label: 'Сколько дней держится', value: 7 });
      UI.form({ title: (c.custom ? (c.kind === 'warn' ? 'Своё замечание' : 'Свой значок') : '«' + c.title + '»') + ' · ' + d.student.name,
        desc: c.kind === 'warn' ? 'Замечание видят только ученик и родитель. Оно исчезнет само.' : 'Значок увидят ученик, родитель и одноклассники.',
        fields: fields, submit: 'Дать значок',
        onSubmit: function (v) { return Api.call('t.badge.give', { studentIds: [d.student.id], key: c.key, title: v.title, note: v.note, days: v.days }); } })
        .then(function (r) { if (r) { UI.haptic('light'); UI.toast('Значок выдан'); App.reload(); } });
    });
  });
  App.action('removeBadge', function (el) {
    UI.confirm('Снять этот значок?', 'Снять', true).then(function (ok) {
      if (ok) App.run('t.badge.remove', { id: el.dataset.id }, { ok: 'Значок снят' });
    });
  });

  // ─────────── Учитель: цель класса ───────────
  var STATUS = { done: ['ok', 'достигнута'], closed: ['', 'закрыта'], missed: ['bad', 'срок вышел'] };
  App.screen('t.goal', {
    title: 'Цель класса',
    load: function (p) { return Api.call('t.goal', { classId: p.classId || App.state.goalClass || '' }); },
    render: function (d) {
      if (!d.cls) return '<div class="card empty">' + icon('users', 28) + '<div>Сначала создайте класс</div></div>';
      App.state.goalClass = d.cls.id;
      var html = d.classes.length > 1 ? '<div class="chips wrap">' + d.classes.map(function (c) {
        return '<button class="chip' + (c.id === d.cls.id ? ' on' : '') + '" data-act="cls" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' : '';
      if (d.goal) {
        html += goalCard(d.goal, { footer: '<div class="btn-row" style="margin-top:12px"><button class="btn ghost sm" data-act="edit">' + icon('edit', 16) + ' Изменить</button>' +
          '<button class="btn plain sm" data-act="close">Закрыть цель</button></div>' });
        html += '<div class="section-title">Вклад учеников <span class="sub">(видите только вы)</span></div><div class="card flat">' + d.goal.members.map(function (m) {
          return '<div class="row" style="min-height:0;padding:8px 14px"><div class="row-main">' + esc(m.name) + '</div><span class="sub">' + m.amount + ' б.</span></div>';
        }).join('') + '</div>';
      } else {
        html += '<div class="card empty">' + icon('gift', 28) + '<div>У класса ' + esc(d.cls.name) + ' нет цели</div><div class="sub" style="margin:6px 0 12px">Весь класс вместе копит баллы на общий приз: кино, игру, пицца-день. ' +
          'Считаются все заработанные баллы, минусы не вычитаются, баланс учеников не тратится.</div>' +
          '<button class="btn" data-act="edit">' + icon('plus', 18) + ' Поставить цель</button></div>';
      }
      if (d.history.length) {
        html += '<div class="section-title">Прошлые цели</div><div class="card flat">' + d.history.map(function (g) {
          var st = STATUS[g.status] || ['', g.status];
          return '<div class="row"><div class="row-main"><div class="row-title">' + esc(g.title) + '</div><div class="row-sub">' + g.raw + ' из ' + g.target + ' баллов · с ' + UI.dayShort(g.from) + '</div></div>' +
            '<span class="pill ' + st[0] + '">' + st[1] + '</span></div>';
        }).join('') + '</div>';
      }
      return html;
    },
    actions: {
      cls: function (el) { App.state.goalClass = el.dataset.id; App.replaceParams({ classId: el.dataset.id }); App.reload(); },
      edit: function (el, d) {
        var g = d.goal || {}, cnt = (d.classes.find(function (c) { return c.id === d.cls.id; }) || {}).count || 20;
        UI.form({ title: g.id ? 'Изменить цель' : 'Цель для ' + d.cls.name,
          desc: g.id ? '' : 'Баллы считаются с сегодняшнего дня. Когда класс соберёт нужное, всем ученикам придёт значок «Командный игрок», а вам — сообщение в Telegram.',
          fields: [{ name: 'title', label: 'Приз', value: g.title, required: true, autofocus: !g.id, placeholder: 'Поход в кино' },
            [{ name: 'target', type: 'number', label: 'Сколько баллов собрать', value: g.target || Math.max(50, Math.round(cnt * 40 / 50) * 50), required: true },
              { name: 'until', type: 'date', label: 'Срок (необязательно)', value: g.until || '' }]],
          submit: g.id ? 'Сохранить' : 'Поставить цель',
          onSubmit: function (v) { return Api.call('t.goal.save', { id: g.id, classId: d.cls.id, title: v.title, target: v.target, until: v.until }); } })
          .then(function (r) { if (r) { UI.toast(g.id ? 'Сохранено' : 'Цель поставлена'); App.reload(); } });
      },
      close: function (el, d) {
        UI.confirm('Закрыть цель «' + d.goal.title + '» без приза? Ученики перестанут её видеть.', 'Закрыть', true).then(function (ok) {
          if (ok) App.run('t.goal.close', { id: d.goal.id }, { ok: 'Цель закрыта' });
        });
      }
    }
  });

  function pupilBlocks(game, opts) { return pupilTop(game, opts) + pupilBadges(game, opts); }
  return { levelCard: levelCard, badgeList: badgeList, goalCard: goalCard, pupilBlocks: pupilBlocks, pupilTop: pupilTop, pupilBadges: pupilBadges, teacherSection: teacherSection };
})();
