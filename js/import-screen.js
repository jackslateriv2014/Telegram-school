/**
 * import-screen.js — экран учителя «Импорт из emaktab»: вставить скопированную страницу →
 * проверить, как она распознана → посмотреть план изменений → импортировать.
 * Ничего не записывается, пока учитель не нажмёт «Импортировать».
 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;
  var KINDS = { classes: 'Классы', students: 'Ученики', schedule: 'Расписание', topics: 'Темы и ДЗ' };
  var HOWTO = {
    classes: 'В emaktab откройте «Образование → Мои классы». Нажмите Ctrl+A (выделить всё), затем Ctrl+C и вставьте сюда Ctrl+V. Классы создадутся сами.',
    students: 'В emaktab откройте класс → «Люди» → «Ученики». Нажмите Ctrl+A, Ctrl+C и вставьте сюда. Меню сайта и возраст учеников отбросятся автоматически.',
    schedule: 'В emaktab откройте «Расписание» класса (неделя). Нажмите Ctrl+A, Ctrl+C и вставьте сюда — таблица считается вместе с днями, временем и учителями.',
    topics: 'В emaktab откройте «Домашние задания», выберите класс, нажмите Ctrl+A, Ctrl+C и вставьте сюда. Подойдёт и КТП из Word/Excel.'
  };
  var IM = { kind: 'classes', classId: '', text: '', rows: null, g: null, grid: null, plan: null, people: null, classes: null, lost: false, teachers: [],
    opts: { format: 'first_last', surnameFirst: true, replace: false, onlyClass: false, mode: 'dates', from: '', subject: '',
      overwrite: false, hwDue: true, createMissing: true, createClasses: true, teacher: localStorage.getItem('uchpom_teacher_filter') || '',
      bells: localStorage.getItem('uchpom_bells') || Importer.DEFAULT_BELLS } };

  function className(d) { var c = d.classes.find(function (x) { return x.id === IM.classId; }); return c ? c.name : ''; }
  function toggle(name, label, hint) {
    return '<div class="toggle-row"><div class="row-main">' + label + (hint ? '<div class="sub">' + hint + '</div>' : '') + '</div>' +
      '<label class="switch"><input type="checkbox" data-change="opt" data-opt="' + name + '"' + (IM.opts[name] ? ' checked' : '') + '><span></span></label></div>';
  }
  function seg(act, items, val) {
    return '<div class="seg">' + items.map(function (x) {
      return '<button data-act="' + act + '" data-v="' + x[0] + '" class="' + (x[0] === val ? 'on' : '') + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }
  function select(change, label, value, options) {
    return UI.fieldHtml({ name: change, type: 'select', label: label, value: value, options: options }).replace('<select', '<select data-change="' + change + '"');
  }

  App.screen('t.import', {
    title: 'Импорт из emaktab',
    load: function (p) {
      if (p.kind && KINDS[p.kind] && p.kind !== IM.kind) reset(p.kind);
      if (p.classId) IM.classId = p.classId;
      return Api.call('t.home');
    },
    render: function (d) {
      IM.today = d.today;
      var o = IM.opts;
      var html = seg('kind', Object.keys(KINDS).map(function (k) { return [k, KINDS[k]]; }), IM.kind);
      if (IM.kind !== 'classes') {
        if (!d.classes.length) {
          return html + '<div class="card empty">' + icon('users', 28) + '<div>Сначала создайте классы — проще всего импортом со страницы «Мои классы».</div>' +
            '<div style="height:10px"></div><button class="btn ghost sm" data-act="kind" data-v="classes">Импортировать классы</button></div>';
        }
        if (!d.classes.some(function (c) { return c.id === IM.classId; })) IM.classId = d.classes[0].id;
        html += '<div class="card">' + (isMulti()
          ? '<div class="row-title">Классы — из вставленной страницы</div><div class="sub" style="margin-bottom:4px">Каждая строка попадёт в свой класс: ' + esc(multiNames().join(', ')) + '</div>' +
            toggle('createClasses', 'Создать недостающие классы', 'Если какого-то класса ещё нет в приложении')
          : select('cls', 'Класс', IM.classId, d.classes.map(function (c) { return { value: c.id, label: c.name }; })));
        if (IM.kind === 'students') {
          html += select('fmt', 'Как записать имена', o.format, [{ value: 'first_last', label: 'Имя Фамилия (без отчества)' },
            { value: 'short', label: 'Имя Ф. — меньше личных данных' }, { value: 'full', label: 'Полностью, как в emaktab' }]) +
            toggle('surnameFirst', 'В emaktab сначала фамилия', 'Обычно так: «Каримов Азиз Акмалович»');
        } else if (IM.kind === 'schedule') {
          html += toggle('replace', 'Заменить текущий шаблон класса', 'Уроки шаблона, которых нет во вставленном расписании, будут удалены');
        } else {
          html += seg('mode', [['dates', 'По датам из таблицы'], ['sequence', 'По порядку (КТП)']], o.mode);
          if (o.mode === 'sequence') {
            html += '<div class="field-row">' + UI.fieldHtml({ name: 'from', type: 'date', label: 'Начиная с урока', value: o.from || d.today }).replace('<input', '<input data-change="from"') +
              UI.fieldHtml({ name: 'subject', label: 'Предмет', value: o.subject, placeholder: 'например, Литература' }).replace('<input', '<input data-change="subject"') + '</div>' +
              '<div class="sub" style="margin:-4px 2px 6px">Темы встанут по очереди на ближайшие уроки этого предмета по расписанию.</div>';
          } else {
            html += toggle('hwDue', 'Дата — это урок, к которому задано ДЗ', 'Как в emaktab: ДЗ запишется в предыдущий урок этого предмета — ученик увидит его сразу после урока') +
              toggle('createMissing', 'Создавать уроки, которых нет в расписании', 'Время — по номеру урока и расписанию звонков');
          }
          html += toggle('overwrite', 'Заменять уже заполненное', 'Выключено — темы и ДЗ, которые вы уже вписали, не трогаем');
        }
        if (IM.kind === 'schedule' || (IM.kind === 'topics' && o.mode === 'dates' && o.createMissing)) {
          html += '<details style="margin-top:8px"><summary class="sub">Расписание звонков (если вместо времени указан номер урока)</summary><div style="height:8px"></div>' +
            '<textarea class="input" rows="5" data-change="bells">' + esc(o.bells) + '</textarea></details>';
        }
        html += '</div>';
      }

      html += '<div class="section-title">1. Вставьте страницу</div><div class="card"><div class="sub" style="margin-bottom:8px">' + HOWTO[IM.kind] + '</div>' +
        '<textarea class="input" id="imText" rows="6" placeholder="Вставьте сюда (Ctrl+V)" style="font-size:13px">' + esc(IM.text) + '</textarea>' +
        '<div class="btn-row" style="margin-top:8px"><button class="btn" data-act="parse">Распознать</button>' +
        (IM.text ? '<button class="btn plain" data-act="clear">Очистить</button>' : '') + '</div>' +
        '<div class="sub" style="margin-top:8px">Удобнее делать с компьютера: Telegram Desktop или web.telegram.org.</div></div>';

      if (IM.lost) html += lostView();
      else if (IM.classes || IM.people || IM.rows) html += previewView(d);
      if (IM.plan) html += planView();
      return html;
    },
    mount: function (view) {
      var ta = view.querySelector('#imText');
      if (ta) {
        ta.addEventListener('input', function () { IM.text = ta.value; });
        // Если в буфере есть HTML-таблица — берём её: так ячейки не «рассыпаются»
        ta.addEventListener('paste', function (e) {
          var html = e.clipboardData && e.clipboardData.getData('text/html');
          var tsv = html && IM.kind !== 'classes' && IM.kind !== 'students' ? Importer.htmlToTsv(html) : '';
          if (!tsv) return;
          e.preventDefault();
          ta.value = IM.text = tsv;
          IM.fromHtml = true;
          UI.toast('Таблица считана из буфера');
        });
      }
      if (IM.scrollTo) { var el = view.querySelector(IM.scrollTo); if (el) el.scrollIntoView({ block: 'start' }); IM.scrollTo = null; }
    },
    actions: {
      kind: function (el) { reset(el.dataset.v); App.repaint(true); },
      cls: function (el) { IM.classId = el.value; IM.plan = null; App.repaint(true); },
      fmt: function (el) { IM.opts.format = el.value; IM.plan = null; reparse(); App.repaint(true); },
      opt: function (el) { IM.opts[el.dataset.opt] = el.checked; IM.plan = null; if (el.dataset.opt === 'surnameFirst') reparse(); App.repaint(true); },
      mode: function (el) { IM.opts.mode = el.dataset.v; IM.plan = null; App.repaint(true); },
      from: function (el) { IM.opts.from = el.value; IM.plan = null; },
      subject: function (el) { IM.opts.subject = el.value; IM.plan = null; },
      teacher: function (el) { IM.opts.teacher = el.value; localStorage.setItem('uchpom_teacher_filter', el.value); IM.plan = null; App.repaint(true); },
      bells: function (el) { IM.opts.bells = el.value; localStorage.setItem('uchpom_bells', el.value); IM.plan = null; App.repaint(true); },
      clear: function () { var k = IM.kind; reset(k); App.repaint(true); },
      parse: function (el, d) {
        IM.text = document.getElementById('imText').value;
        if (!IM.text.trim()) return UI.toast('Сначала вставьте скопированную страницу');
        IM.plan = null;
        if (!parseText(d.today)) return;
        IM.scrollTo = '#imPreview';
        App.repaint(true);
      },
      role: function (el) {
        var c = +el.dataset.col, role = el.value;
        IM.g.mapping = IM.g.mapping.map(function (r, i) { return i === c ? role : (r === role && role ? '' : r); });
        IM.plan = null; App.repaint(true);
      },
      header: function (el) { IM.g.header = el.checked ? 0 : -1; IM.plan = null; App.repaint(true); },
      check: function (el, d) { send(d, true); },
      apply: function (el, d) { send(d, false); }
    }
  });

  function reset(kind) {
    IM.kind = kind; IM.text = ''; IM.rows = null; IM.g = null; IM.grid = null; IM.plan = null;
    IM.people = null; IM.classes = null; IM.lost = false; IM.teachers = []; IM.fromHtml = false; IM.scheduleMulti = false;
  }
  function reparse() { if (IM.people) IM.people = Importer.studentsFromText(IM.text, IM.opts); }

  // Разобрать вставленный текст. Возвращает false, если распознать не удалось.
  function parseText(today) {
    var text = IM.text;
    IM.rows = IM.people = IM.classes = null; IM.lost = false;
    if (IM.kind === 'classes') {
      IM.classes = Importer.toClasses(text);
      if (!IM.classes.length) { UI.toast('Не нашёл названий классов (вида «10-A»). Скопируйте страницу «Мои классы».', true); return false; }
      return true;
    }
    if (IM.kind === 'students' && text.indexOf('\t') < 0) { // перечень, а не таблица
      IM.people = Importer.studentsFromText(text, IM.opts);
      if (!IM.people.names.length) { UI.toast('Не нашёл имён учеников. Скопируйте страницу класса «Люди → Ученики».', true); return false; }
      return true;
    }
    if (IM.kind === 'schedule' && Importer.lostCells(text)) { IM.lost = true; return true; }
    IM.rows = Importer.parseTable(text);
    if (!IM.rows.length) { UI.toast('Не удалось найти таблицу во вставленном тексте', true); return false; }
    IM.grid = IM.kind === 'schedule' ? Importer.detectGrid(IM.rows) : null;
    IM.g = Importer.guess(IM.kind, IM.rows, today);
    if (IM.kind === 'topics') IM.opts.mode = IM.g.mapping.indexOf('date') >= 0 ? 'dates' : 'sequence';
    if (IM.kind === 'schedule') {
      // Список учителей из расписания — чтобы взять только свои уроки
      var all = Importer.toTemplates(IM.rows, IM.g, { grid: IM.grid, bells: IM.opts.bells }).rows, count = {};
      all.forEach(function (r) { if (r.teacher) count[r.teacher] = (count[r.teacher] || 0) + 1; });
      IM.teachers = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
      if (IM.opts.teacher && IM.teachers.indexOf(IM.opts.teacher) < 0) IM.opts.teacher = '';
      IM.scheduleMulti = all.some(function (r) { return r.className; }); // расписание учителя: в ячейках классы
      IM.opts.onlyClass = !IM.teachers.length && IM.rows.some(function (r) { return r.some(Importer.cellHasClass); });
    }
    return true;
  }

  // «Сразу все классы»: в расписании учителя у каждого урока есть класс, в ДЗ — столбец «Кому выдано»
  function isMulti() {
    if (IM.kind === 'schedule') return !!(IM.rows && IM.scheduleMulti);
    if (IM.kind === 'topics') return !!(IM.g && IM.g.mapping.indexOf('class') >= 0);
    return false;
  }
  function multiNames() {
    var b = build(null, true), seen = [];
    (b.list || []).forEach(function (x) { if (x.className && seen.indexOf(x.className) < 0) seen.push(x.className); });
    return seen.sort(function (a, c) { return parseInt(a, 10) - parseInt(c, 10) || (a < c ? -1 : 1); });
  }

  // Собрать данные для сервера
  function build(d, raw) {
    var o = IM.opts;
    if (isMulti()) {
      var list = IM.kind === 'schedule'
        ? Importer.toTemplates(IM.rows, IM.g, { grid: IM.grid, bells: o.bells }).rows
        : Importer.toTopics(IM.rows, IM.g, { today: IM.today, bells: o.bells });
      var problems = list.problems || [];
      list = list.items || list;
      if (raw) return { list: list };
      var groups = Importer.groupByClass(list).map(function (g) {
        return IM.kind === 'schedule' ? { className: g.className, rows: g.list } : { className: g.className, items: g.list };
      });
      return { multi: true, payload: { kind: IM.kind === 'schedule' ? 'templates' : 'topics', groups: groups, createClasses: o.createClasses,
        replace: o.replace, mode: 'dates', overwrite: o.overwrite, hwDue: o.hwDue, createMissing: o.createMissing }, problems: problems, count: list.length };
    }
    if (IM.kind === 'classes') return { payload: { classes: IM.classes }, problems: [], count: IM.classes.length };
    if (IM.kind === 'students') {
      var s = IM.people || Importer.toStudents(IM.rows, IM.g, { format: o.format, surnameFirst: o.surnameFirst });
      return { payload: { names: s.names }, problems: s.problems, count: s.names.length };
    }
    if (IM.kind === 'schedule') {
      var t = Importer.toTemplates(IM.rows, IM.g, { grid: IM.grid, bells: o.bells, className: className(d), onlyClass: o.onlyClass, teacher: o.teacher });
      return { payload: { rows: t.rows, replace: o.replace }, problems: t.problems, count: t.rows.length };
    }
    var x = Importer.toTopics(IM.rows, IM.g, { today: IM.today, bells: o.bells });
    return { payload: { items: x.items, mode: o.mode, from: o.from, subject: o.subject, overwrite: o.overwrite, hwDue: o.hwDue,
      createMissing: o.createMissing }, problems: x.problems, count: x.items.length };
  }

  function lostView() {
    return '<div class="section-title" id="imPreview">2. Не получилось разобрать</div><div class="card" style="border-left:3px solid var(--warn)">' +
      '<div class="row-title wrap">При вставке потерялись границы ячеек — непонятно, какой урок к какому дню относится.</div>' +
      '<div class="sub" style="margin-top:6px">Так бывает, если текст прошёл через другую программу (мессенджер, заметки). Попробуйте:<br>' +
      '1) скопировать страницу расписания в браузере (Ctrl+A, Ctrl+C) и сразу вставить сюда — в Telegram Desktop или web.telegram.org;<br>' +
      '2) или нажать в emaktab «Экспорт», открыть файл в Excel / Google Таблицах, скопировать таблицу оттуда и вставить сюда.</div></div>';
  }

  function previewView(d) {
    var html = '<div class="section-title" id="imPreview">2. Проверьте распознавание</div><div class="card">';
    if (IM.classes) {
      html += '<div class="sub" style="margin-bottom:6px">Найдены классы:</div>' + IM.classes.map(function (c) {
        return '<div class="toggle-row"><div class="row-main"><b>' + esc(c.name) + '</b>' + (c.subjects.length ? '<div class="sub">' + esc(c.subjects.join(', ')) + '</div>' : '') + '</div></div>';
      }).join('');
    } else if (IM.people) {
      html += '<div class="sub" style="margin-bottom:6px">Так будут записаны имена:</div><div style="columns:2;column-gap:16px;font-size:14px">' +
        IM.people.names.map(function (n, i) { return '<div>' + (i + 1) + '. ' + esc(n) + '</div>'; }).join('') + '</div>';
    } else if (IM.grid) {
      var days = Object.keys(IM.grid.days).map(function (c) { return UI.WD_SHORT[IM.grid.days[c] - 1]; }).join(', ');
      html += '<div class="row-title">Распознана сетка расписания: ' + days + '</div>';
      if (IM.scheduleMulti) {
        html += '<div class="sub" style="margin-top:6px">Это расписание учителя: у каждого урока указан класс, уроки разойдутся по своим классам.</div>';
      } else if (IM.teachers.length) {
        html += '<div style="height:10px"></div>' + select('teacher', 'Чьи уроки взять', IM.opts.teacher,
          [{ value: '', label: 'Все уроки класса' }].concat(IM.teachers.map(function (t) { return { value: t, label: t }; }))) +
          '<div class="sub" style="margin:-4px 2px 4px">Выберите себя — в приложение попадут только ваши уроки. Выбор запомнится.</div>';
      } else if (IM.rows.some(function (r) { return r.some(Importer.cellHasClass); })) {
        html += toggle('onlyClass', 'Брать только уроки класса «' + esc(className(d)) + '»', 'В ячейках указаны классы — уроки других классов пропустим');
      }
    } else {
      var roles = Importer.ROLES[IM.kind];
      html += '<div class="sub" style="margin-bottom:8px">Что означает каждый столбец? Если угадано неверно — выберите вручную.</div>' +
        '<div class="toggle-row" style="padding-top:0"><div class="row-main">Первая строка — заголовки</div><label class="switch"><input type="checkbox" data-change="header"' +
        (IM.g.header >= 0 ? ' checked' : '') + '><span></span></label></div>';
      html += '<div style="overflow-x:auto;margin:0 -14px;padding:0 14px"><table style="border-collapse:collapse;font-size:13px;min-width:100%"><tr>' +
        IM.rows[0].map(function (h, c) {
          return '<th style="padding:4px;min-width:120px;vertical-align:bottom"><select class="input" style="min-height:36px;padding:6px;font-size:13px" data-change="role" data-col="' + c + '">' +
            '<option value="">— не нужен —</option>' + roles.map(function (r) {
              return '<option value="' + r + '"' + (IM.g.mapping[c] === r ? ' selected' : '') + '>' + Importer.ROLE_NAMES[r] + '</option>';
            }).join('') + '</select></th>';
        }).join('') + '</tr>' +
        IM.rows.slice(0, 7).map(function (r, i) {
          var isHead = i === IM.g.header;
          return '<tr>' + r.map(function (cell, c) {
            var v = cell.replace(/\s*¶\s*/g, ' · ');
            return '<td style="padding:5px 4px;border-top:1px solid var(--line);vertical-align:top;' + (isHead ? 'font-weight:600;color:var(--hint);' : '') +
              (IM.g.mapping[c] ? '' : 'opacity:.4;') + '">' + esc(v.length > 70 ? v.slice(0, 70) + '…' : v) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</table></div>' + (IM.rows.length > 7 ? '<div class="sub" style="margin-top:6px">…и ещё ' + (IM.rows.length - 7) + ' строк</div>' : '');
    }
    var b = build(d);
    html += '<div style="margin-top:10px"><b>Найдено: ' + b.count + '</b>' + (b.problems.length ? ' · <span style="color:var(--warn)">замечаний: ' + b.problems.length + '</span>' : '') + '</div>';
    if (b.problems.length) html += '<div class="sub">' + b.problems.slice(0, 3).map(esc).join('<br>') + '</div>';
    html += '<button class="btn block" data-act="check" style="margin-top:10px"' + (b.count ? '' : ' disabled') + '>Показать, что изменится</button></div>';
    return html;
  }

  var STATUS = { new: ['ok', 'добавим'], create: ['ok', 'создадим урок'], update: ['accent', 'обновим'], skip: ['', 'пропустим'],
    remove: ['bad', 'удалим'], error: ['warn', 'ошибка'], nolesson: ['warn', 'нет урока'] };
  function planView() {
    var counts = {};
    IM.plan.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
    var todo = (counts.new || 0) + (counts.create || 0) + (counts.update || 0) + (counts.remove || 0);
    var html = '<div class="section-title" id="imPlan">3. Что изменится</div><div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      Object.keys(counts).map(function (k) { return '<span class="pill ' + STATUS[k][0] + '">' + STATUS[k][1] + ': ' + counts[k] + '</span>'; }).join('') + '</div></div>';
    html += '<div class="card flat">' + IM.plan.slice(0, 150).map(function (x) {
      var title, sub = [];
      var pre = x.className ? '<b>' + esc(x.className) + '</b> · ' : '';
      if (IM.kind === 'classes') { title = esc(x.name); if (x.subjects && x.subjects.length) sub.push(esc(x.subjects.join(', '))); }
      else if (IM.kind === 'students') title = esc(x.name);
      else if (IM.kind === 'schedule') { title = UI.WD_SHORT[x.weekday - 1] || '?'; title += ' ' + (x.start || '') + '–' + (x.end || '') + ' · ' + esc(x.subject || ''); if (x.room) sub.push('каб. ' + esc(x.room)); }
      else {
        title = (x.date ? UI.dayShort(x.date) : 'без даты') + (x.start ? ', ' + x.start : '') + (x.subject ? ' · ' + esc(x.subject) : '');
        if (x.topic) sub.push('Тема: ' + esc(x.topic));
        if (x.homework) sub.push('ДЗ: ' + esc(x.homework) + (x.hwDate && x.hwDate !== x.date ? ' → в урок ' + UI.dayShort(x.hwDate) : ''));
      }
      if (x.note) sub.push('<i>' + esc(x.note) + '</i>');
      title = pre + title;
      var st = STATUS[x.status] || ['', x.status];
      return '<div class="row"><div class="row-main"><div class="row-title wrap">' + title + '</div>' +
        (sub.length ? '<div class="row-sub wrap">' + sub.join('<br>') + '</div>' : '') + '</div><span class="pill ' + st[0] + '">' + st[1] + '</span></div>';
    }).join('') + (IM.plan.length > 150 ? '<div class="row"><div class="row-sub">…и ещё ' + (IM.plan.length - 150) + '</div></div>' : '') + '</div>';
    html += '<div class="sticky-bottom"><button class="btn block" data-act="apply"' + (todo ? '' : ' disabled') + '>' +
      (todo ? 'Импортировать (' + todo + ')' : 'Нечего импортировать') + '</button></div>';
    return html;
  }

  function send(d, dryRun) {
    var b = build(d);
    var payload = Object.assign({ classId: IM.classId, dryRun: dryRun }, b.payload);
    var action = b.multi ? 't.import.multi' : { classes: 't.import.classes', students: 't.import.students', schedule: 't.import.templates', topics: 't.import.topics' }[IM.kind];
    Api.call(action, payload).then(function (res) {
      if (dryRun) { IM.plan = res.plan; IM.scrollTo = '#imPlan'; App.repaint(true); return; }
      var done = res.plan.filter(function (x) { return ['new', 'create', 'update', 'remove'].indexOf(x.status) >= 0; }).length;
      UI.toast('Готово: изменений — ' + done);
      UI.haptic('success');
      var kind = IM.kind, classId = IM.classId, multi = b.multi;
      reset(kind);
      if (multi) { App.showTab(kind === 'schedule' ? 't.week' : 't.today'); return; }
      if (kind === 'classes') { reset('students'); App.reload(); }
      else if (kind === 'students') App.go('t.class', { id: classId });
      else if (kind === 'schedule') App.go('t.templates', { classId: classId });
      else App.go('t.week', { classId: classId });
    }).catch(function (err) { UI.toast(err.message, true); });
  }
})();
