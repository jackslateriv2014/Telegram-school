/**
 * check.js — проверка домашнего задания:
 *   «Проверка ДЗ» (календарь проверок + настройка: мои предметы, дни проверки, что спрашивать, напоминания)
 *   «Мастер проверки» — 3 шага: 1) кто пришёл  2) по одному ученику: ДЗ, оценка, форма  3) итог и одна отправка.
 *
 * Пока учитель отмечает, всё хранится в памяти телефона (черновик). На сервер уходит один запрос —
 * по кнопке «Отправить». Если связи нет, черновик остаётся, и его можно отправить позже.
 */
var Check = (function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;
  function noop() { /* ошибка уже показана */ }

  // ─── Черновики в памяти телефона ───
  var DKEY = 'uchpom_check_';
  var live = {}; // открытые черновики: ключ → состояние
  function draftKey(l) { return l.template_id && l.orig_date ? 't~' + l.template_id + '~' + l.orig_date : l.id; }
  function readDraft(key) { try { return JSON.parse(localStorage.getItem(DKEY + key) || 'null'); } catch (e) { return null; } }
  function saveDraft(D) {
    D.touched = true; D.at = Date.now();
    try { localStorage.setItem(DKEY + D.key, JSON.stringify(D)); } catch (e) { /* нет места — останется в памяти */ }
  }
  function dropDraft(D) { delete live[D.key]; try { localStorage.removeItem(DKEY + D.key); } catch (e) { /* ignore */ } }
  /** Незавершённые проверки (начатые, но не отправленные). */
  function drafts() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(DKEY) === 0) { var d = readDraft(k.slice(DKEY.length)); if (d && d.touched) out.push(d); }
      }
    } catch (e) { /* ignore */ }
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  var HERE = { present: 1, late: 1 };
  function here(D) { return D.students.filter(function (s) { return HERE[D.marks[s.id].attendance]; }); }
  function complete(D, m) {
    return !!m.homework && (!D.ask.grade || m.grade !== null) && (!D.ask.uniform || m.uniform !== null);
  }

  // Черновик из данных урока (или продолжение уже начатого)
  function getDraft(d, p) {
    var key = draftKey(d.lesson);
    var D = live[key] && live[key].touched ? live[key] : readDraft(key);
    if (!D) {
      var wasChecked = d.lesson.check === 'done';
      D = { key: key, id: p.id, step: 'att', idx: 0, sid: null, select: null, status: '', ask: d.ask, students: [], marks: {} };
      d.students.forEach(function (s) {
        var m = s.mark || {};
        D.marks[s.id] = {
          attendance: m.attendance || 'present', homework: m.homework || '',
          grade: m.grade ? m.grade : wasChecked ? 0 : null,
          uniform: m.uniform ? m.uniform : wasChecked ? '' : null
        };
      });
      if (wasChecked) D.step = 'sum';
    }
    // новые ученики класса, появившиеся после начала проверки
    D.students = d.students.map(function (s) { return { id: s.id, name: s.name }; });
    D.students.forEach(function (s) {
      if (!D.marks[s.id]) D.marks[s.id] = { attendance: 'present', homework: '', grade: null, uniform: null };
    });
    D.ask = d.ask;
    D.title = d.lesson.subject + ' · ' + d.lesson.class_name;
    D.date = d.lesson.date; D.start = d.lesson.start;
    live[key] = D;
    return D;
  }

  // ═════════════════════════ Мастер проверки ═════════════════════════
  var STEPS = [['att', '1 · Пришли'], ['one', '2 · ДЗ'], ['sum', '3 · Итог']];
  var ATT_NEXT = { present: 'absent', absent: 'late', late: 'present', excused: 'present', '': 'present' };

  App.screen('t.check', {
    title: null,
    load: function (p) { return Api.call('t.lesson', { id: p.id }); },
    render: function (d, p) {
      var D = getDraft(d, p);
      var head = '<div class="kicker">Проверка ДЗ · ' + UI.relDay(d.lesson.date, d.today) + ', ' + d.lesson.start + '</div>' +
        '<div class="topline"><h1>' + esc(D.title) + '</h1></div>' +
        (d.prevHomework ? '<div class="card wz-hw">' + icon('book', 18) + '<div class="row-main"><div class="sub">Задано ' + UI.dayShort(d.prevHomework.date) + '</div>' +
          '<div class="textblock">' + esc(d.prevHomework.text) + '</div></div></div>' : '') +
        '<div class="seg">' + STEPS.map(function (s) {
          return '<button data-act="step" data-step="' + s[0] + '" class="' + (D.step === s[0] ? 'on' : '') + '">' + s[1] + '</button>';
        }).join('') + '</div>';
      if (!D.students.length) return head + '<div class="card empty">' + icon('users', 28) + '<div>В классе пока нет учеников</div></div>';
      return head + (D.step === 'att' ? attView(D) : D.step === 'one' ? oneView(D) : sumView(D));
    },
    prefetch: function () { return [{ key: 't.checks', params: {} }]; },
    actions: {
      step: function (el, d, p) { var D = getDraft(d, p); go(D, el.dataset.step, 0); },
      // шаг 1
      att: function (el, d, p) {
        var D = getDraft(d, p), m = D.marks[el.dataset.sid];
        m.attendance = ATT_NEXT[m.attendance || ''];
        UI.haptic('select'); saveDraft(D); App.repaint(true);
      },
      allHere: function (el, d, p) { var D = getDraft(d, p); setAll(D, D.students, { attendance: 'present' }); App.repaint(true); },
      noneHere: function (el, d, p) {
        var D = getDraft(d, p);
        UI.confirm('Отметить, что весь класс отсутствует?', 'Да, никого нет').then(function (ok) {
          if (ok) { setAll(D, D.students, { attendance: 'absent' }); go(D, 'sum'); }
        });
      },
      toOne: function (el, d, p) { var D = getDraft(d, p); go(D, here(D).length ? 'one' : 'sum', 0); },
      // шаг 2
      pick: function (el, d, p) {
        var D = getDraft(d, p), s = current(D);
        if (!s) return;
        var m = D.marks[s.id], f = el.dataset.f, v = el.dataset.v;
        if (f === 'grade') v = +v;
        var before = complete(D, m);
        m[f] = v;
        if (f === 'attendance' && !HERE[v]) { m.homework = ''; }
        UI.haptic('light'); saveDraft(D);
        if (f === 'attendance' && !HERE[v]) return advance(D, s);
        App.repaint(true);
        // всё отвечено — сам переходим к следующему ученику
        if (complete(D, m) && !before) setTimeout(function () { var c = current(D); if (c && String(c.id) === String(s.id)) advance(D, c); }, 260);
      },
      prev: function (el, d, p) { var D = getDraft(d, p); if (D.idx > 0) { D.idx--; saveDraft(D); App.repaint(true); } },
      next: function (el, d, p) { var D = getDraft(d, p); var s = current(D); if (s) advance(D, s); },
      backToSum: function (el, d, p) { var D = getDraft(d, p); D.sid = null; go(D, 'sum'); },
      // шаг 3
      open: function (el, d, p) {
        var D = getDraft(d, p), sid = el.dataset.sid;
        if (D.select) { toggleSel(D, sid); return App.repaint(true); }
        D.sid = sid; go(D, 'one');
      },
      selMode: function (el, d, p) { var D = getDraft(d, p); D.select = D.select ? null : {}; App.repaint(true); },
      selAll: function (el, d, p) {
        var D = getDraft(d, p), all = D.students.every(function (s) { return D.select[s.id]; });
        D.select = {};
        if (!all) D.students.forEach(function (s) { D.select[s.id] = true; });
        App.repaint(true);
      },
      bulk: function (el, d, p) {
        var D = getDraft(d, p), list = D.students.filter(function (s) { return D.select && D.select[s.id]; });
        if (!list.length) return UI.toast('Сначала отметьте учеников');
        var f = el.dataset.f, v = el.dataset.v;
        if (f === 'grade') return gradeSheet(function (g) { setAll(D, list.filter(isHere(D)), { grade: g }); D.select = null; App.repaint(true); });
        var patch = {}; patch[f] = v;
        if (f === 'attendance' && !HERE[v]) patch.homework = '';
        setAll(D, f === 'attendance' ? list : list.filter(isHere(D)), patch);
        D.select = null; App.repaint(true);
      },
      continueOne: function (el, d, p) {
        var D = getDraft(d, p), h = here(D), i = h.findIndex(function (s) { return !complete(D, D.marks[s.id]); });
        go(D, 'one', i < 0 ? 0 : i);
      },
      send: function (el, d, p) { send(getDraft(d, p)); }
    }
  });

  function isHere(D) { return function (s) { return HERE[D.marks[s.id].attendance]; }; }
  function setAll(D, list, patch) {
    list.forEach(function (s) { Object.assign(D.marks[s.id], patch); });
    UI.haptic('light'); saveDraft(D);
  }
  function toggleSel(D, sid) { if (D.select[sid]) delete D.select[sid]; else D.select[sid] = true; UI.haptic('select'); }
  function go(D, step, idx) {
    D.step = step;
    if (idx !== undefined) D.idx = idx;
    if (step !== 'one') D.sid = null;
    D.select = null;
    saveDraft(D); App.repaint(true); window.scrollTo(0, 0);
  }
  // Кто сейчас на экране шага 2: выбранный из итога (sid) или очередной из присутствующих
  function current(D) {
    if (D.sid) return D.students.find(function (s) { return String(s.id) === String(D.sid); }) || null;
    return here(D)[D.idx] || null;
  }
  function advance(D, s) {
    if (D.sid) { D.sid = null; return go(D, 'sum'); }
    var h = here(D), i = h.findIndex(function (x) { return String(x.id) === String(s.id); });
    // ученик мог только что стать «нет на уроке» — тогда следующий встал на его место
    var nextIdx = i < 0 ? D.idx : i + 1;
    if (nextIdx >= h.length) return go(D, 'sum');
    D.idx = nextIdx; saveDraft(D); App.repaint(true);
  }

  // ─── Шаг 1: кто пришёл ───
  var ATT_LABEL = { present: ['пришёл', 'ok'], absent: ['нет', 'bad'], late: ['опоздал', 'warn'], excused: ['уваж.', ''] };
  function attView(D) {
    var h = here(D).length;
    return '<div class="sub" style="margin:0 4px 10px">Все отмечены «пришёл». Нажмите на тех, кого нет: один раз — «нет», ещё раз — «опоздал».</div>' +
      '<div class="card flat">' + D.students.map(function (s) {
        var a = ATT_LABEL[D.marks[s.id].attendance] || ATT_LABEL.present;
        return '<div class="row tap wz-att" data-act="att" data-sid="' + esc(s.id) + '"><div class="row-main"><div class="row-title wrap">' + esc(s.name) + '</div></div>' +
          '<span class="pill ' + a[1] + ' big">' + a[0] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="btn-row"><button class="btn plain sm" data-act="allHere">' + icon('check', 16) + ' Все пришли</button>' +
      '<button class="btn plain sm" data-act="noneHere">' + icon('x', 16) + ' Весь класс отсутствует</button></div>' +
      '<div class="sticky-bottom"><button class="btn block" data-act="toOne">Дальше: проверка ДЗ · ' + h + ' ' +
      UI.plural(h, ['ученик', 'ученика', 'учеников']) + ' ' + icon('chev', 18) + '</button></div>';
  }

  // ─── Шаг 2: один ученик — один экран ───
  function choice(f, v, label, cls, cur) {
    return '<button class="wz-b ' + (String(cur) === String(v) ? 'on ' + cls : '') + '" data-act="pick" data-f="' + f + '" data-v="' + v + '">' + label + '</button>';
  }
  function oneView(D) {
    var s = current(D), h = here(D);
    if (!s) {
      return '<div class="card empty">' + icon('check', 28) + '<div>' + (h.length ? 'Все ученики проверены' : 'На уроке никого нет') + '</div></div>' +
        '<button class="btn block" data-act="backToSum">К итогу</button>';
    }
    var m = D.marks[s.id], pos = D.sid ? null : D.idx + 1;
    var html = '<div class="wz-nav">' +
      (D.sid ? '<button class="link-btn" data-act="backToSum">' + icon('left', 16) + ' к итогу</button>' :
        '<button class="back" data-act="prev" aria-label="Предыдущий"' + (D.idx ? '' : ' disabled') + '>' + icon('left') + '</button>') +
      '<div class="row-main" style="text-align:center">' + (pos ? '<b>' + pos + '</b> из ' + h.length : 'исправление') + '</div>' +
      (D.sid ? '<span style="width:36px"></span>' : '<button class="back" data-act="next" aria-label="Следующий">' + icon('chev') + '</button>') + '</div>' +
      (pos ? '<div class="progress ok" style="margin:0 0 12px"><i style="width:' + Math.round((pos - 1) / h.length * 100) + '%"></i></div>' : '');
    html += '<div class="card wz-card"><div class="wz-name">' + esc(s.name) + '</div>' +
      '<div class="wz-mini">' + choice('attendance', 'present', 'пришёл', 'ok', m.attendance) + choice('attendance', 'late', 'опоздал', 'warn', m.attendance) +
      choice('attendance', 'absent', 'нет на уроке', 'bad', m.attendance) + '</div>';
    if (HERE[m.attendance]) {
      html += '<div class="wz-lbl">Домашнее задание</div><div class="wz-grid c3">' +
        choice('homework', 'done', icon('check', 18) + ' Принёс', 'ok', m.homework) + choice('homework', 'partial', '½ Частично', 'warn', m.homework) +
        choice('homework', 'none', icon('x', 18) + ' Нет', 'bad', m.homework) + '</div>';
      if (D.ask.grade) {
        html += '<div class="wz-lbl">Оценка</div><div class="wz-grid c5">' + choice('grade', 0, '—', '', m.grade) +
          [2, 3, 4, 5].map(function (g) { return choice('grade', g, g, g >= 4 ? 'ok' : g === 3 ? 'warn' : 'bad', m.grade); }).join('') + '</div>';
      }
      if (D.ask.uniform) {
        html += '<div class="wz-lbl">Школьная форма</div><div class="wz-grid c2">' + choice('uniform', 'yes', 'В форме', 'ok', m.uniform) +
          choice('uniform', 'no', 'Без формы', 'bad', m.uniform) + '</div>';
      }
    }
    html += '</div><div class="sub" style="text-align:center;margin:4px 4px 0">' +
      (D.sid ? 'После ответа вернётесь к итогу' : 'Когда всё отмечено, сразу откроется следующий ученик') + '</div>';
    html += '<div class="sticky-bottom"><div class="btn-row">' +
      (D.sid ? '<button class="btn" data-act="backToSum">Готово</button>' :
        '<button class="btn plain" data-act="backToSum">К итогу</button><button class="btn ghost" data-act="next">Следующий ' + icon('chev', 18) + '</button>') +
      '</div></div>';
    return html;
  }

  // ─── Шаг 3: итог, исправления, одна отправка ───
  function sumView(D) {
    var h = here(D), withHw = 0, sum = 0, cnt = 0, todo = 0;
    h.forEach(function (s) {
      var m = D.marks[s.id];
      if (m.homework === 'done') withHw++;
      if (m.grade) { sum += m.grade; cnt++; }
      if (!complete(D, m)) todo++;
    });
    var html = '<div class="tiles three"><div class="tile"><div class="val">' + h.length + '<small>/' + D.students.length + '</small></div><div class="lbl">пришли</div></div>' +
      '<div class="tile"><div class="val">' + withHw + '</div><div class="lbl">принесли ДЗ</div></div>' +
      '<div class="tile"><div class="val">' + (cnt ? (sum / cnt).toFixed(1).replace('.', ',') : '—') + '</div><div class="lbl">средняя оценка</div></div></div>';
    if (todo) {
      html += '<div class="card wz-todo"><div class="row-main">Не проверено: <b>' + todo + '</b> ' + UI.plural(todo, ['ученик', 'ученика', 'учеников']) + '</div>' +
        '<button class="btn sm" data-act="continueOne">Продолжить</button></div>';
    }
    var sel = D.select;
    html += '<div class="section-title">Класс<span class="grow"></span>' +
      (sel ? '<button class="link-btn" data-act="selAll">все / никого</button>' : '') +
      '<button class="link-btn" data-act="selMode">' + (sel ? 'Готово' : 'Выбрать несколько') + '</button></div>';
    html += '<div class="card flat">' + D.students.map(function (s) {
      var m = D.marks[s.id], isHere = HERE[m.attendance], pills = '';
      if (!isHere) pills = Views.attPill(m.attendance);
      else {
        pills = (m.attendance === 'late' ? Views.attPill('late') + ' ' : '') + (m.homework ? Views.hwPill(m.homework) : '<span class="pill">ДЗ ?</span>') +
          (D.ask.grade && m.grade ? ' <span class="pill ' + (m.grade >= 4 ? 'ok' : m.grade === 3 ? 'warn' : 'bad') + '">' + m.grade + '</span>' : '') +
          (D.ask.uniform && m.uniform === 'no' ? ' <span class="pill bad">без формы</span>' : '');
      }
      return '<div class="row tap" data-act="open" data-sid="' + esc(s.id) + '">' +
        (sel ? '<span class="wz-check' + (sel[s.id] ? ' on' : '') + '">' + icon('check', 14) + '</span>' : '') +
        '<div class="row-main"><div class="row-title wrap' + (isHere ? '' : ' muted') + '">' + esc(s.name) + '</div></div>' +
        '<div class="row-end wz-pills">' + pills + '</div></div>';
    }).join('') + '</div>';
    if (sel) {
      var n = Object.keys(sel).length;
      html += '<div class="sticky-bottom"><div class="sub" style="padding:0 4px 6px">Выбрано: ' + n + '. Что поставить?</div><div class="wz-bulk">' +
        '<button class="btn plain sm" data-act="bulk" data-f="attendance" data-v="absent">Нет на уроке</button>' +
        '<button class="btn plain sm" data-act="bulk" data-f="attendance" data-v="present">Пришли</button>' +
        '<button class="btn plain sm" data-act="bulk" data-f="homework" data-v="done">ДЗ принесли</button>' +
        '<button class="btn plain sm" data-act="bulk" data-f="homework" data-v="none">ДЗ нет</button>' +
        (D.ask.grade ? '<button class="btn plain sm" data-act="bulk" data-f="grade">Оценка…</button>' : '') +
        (D.ask.uniform ? '<button class="btn plain sm" data-act="bulk" data-f="uniform" data-v="no">Без формы</button>' : '') +
        '</div></div>';
      return html;
    }
    var st = D.status === 'sending' ? '<span class="save-state">отправка…</span>'
      : D.status === 'error' ? '<span class="save-state err">не отправлено — нет связи. Всё сохранено в телефоне</span>'
      : '<span class="save-state ok">' + icon('check', 14) + ' сохранено в телефоне</span>';
    html += '<div class="sub" style="margin:2px 4px 0">Нажмите на ученика, чтобы исправить. «Выбрать несколько» — поставить одно и то же сразу группе.</div>' +
      '<div class="sticky-bottom"><div style="padding:0 4px 8px">' + st + '</div>' +
      '<button class="btn block" data-act="send"' + (D.status === 'sending' ? ' disabled' : '') + '>' + icon('upload', 18) +
      (D.status === 'error' ? ' Отправить ещё раз' : ' Отправить') + '</button></div>';
    return html;
  }

  function gradeSheet(cb) {
    var s = UI.openSheet('<h2>Оценка для выбранных</h2><p class="desc">Поставится только тем, кто был на уроке.</p><div class="wz-grid c5">' +
      [0, 2, 3, 4, 5].map(function (g) { return '<button class="wz-b" data-g="' + g + '">' + (g || '—') + '</button>'; }).join('') + '</div>');
    s.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]');
      if (b) { s.close(); cb(+b.dataset.g); }
    });
  }

  function send(D) {
    if (D.status === 'sending') return;
    var marks = D.students.map(function (s) {
      var m = D.marks[s.id], h = !!HERE[m.attendance];
      var o = { studentId: s.id, attendance: m.attendance || 'present', homework: h ? m.homework || '' : '' };
      if (D.ask.grade) o.grade = h && m.grade ? m.grade : 0;
      if (D.ask.uniform) o.uniform = h && m.uniform ? m.uniform : '';
      return o;
    });
    D.status = 'sending'; App.repaint(true);
    Api.call('t.marks.save', { lessonId: D.id, marks: marks, finish: true, check: 'done' }).then(function () {
      dropDraft(D);
      UI.haptic('success');
      UI.toast('Проверка отправлена · ' + here(D).length + ' из ' + D.students.length + ' на уроке');
      var c = App.current;
      if (c && c.key === 't.check') { App.back(); App.reload(); }
    }).catch(function (err) {
      D.status = 'error'; saveDraft(D);
      var c = App.current;
      if (c && c.key === 't.check') App.repaint(true);
      UI.toast(err.message, true);
    });
  }

  // ═════════════════════════ Календарь и настройка проверок ═════════════════════════
  App.screen('t.checks', {
    title: 'Проверка ДЗ',
    load: function () { return Api.call('t.checks'); },
    render: function (d) {
      var html = '';
      var due = d.items.filter(function (l) { return l.check === 'due' && l.date <= d.today; });
      var soon = d.items.filter(function (l) { return l.check === 'due' && l.date > d.today; });
      var off = d.items.filter(function (l) { return l.check === 'off' && l.date >= d.today; });
      var done = d.items.filter(function (l) { return l.check === 'done'; }).reverse();
      var configured = d.mine.length && d.slots.some(function (s) { return s.check; });
      if (!configured) {
        html += '<div class="card"><h3>' + icon('clipboard', 18) + ' Настройте один раз</h3><div class="sub">1. Ниже выберите свои предметы.<br>' +
          '2. Отметьте уроки, на которых обычно проверяете ДЗ (например, раз в неделю).<br>Дальше приложение само подскажет, когда проверять, и пришлёт напоминание.</div></div>';
      }
      var row = function (l, btn) {
        var late = l.date < d.today;
        return '<div class="row"><div class="time-col">' + l.start + '<small>' + (l.date === d.today ? 'сегодня' : UI.dayShort(l.date)) + '</small></div>' +
          '<div class="row-main tap" data-act="go" data-screen="t.check" data-id="' + esc(l.id) + '"><div class="row-title">' + esc(l.subject) + ' · ' + esc(l.class_name) + '</div>' +
          '<div class="row-sub">' + (late ? '<span style="color:var(--warn)">не проверено</span> · ' : '') + UI.dayLong(l.date) + '</div></div>' + btn + '</div>';
      };
      if (due.length) {
        html += '<div class="section-title">Надо проверить</div><div class="card flat">' + due.map(function (l) {
          return row(l, '<button class="btn sm" data-act="go" data-screen="t.check" data-id="' + esc(l.id) + '">Проверить</button>' +
            '<button class="icon-btn" data-act="setCheck" data-id="' + esc(l.id) + '" data-v="no" aria-label="Отменить проверку">' + icon('x', 17) + '</button>');
        }).join('') + '</div>';
      } else if (configured) {
        html += '<div class="card empty">' + icon('check', 28) + '<div>Сегодня проверять нечего</div></div>';
      }
      if (soon.length) {
        html += '<div class="section-title">Скоро</div><div class="card flat">' + soon.map(function (l) {
          return row(l, '<button class="btn plain sm" data-act="setCheck" data-id="' + esc(l.id) + '" data-v="no">Отменить</button>');
        }).join('') + '</div>';
      }
      if (off.length) {
        html += '<div class="section-title">Проверка отменена</div><div class="card flat">' + off.map(function (l) {
          return row(l, '<button class="btn plain sm" data-act="setCheck" data-id="' + esc(l.id) + '" data-v="yes">Вернуть</button>');
        }).join('') + '</div>';
      }
      if (done.length) {
        html += '<div class="section-title">Проверено за неделю</div><div class="card flat">' + done.map(function (l) {
          return row(l, '<span class="pill ok">' + icon('check', 12) + ' готово</span>');
        }).join('') + '</div>';
      }
      html += '<div class="sub" style="margin:4px 4px 0">Проверить ДЗ можно на любом уроке: откройте урок и нажмите «Проверить ДЗ по шагам».</div>';

      // ─── Настройка ───
      html += '<div class="section-title">' + icon('settings', 15) + ' Мои предметы</div><div class="card">' +
        (d.subjects.length ? '<div class="chips wrap">' + d.subjects.map(function (s) {
          var on = d.mine.some(function (x) { return x.toLowerCase() === s.toLowerCase(); });
          return '<button class="chip' + (on ? ' on' : '') + '" data-act="subj" data-v="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div><div class="sub">Проверки будут только по этим предметам. Нажмите, чтобы выбрать или убрать.</div>'
          : '<div class="sub">Предметы появятся, когда вы добавите расписание (вкладка «Расписание» → «Шаблон недели»).</div>') + '</div>';
      if (d.mine.length) {
        html += '<div class="section-title">Дни проверки</div>';
        if (d.slots.length) {
          var byClass = {};
          d.slots.forEach(function (s) { (byClass[s.class_name] = byClass[s.class_name] || []).push(s); });
          html += '<div class="sub" style="margin:-2px 4px 8px">Отметьте уроки, на которых вы каждую неделю проверяете ДЗ.</div>';
          Object.keys(byClass).forEach(function (c) {
            html += '<div class="card" style="padding:2px 14px"><div class="sub" style="padding-top:8px;font-weight:600">' + esc(c) + '</div>' + byClass[c].map(function (s) {
              return '<div class="toggle-row"><div class="row-main">' + UI.WD[s.weekday - 1].replace(/^./, function (x) { return x.toUpperCase(); }) + ', ' + s.start +
                ' · ' + esc(s.subject) + '</div><label class="switch"><input type="checkbox" data-change="slot" data-id="' + esc(s.id) + '"' + (s.check ? ' checked' : '') + '><span></span></label></div>';
            }).join('') + '</div>';
          });
        } else {
          html += '<div class="card sub">В расписании нет уроков по выбранным предметам.</div>';
        }
      }
      var tog = function (key, label, on, hint) {
        return '<div class="toggle-row"><div class="row-main">' + label + (hint ? '<div class="sub">' + hint + '</div>' : '') + '</div>' +
          '<label class="switch"><input type="checkbox" data-change="setting" data-key="' + key + '"' + (on ? ' checked' : '') + '><span></span></label></div>';
      };
      html += '<div class="section-title">Что спрашивать при проверке</div><div class="card" style="padding:4px 14px">' +
        '<div class="toggle-row"><div class="row-main">Принёс ли ДЗ<div class="sub">спрашивается всегда</div></div></div>' +
        tog('check_ask_grade', 'Оценка (2–5)', d.ask.grade, 'можно поставить «—», если без оценки') +
        tog('check_ask_uniform', 'Школьная форма', d.ask.uniform) + '</div>' +
        '<div class="sub" style="margin:0 4px">Сколько баллов давать за оценки и форму — во вкладке «Награды» → «Правила».</div>';
      html += '<div class="section-title">' + icon('bell', 15) + ' Напоминание в Telegram</div><div class="card" style="padding:4px 14px">' +
        tog('remind_enabled', 'Присылать утром список проверок', d.remind.enabled) +
        '<div class="toggle-row"><div class="row-main">Время</div><select class="input" data-change="hour" style="width:auto;min-height:36px;padding:4px 10px">' +
        [6, 7, 8, 9, 10, 12, 14, 16, 18, 20].map(function (h) { return '<option value="' + h + '"' + (h === d.remind.hour ? ' selected' : '') + '>' + h + ':00</option>'; }).join('') +
        '</select></div></div><div class="sub" style="margin:0 4px">Включается один раз в Google Таблице: меню «Учебный помощник» → «4. Напоминания о проверке ДЗ». ' +
        'Если меняете время — повторите этот пункт меню.</div>';
      return html;
    },
    actions: {
      setCheck: function (el) {
        var v = el.dataset.v;
        App.run('t.check.set', { id: el.dataset.id, value: v }, { ok: v === 'no' ? 'Проверка отменена' : 'Проверка возвращена' });
      },
      subj: function (el, d) {
        var v = el.dataset.v, list = d.mine.filter(function (x) { return x.toLowerCase() !== v.toLowerCase(); });
        if (list.length === d.mine.length) list.push(v);
        UI.haptic('select');
        App.run('t.settings.save', { check_subjects: list });
      },
      slot: function (el) { UI.haptic('select'); App.run('t.check.slot', { id: el.dataset.id, on: el.checked }); },
      setting: function (el) { var p = {}; p[el.dataset.key] = el.checked; App.run('t.settings.save', p, { ok: 'Сохранено' }); },
      hour: function (el) { App.run('t.settings.save', { remind_hour: +el.value }, { ok: 'Время сохранено' }); }
    }
  });

  // ═════════════════════════ Блок на главной ═════════════════════════
  function homeCard(d) {
    var pend = drafts(), rows = [];
    pend.forEach(function (D) {
      rows.push('<div class="row tap" data-act="go" data-screen="t.check" data-id="' + esc(D.id) + '">' + icon('upload') +
        '<div class="row-main"><div class="row-title">' + esc(D.title || 'Проверка ДЗ') + '</div><div class="row-sub" style="color:var(--warn)">' +
        (D.status === 'error' ? 'не отправлено — нажмите, чтобы отправить' : 'начата, не отправлена') + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>');
    });
    var keys = {};
    pend.forEach(function (D) { keys[D.key] = true; });
    (d.checks || []).forEach(function (l) {
      if (keys[draftKey(l)]) return;
      var late = l.date < d.today;
      rows.push('<div class="row"><div class="time-col">' + l.start + '<small>' + (late ? UI.dayShort(l.date) : 'сегодня') + '</small></div>' +
        '<div class="row-main"><div class="row-title">' + esc(l.subject) + ' · ' + esc(l.class_name) + '</div>' +
        '<div class="row-sub">' + (late ? '<span style="color:var(--warn)">не проверено</span>' : 'проверка ДЗ') + '</div></div>' +
        '<button class="btn sm" data-act="go" data-screen="t.check" data-id="' + esc(l.id) + '">Проверить</button></div>');
    });
    // Ближайшие проверки и оценки — какие классы и когда
    var next = (d.nextChecks || []).map(function (l) {
      return '<div class="row tap" data-act="go" data-screen="t.lesson" data-id="' + esc(l.id) + '"><div class="time-col">' + l.start + '<small>' + esc(l.date === Logic.util.addDays(d.today, 1) ? 'завтра' : UI.WD_SHORT[UI.wdIndex(l.date)] + ' ' + (+l.date.slice(8, 10)) + '.' + l.date.slice(5, 7)) + '</small></div>' +
        '<div class="row-main"><div class="row-title"><b>' + esc(l.class_name) + '</b> · ' + esc(l.subject) + '</div><div class="row-sub">проверка ДЗ' + (d.askGrade ? ' и оценки' : '') + '</div></div>' +
        '<span class="chev">' + icon('chev', 16) + '</span></div>';
    });
    if (!rows.length && !next.length) return '';
    return '<div class="section-title">' + icon('clipboard', 15) + ' Проверки и оценки<span class="grow"></span><a data-act="go" data-screen="t.checks">Календарь</a></div>' +
      (rows.length ? '<div class="card flat">' + rows.join('') + '</div>' : '<div class="card sub" style="padding:12px 14px">Сегодня проверять нечего ✓</div>') +
      (next.length ? '<div class="sub" style="margin:2px 4px 6px">Ближайшие:</div><div class="card flat">' + next.join('') + '</div>' : '');
  }
  function prefetchList(d) {
    return (d.checks || []).map(function (l) { return { key: 't.check', params: { id: l.id } }; }).concat([{ key: 't.checks', params: {} }]);
  }

  return { homeCard: homeCard, prefetchList: prefetchList, drafts: drafts };
})();
