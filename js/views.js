/**
 * views.js — общие блоки экранов, которые используют учитель, ученик и родитель.
 */
var Views = (function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  // Обозначения отметок: [символ, цвет, подпись]
  var ATT = { present: ['✓', 'ok', 'Был'], absent: ['Н', 'bad', 'Не был'], late: ['ОП', 'warn', 'Опоздал'], excused: ['УП', '', 'Уваж. причина'] };
  var HW = { done: ['✓', 'ok', 'ДЗ выполнено'], partial: ['½', 'warn', 'ДЗ частично'], none: ['✗', 'bad', 'ДЗ не выполнено'] };

  function attPill(a) { var x = ATT[a]; return x ? '<span class="pill ' + x[1] + '">' + x[2] + '</span>' : ''; }
  function hwPill(h) { var x = HW[h]; return x ? '<span class="pill ' + x[1] + '">' + x[2] + '</span>' : ''; }

  /** Большая карточка с таймером: идущий урок или ближайший. */
  function hero(lessons, opts) {
    opts = opts || {};
    var nw = UI.findNow(lessons), l;
    if (nw.current) {
      l = nw.current;
      return '<div class="hero"><div class="label"><span class="dot live"></span> Идёт урок · до конца</div>' +
        '<div class="count">' + UI.countdown(UI.parse(l.date, l.end).getTime()) + '</div>' +
        '<div class="title">' + esc(l.subject) + (opts.showClass && l.class_name ? ' · ' + esc(l.class_name) : '') + '</div>' +
        '<div class="meta">' + l.start + '–' + l.end + (l.topic ? ' · ' + esc(l.topic) : '') + '</div>' + UI.progress(l) +
        (opts.screen ? '<button class="btn block" data-act="go" data-screen="' + opts.screen + '" data-id="' + esc(l.id) + '">' +
          (opts.currentLabel || 'Открыть урок') + '</button>' : '') + '</div>';
    }
    if (nw.next) {
      l = nw.next;
      return '<div class="hero"><div class="label">' + icon('clock', 16) + ' Следующий урок · через</div>' +
        '<div class="count">' + UI.countdown(UI.parse(l.date, l.start).getTime()) + '</div>' +
        '<div class="title">' + esc(l.subject) + (opts.showClass && l.class_name ? ' · ' + esc(l.class_name) : '') + '</div>' +
        '<div class="meta">' + UI.relDay(l.date, opts.today) + ', ' + l.start + '–' + l.end + (l.topic ? ' · ' + esc(l.topic) : '') + '</div>' +
        (opts.screen ? '<button class="btn ghost block" data-act="go" data-screen="' + opts.screen + '" data-id="' + esc(l.id) + '">Открыть урок</button>' : '') +
        '</div>';
    }
    return '<div class="hero"><div class="label">' + icon('check', 16) + ' Свободно</div><div class="title">Ближайших уроков нет</div>' +
      '<div class="meta">' + esc(opts.emptyText || 'В расписании на ближайшие дни пусто.') + '</div></div>';
  }

  /** Строка урока в списке. */
  function lessonRow(l, o) {
    var now = new Date(), s = UI.parse(l.date, l.start), e = UI.parse(l.date, l.end);
    var isNow = s <= now && now < e && l.status !== 'cancelled';
    var end = [];
    if (l.material_url) end.push('<span title="Есть конспект">' + icon('file', 18) + '</span>');
    if (o.teacher && l.marked) end.push('<span class="pill ok">' + icon('check', 12) + ' ' + l.marked + '</span>');
    if (l.status === 'cancelled') end.push('<span class="pill bad">отменён</span>');
    else if (isNow) end.push('<span class="pill accent">идёт</span>');
    if (o.extra) end.push(o.extra(l));
    return '<div class="row tap' + (l.status === 'cancelled' ? ' cancelled' : '') + (isNow ? ' now' : '') + '" data-act="go" data-screen="' +
      o.screen + '" data-id="' + esc(l.id) + '"><div class="time-col">' + l.start + '<small>' + l.end + '</small></div>' +
      '<div class="row-main"><div class="row-title">' + esc(l.subject) + (o.showClass && l.class_name ? ' · ' + esc(l.class_name) : '') + '</div>' +
      '<div class="row-sub">' + (l.topic ? esc(l.topic) : 'Тема не указана') + '</div></div>' +
      '<div class="row-end">' + end.join('') + '<span class="chev">' + icon('chev', 16) + '</span></div></div>';
  }

  /** Уроки, сгруппированные по дням. */
  function byDays(lessons, today, rowOpts, opts) {
    opts = opts || {};
    var days = {}, order = [];
    if (opts.from) for (var i = 0; i < 7; i++) {
      var d = Logic.util.addDays(opts.from, i);
      if (i < 6 || lessons.some(function (l) { return l.date === d; })) { days[d] = []; order.push(d); }
    }
    lessons.forEach(function (l) { if (!days[l.date]) { days[l.date] = []; order.push(l.date); } days[l.date].push(l); });
    order.sort();
    if (!order.length) return '<div class="card empty">' + icon('calendar', 28) + '<div>' + esc(opts.empty || 'Уроков нет') + '</div></div>';
    return order.map(function (d) {
      var title = (d === today ? 'Сегодня · ' : '') + UI.dayLong(d);
      return '<div class="section-title">' + title + '</div><div class="card flat">' +
        (days[d].length ? days[d].map(function (l) { return lessonRow(l, rowOpts); }).join('') : '<div class="row"><div class="row-sub">Нет уроков</div></div>') +
        '</div>';
    }).join('');
  }

  /** История баллов. */
  function ledger(items, emptyText) {
    if (!items || !items.length) return '<div class="empty">' + esc(emptyText || 'Пока нет начислений') + '</div>';
    return items.map(function (l) {
      return '<div class="row"><div class="row-main"><div class="row-title wrap">' + esc(l.reason) + '</div><div class="row-sub">' +
        UI.dateTime(l.at) + '</div></div><div class="row-end" style="font-weight:700;font-size:15px;color:' +
        (l.amount > 0 ? 'var(--ok)' : 'var(--bad)') + '">' + UI.signed(l.amount) + '</div></div>';
    }).join('');
  }

  /** Достижения. */
  function badges(list) {
    return '<div class="badges">' + list.map(function (a) {
      return '<div class="badge' + (a.done ? ' done' : '') + '" data-act="hint" data-hint="' + esc(a.title + ': ' + a.desc) + '">' +
        '<div class="ic-wrap">' + icon(a.icon, 19) + '</div><div class="t">' + esc(a.title) + '</div>' +
        '<div class="p">' + (a.done ? 'получено' : a.value + ' / ' + a.target) + '</div></div>';
    }).join('') + '</div>';
  }

  /** Серия ДЗ подряд. */
  function streak(s) {
    if (!s || !s.length) {
      return '<div class="card"><div class="row-title">' + icon('flame', 18) + ' Серия ДЗ: ' + (s ? s.current : 0) + ' подряд</div></div>';
    }
    var inCycle = s.current % s.length, boxes = '';
    for (var i = 0; i < s.length; i++) boxes += '<i class="' + (i < inCycle ? 'on' : '') + '"></i>';
    return '<div class="card"><div class="row" style="padding:0;min-height:0"><div class="row-main"><div class="row-title">' +
      '<span style="color:var(--warn)">' + icon('flame', 18) + '</span> Серия ДЗ: ' + s.current + ' подряд</div>' +
      '<div class="row-sub">Ещё ' + s.toBonus + ' — и бонус +' + s.bonus + '</div></div></div>' +
      '<div class="streak">' + boxes + '</div></div>';
  }

  /** Блок «Лучшие». forTeacher — показывать значения (только учителю). */
  function top(t, forTeacher) {
    var mode = { points: 'по заработанным баллам', rating: 'по успеваемости', manual: 'выбор учителя' }[t.mode] +
      (t.mode !== 'manual' ? (t.period === 'month' ? ' · текущий месяц' : ' · за всё время') : '');
    var items = t.items.length ? t.items.map(function (x) {
      return '<div class="top-item' + (x.me ? ' me' : '') + '"><div class="place p' + x.place + '">' + x.place + '</div>' +
        '<div class="row-main">' + esc(x.name) + (x.me ? ' <span class="pill accent">это вы</span>' : '') + '</div>' +
        (forTeacher && x.value !== null && x.value !== undefined ? '<span class="sub">' + x.value + (t.mode === 'rating' ? ' / 100' : ' б.') + '</span>' : '') + '</div>';
    }).join('') : '<div class="empty" style="padding:14px">Пока никого — всё впереди</div>';
    return '<div class="card"><h3>' + icon('trophy', 18) + ' Лучшие · топ-' + t.size + '</h3><div class="sub" style="margin-bottom:6px">' + mode + '</div>' + items + '</div>';
  }

  /** Чек-лист подготовки (галочки хранятся только на телефоне ученика). */
  function checklist(lessonId, text) {
    var items = String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!items.length) return '';
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('uchpom_cl_' + lessonId) || '{}'); } catch (e) { /* ignore */ }
    return '<div class="section-title">' + icon('list', 15) + ' Чек-лист подготовки</div><div class="card checklist">' + items.map(function (it, i) {
      return '<label><input type="checkbox" data-change="cl" data-lesson="' + esc(lessonId) + '" data-i="' + i + '"' + (saved[i] ? ' checked' : '') +
        '><span>' + esc(it) + '</span></label>';
    }).join('') + '</div>';
  }
  function saveChecklist(el) {
    var key = 'uchpom_cl_' + el.dataset.lesson, saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { /* ignore */ }
    saved[el.dataset.i] = el.checked;
    localStorage.setItem(key, JSON.stringify(saved));
    UI.haptic('select');
  }

  /** Кнопка-ссылка на конспект. */
  function material(l) {
    if (!l.material_url) return '';
    var host = '';
    try { host = new URL(l.material_url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
    return '<div class="material" data-act="url" data-url="' + esc(l.material_url) + '">' + icon('file', 24) +
      '<div class="row-main"><div class="row-title">' + esc(l.material_name || 'Конспект урока') + '</div><div class="row-sub">' + esc(host) + '</div></div>' +
      icon('chev', 16) + '</div>';
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  return { ATT: ATT, HW: HW, attPill: attPill, hwPill: hwPill, hero: hero, lessonRow: lessonRow, byDays: byDays, ledger: ledger,
    badges: badges, streak: streak, top: top, checklist: checklist, saveChecklist: saveChecklist, material: material, greeting: greeting };
})();
