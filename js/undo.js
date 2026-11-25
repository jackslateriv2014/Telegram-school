/**
 * undo.js — экраны учителя «История изменений» и «Массовая отмена».
 *   История: последние сохранения за 30 дней, у каждого «Отменить» (и «Вернуть», если отменили по ошибке).
 *   Массовая отмена: класс → ученики → период → что снять → превью → одна кнопка.
 */
var Undo = (function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon, U = Logic.util;
  var S = App.state;

  // ═════════════════════════ История изменений ═════════════════════════
  App.screen('t.journal', {
    title: 'История изменений',
    load: function () { return Api.call('t.journal'); },
    render: function (d) {
      var html = '<button class="btn ghost block" data-act="go" data-screen="t.undo" style="margin-bottom:10px">' + icon('filter', 18) + ' Массовая отмена</button>' +
        '<div class="sub" style="margin:0 4px 10px">Последние сохранения за ' + d.days + ' дней. «Отменить» возвращает отметки и баллы, как было до этого действия. ' +
        'Отменили по ошибке — нажмите «Вернуть».</div>';
      if (!d.items.length) return html + '<div class="card empty">' + icon('history', 28) + '<div>Пока нечего отменять</div></div>';
      return html + '<div class="card flat">' + d.items.map(function (r) {
        var undone = r.status === 'undone';
        var btn = !r.canUndo ? '<span class="pill">нельзя отменить</span>'
          : undone ? '<button class="btn plain sm" data-act="redo" data-id="' + esc(r.id) + '">Вернуть</button>'
          : '<button class="btn ghost sm" data-act="undo" data-id="' + esc(r.id) + '">Отменить</button>';
        return '<div class="row"' + (undone ? ' style="opacity:.6"' : '') + '><div class="row-main"><div class="row-title wrap">' +
          (undone ? '<s>' + esc(r.title) + '</s>' : esc(r.title)) + '</div><div class="row-sub">' + UI.dateTime(r.at) +
          (r.students ? ' · ' + r.students + ' уч.' : '') + (r.amount ? ' · ' + UI.signed(r.amount) + ' б.' : '') +
          (undone ? ' · отменено' : '') + '</div></div>' + btn + '</div>';
      }).join('') + '</div>';
    },
    actions: {
      undo: function (el) { act('t.journal.undo', el.dataset.id, 'Отменено'); },
      redo: function (el) { act('t.journal.redo', el.dataset.id, 'Возвращено'); }
    }
  });
  function act(action, id, ok) {
    App.run(action, { id: id }).then(function (r) {
      UI.toast(r.skipped ? ok + '. Не тронуто изменений: ' + r.skipped + ' — их меняли позже.' : ok);
    });
  }

  // ═════════════════════════ Массовая отмена ═════════════════════════
  var KINDS = [['attendance', 'Посещаемость'], ['homework', 'Домашнее задание'], ['grade', 'Оценки'],
    ['uniform', 'Школьная форма'], ['activity', 'Активность'], ['manual', 'Баллы, начисленные вручную']];
  var M = null; // состояние фильтра (живёт, пока открыт экран)
  function state(p, d) {
    var key = p.lessonId ? 'l:' + p.lessonId : 'all';
    if (!M || M.key !== key) {
      var today = d.today || U.fmtDate(new Date());
      M = { key: key, lessonId: p.lessonId || '', classId: d.classId || '', pick: false, studentIds: [],
        from: today, to: today, range: 'today', kinds: p.lessonId ? ['attendance', 'homework', 'grade', 'uniform', 'activity'] : ['homework', 'grade'],
        preview: null, loading: false, seq: 0 };
    }
    if (d.classId && !M.lessonId) M.classId = d.classId;
    return M;
  }
  function params() {
    return { lessonId: M.lessonId, classId: M.lessonId ? '' : M.classId, studentIds: M.pick ? M.studentIds : [],
      from: M.from, to: M.to, kinds: M.kinds.filter(function (k) { return !M.lessonId || k !== 'manual'; }) };
  }
  function refresh() {
    var seq = ++M.seq;
    M.loading = true;
    if (!M.kinds.length || (M.pick && !M.studentIds.length)) { M.preview = null; M.loading = false; return App.repaint(true); }
    App.repaint(true);
    Api.call('t.mass.preview', params()).then(function (r) {
      if (seq !== M.seq) return;
      M.preview = r; M.loading = false; App.repaint(true);
    }, function (e) { if (seq !== M.seq) return; M.preview = { error: e.message }; M.loading = false; App.repaint(true); });
  }
  function setRange(kind, today) {
    var t = today, mon = U.mondayOf(t);
    var r = { today: [t, t], yesterday: [U.addDays(t, -1), U.addDays(t, -1)], week: [mon, t], month: [t.slice(0, 8) + '01', t] }[kind];
    M.range = kind; M.from = r[0]; M.to = r[1];
  }

  App.screen('t.undo', {
    title: function (d, p) { return p && p.lessonId ? 'Отменить отметки урока' : 'Массовая отмена'; },
    load: function (p) {
      if (p.lessonId) {
        return Api.call('t.lesson', { id: p.lessonId }).then(function (d) {
          return { lesson: d.lesson, students: d.students.map(function (s) { return { id: s.id, name: s.name }; }), classes: [], today: d.today };
        });
      }
      return Api.call('t.journal').then(function (j) {
        var cid = (M && M.key === 'all' && M.classId) || p.classId || (j.classes[0] && j.classes[0].id) || '';
        if (!cid) return { classes: j.classes, students: [], classId: '' };
        return Api.call('t.class', { id: cid }).then(function (c) {
          return { classes: j.classes, students: c.students.map(function (s) { return { id: s.id, name: s.name }; }), classId: cid };
        });
      });
    },
    mount: function (view, d, p) { var m = state(p, d); if (!m.preview && !m.loading) refresh(); },
    render: function (d, p) {
      var m = state(p, d), today = d.today || U.fmtDate(new Date()), html = '';
      if (m.lessonId) {
        html += '<div class="card"><div class="row-title">' + esc(d.lesson.class_name || '') + ' · ' + esc(d.lesson.subject) + '</div><div class="sub">' +
          UI.dayLong(d.lesson.date) + ', ' + esc(d.lesson.start) + '</div></div>';
      } else {
        if (!d.classes.length) return '<div class="card empty">' + icon('users', 28) + '<div>Классов пока нет</div></div>';
        html += '<div class="section-title">Класс</div><div class="chips wrap">' + d.classes.map(function (c) {
          return '<button class="chip' + (c.id === m.classId ? ' on' : '') + '" data-act="cls" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
        }).join('') + '</div>';
      }
      html += '<div class="section-title">Ученики</div><div class="seg"><button data-act="pick" data-v="0" class="' + (m.pick ? '' : 'on') + '">Все</button>' +
        '<button data-act="pick" data-v="1" class="' + (m.pick ? 'on' : '') + '">Выбрать' + (m.pick && m.studentIds.length ? ' · ' + m.studentIds.length : '') + '</button></div>';
      if (m.pick) {
        html += '<div class="card picklist">' + d.students.map(function (s) {
          return '<label><input type="checkbox" data-change="stu" data-id="' + esc(s.id) + '"' + (m.studentIds.indexOf(String(s.id)) >= 0 ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>';
        }).join('') + '</div>';
      }
      if (!m.lessonId) {
        html += '<div class="section-title">Период</div><div class="chips wrap">' +
          [['today', 'Сегодня'], ['yesterday', 'Вчера'], ['week', 'Эта неделя'], ['month', 'Этот месяц']].map(function (r) {
            return '<button class="chip' + (m.range === r[0] ? ' on' : '') + '" data-act="range" data-v="' + r[0] + '">' + r[1] + '</button>';
          }).join('') + '</div><div class="field-row">' +
          '<label class="field"><span>С</span><input class="input" type="date" data-change="from" value="' + esc(m.from) + '" max="' + esc(today) + '"></label>' +
          '<label class="field"><span>По</span><input class="input" type="date" data-change="to" value="' + esc(m.to) + '" max="' + esc(today) + '"></label></div>';
      }
      html += '<div class="section-title">Что отменить</div><div class="card picklist">' + KINDS.filter(function (k) { return !m.lessonId || k[0] !== 'manual'; }).map(function (k) {
        return '<label><input type="checkbox" data-change="kind" data-k="' + k[0] + '"' + (m.kinds.indexOf(k[0]) >= 0 ? ' checked' : '') + '><span>' + k[1] + '</span></label>';
      }).join('') + '</div><div class="sub" style="margin:-4px 4px 12px">Покупки наград здесь не отменяются.</div>';
      html += previewHtml(m);
      return html;
    },
    actions: {
      cls: function (el) { M.classId = el.dataset.id; M.studentIds = []; M.preview = null; App.reload(); },
      pick: function (el) { M.pick = el.dataset.v === '1'; refresh(); },
      stu: function (el) {
        var id = String(el.dataset.id), i = M.studentIds.indexOf(id);
        if (el.checked && i < 0) M.studentIds.push(id);
        if (!el.checked && i >= 0) M.studentIds.splice(i, 1);
        refresh();
      },
      range: function (el, d) { setRange(el.dataset.v, d.today || U.fmtDate(new Date())); refresh(); },
      from: function (el) { if (el.value) { M.from = el.value; M.range = ''; refresh(); } },
      to: function (el) { if (el.value) { M.to = el.value; M.range = ''; refresh(); } },
      kind: function (el) {
        var k = el.dataset.k, i = M.kinds.indexOf(k);
        if (el.checked && i < 0) M.kinds.push(k);
        if (!el.checked && i >= 0) M.kinds.splice(i, 1);
        refresh();
      },
      apply: function () {
        var pv = M.preview, n = pv.marks + pv.manual;
        UI.confirm('Отменить ' + n + ' ' + UI.plural(n, ['запись', 'записи', 'записей']) + ' у ' + pv.students.length + ' уч.? Баллы: ' + UI.signed(pv.amount) +
          '. Если ошиблись — это можно вернуть в «Истории изменений».', 'Отменить', true).then(function (ok) {
          if (!ok) return;
          App.run('t.mass.apply', params(), { ok: 'Готово. Вернуть можно в «Истории изменений»', reload: false }).then(function () {
            M = null; App.back(); App.reload();
          });
        });
      }
    }
  });

  function previewHtml(m) {
    var pv = m.preview;
    if (!m.kinds.length) return '<div class="card sub">Отметьте, что отменить.</div>';
    if (m.pick && !m.studentIds.length) return '<div class="card sub">Выберите хотя бы одного ученика.</div>';
    if (!pv) return '<div class="card sub">' + (m.loading ? 'Считаю…' : '') + '</div>';
    if (pv.error) return '<div class="card" style="color:var(--bad)">' + esc(pv.error) + '</div>';
    var n = pv.marks + pv.manual;
    if (!n) return '<div class="card empty">' + icon('check', 26) + '<div>Под фильтр ничего не попало</div></div>';
    var parts = [];
    if (pv.marks) parts.push(pv.marks + ' ' + UI.plural(pv.marks, ['отметка', 'отметки', 'отметок']));
    if (pv.manual) parts.push(pv.manual + ' ' + UI.plural(pv.manual, ['ручная запись', 'ручные записи', 'ручных записей']));
    var list = pv.students.slice(0, 8).map(function (s) {
      return '<div class="row" style="min-height:0;padding:6px 0"><div class="row-main">' + esc(s.name) + '</div><span class="sub">' + UI.signed(s.amount) + ' б.</span></div>';
    }).join('') + (pv.students.length > 8 ? '<div class="sub">и ещё ' + (pv.students.length - 8) + ' уч.</div>' : '');
    return '<div class="card"' + (m.loading ? ' style="opacity:.6"' : '') + '><h3>Будет отменено</h3><div class="sub" style="margin-bottom:6px">' + parts.join(', ') + ' · ' +
      pv.students.length + ' уч. · баллы ' + UI.signed(pv.amount) + '</div>' + list + '</div>' +
      (pv.tooMany ? '<div class="card" style="color:var(--bad)">Слишком много за один раз. Выберите период короче или меньше учеников.</div>'
        : '<button class="btn danger block" data-act="apply">' + icon('trash', 18) + ' Отменить ' + n + ' ' + UI.plural(n, ['запись', 'записи', 'записей']) + '</button>');
  }

  return {};
})();
