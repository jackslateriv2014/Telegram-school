/**
 * teacher.js — экраны учителя:
 *   Сегодня · Классы (→ класс → ученик) · Расписание (→ урок, шаблон недели) · Награды · Настройки
 *   + режим урока: быстрые отметки присутствия, ДЗ и активности.
 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon, U = Logic.util;
  var S = App.state;
  function noop() { /* ошибка уже показана пользователю */ }

  function classOptions(classes, withNone) {
    var o = classes.map(function (c) { return { value: c.id, label: c.name }; });
    if (withNone) o.unshift({ value: '', label: 'Без класса' });
    return o;
  }
  // «Мои предметы / Все уроки»: учитель видит только свои предметы (Настройки → Мои предметы и проверка ДЗ)
  S.allLessons = localStorage.getItem('uchpom_all_lessons') === '1';
  function mineToggle(d) {
    if (!d.mine || !d.mine.length) return '';
    return '<div class="seg mine-seg"><button data-act="mineAll" data-v="0" class="' + (S.allLessons ? '' : 'on') + '">Мои: ' + esc(d.mine.join(', ')) + '</button>' +
      '<button data-act="mineAll" data-v="1" class="' + (S.allLessons ? 'on' : '') + '">Все уроки</button></div>';
  }
  App.action('mineAll', function (el) {
    S.allLessons = el.dataset.v === '1';
    localStorage.setItem('uchpom_all_lessons', S.allLessons ? '1' : '0');
    App.reload();
  });
  var WEEKDAY_OPTIONS = UI.WD.map(function (n, i) { return { value: i + 1, label: n.charAt(0).toUpperCase() + n.slice(1) }; });

  // ═════════════════════════ Сегодня ═════════════════════════
  App.screen('t.today', {
    title: null, live: true,
    load: function () { return Api.call('t.home', { all: S.allLessons }).then(function (d) { S.pending = d.pending; return d; }); },
    prefetch: function (d) { return Check.prefetchList(d); },
    render: function (d) {
      var todays = d.upcoming.filter(function (l) { return l.date === d.today; });
      var html = '<div class="kicker">' + UI.dayLong(d.today) + '</div>' +
        '<div class="topline"><h1>' + Views.greeting() + ', ' + esc(d.settings.teacher_name) + '</h1></div>' +
        Views.hero(d.upcoming, { screen: 't.lesson', showClass: true, today: d.today, currentLabel: icon('check') + ' Отметить класс',
          emptyText: 'Добавьте уроки во вкладке «Расписание».' });
      var alerts = [];
      if (d.pending) alerts.push('<div class="row tap" data-act="tab" data-screen="t.rewards">' + icon('gift') +
        '<div class="row-main"><div class="row-title">Заявки на награды</div><div class="row-sub">Ждут вашего решения</div></div>' +
        '<span class="pill warn">' + d.pending + '</span><span class="chev">' + icon('chev', 16) + '</span></div>');
      if (d.unassigned) alerts.push('<div class="row tap" data-act="go" data-screen="t.class" data-id="__none">' + icon('users') +
        '<div class="row-main"><div class="row-title">Ученики без класса</div><div class="row-sub">Распределите их по классам</div></div>' +
        '<span class="pill">' + d.unassigned + '</span><span class="chev">' + icon('chev', 16) + '</span></div>');
      if (!d.classes.length) alerts.push('<div class="row tap" data-act="tab" data-screen="t.classes">' + icon('plus') +
        '<div class="row-main"><div class="row-title">Начните с создания класса</div><div class="row-sub">Затем добавьте учеников и расписание</div></div>' +
        '<span class="chev">' + icon('chev', 16) + '</span></div>');
      if (alerts.length) html += '<div class="card flat">' + alerts.join('') + '</div>';
      html += Check.homeCard(d);
      html += '<div class="section-title">Уроки сегодня<span class="grow"></span><a data-act="tab" data-screen="t.week">Вся неделя</a></div>' + mineToggle(d);
      html += todays.length
        ? '<div class="card flat">' + todays.map(function (l) { return Views.lessonRow(l, { screen: 't.lesson', showClass: true, teacher: true }); }).join('') + '</div>'
        : '<div class="card empty">' + icon('calendar', 28) + '<div>Сегодня уроков нет</div></div>';
      return html;
    }
  });

  // ═════════════════════════ Классы ═════════════════════════
  App.screen('t.classes', {
    title: 'Классы',
    load: function () { return Api.call('t.home'); },
    render: function (d) {
      var rows = d.classes.map(function (c) {
        return '<div class="row tap" data-act="go" data-screen="t.class" data-id="' + esc(c.id) + '"><div class="place">' + esc(c.name.slice(0, 3)) + '</div>' +
          '<div class="row-main"><div class="row-title">' + esc(c.name) + '</div><div class="row-sub">' + c.count + ' ' +
          UI.plural(c.count, ['ученик', 'ученика', 'учеников']) + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>';
      });
      if (d.unassigned) rows.push('<div class="row tap" data-act="go" data-screen="t.class" data-id="__none"><div class="place">—</div>' +
        '<div class="row-main"><div class="row-title">Без класса</div><div class="row-sub">' + d.unassigned + ' ' +
        UI.plural(d.unassigned, ['ученик', 'ученика', 'учеников']) + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>');
      return (rows.length ? '<div class="card flat">' + rows.join('') + '</div>'
        : '<div class="card empty">' + icon('users', 28) + '<div>Классов пока нет</div></div>') +
        '<button class="btn block" data-act="add">' + icon('plus') + ' Добавить класс</button>';
    },
    actions: {
      add: function () {
        UI.form({ title: 'Новый класс', fields: [{ name: 'name', label: 'Название', placeholder: 'Например: 3А', required: true, autofocus: true }],
          submit: 'Создать', onSubmit: function (v) { return Api.call('t.classes.save', v); } })
          .then(function (r) { if (r) { UI.toast('Класс создан'); App.go('t.class', { id: r.id }); } });
      }
    }
  });

  App.screen('t.class', {
    title: function (d) { return d ? d.cls.name : 'Класс'; },
    load: function (p) { return Api.call('t.class', { id: p.id }); },
    render: function (d) {
      var html = '';
      html += d.students.length ? '<div class="card flat">' + d.students.map(function (s) {
        return '<div class="row tap" data-act="go" data-screen="t.student" data-id="' + esc(s.id) + '"><div class="row-main">' +
          '<div class="row-title">' + esc(s.name) + '</div><div class="row-sub">Посещ. ' + UI.pct(s.attendancePct) + ' · ДЗ ' + UI.pct(s.homeworkPct) +
          (s.hwStreak >= 3 ? ' · <span style="color:var(--warn)">серия ' + s.hwStreak + '</span>' : '') + '</div></div>' +
          '<div class="row-end"><b style="color:var(--text)">' + s.balance + '</b>' + icon('coin', 16) + '<span class="chev">' + icon('chev', 16) + '</span></div></div>';
      }).join('') + '</div>' : '<div class="card empty">' + icon('users', 28) + '<div>В классе пока нет учеников</div></div>';
      if (!d.cls.virtual) html += '<div class="btn-row"><button class="btn ghost" data-act="addStudents">' + icon('plus') + ' Добавить учеников</button>' +
        '<button class="btn plain" data-act="go" data-screen="t.import" data-params="' + esc(JSON.stringify({ kind: 'students', classId: d.cls.id })) + '">' + icon('upload', 18) + ' Из emaktab</button></div>';
      if (d.top) html += '<div class="card flat"><div class="row tap" data-act="go" data-screen="t.top" data-params="' + esc(JSON.stringify({ classId: d.cls.id })) + '">' +
        icon('trophy') + '<div class="row-main"><div class="row-title">Рейтинг класса</div><div class="row-sub">' + (d.top.enabled ? 'Включён · топ-' + d.top.size : 'Выключен — ученики не видят') + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>' +
        '<div class="row tap" data-act="go" data-screen="t.goal" data-params="' + esc(JSON.stringify({ classId: d.cls.id })) + '">' + icon('users') +
        '<div class="row-main"><div class="row-title">Цель класса</div><div class="row-sub">Общая копилка баллов на приз</div></div><span class="chev">' + icon('chev', 16) + '</span></div>' +
        '<div class="row tap" data-act="go" data-screen="t.stats" data-params="' + esc(JSON.stringify({ classId: d.cls.id })) + '">' + icon('list') +
        '<div class="row-main"><div class="row-title">Посещаемость и оценки</div><div class="row-sub">Таблица за месяц по каждому ученику</div></div><span class="chev">' + icon('chev', 16) + '</span></div></div>';
      if (!d.cls.virtual) {
        html += '<div class="section-title">Класс</div><div class="card flat">' +
          '<div class="row tap" data-act="schedule">' + icon('calendar') + '<div class="row-main">Расписание класса</div><span class="chev">' + icon('chev', 16) + '</span></div>' +
          '<div class="row tap" data-act="rename">' + icon('edit') + '<div class="row-main">Переименовать</div></div>' +
          '<div class="row tap" data-act="remove" style="color:var(--danger)">' + icon('trash') + '<div class="row-main">Удалить класс</div></div></div>';
      }
      return html;
    },
    actions: {
      addStudents: function (el, d) {
        UI.form({ title: 'Добавить учеников в ' + d.cls.name, desc: 'Можно сразу несколько — каждое имя с новой строки (например, скопировать список из журнала).',
          fields: [{ name: 'names', type: 'textarea', rows: 6, label: 'Имя и фамилия', placeholder: 'Иван Петров\nМария Сидорова', required: true }],
          submit: 'Добавить', onSubmit: function (v) { return Api.call('t.students.save', { classId: d.cls.id, names: v.names }); } })
          .then(function (r) { if (r) { UI.toast('Добавлено: ' + r.ids.length); App.reload(); } });
      },
      rename: function (el, d) {
        UI.form({ title: 'Переименовать класс', fields: [{ name: 'name', label: 'Название', value: d.cls.name, required: true }],
          onSubmit: function (v) { return Api.call('t.classes.save', { id: d.cls.id, name: v.name }); } })
          .then(function (r) { if (r) { UI.toast('Сохранено'); App.reload(); } });
      },
      remove: function (el, d) {
        UI.confirm('Удалить класс «' + d.cls.name + '»? Ученики перейдут в «Без класса», история баллов сохранится.', 'Удалить', true)
          .then(function (ok) { if (ok) App.run('t.classes.delete', { id: d.cls.id }, { ok: 'Класс удалён', reload: false }).then(function () { App.back(); App.reload(); }); });
      },
      schedule: function (el, d) { App.go('t.templates', { classId: d.cls.id }); }
    }
  });

  // ═════════════════════════ Рейтинг (топ лучших) ═════════════════════════
  // Награды → Рейтинг. Класс выбирается сверху; настройки сохраняются сразу.
  App.screen('t.top', {
    title: 'Рейтинг',
    load: function (p) {
      var id = p.classId || S.topClass;
      var open = function (cid) { return Api.call('t.class', { id: cid }); };
      if (id) return open(id).catch(function () { S.topClass = ''; return Api.call('t.home').then(first); });
      return Api.call('t.home').then(first);
      function first(h) { return h.classes[0] ? open(h.classes[0].id) : { cls: null, classes: [] }; }
    },
    render: function (d) {
      if (!d.cls) return '<div class="card empty">' + icon('users', 28) + '<div>Сначала создайте класс</div></div>';
      S.topClass = d.cls.id;
      var html = d.classes.length > 1 ? '<div class="chips wrap">' + d.classes.map(function (c) {
        return '<button class="chip' + (c.id === d.cls.id ? ' on' : '') + '" data-act="cls" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>' : '';
      return html + topSettings(d);
    },
    actions: {
      cls: function (el) { S.topClass = el.dataset.id; App.replaceParams({ classId: el.dataset.id }); App.reload(); },
      topEnabled: function (el, d) { saveTop(d, { enabled: el.checked }); },
      topSize: function (el, d) {
        var size = +el.dataset.v;
        saveTop(d, { size: size, manual: d.top.manual.slice(0, size) });
      },
      topMode: function (el, d) { saveTop(d, { mode: el.dataset.v }); },
      topPeriod: function (el, d) { saveTop(d, { period: el.dataset.v }); },
      topPick: function (el, d) {
        var list = d.top.manual.slice(), id = el.dataset.id, i = list.indexOf(id);
        if (el.checked && i < 0) {
          if (list.length >= d.top.size) { el.checked = false; return UI.toast('Можно выбрать не больше ' + d.top.size); }
          list.push(id);
        }
        if (!el.checked && i >= 0) list.splice(i, 1);
        saveTop(d, { manual: list });
      }
    }
  });

  function topSettings(d) {
    var t = d.top, manual = t.mode === 'manual';
    var seg = function (act, items, val) {
      return '<div class="seg">' + items.map(function (x) {
        return '<button data-act="' + act + '" data-v="' + x[0] + '" class="' + (String(x[0]) === String(val) ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>';
    };
    var html = '<div class="card">' +
      '<div class="toggle-row" style="padding-top:0"><div class="row-main"><b>Показывать ученикам</b><div class="sub">' +
      (t.enabled ? 'Ученики класса видят топ (только имена и места, без баллов)' : 'Выключено — каждый видит только свой прогресс') + '</div></div>' +
      '<label class="switch"><input type="checkbox" data-change="topEnabled"' + (t.enabled ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="sub" style="margin:8px 2px 6px">Сколько мест</div>' +
      seg('topSize', [[3, 'Топ-3'], [5, 'Топ-5'], [10, 'Топ-10']], t.size) +
      '<div class="sub" style="margin:0 2px 6px">Как считать</div>' +
      seg('topMode', [['points', 'По баллам'], ['rating', 'Успеваемость'], ['manual', 'Только вручную']], t.mode);
    if (!manual) {
      html += '<div class="sub" style="margin:0 2px 6px">За какой период</div>' +
        seg('topPeriod', [['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']], t.period) +
        '<div class="sub">' + (t.mode === 'rating' ? 'Успеваемость = ДЗ 50% + посещаемость 30% + активность 20%.' :
          'Считаются заработанные баллы — покупка наград место в топе не уменьшает.') + '</div>';
    }
    html += '</div>';
    html += '<div class="section-title">' + icon('star', 15) + (manual ? ' Кто в топе (по порядку мест)' : ' Закрепить в топе вручную') + '</div>' +
      '<div class="sub" style="margin:0 4px 8px">' + (manual ? 'Отметьте учеников по порядку мест, до ' + t.size + '.'
        : 'Необязательно. Отмеченные всегда стоят наверху с пометкой «выбор учителя», остальные места — ' +
          (t.mode === 'rating' ? 'по успеваемости' : 'по баллам') + '. Можно отметить до ' + t.size + '.') + '</div>' +
      '<div class="card picklist">' + d.students.map(function (s) {
        var pos = t.manual.indexOf(String(s.id));
        return '<label><input type="checkbox" data-change="topPick" data-id="' + esc(s.id) + '"' + (pos >= 0 ? ' checked' : '') + '><span>' +
          esc(s.name) + '</span>' + (pos >= 0 ? '<span class="pill accent">' + (manual ? (pos + 1) + ' место' : icon('star', 13) + ' закреплён') + '</span>' : '') + '</label>';
      }).join('') + '</div>';
    html += '<div class="sub" style="margin:4px 4px 8px">' + (t.enabled ? 'Так видят ученики:' : 'Предпросмотр (ученики пока не видят):') + '</div>' + Views.top(t, true);
    return html;
  }
  function saveTop(d, patch) {
    var t = Object.assign({ classId: d.cls.id, enabled: d.top.enabled, size: d.top.size, mode: d.top.mode, period: d.top.period, manual: d.top.manual }, patch);
    UI.haptic('select');
    App.run('t.top.save', t);
  }

  // ═════════════════════════ Карточка ученика ═════════════════════════
  App.screen('t.student', {
    title: function (d) { return d ? d.student.name : 'Ученик'; },
    load: function (p) { return Api.call('t.student', { id: p.id }); },
    render: function (d) {
      var st = d.student, s = d.stats;
      var html = '<div class="sub" style="margin:-10px 2px 12px">' + esc(st.class_name) + '</div>' +
        '<div class="tiles"><div class="tile"><div class="val">' + d.balance + '</div><div class="lbl">баланс' + (d.pending ? ' · ' + d.pending + ' в резерве' : '') + '</div></div>' +
        '<div class="tile"><div class="val">' + UI.pct(s.attendancePct) + '</div><div class="lbl">посещаемость</div></div>' +
        '<div class="tile"><div class="val">' + UI.pct(s.homeworkPct) + '</div><div class="lbl">выполнение ДЗ</div></div>' +
        '<div class="tile"><div class="val">' + s.hwStreak + '</div><div class="lbl">серия ДЗ (лучшая ' + s.hwBest + ')</div></div></div>' +
        '<div class="btn-row" style="margin-bottom:10px"><button class="btn ghost" data-act="points" data-sign="1">' + icon('plus', 18) + ' Начислить</button>' +
        '<button class="btn plain" data-act="points" data-sign="-1">' + icon('minus', 18) + ' Списать</button></div>';

      html += '<div class="section-title">' + icon(st.note_parent ? 'eye' : 'lock', 15) + ' Заметки по успеваемости</div><div class="card">' +
        UI.fieldHtml({ name: 'good', type: 'textarea', rows: 2, label: 'Что получается', value: st.note_good, placeholder: 'Сильные стороны' }) +
        UI.fieldHtml({ name: 'weak', type: 'textarea', rows: 2, label: 'Что проседает', value: st.note_weak, placeholder: 'Над чем поработать' }) +
        UI.fieldHtml({ name: 'repeat', type: 'textarea', rows: 2, label: 'Темы для повторения', value: st.note_repeat }) +
        UI.fieldHtml({ name: 'parent', type: 'toggle', label: 'Показывать родителю', value: st.note_parent, hint: 'Ученики и другие родители заметки не видят никогда' }) +
        '<button class="btn block" data-act="saveNotes" style="margin-top:6px">Сохранить заметки</button>' +
        (st.note_updated ? '<div class="sub" style="text-align:center;margin-top:8px">Обновлено ' + UI.dateTime(st.note_updated) + '</div>' : '') + '</div>';

      html += '<div class="section-title">' + icon('link', 15) + ' Доступ в приложение</div><div class="card flat">' +
        (d.accounts.length ? d.accounts.map(function (a) {
          return '<div class="row">' + icon(a.role === 'student' ? 'user' : 'users') + '<div class="row-main"><div class="row-title">' + esc(a.name) +
            '</div><div class="row-sub">' + (a.role === 'student' ? 'Ученик' : 'Родитель') + (a.username ? ' · @' + esc(a.username) : '') + '</div></div>' +
            '<button class="btn sm plain" data-act="unlink" data-tg="' + esc(a.tg_id) + '" data-role="' + a.role + '">Отвязать</button></div>';
        }).join('') : '<div class="row"><div class="row-sub">Пока никто не подключён</div></div>') +
        '</div><div class="btn-row" style="margin-bottom:10px"><button class="btn ghost" data-act="invite" data-role="student">Ссылка для ученика</button>' +
        '<button class="btn ghost" data-act="invite" data-role="parent">Ссылка для родителя</button></div>';

      html += Game.teacherSection(d);
      html += '<div class="section-title">Достижения</div>' + Views.badges(d.achievements);

      html += '<div class="section-title">Последние уроки</div><div class="card flat">' + (d.marks.length ? d.marks.map(function (m) {
        return '<div class="row"><div class="row-main"><div class="row-title">' + esc(m.subject) + ' · ' + UI.dayShort(m.date) + '</div>' +
          '<div class="row-sub">' + esc(m.topic || '') + '</div></div><div class="row-end">' + Views.attPill(m.attendance) + ' ' + Views.hwPill(m.homework) + ' ' + Views.gradePill(m.grade) +
          (m.activity ? ' <span class="pill accent">+' + m.activity + '</span>' : '') + '</div></div>';
      }).join('') : '<div class="empty">Отметок пока нет</div>') + '</div>';

      html += '<div class="section-title">История баллов</div><div class="card flat">' + Views.ledger(d.ledger.slice(0, 25), '', true) + '</div>';

      html += '<div class="section-title">Управление</div><div class="card flat">' +
        '<div class="row tap" data-act="rename">' + icon('edit') + '<div class="row-main">Изменить имя</div></div>' +
        '<div class="row tap" data-act="move">' + icon('swap') + '<div class="row-main">Перевести в другой класс</div></div>' +
        '<div class="row tap" data-act="archive" style="color:var(--danger)">' + icon('trash') + '<div class="row-main">Убрать ученика</div></div></div>';
      return html;
    },
    actions: {
      delPoint: function (el, d) {
        var l = d.ledger.find(function (x) { return x.id === el.dataset.id; });
        if (!l) return;
        UI.confirm('Удалить запись «' + l.reason + '» (' + UI.signed(l.amount) + ')? Баланс пересчитается. Вернуть можно в «Награды → История изменений».', 'Удалить', true)
          .then(function (ok) { if (ok) App.run('t.points.delete', { id: l.id }, { ok: 'Запись удалена' }); });
      },
      saveNotes: function (el, d) {
        var v = function (n) { return document.querySelector('[name=' + n + ']'); };
        App.run('t.notes.save', { id: d.student.id, good: v('good').value, weak: v('weak').value, repeat: v('repeat').value, parent: v('parent').checked },
          { ok: 'Заметки сохранены' });
      },
      points: function (el, d) {
        var plus = el.dataset.sign === '1';
        UI.form({ title: plus ? 'Начислить баллы' : 'Списать баллы', desc: d.student.name + ' · сейчас ' + UI.pts(d.balance),
          fields: [{ name: 'amount', type: 'number', label: 'Сколько баллов', value: plus ? 5 : 1, required: true },
            { name: 'reason', label: 'За что', placeholder: plus ? 'Например: победа в олимпиаде' : 'Причина', required: true }],
          submit: plus ? 'Начислить' : 'Списать',
          onSubmit: function (v) { return Api.call('t.points', { studentId: d.student.id, amount: (plus ? 1 : -1) * Math.abs(+v.amount), reason: v.reason }); } })
          .then(function (r) { if (r) { UI.toast('Баланс: ' + UI.pts(r.balance)); App.reload(); } });
      },
      invite: function (el, d) {
        var role = el.dataset.role;
        Api.call('t.invite', { studentId: d.student.id, role: role }).then(function (r) { r.studentId = d.student.id; showInvite(r, role, d.student.name); })
          .catch(function (err) { UI.toast(err.message, true); });
      },
      unlink: function (el, d) {
        UI.confirm('Отвязать этот Telegram-аккаунт от ученика? Он потеряет доступ.', 'Отвязать', true).then(function (ok) {
          if (ok) App.run('t.unlink', { studentId: d.student.id, tgId: el.dataset.tg, role: el.dataset.role }, { ok: 'Отвязано' });
        });
      },
      rename: function (el, d) {
        UI.form({ title: 'Имя ученика', fields: [{ name: 'name', label: 'Имя и фамилия', value: d.student.name, required: true }],
          onSubmit: function (v) { return Api.call('t.students.save', { id: d.student.id, name: v.name }); } })
          .then(function (r) { if (r) { UI.toast('Сохранено'); App.reload(); } });
      },
      move: function (el, d) {
        UI.form({ title: 'Перевести в класс', fields: [{ name: 'classId', type: 'select', label: 'Класс', value: d.student.class_id, options: classOptions(d.classes, true) }],
          submit: 'Перевести', onSubmit: function (v) { return Api.call('t.students.move', { id: d.student.id, classId: v.classId }); } })
          .then(function (r) { if (r) { UI.toast('Ученик переведён'); App.reload(); } });
      },
      archive: function (el, d) {
        UI.confirm('Убрать ученика «' + d.student.name + '»? Он исчезнет из списков и потеряет доступ. История останется в таблице.', 'Убрать', true)
          .then(function (ok) { if (ok) App.run('t.students.delete', { id: d.student.id }, { ok: 'Ученик убран', reload: false }).then(function () { App.back(); App.reload(); }); });
      }
    }
  });

  function showInvite(r, role, name) {
    var who = role === 'student' ? 'ученику' : 'родителю';
    var html = '<h2>' + (role === 'student' ? 'Ссылка для ученика' : 'Ссылка для родителя') + '</h2>' +
      (r.link ? '<p class="desc">Отправьте ссылку ' + who + ' (' + esc(name) + '). При открытии в Telegram доступ подключится сам.</p><div class="linkbox">' + esc(r.link) + '</div>'
        : '<p class="desc">Готовая ссылка появится, когда в «Настройках» будут указаны имя бота и короткое имя приложения. Пока передайте код — его вводят на экране входа.</p>') +
      '<div class="codebox">' + esc(r.code) + '</div><p class="sub">' +
      'Ссылка работает без срока, пока ею не воспользуются' + (role === 'parent' ? ' (до 3 человек — например, мама и папа' + (r.uses ? '; уже вошли: ' + r.uses : '') + ')' : '') +
      '. Повторное нажатие покажет эту же ссылку. Если ребёнок уже подключён, он может открывать её сколько угодно.</p>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn plain" data-copy>' + icon('copy', 18) + ' Копировать</button>' +
      (r.link ? '<button class="btn" data-share>' + icon('share', 18) + ' Отправить</button>' : '') + '</div>' +
      '<div class="btn-row"><button class="btn plain sm" data-renew>' + icon('refresh', 16) + ' Новая ссылка (старая перестанет работать)</button></div>';
    var s = UI.openSheet(html);
    s.el.addEventListener('click', function (e) {
      if (e.target.closest('[data-copy]')) UI.copy(r.link || r.code);
      if (e.target.closest('[data-share]')) UI.shareLink(r.link, 'Ссылка для входа в учебный помощник (' + name + ')');
      if (e.target.closest('[data-renew]')) {
        s.close();
        UI.confirm('Сделать новую ссылку? Старая перестанет работать — если вы её уже отправили, отправьте новую.', 'Новая ссылка').then(function (ok) {
          if (ok) Api.call('t.invite', { studentId: r.studentId, role: role, renew: true }).then(function (n) { n.studentId = r.studentId; showInvite(n, role, name); UI.toast('Новая ссылка готова'); },
            function (err) { UI.toast(err.message, true); });
        });
      }
    });
  }

  // ═════════════════════════ Расписание ═════════════════════════
  S.week = { from: '', classId: '' };
  App.screen('t.week', {
    title: 'Расписание',
    load: function (p) { return Api.call('t.week', { from: p.from || S.week.from, classId: p.classId !== undefined ? p.classId : S.week.classId, all: S.allLessons }); },
    render: function (d) {
      S.week.from = d.from; S.week.classId = d.classId;
      var html = '<div class="card" style="display:flex;align-items:center;gap:8px;padding:8px">' +
        '<button class="back" data-act="shift" data-n="-7" aria-label="Предыдущая неделя">' + icon('left') + '</button>' +
        '<div style="flex:1;text-align:center"><b>' + UI.weekRange(d.from) + '</b>' +
        (U.mondayOf(d.today) !== d.from ? '<div><button class="link-btn" data-act="shift" data-n="0">к текущей неделе</button></div>' : '<div class="sub">текущая неделя</div>') +
        '</div><button class="back" data-act="shift" data-n="7" aria-label="Следующая неделя">' + icon('chev') + '</button></div>';
      if (d.classes.length > 1) {
        html += '<div class="chips"><button class="chip' + (!d.classId ? ' on' : '') + '" data-act="cls" data-id="">Все классы</button>' +
          d.classes.map(function (c) { return '<button class="chip' + (d.classId === c.id ? ' on' : '') + '" data-act="cls" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>'; }).join('') + '</div>';
      }
      html += '<div class="btn-row"><button class="btn ghost sm" data-act="oneoff">' + icon('plus', 18) + ' Разовый урок</button>' +
        '<button class="btn plain sm" data-act="templates">' + icon('calendar', 18) + ' Шаблон недели</button>' +
        '<button class="btn plain sm" data-act="go" data-screen="t.import" data-params="' + esc(JSON.stringify({ kind: 'topics', classId: d.classId || '' })) + '">' + icon('upload', 18) + ' Темы и ДЗ</button></div>';
      html += mineToggle(d) + Views.byDays(d.lessons, d.today, { screen: 't.lesson', showClass: !d.classId, teacher: true }, { from: d.from });
      return html;
    },
    actions: {
      shift: function (el, d) {
        var n = +el.dataset.n;
        App.replaceParams({ from: n === 0 ? U.mondayOf(d.today) : U.addDays(d.from, n), classId: d.classId });
        App.reload();
      },
      cls: function (el, d) { App.replaceParams({ from: d.from, classId: el.dataset.id }); App.reload(); },
      templates: function (el, d) { App.go('t.templates', { classId: d.classId }); },
      oneoff: function (el, d) {
        if (!d.classes.length) return UI.toast('Сначала создайте класс');
        UI.form({ title: 'Разовый урок', desc: 'Дополнительное занятие или замена — не повторяется каждую неделю.',
          fields: [{ name: 'classId', type: 'select', label: 'Класс', value: d.classId || d.classes[0].id, options: classOptions(d.classes) },
            { name: 'date', type: 'date', label: 'Дата', value: d.today, required: true },
            [{ name: 'start', type: 'time', label: 'Начало', value: '09:00', required: true }, { name: 'end', type: 'time', label: 'Конец', value: '09:45', required: true }],
            { name: 'subject', label: 'Предмет', required: true }, { name: 'topic', label: 'Тема (необязательно)' }],
          submit: 'Добавить', onSubmit: function (v) { return Api.call('t.lesson.create', v); } })
          .then(function (r) { if (r) { UI.toast('Урок добавлен'); App.reload(); } });
      }
    }
  });

  App.screen('t.templates', {
    title: 'Шаблон недели',
    load: function (p) { return Api.call('t.week', { classId: p.classId || '' }); },
    render: function (d) {
      var html = '<div class="sub" style="margin:-6px 4px 12px">Повторяется каждую неделю. Чтобы изменить один конкретный урок (перенос, замена), откройте его в расписании.</div>';
      var any = false;
      for (var wd = 1; wd <= 7; wd++) {
        var items = d.templates.filter(function (t) { return t.weekday === wd; });
        if (!items.length) continue;
        any = true;
        html += '<div class="section-title">' + UI.WD[wd - 1] + '</div><div class="card flat">' + items.map(function (t) {
          return '<div class="row tap" data-act="edit" data-id="' + esc(t.id) + '"><div class="time-col">' + t.start + '<small>' + t.end + '</small></div>' +
            '<div class="row-main"><div class="row-title">' + esc(t.subject) + (d.classId ? '' : ' · ' + esc(t.class_name)) + '</div>' +
            (t.room ? '<div class="row-sub">Кабинет ' + esc(t.room) + '</div>' : '') + '</div>' + icon('edit', 18) + '</div>';
        }).join('') + '</div>';
      }
      if (!any) html += '<div class="card empty">' + icon('calendar', 28) + '<div>Шаблон пуст. Добавьте уроки, которые повторяются каждую неделю.</div></div>';
      return html + '<div class="btn-row" style="margin-top:6px"><button class="btn" data-act="add">' + icon('plus') + ' Добавить урок</button>' +
        '<button class="btn plain" data-act="go" data-screen="t.import" data-params="' + esc(JSON.stringify({ kind: 'schedule', classId: d.classId || '' })) + '">' + icon('upload', 18) + ' Из emaktab</button></div>';
    },
    actions: {
      add: function (el, d, p) { templateForm(d, null, p.classId); },
      edit: function (el, d) { templateForm(d, d.templates.find(function (t) { return t.id === el.dataset.id; })); }
    }
  });
  function templateForm(d, t, classId) {
    if (!d.classes.length) return UI.toast('Сначала создайте класс');
    t = t || {};
    UI.form({ title: t.id ? 'Урок в шаблоне' : 'Новый урок в шаблоне',
      fields: [{ name: 'classId', type: 'select', label: 'Класс', value: t.class_id || classId || d.classes[0].id, options: classOptions(d.classes) },
        { name: 'weekday', type: 'select', label: 'День недели', value: t.weekday || 1, options: WEEKDAY_OPTIONS },
        [{ name: 'start', type: 'time', label: 'Начало', value: t.start || '09:00', required: true }, { name: 'end', type: 'time', label: 'Конец', value: t.end || '09:45', required: true }],
        [{ name: 'subject', label: 'Предмет', value: t.subject, required: true }, { name: 'room', label: 'Кабинет', value: t.room }]],
      onSubmit: function (v) { v.id = t.id; return Api.call('t.template.save', v); },
      extra: t.id ? { label: 'Удалить из шаблона', onClick: function () {
        return UI.confirm('Удалить этот урок из шаблона? Уже проведённые уроки и отметки сохранятся.', 'Удалить', true).then(function (ok) {
          if (!ok) return false;
          return App.run('t.template.delete', { id: t.id }, { ok: 'Удалено' });
        });
      } } : null })
      .then(function (r) { if (r) { UI.toast('Сохранено'); App.reload(); } });
  }

  // ═════════════════════════ Урок: отметки + карточка ═════════════════════════
  var ATT_NEXT = { '': 'present', present: 'absent', absent: 'late', late: 'excused', excused: 'present' };
  var HW_NEXT = { '': 'done', done: 'partial', partial: 'none', none: '' };
  var LM = null; // состояние отметок открытого урока

  App.screen('t.lesson', {
    live: true,
    title: function (d) { return d ? d.lesson.subject + (d.lesson.class_name ? ' · ' + d.lesson.class_name : '') : 'Урок'; },
    load: function (p) { return Api.call('t.lesson', { id: p.id }); },
    render: function (d, p) {
      var l = d.lesson;
      // Локальные (ещё не сохранённые) отметки не затираем данными с сервера
      if (!LM || LM.key !== l.id) LM = { key: l.id, lessonId: l.id, marks: {}, dirty: {}, saving: false, again: false, status: '' };
      d.students.forEach(function (s) { if (!LM.dirty[s.id] && !LM.saving) LM.marks[s.id] = Object.assign({}, s.mark); else if (!LM.marks[s.id]) LM.marks[s.id] = Object.assign({}, s.mark); });
      LM.students = d.students;
      var seg = p.seg || (l.date <= d.today ? 'marks' : 'card');
      var html = '<div class="seg"><button data-act="seg" data-seg="marks" class="' + (seg === 'marks' ? 'on' : '') + '">Отметки</button>' +
        '<button data-act="seg" data-seg="card" class="' + (seg === 'card' ? 'on' : '') + '">Карточка урока</button></div>';
      html += lessonHead(d);
      return html + (seg === 'marks' ? marksView(d) : cardView(d));
    },
    mount: function (view) { var list = view.querySelector('#mlist'); if (list) attachSwipes(list); },
    leave: function () { if (LM && Object.keys(LM.dirty).length) { clearTimeout(LM.timer); saveMarks().catch(noop); } },
    actions: {
      seg: function (el) { App.replaceParams({ seg: el.dataset.seg }); App.repaint(true); },
      att: function (el) { var id = el.closest('.mrow').dataset.sid, m = LM.marks[id]; m.attendance = ATT_NEXT[m.attendance || '']; if (m.attendance === 'absent' || m.attendance === 'excused') { m.homework = ''; m.activity = 0; } changed([id]); },
      hw: function (el) { var id = el.closest('.mrow').dataset.sid, m = LM.marks[id]; m.homework = HW_NEXT[m.homework || '']; if (!m.attendance && m.homework) m.attendance = 'present'; changed([id]); },
      plus: function (el) { bump(el.closest('.mrow').dataset.sid, 1); },
      minus: function (el) { bump(el.closest('.mrow').dataset.sid, -1); },
      allPresent: function () {
        var ids = LM.students.filter(function (s) { return !LM.marks[s.id].attendance; }).map(function (s) { LM.marks[s.id].attendance = 'present'; return s.id; });
        if (!ids.length) return UI.toast('У всех уже есть отметка');
        changed(ids);
      },
      allHw: function () {
        var ids = LM.students.filter(function (s) { var m = LM.marks[s.id]; return !m.homework && m.attendance !== 'absent' && m.attendance !== 'excused'; })
          .map(function (s) { var m = LM.marks[s.id]; m.homework = 'done'; if (!m.attendance) m.attendance = 'present'; return s.id; });
        if (!ids.length) return UI.toast('ДЗ уже отмечено у всех присутствующих');
        changed(ids);
      },
      retrySave: function () { saveMarks().catch(noop); },
      finish: function () {
        clearTimeout(LM.timer);
        var sum = summary();
        saveMarks(true).then(function () {
          UI.toast('Урок завершён · присутствовали ' + sum.here + ' из ' + sum.total);
          UI.haptic('success');
          App.back(); App.reload();
        }).catch(noop);
      },
      saveCard: function (el, d) {
        var v = function (n) { return document.querySelector('[name=' + n + ']').value; };
        lessonSave(d, { topic: v('topic'), homework: v('homework'), checklist: v('checklist'), notes: v('notes') }, 'Карточка урока сохранена');
      },
      attachUrl: function (el, d) {
        var url = document.querySelector('[name=murl]').value.trim();
        if (!url) return UI.toast('Вставьте ссылку на файл Google Диска');
        lessonSave(d, { material_url: url, material_name: 'Конспект урока' }, 'Конспект прикреплён');
      },
      removeMaterial: function (el, d) { lessonSave(d, { material_url: '' }, 'Конспект откреплён'); },
      upload: function () { document.getElementById('mfile').click(); },
      file: function (el, d) {
        var f = el.files && el.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) return UI.toast('Файл больше 10 МБ — загрузите его на Диск вручную и вставьте ссылку', true);
        UI.toast('Загружаю «' + f.name + '»…');
        var reader = new FileReader();
        reader.onload = function () {
          Api.call('t.material.upload', { lessonId: d.lesson.id, name: f.name, mime: f.type, data: reader.result }).then(function (r) {
            App.replaceParams({ id: r.id }); UI.toast('Конспект загружен на Диск'); App.reload();
          }).catch(function (err) { UI.toast(err.message, true); });
        };
        reader.readAsDataURL(f);
      },
      reschedule: function (el, d) {
        var l = d.lesson;
        UI.form({ title: 'Перенести или изменить урок', desc: 'Изменится только этот урок. Шаблон недели останется прежним.',
          fields: [{ name: 'date', type: 'date', label: 'Дата', value: l.date, required: true },
            [{ name: 'start', type: 'time', label: 'Начало', value: l.start, required: true }, { name: 'end', type: 'time', label: 'Конец', value: l.end, required: true }],
            { name: 'subject', label: 'Предмет', value: l.subject, required: true }],
          onSubmit: function (v) { v.id = l.id; return Api.call('t.lesson.save', v); } })
          .then(function (r) { if (r) { App.replaceParams({ id: r.id }); UI.toast('Урок изменён'); App.reload(); } });
      },
      cancel: function (el, d) {
        var cancelled = d.lesson.status === 'cancelled';
        UI.confirm(cancelled ? 'Вернуть урок в расписание?' : 'Отменить этот урок? Ученики увидят его как отменённый.', cancelled ? 'Вернуть' : 'Отменить урок', !cancelled)
          .then(function (ok) { if (ok) lessonSave(d, { status: cancelled ? 'planned' : 'cancelled' }, cancelled ? 'Урок возвращён' : 'Урок отменён'); });
      },
      deleteLesson: function (el, d) {
        UI.confirm('Удалить разовый урок?', 'Удалить', true).then(function (ok) {
          if (ok) App.run('t.lesson.delete', { id: d.lesson.id }, { ok: 'Урок удалён', reload: false }).then(function () { App.back(); App.reload(); });
        });
      }
    }
  });

  function lessonSave(d, patch, ok) {
    patch.id = d.lesson.id;
    return Api.call('t.lesson.save', patch).then(function (r) {
      App.replaceParams({ id: r.id }); UI.toast(ok); UI.haptic('light'); App.reload();
    }).catch(function (err) { UI.toast(err.message, true); });
  }

  function lessonHead(d) {
    var l = d.lesson, now = new Date(), s = UI.parse(l.date, l.start), e = UI.parse(l.date, l.end);
    var status = l.status === 'cancelled' ? '<span class="pill bad">отменён</span>' : l.status === 'done' ? '<span class="pill ok">проведён</span>' : '';
    var timer = '';
    if (l.status !== 'cancelled' && s <= now && now < e) timer = '<div style="margin-top:8px"><span class="dot live"></span> <b>до конца ' + UI.countdown(e.getTime()) + '</b></div>' + UI.progress(l);
    else if (l.status !== 'cancelled' && s > now && s - now < 12 * 3600000) timer = '<div style="margin-top:8px" class="sub">' + icon('clock', 15) + ' начнётся через ' + UI.countdown(s.getTime()) + '</div>';
    return '<div class="card"><div class="row" style="padding:0;min-height:0"><div class="row-main"><div class="row-title">' + UI.relDay(l.date, d.today) + ', ' + l.start + '–' + l.end + '</div>' +
      '<div class="row-sub wrap">' + (l.topic ? esc(l.topic) : 'Тема не указана') + '</div></div>' + status + '</div>' + timer + '</div>';
  }

  // ─── Отметки ───
  function markRow(s) {
    var m = LM.marks[s.id], a = Views.ATT[m.attendance], h = Views.HW[m.homework];
    return '<div class="mrow' + (m.attendance === 'absent' ? ' absent' : '') + '" data-sid="' + esc(s.id) + '">' +
      '<div class="nm"><b>' + esc(s.name) + '</b><small>' + icon('coin', 12) + ' <span data-bal>' + s.balance + '</span></small></div>' +
      '<button class="mbtn ' + (m.attendance || '') + '" data-act="att" aria-label="Присутствие">' + (a ? a[0] : '·') + '</button>' +
      '<button class="mbtn ' + (m.homework || '') + '" data-act="hw" aria-label="Домашнее задание">' + (h ? h[0] : '—') + '</button>' +
      '<div class="act"><button data-act="minus" aria-label="Минус балл">' + icon('minus', 16) + '</button><b class="' + (m.activity ? '' : 'zero') + '">' +
      (m.activity || 0) + '</b><button class="plus" data-act="plus" aria-label="Плюс балл">' + icon('plus', 16) + '</button></div></div>';
  }
  function marksView(d) {
    if (!d.students.length) {
      return '<div class="card empty">' + icon('users', 28) + '<div>В классе пока нет учеников</div><div style="height:10px"></div>' +
        '<button class="btn ghost sm" data-act="go" data-screen="t.class" data-id="' + esc(d.lesson.class_id) + '">Открыть класс</button></div>';
    }
    var r = d.rules;
    return (d.lesson.status === 'cancelled' ? '<div class="card" style="color:var(--bad)">Урок отменён. Отметки можно ставить, но ученики видят его как отменённый.</div>' : '') +
      '<button class="btn block' + (d.lesson.check === 'due' ? '' : ' ghost') + '" data-act="go" data-screen="t.check" data-id="' + esc(d.lesson.id) + '" style="margin-bottom:10px">' +
      icon('clipboard', 18) + (d.lesson.check === 'done' ? ' ДЗ проверено · открыть' : ' Проверить ДЗ по шагам') + '</button>' +
      '<div class="btn-row" style="margin-bottom:12px"><button class="btn ghost sm" data-act="allPresent">' + icon('check', 17) + ' Все присутствуют</button>' +
      '<button class="btn ghost sm" data-act="allHw">' + icon('check', 17) + ' ДЗ: всем ✓</button></div>' +
      '<div class="marks-head"><span>Ученик</span><span>Был</span><span>ДЗ</span><span>Активность</span></div>' +
      '<div class="card flat" id="mlist">' + d.students.map(markRow).join('') + '</div>' +
      (d.students.some(function (s) { return s.mark && (s.mark.attendance || s.mark.homework || s.mark.activity || s.mark.grade || s.mark.uniform); })
        ? '<button class="btn plain block sm" data-act="go" data-screen="t.undo" data-params="' + esc(JSON.stringify({ lessonId: d.lesson.id })) + '">' + icon('undo', 17) + ' Отменить отметки этого урока</button>' : '') +
      '<div class="sub" style="padding:2px 4px 0">Нажатие переключает отметку: <b>Был</b> ✓ → Н → ОП (опоздал) → УП (уважит.); <b>ДЗ</b> ✓ → ½ → ✗. ' +
      'Свайп по строке вправо — +1 активность, влево — −1. Баллы: присутствие +' + r.attendance + ', ДЗ +' + r.homework + ', активность +' + r.activity + '.</div>' +
      '<div class="sticky-bottom"><div style="display:flex;align-items:center;gap:8px;padding:0 4px 8px"><div class="row-main sub" id="msum">' + summaryText() + '</div>' +
      '<span id="msave">' + saveStateHtml() + '</span></div><button class="btn block" data-act="finish">' + icon('check') + ' Завершить урок</button></div>';
  }
  function summary() {
    var here = 0, hw = 0, act = 0;
    LM.students.forEach(function (s) {
      var m = LM.marks[s.id];
      if (m.attendance === 'present' || m.attendance === 'late') here++;
      if (m.homework === 'done') hw++;
      act += m.activity || 0;
    });
    return { here: here, hw: hw, act: act, total: LM.students.length };
  }
  function summaryText() { var s = summary(); return 'Присутствуют ' + s.here + '/' + s.total + ' · ДЗ ' + s.hw + ' · активность ' + s.act; }
  function saveStateHtml() {
    return { '': '', wait: '<span class="save-state">изменено…</span>', saving: '<span class="save-state">сохранение…</span>',
      saved: '<span class="save-state ok">' + icon('check', 14) + ' сохранено</span>',
      error: '<span class="save-state err" data-act="retrySave">не сохранено · повторить</span>' }[LM.status || ''];
  }
  function refreshRows(ids) {
    ids.forEach(function (id) {
      var el = document.querySelector('.mrow[data-sid="' + id + '"]'), s = LM.students.find(function (x) { return String(x.id) === String(id); });
      if (el && s) el.outerHTML = markRow(s);
    });
    var sum = document.getElementById('msum');
    if (sum) sum.textContent = summaryText();
  }
  function setStatus(st) { LM.status = st; var el = document.getElementById('msave'); if (el) el.innerHTML = saveStateHtml(); }
  function changed(ids) {
    ids.forEach(function (id) { LM.dirty[id] = true; });
    refreshRows(ids);
    UI.haptic('light');
    setStatus('wait');
    clearTimeout(LM.timer);
    LM.timer = setTimeout(function () { saveMarks().catch(noop); }, 700); // сохраняем пачкой через 0,7 с после последнего нажатия
    try { if (Api.isTg) Telegram.WebApp.enableClosingConfirmation(); } catch (e) { /* ignore */ }
  }
  function bump(id, n) {
    var m = LM.marks[id];
    var v = Math.max(0, Math.min(99, (m.activity || 0) + n));
    if (v === (m.activity || 0)) return;
    m.activity = v;
    if (n > 0 && !m.attendance) m.attendance = 'present';
    changed([id]);
    var el = document.querySelector('.mrow[data-sid="' + id + '"]');
    if (el) { el.classList.add(n > 0 ? 'flash-plus' : 'flash-minus'); setTimeout(function () { el.classList.remove('flash-plus', 'flash-minus'); }, 350); }
  }
  // Отправить отметки на сервер. Если во время отправки были новые нажатия — отправим ещё раз.
  function saveMarks(finish) {
    var lm = LM;
    if (finish) lm.finish = true;
    if (lm.saving) { lm.again = true; return lm.promise; }
    var ids = Object.keys(lm.dirty);
    if (!ids.length && !lm.finish) return Promise.resolve();
    var fin = !!lm.finish;
    lm.finish = false;
    var marks = ids.map(function (id) { var m = lm.marks[id]; return { studentId: id, attendance: m.attendance || '', homework: m.homework || '', activity: m.activity || 0 }; });
    lm.dirty = {};
    lm.saving = true;
    if (LM === lm) setStatus('saving');
    lm.promise = Api.call('t.marks.save', { lessonId: lm.lessonId, marks: marks, finish: fin }).then(function (res) {
      lm.saving = false;
      // запоминаем сохранённое, чтобы при перерисовке экрана не вернулись старые отметки
      marks.forEach(function (m) {
        var s = lm.students.find(function (x) { return String(x.id) === String(m.studentId); });
        if (s) s.mark = { attendance: m.attendance, homework: m.homework, activity: m.activity };
      });
      if (res.lessonId !== lm.lessonId) { // урок из шаблона сохранён в таблицу и получил постоянный ID
        lm.lessonId = res.lessonId; lm.key = res.lessonId;
        var c = App.current;
        if (c && c.key === 't.lesson' && LM === lm) App.replaceParams({ id: res.lessonId });
      }
      Object.keys(res.balances).forEach(function (sid) {
        var s = lm.students.find(function (x) { return String(x.id) === sid; });
        if (s) s.balance = res.balances[sid];
        var el = document.querySelector('.mrow[data-sid="' + sid + '"] [data-bal]');
        if (el && LM === lm) el.textContent = res.balances[sid];
      });
      if (lm.again || lm.finish || Object.keys(lm.dirty).length) { lm.again = false; return saveMarks(); }
      if (LM === lm) setStatus('saved');
      try { if (Api.isTg) Telegram.WebApp.disableClosingConfirmation(); } catch (e) { /* ignore */ }
    }).catch(function (err) {
      lm.saving = false;
      ids.forEach(function (id) { lm.dirty[id] = true; });
      if (LM === lm) setStatus('error');
      UI.toast(err.message, true);
      throw err;
    });
    return lm.promise;
  }
  // Свайпы по строке: вправо +1 активность, влево −1. Вертикальная прокрутка не мешает.
  function attachSwipes(list) {
    var startX = 0, startY = 0, row = null, dx = 0, horizontal = null;
    list.addEventListener('touchstart', function (e) {
      row = e.target.closest('.mrow'); if (!row) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; horizontal = null;
    }, { passive: true });
    list.addEventListener('touchmove', function (e) {
      if (!row) return;
      dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;
      if (horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
      if (horizontal) row.style.transform = 'translateX(' + Math.max(-70, Math.min(70, dx * 0.5)) + 'px)';
    }, { passive: true });
    list.addEventListener('touchend', function () {
      if (!row) return;
      var r = row; row.style.transform = ''; row = null;
      if (horizontal && Math.abs(dx) > 60) bump(r.dataset.sid, dx > 0 ? 1 : -1);
    });
  }

  // ─── Карточка урока ───
  function cardView(d) {
    var l = d.lesson;
    var html = '<div class="card">' +
      UI.fieldHtml({ name: 'topic', label: 'Тема урока', value: l.topic, placeholder: 'Например: Дроби. Сравнение дробей' }) +
      UI.fieldHtml({ name: 'homework', type: 'textarea', rows: 2, label: 'Домашнее задание', value: l.homework, placeholder: 'Что задано к следующему уроку' }) +
      UI.fieldHtml({ name: 'checklist', type: 'textarea', rows: 3, label: 'Чек-лист подготовки для учеников', value: l.checklist, placeholder: 'Каждый пункт с новой строки:\nУчебник\nЛинейка' }) +
      UI.fieldHtml({ name: 'notes', type: 'textarea', rows: 3, label: 'Заметки к уроку — видите только вы', value: l.notes }) +
      '<button class="btn block" data-act="saveCard">Сохранить</button></div>';
    html += '<div class="section-title">' + icon('file', 15) + ' Цифровой конспект</div><div class="card">';
    if (l.material_url) {
      html += Views.material(l) + '<div class="btn-row" style="margin-top:10px"><button class="btn plain sm" data-act="removeMaterial">Открепить</button></div>' +
        '<div class="sub" style="margin:12px 2px 6px">Заменить:</div>';
    } else {
      html += '<div class="sub" style="margin-bottom:10px">Вставьте ссылку на файл Google Диска или загрузите файл — он сохранится в папку класса и откроется у учеников по ссылке.</div>';
    }
    html += '<div style="display:flex;gap:8px"><input class="input" name="murl" placeholder="https://drive.google.com/…" style="flex:1">' +
      '<button class="btn sm" data-act="attachUrl">Прикрепить</button></div>' +
      '<button class="btn ghost block" data-act="upload" style="margin-top:8px">' + icon('upload', 18) + ' Загрузить файл</button>' +
      '<input type="file" id="mfile" data-change="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*"></div>';
    html += '<div class="section-title">Время и статус</div><div class="card flat">' +
      '<div class="row tap" data-act="reschedule">' + icon('calendar') + '<div class="row-main"><div class="row-title">Перенести или изменить</div>' +
      '<div class="row-sub">' + UI.dayLong(l.date) + ', ' + l.start + '–' + l.end + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>' +
      '<div class="row tap" data-act="cancel"' + (l.status === 'cancelled' ? '' : ' style="color:var(--danger)"') + '>' + icon(l.status === 'cancelled' ? 'check' : 'x') +
      '<div class="row-main">' + (l.status === 'cancelled' ? 'Вернуть урок' : 'Отменить урок') + '</div></div>' +
      (!l.template_id && !l.virtual ? '<div class="row tap" data-act="deleteLesson" style="color:var(--danger)">' + icon('trash') + '<div class="row-main">Удалить разовый урок</div></div>' : '') +
      '</div>';
    return html;
  }

  // ═════════════════════════ Награды ═════════════════════════
  S.rwSeg = '';
  App.screen('t.rewards', {
    title: 'Награды и баллы',
    load: function () { return Api.call('t.rewards'); },
    render: function (d) {
      var pending = d.requests.filter(function (r) { return r.status === 'pending'; });
      S.pending = pending.length;
      var seg = S.rwSeg || (pending.length ? 'requests' : 'shop');
      var html = '<div class="btn-row" style="margin-bottom:12px"><button class="btn ghost sm" data-act="go" data-screen="t.top">' + icon('trophy', 17) + ' Рейтинг</button>' +
        '<button class="btn ghost sm" data-act="go" data-screen="t.goal">' + icon('users', 17) + ' Цель класса</button>' +
        '<button class="btn ghost sm" data-act="go" data-screen="t.journal">' + icon('undo', 17) + ' История</button></div>' +
        '<div class="seg"><button data-act="seg" data-seg="requests" class="' + (seg === 'requests' ? 'on' : '') + '">Заявки' + (pending.length ? ' · ' + pending.length : '') + '</button>' +
        '<button data-act="seg" data-seg="shop" class="' + (seg === 'shop' ? 'on' : '') + '">Магазин</button>' +
        '<button data-act="seg" data-seg="rules" class="' + (seg === 'rules' ? 'on' : '') + '">Правила</button></div>';
      if (seg === 'requests') {
        html += pending.length ? pending.map(function (r) {
          return '<div class="card"><div class="row" style="padding:0;min-height:0"><div class="row-main"><div class="row-title">' + esc(r.student_name) +
            (r.class_name ? ' <span class="sub">· ' + esc(r.class_name) + '</span>' : '') + '</div><div class="row-sub wrap">' + esc(r.reward_title) + '</div></div>' +
            '<span class="pill warn">' + r.cost + ' б.</span></div><div class="sub" style="margin:6px 0 10px">Баланс ученика: ' + UI.pts(r.balance) + ' · ' + UI.dateTime(r.created_at) + '</div>' +
            '<div class="btn-row"><button class="btn plain sm" data-act="decide" data-id="' + esc(r.id) + '" data-ok="0">Отклонить</button>' +
            '<button class="btn sm" data-act="decide" data-id="' + esc(r.id) + '" data-ok="1"' + (r.balance < r.cost ? ' disabled' : '') + '>Подтвердить</button></div></div>';
        }).join('') : '<div class="card empty">' + icon('gift', 28) + '<div>Новых заявок нет</div></div>';
        var done = d.requests.filter(function (r) { return r.status !== 'pending'; });
        if (done.length) {
          html += '<div class="section-title">История</div><div class="card flat">' + done.map(function (r) {
            var st = { approved: ['ok', 'выдана'], rejected: ['bad', 'отклонена'], cancelled: ['', 'отменена'] }[r.status] || ['', r.status];
            return '<div class="row"><div class="row-main"><div class="row-title">' + esc(r.reward_title) + '</div><div class="row-sub">' + esc(r.student_name) +
              ' · ' + UI.dateTime(r.decided_at || r.created_at) + '</div></div><span class="pill ' + st[0] + '">' + st[1] + '</span></div>';
          }).join('') + '</div>';
        }
      } else if (seg === 'shop') {
        html += d.rewards.length ? '<div class="card flat">' + d.rewards.map(function (r) {
          return '<div class="row tap" data-act="edit" data-id="' + esc(r.id) + '"' + (r.active ? '' : ' style="opacity:.5"') + '><div class="row-main"><div class="row-title">' + esc(r.title) + '</div>' +
            '<div class="row-sub">' + (r.active ? '' : 'скрыта · ') + (r.stock !== '' ? 'осталось ' + r.stock + ' · ' : '') + esc(r.description || '') + '</div></div>' +
            '<span class="pill accent">' + r.cost + ' б.</span></div>';
        }).join('') + '</div>' : '<div class="card empty">' + icon('gift', 28) + '<div>Добавьте награды, на которые ученики смогут обменять баллы</div></div>';
        html += '<button class="btn block" data-act="edit">' + icon('plus') + ' Добавить награду</button>';
      } else {
        var r = d.rules;
        html += '<div class="card"><h3>Начисление баллов</h3><div class="sub" style="margin-bottom:12px">Баллы начисляются автоматически при отметках на уроке. 0 — баллы не давать. Изменения действуют для новых отметок.</div>' +
          [[UI.fieldHtml({ name: 'attendance', type: 'number', label: 'Присутствие', value: r.attendance }), UI.fieldHtml({ name: 'late', type: 'number', label: 'Опоздание', value: r.late })],
            [UI.fieldHtml({ name: 'homework', type: 'number', label: 'ДЗ выполнено', value: r.homework }), UI.fieldHtml({ name: 'homeworkPartial', type: 'number', label: 'ДЗ частично', value: r.homeworkPartial })],
            [UI.fieldHtml({ name: 'activity', type: 'number', label: 'Активность (за «+»)', value: r.activity }), UI.fieldHtml({ name: 'uniform', type: 'number', label: 'Школьная форма', value: r.uniform })]]
            .map(function (p) { return '<div class="field-row">' + p.join('') + '</div>'; }).join('') +
          '<h3 style="margin-top:6px">За оценки</h3><div class="sub" style="margin-bottom:12px">Оценка ставится в мастере проверки ДЗ, а баллы добавляются к ней.</div>' +
          '<div class="field-row">' + UI.fieldHtml({ name: 'grade5', type: 'number', label: '«5»', value: r.grade5 }) + UI.fieldHtml({ name: 'grade4', type: 'number', label: '«4»', value: r.grade4 }) +
          UI.fieldHtml({ name: 'grade3', type: 'number', label: '«3»', value: r.grade3 }) + UI.fieldHtml({ name: 'grade2', type: 'number', label: '«2»', value: r.grade2 }) + '</div>' +
          '<h3 style="margin-top:6px">Серия ДЗ</h3><div class="sub" style="margin-bottom:12px">Бонус за каждые N выполненных ДЗ подряд. 0 — без бонуса.</div>' +
          '<div class="field-row">' + UI.fieldHtml({ name: 'streakLength', type: 'number', label: 'ДЗ подряд (N)', value: r.streakLength }) +
          UI.fieldHtml({ name: 'streakBonus', type: 'number', label: 'Бонус', value: r.streakBonus }) + '</div>' +
          '<button class="btn block" data-act="saveRules">Сохранить правила</button></div>';
      }
      return html;
    },
    mount: function () { App.syncChrome(); },
    actions: {
      seg: function (el) { S.rwSeg = el.dataset.seg; App.repaint(true); },
      decide: function (el) {
        var ok = el.dataset.ok === '1';
        App.run('t.requests.decide', { id: el.dataset.id, approve: ok }, { ok: ok ? 'Награда выдана, баллы списаны' : 'Заявка отклонена' });
      },
      edit: function (el, d) {
        var r = d.rewards.find(function (x) { return x.id === el.dataset.id; }) || { active: true, stock: '' };
        UI.form({ title: r.id ? 'Награда' : 'Новая награда',
          fields: [{ name: 'title', label: 'Название', value: r.title, required: true, placeholder: 'Например: выбрать место в классе' },
            { name: 'description', label: 'Описание (необязательно)', value: r.description },
            [{ name: 'cost', type: 'number', label: 'Стоимость, баллов', value: r.cost || 20, required: true }, { name: 'stock', type: 'number', label: 'Количество', value: r.stock, placeholder: 'без лимита' }],
            { name: 'active', type: 'toggle', label: 'Показывать ученикам', value: r.active }],
          onSubmit: function (v) { v.id = r.id; return Api.call('t.rewards.save', v); },
          extra: r.id ? { label: 'Удалить награду', onClick: function () {
            return UI.confirm('Удалить награду «' + r.title + '»?', 'Удалить', true).then(function (ok) {
              return ok ? App.run('t.rewards.delete', { id: r.id }, { ok: 'Удалено' }) : false;
            });
          } } : null })
          .then(function (res) { if (res) { UI.toast('Сохранено'); App.reload(); } });
      },
      saveRules: function () {
        var v = {};
        ['attendance', 'late', 'homework', 'homeworkPartial', 'activity', 'uniform', 'grade5', 'grade4', 'grade3', 'grade2', 'streakLength', 'streakBonus'].forEach(function (k) {
          v[k] = document.querySelector('[name=' + k + ']').value;
        });
        App.run('t.rules.save', v, { ok: 'Правила сохранены' });
      }
    }
  });

  // ═════════════════════════ Настройки ═════════════════════════
  // Ключ для расширения Chrome: показать, скопировать, заменить, отключить
  function extKeySheet(p) {
    if (Api.mode === 'demo') {
      UI.openSheet('<h3>Расширение для Chrome</h3><p class="sub" style="color:var(--warn)"><b>Сейчас открыт демо-режим</b> (вымышленные данные) — ' +
        'здесь ключ не настоящий, сервер его не примет.</p><p class="sub">Откройте приложение <b>через Telegram</b> (Telegram Desktop на компьютере ' +
        'или на телефоне) → Настройки → Расширение для Chrome → «Копировать ключ». Потом вставьте ключ в расширение.</p>');
      return;
    }
    Api.call('t.ext.key', p).then(function (r) {
      if (!r.key) { UI.toast('Расширение отключено'); return; }
      var html = '<h3>Расширение для Chrome</h3><p class="sub">1. Установите расширение (папка <b>extension</b> из проекта, инструкция в docs/02-настройка.md).<br>' +
        '2. Нажмите на значок расширения и вставьте этот ключ.<br>3. Откройте в emaktab расписание или домашние задания — внизу справа появится кнопка «В помощник».</p>' +
        '<div class="input" style="font-family:monospace;word-break:break-all;user-select:all;margin:10px 0">' + esc(r.key) + '</div>' +
        '<p class="sub">Ключ — как пароль: не отправляйте его ученикам. Он даёт только перенос расписания и тем из emaktab.</p>' +
        '<div class="btn-row"><button class="btn" data-copy>' + icon('copy', 18) + ' Копировать ключ</button></div>' +
        '<div class="btn-row"><button class="btn plain sm" data-renew>' + icon('refresh', 16) + ' Новый ключ</button><button class="btn plain sm" data-off>Отключить</button></div>';
      var s = UI.openSheet(html);
      s.el.addEventListener('click', function (e) {
        if (e.target.closest('[data-copy]')) UI.copy(r.key);
        if (e.target.closest('[data-renew]')) { s.close(); extKeySheet({ renew: true }); }
        if (e.target.closest('[data-off]')) { s.close(); extKeySheet({ off: true }); }
      });
    }, function (err) { UI.toast(err.message, true); });
  }

  App.screen('t.settings', {
    title: 'Настройки',
    load: function () { return Api.call('t.home'); },
    render: function (d) {
      var s = d.settings, t = Logic.util.truthy;
      var tog = function (key, label, hint) {
        return '<div class="toggle-row"><div class="row-main">' + label + (hint ? '<div class="sub">' + hint + '</div>' : '') + '</div>' +
          '<label class="switch"><input type="checkbox" data-change="ps" data-key="' + key + '"' + (t(s[key]) ? ' checked' : '') + '><span></span></label></div>';
      };
      var html = App.roleSwitcher();
      html += '<div class="section-title">' + icon('clipboard', 15) + ' Мои предметы и проверка ДЗ</div><div class="card flat">' +
        '<div class="row tap" data-act="go" data-screen="t.checks">' + icon('calendar') + '<div class="row-main"><div class="row-title">Мои предметы, дни проверки, напоминания</div>' +
        '<div class="row-sub">' + esc(s.check_subjects ? 'Мои предметы: ' + s.check_subjects + ' — в расписании видны только они' : 'Выберите свои предметы — в расписании останутся только они') + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div></div>';
      html += '<div class="section-title">' + icon('upload', 15) + ' Импорт из emaktab</div><div class="card flat">' +
        [['students', 'Список учеников', 'один раз в начале года'], ['schedule', 'Расписание', 'шаблон недели'], ['topics', 'Темы и домашние задания', 'по датам или по КТП']]
          .map(function (k) {
            return '<div class="row tap" data-act="go" data-screen="t.import" data-params="' + esc(JSON.stringify({ kind: k[0] })) + '"><div class="row-main"><div class="row-title">' + k[1] +
              '</div><div class="row-sub">' + k[2] + '</div></div><span class="chev">' + icon('chev', 16) + '</span></div>';
          }).join('') +
        '<div class="row tap" data-act="extKey"><div class="row-main"><div class="row-title">Расширение для Chrome</div>' +
        '<div class="row-sub">кнопка «В помощник» прямо на страницах emaktab — без копирования</div></div><span class="chev">' + icon('chev', 16) + '</span></div></div>';
      html += '<div class="section-title">' + icon('star', 15) + ' Игровой режим</div><div class="card" style="padding:4px 14px">' +
        tog('game_enabled', 'Уровни, значки, цель класса и украшения', 'Ученики видят свой уровень, значки, общую цель и покупают украшения для аватара; одноклассники видят аватар, уровень и значки друг друга') +
        '<div class="sub" style="margin:8px 0 6px">Цены украшений</div><div class="seg">' + [[50, 'Дешевле ½'], [100, 'Обычные'], [150, '×1,5'], [200, '×2']].map(function (x) {
          return '<button data-act="price" data-v="' + x[0] + '" class="' + (+(s.shop_price_pct || 100) === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
        }).join('') + '</div></div>';
      html += '<div class="section-title">' + icon('eye', 15) + ' Что видят родители</div><div class="card" style="padding:4px 14px">' +
        tog('parent_show_attendance', 'Посещаемость') + tog('parent_show_homework', 'Сдача домашних заданий') +
        tog('parent_show_points', 'Баллы, история и достижения') + tog('parent_show_materials', 'Темы уроков, ДЗ и конспекты') + '</div>' +
        '<div class="sub" style="margin:0 4px">Личные заметки включаются отдельно в карточке каждого ученика. Чужих детей родитель не видит никогда.</div>';
      html += '<div class="section-title">' + icon('user', 15) + ' Профиль</div><div class="card">' +
        UI.fieldHtml({ name: 'teacher_name', label: 'Как к вам обращаться', value: s.teacher_name }) +
        '<div class="section-title" style="margin:6px 0 8px">Telegram-бот (для ссылок-приглашений)</div>' +
        '<div class="field-row">' + UI.fieldHtml({ name: 'bot_username', label: 'Имя бота (без @)', value: s.bot_username, placeholder: 'my_school_bot' }) +
        UI.fieldHtml({ name: 'app_short_name', label: 'Короткое имя приложения', value: s.app_short_name, placeholder: 'app' }) + '</div>' +
        '<div class="sub" style="margin-bottom:10px">Ссылки будут вида: ' + esc(s.bot_username && s.app_short_name ? 't.me/' + s.bot_username + '/' + s.app_short_name + '?startapp=код' : 't.me/имя_бота/короткое_имя?startapp=код') + '</div>' +
        '<button class="btn block" data-act="saveProfile">Сохранить</button></div>';
      html += '<div class="section-title">О системе</div><div class="card flat">' +
        '<div class="row">' + icon(Api.mode === 'demo' ? 'play' : 'check') + '<div class="row-main"><div class="row-title">' +
        (Api.mode === 'demo' ? 'Демо-режим' : 'Подключено к Google Таблице') + '</div><div class="row-sub">' +
        (Api.mode === 'demo' ? 'Данные вымышленные и хранятся только в этом браузере' : 'Данные хранятся в вашем Google-аккаунте') + '</div></div></div>' +
        '<div class="row">' + icon('book') + '<div class="row-main"><div class="row-title">Версия ' + esc(Logic.VERSION) + '</div><div class="row-sub">Инструкция по настройке — в файле docs/02-настройка.md</div></div></div>' +
        (Api.mode === 'demo' ? '<div class="row tap" data-act="resetDemo">' + icon('history') + '<div class="row-main">Сбросить демо-данные</div></div>' : '') + '</div>';
      return html;
    },
    actions: {
      ps: function (el) { var p = {}; p[el.dataset.key] = el.checked; App.run('t.settings.save', p, { ok: 'Сохранено' }); },
      extKey: function () { extKeySheet({}); },
      price: function (el) { App.run('t.settings.save', { shop_price_pct: +el.dataset.v }, { ok: 'Цены сохранены' }); },
      saveProfile: function () {
        var v = function (n) { return document.querySelector('[name=' + n + ']').value; };
        App.run('t.settings.save', { teacher_name: v('teacher_name'), bot_username: v('bot_username'), app_short_name: v('app_short_name') }, { ok: 'Сохранено' });
      },
      resetDemo: function () {
        UI.confirm('Сбросить демо-данные к исходным?', 'Сбросить').then(function (ok) { if (ok) { Demo.reset(); App.boot(); } });
      }
    }
  });
})();
