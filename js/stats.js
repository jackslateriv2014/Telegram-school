/**
 * stats.js — «Посещаемость и оценки» за месяц.
 *   Кольцо посещаемости (был / опоздал / уважительная / не был), сетка «ученики × уроки» с оценками в кружках,
 *   средний балл и оценки по предметам.
 *   Учитель — весь класс (свои предметы или любой), ученик и родитель — только своя строка.
 */
var Stats = (function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;
  var COLORS = { present: '#2fb36b', late: '#f08c2e', excused: '#3d8bf0', absent: '#e5484d' };
  var LABELS = [['present', 'Был'], ['late', 'Опоздал'], ['excused', 'Уважительная'], ['absent', 'Не был']];
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MSHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  function monthTitle(m) { return MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
  function dayLabel(ds) { return (+ds.slice(8, 10)) + ' ' + MSHORT[+ds.slice(5, 7) - 1]; }

  // Кольцо: доли посещаемости
  function donut(sum) {
    var total = sum.present + sum.late + sum.excused + sum.absent, r = 42, len = 2 * Math.PI * r, off = 0, arcs = '';
    if (total) LABELS.forEach(function (k) {
      var v = sum[k[0]];
      if (!v) return;
      var part = v / total * len;
      arcs += '<circle cx="55" cy="55" r="' + r + '" fill="none" stroke="' + COLORS[k[0]] + '" stroke-width="13" stroke-dasharray="' +
        Math.max(0, part - 1.5).toFixed(2) + ' ' + (len - part + 1.5).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 55 55)"/>';
      off += part;
    });
    return '<svg class="donut" width="120" height="120" viewBox="0 0 110 110"><circle cx="55" cy="55" r="' + r + '" fill="none" stroke="var(--soft)" stroke-width="13"/>' + arcs +
      '<text x="55" y="56" text-anchor="middle" class="d-big">' + (sum.pct === null || sum.pct === undefined ? '—' : sum.pct + '%') + '</text>' +
      '<text x="55" y="72" text-anchor="middle" class="d-sub">посещ.</text></svg>';
  }
  function attendanceCard(sum) {
    return '<div class="card st-att">' + donut(sum) + '<div class="st-legend">' + LABELS.map(function (k) {
      return '<div><b><i style="background:' + COLORS[k[0]] + '"></i>' + sum[k[0]] + '</b><span>' + k[1] + '</span></div>';
    }).join('') + '</div></div>';
  }
  function gradesCard(sum, subjects) {
    if (!sum.grades) return '';
    var max = Math.max(1, sum.grades[5], sum.grades[4], sum.grades[3], sum.grades[2]);
    return '<div class="card st-grades"><div class="st-avg"><div class="big">' + (sum.avg === null ? '—' : String(sum.avg).replace('.', ',')) + '</div><div class="sub">средний балл</div></div>' +
      '<div class="st-bars">' + [5, 4, 3, 2].map(function (g) {
        return '<div class="st-bar"><span class="g g' + g + '">' + g + '</span><div class="track"><i class="g' + g + '" style="width:' + Math.round(sum.grades[g] / max * 100) + '%"></i></div><b>' + sum.grades[g] + '</b></div>';
      }).join('') + '</div></div>' +
      (subjects && subjects.length ? '<div class="card flat">' + subjects.map(function (s) {
        return '<div class="row" style="min-height:0;padding:9px 14px"><div class="row-main">' + esc(s.subject) + '</div><span class="sub">' + s.n + ' ' + UI.plural(s.n, ['оценка', 'оценки', 'оценок']) +
          '</span><span class="avg-pill">' + String(s.avg).replace('.', ',') + '</span></div>';
      }).join('') + '</div>' : '');
  }
  function monthNav(d, sub) {
    return '<div class="st-month"><button class="back" data-act="month" data-m="' + d.prev + '" aria-label="Прошлый месяц">' + icon('left') + '</button>' +
      '<div class="t"><b>' + monthTitle(d.month) + '</b><div class="sub">' + sub + '</div></div>' +
      '<button class="back" data-act="month" data-m="' + (d.next || '') + '"' + (d.next ? '' : ' disabled') + ' aria-label="Следующий месяц">' + icon('chev') + '</button></div>';
  }
  var LEGEND = '<div class="st-keys">' + LABELS.map(function (k) { return '<span><i style="background:' + COLORS[k[0]] + '"></i>' + k[1] + '</span>'; }).join('') +
    '<span><i class="none"></i>Нет отметки</span></div>';
  function dot(c) {
    if (c.future) return '<span class="dot future"></span>';
    var txt = c.g ? c.g : c.a ? '–' : '·';
    return '<span class="dot' + (c.a ? '' : ' none') + '"' + (c.a ? ' style="background:' + COLORS[c.a] + '"' : '') + '>' + txt + '</span>';
  }
  function cell(c) { return '<td>' + dot(c) + '</td>'; }
  // Один ученик: кружки переносятся по строкам — без прокрутки вбок
  function days(lessons, cells) {
    if (!lessons.length) return '<div class="card empty">' + icon('calendar', 26) + '<div>В этом месяце уроков нет</div></div>';
    return '<div class="st-days">' + lessons.map(function (l, i) {
      return '<div class="st-day">' + dot(cells[i]) + '<small>' + dayLabel(l.date) + '</small><small class="s">' + esc(l.subject) + '</small></div>';
    }).join('') + '</div>';
  }
  function initials(name) {
    var p = String(name).trim().split(/\s+/);
    return ((p[0] || '').charAt(0) + (p[1] || '').charAt(0)).toUpperCase();
  }
  function shortName(n) { var p = String(n).trim().split(/s+/); return p[0] + (p[1] ? ' ' + p[1].charAt(0) + '.' : ''); }
  // таблица сразу показывает последние даты месяца
  function toEnd(view) { var g = view.querySelector('.st-grid'); if (g) g.scrollLeft = g.scrollWidth; }
  var HUES = ['#e5484d', '#2fb36b', '#7c5cff', '#f08c2e', '#3d8bf0', '#d6409f', '#12a594'];
  function grid(lessons, rows, opts) {
    if (!lessons.length) return '<div class="card empty">' + icon('calendar', 26) + '<div>В этом месяце уроков нет</div></div>';
    var head = '<tr><th class="who">' + (opts.single ? '' : 'Ученики') + '</th>' + lessons.map(function (l) {
      return '<th><span class="dpill">' + dayLabel(l.date) + '</span>' + (opts.showSubj ? '<small>' + esc(l.subject.slice(0, 6)) + '</small>' : '') + '</th>';
    }).join('') + '</tr>';
    var body = rows.map(function (r, i) {
      return '<tr' + (r.me ? ' class="me"' : '') + '><th class="who"><span class="place">' + (opts.single ? '' : i + 1) + '</span>' +
        '<span class="ini" style="background:' + HUES[i % HUES.length] + '">' + esc(initials(r.name)) + '</span><span class="nm">' + esc(r.label || shortName(r.name)) +
        (r.sum && r.sum.pct !== null && !opts.single ? '<small>' + r.sum.pct + '%' + (r.sum.avg ? ' · ' + String(r.sum.avg).replace('.', ',') : '') + '</small>' : '') + '</span></th>' +
        r.cells.map(cell).join('') + '</tr>';
    }).join('');
    return '<div class="st-grid"><table>' + head + body + '</table></div>';
  }

  // ─────────── Учитель: класс ───────────
  App.screen('t.stats', {
    title: 'Посещаемость и оценки',
    mount: toEnd,
    load: function (p) { return Api.call('t.stats', { classId: p.classId || App.state.statsClass || '', month: p.month || '', subject: p.subject !== undefined ? p.subject : '' }); },
    render: function (d) {
      if (!d.cls) return '<div class="card empty">' + icon('users', 28) + '<div>Сначала создайте класс</div></div>';
      App.state.statsClass = d.cls.id;
      var html = d.classes.length > 1 ? '<div class="chips">' + d.classes.map(function (c) {
        return '<button class="chip' + (c.id === d.cls.id ? ' on' : '') + '" data-act="cls" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' : '';
      var subjChips = (d.mine.length ? [['', 'Мои предметы']] : []).concat(d.subjects.map(function (s) { return [s, s]; })).concat([['*', 'Все']]);
      html += '<div class="chips">' + subjChips.map(function (s) {
        return '<button class="chip' + (s[0] === d.subject || (!d.subject && !d.mine.length && s[0] === '*') ? ' on' : '') + '" data-act="subj" data-s="' + esc(s[0]) + '">' + esc(s[1]) + '</button>';
      }).join('') + '</div>';
      html += attendanceCard(d.total);
      var subjName = d.subject === '*' || (!d.subject && !d.mine.length) ? 'все предметы' : d.subject || d.mine.join(', ');
      html += '<div class="card st-card">' + monthNav(d, esc(d.cls.name) + ' · ' + esc(subjName) + ' · уроков: ' + d.lessons.length) + LEGEND +
        grid(d.lessons, d.rows, { showSubj: d.subject === '*' || (!d.subject && d.mine.length !== 1) }) + '</div>';
      html += '<div class="sub" style="margin:0 4px 12px">В кружке — оценка, «–» — отметка без оценки. Сверху — лучшая посещаемость. Ученики видят только свою строку.</div>';
      html += '<div class="section-title">Оценки класса</div>' + gradesCard(d.total);
      return html;
    },
    actions: {
      cls: function (el) { App.state.statsClass = el.dataset.id; App.replaceParams({ classId: el.dataset.id }); App.reload(); },
      subj: function (el, d) { App.replaceParams({ classId: d.cls.id, month: d.month, subject: el.dataset.s }); App.reload(); },
      month: function (el, d) { if (!el.dataset.m) return; App.replaceParams({ classId: d.cls.id, month: el.dataset.m, subject: d.subject }); App.reload(); }
    }
  });

  // ─────────── Ученик и родитель: своя строка ───────────
  function pupilRender(d, who) {
    var html = '';
    if (d.streak) html += '<div class="st-streak">' + icon('flame', 15) + ' Серия: ' + d.streak + ' ' + UI.plural(d.streak, ['урок', 'урока', 'уроков']) + ' без пропусков</div>';
    if (d.show.attendance) html += attendanceCard(d.sum);
    html += '<div class="card st-card">' + monthNav(d, 'уроков: ' + d.lessons.length) + (d.show.attendance ? LEGEND : '') +
      days(d.lessons, d.cells) + '</div>';
    if (d.show.homework) html += '<div class="section-title">Оценки</div>' + gradesCard(d.sum, d.subjects);
    return html;
  }
  App.screen('s.stats', {
    title: 'Оценки',
    mount: toEnd,
    load: function (p) { return Api.call('s.stats', { month: p.month || '' }); },
    render: function (d) { return pupilRender(d, 'Вы'); },
    actions: { month: function (el) { if (!el.dataset.m) return; App.replaceParams({ month: el.dataset.m }); App.reload(); } }
  });
  App.screen('p.stats', {
    title: 'Посещаемость и оценки',
    mount: toEnd,
    load: function (p) { return Api.call('p.stats', { month: p.month || '', studentId: p.studentId || App.state.childId || '' }); },
    render: function (d) {
      var html = d.children.length > 1 ? '<div class="chips">' + d.children.map(function (c) {
        return '<button class="chip' + (c.id === d.childId ? ' on' : '') + '" data-act="kid" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' : '';
      return html + pupilRender(d, d.name.split(' ')[0]);
    },
    actions: {
      month: function (el, d) { if (!el.dataset.m) return; App.replaceParams({ month: el.dataset.m, studentId: d.childId }); App.reload(); },
      kid: function (el, d) { App.state.childId = el.dataset.id; App.replaceParams({ month: d.month, studentId: el.dataset.id }); App.reload(); }
    }
  });

  return { donut: donut };
})();
