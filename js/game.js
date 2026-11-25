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
  function levelCard(lv) {
    if (!lv) return '';
    return '<div class="card lvl"><div class="lvl-badge">' + lv.level + '</div><div class="row-main"><div class="row-title">Уровень ' + lv.level + ' · ' + esc(lv.name) + '</div>' +
      bar(lv.pct) + '<div class="sub">' + (lv.next ? 'До уровня «' + esc(lv.next) + '» — ещё ' + UI.pts(lv.toNext) : 'Максимальный уровень!') + '</div></div></div>';
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
  function pupilTop(game) { return game ? levelCard(game.level) + goalCard(game.goal) : ''; }
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
      UI.info(p.name, '<div class="card lvl" style="margin-bottom:10px"><div class="lvl-badge">' + p.level.level + '</div><div class="row-main"><div class="row-title">Уровень ' +
        p.level.level + ' · ' + esc(p.level.name) + '</div></div></div>' + badgeList(p.badges, { empty: 'Значков пока нет' }));
    }, function (e) { UI.toast(e.message, true); });
  });

  // ─────────── Учитель: значки в карточке ученика ───────────
  function teacherSection(d) {
    var html = '<div class="section-title">' + icon('star', 15) + ' Уровень и значки<span class="grow"></span><a data-act="giveBadge">+ Дать значок</a></div>';
    html += levelCard(d.level);
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

  function pupilBlocks(game, opts) { return pupilTop(game) + pupilBadges(game, opts); }
  return { levelCard: levelCard, badgeList: badgeList, goalCard: goalCard, pupilBlocks: pupilBlocks, pupilTop: pupilTop, pupilBadges: pupilBadges, teacherSection: teacherSection };
})();
