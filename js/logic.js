/**
 * logic.js — «мозг» Учебного помощника.
 *
 * Здесь собраны ВСЕ правила: кто что видит, как начисляются баллы, как строится топ,
 * как работает расписание. Файл работает в двух местах без изменений:
 *   1) в браузере (демо-режим) — данные лежат в памяти/localStorage;
 *   2) в Google Apps Script (боевой режим) — данные лежат в Google Таблице.
 *
 * Чтобы обновить сервер: скопируйте этот файл целиком в Apps Script в файл Logic.gs.
 *
 * Логика не знает, где лежат данные. Она работает с объектом db, у которого 4 метода:
 *   db.all(table)              — все строки листа (массив объектов)
 *   db.insert(table, obj)      — добавить строку
 *   db.update(table, row, patch) — изменить строку
 *   db.remove(table, row)      — удалить строку
 */
var Logic = (function () {
  'use strict';

  var VERSION = '0.9.4';

  // ───────────────────────── Структура листов таблицы ─────────────────────────
  // [ключ в коде, заголовок столбца в таблице, тип]
  // Тип нужен, чтобы правильно читать ячейки: text (по умолчанию), num, bool, date, time, datetime.
  var SCHEMA = {
    settings: { sheet: 'Настройки', cols: [
      ['key', 'Параметр'], ['value', 'Значение'], ['note', 'Пояснение']] },
    users: { sheet: 'Пользователи', cols: [
      ['tg_id', 'Telegram ID'], ['role', 'Роль'], ['name', 'Имя'], ['username', 'Ник в Telegram'],
      ['student_id', 'ID ученика'], ['created_at', 'Добавлен', 'datetime'], ['ext_key', 'Ключ расширения Chrome']] },
    classes: { sheet: 'Классы', cols: [
      ['id', 'ID'], ['name', 'Название'], ['sort', 'Порядок', 'num'],
      ['top_enabled', 'Показывать топ', 'bool'], ['top_size', 'Размер топа', 'num'],
      ['top_mode', 'Принцип топа'], ['top_period', 'Период топа'],
      ['top_manual', 'Ручной топ (ID через запятую)'], ['folder_id', 'Папка конспектов (ID)']] },
    students: { sheet: 'Ученики', cols: [
      ['id', 'ID'], ['class_id', 'ID класса'], ['name', 'Имя и фамилия'], ['status', 'Статус'],
      ['balance', 'Баланс (авто)', 'num'], ['note_good', 'Получается'], ['note_weak', 'Проседает'],
      ['note_repeat', 'Повторить'], ['note_parent', 'Заметки видны родителю', 'bool'],
      ['note_updated', 'Заметки обновлены', 'datetime'], ['created_at', 'Добавлен', 'datetime'], ['look', 'Образ (заполняется сам)']] },
    templates: { sheet: 'Расписание (шаблон)', cols: [
      ['id', 'ID'], ['class_id', 'ID класса'], ['weekday', 'День недели (1=Пн)', 'num'],
      ['start', 'Начало', 'time'], ['end', 'Конец', 'time'], ['subject', 'Предмет'], ['room', 'Кабинет'],
      ['check', 'Проверка ДЗ с даты']] },
    lessons: { sheet: 'Уроки', cols: [
      ['id', 'ID'], ['class_id', 'ID класса'], ['template_id', 'ID шаблона'],
      ['orig_date', 'Исходная дата', 'date'], ['date', 'Дата', 'date'],
      ['start', 'Начало', 'time'], ['end', 'Конец', 'time'], ['subject', 'Предмет'],
      ['topic', 'Тема'], ['homework', 'Домашнее задание'], ['notes', 'Заметки учителя'],
      ['checklist', 'Чек-лист подготовки'], ['material_url', 'Конспект (ссылка)'],
      ['material_name', 'Конспект (название)'], ['status', 'Статус'], ['updated_at', 'Изменён', 'datetime'],
      ['check', 'Проверка ДЗ (yes/no/done)']] },
    marks: { sheet: 'Отметки', cols: [
      ['id', 'ID'], ['lesson_id', 'ID урока'], ['student_id', 'ID ученика'], ['date', 'Дата', 'date'],
      ['attendance', 'Присутствие'], ['homework', 'ДЗ'], ['activity', 'Активность', 'num'],
      ['updated_at', 'Изменено', 'datetime'], ['grade', 'Оценка', 'num'], ['uniform', 'Форма']] },
    ledger: { sheet: 'История баллов', cols: [
      ['id', 'ID'], ['student_id', 'ID ученика'], ['at', 'Когда', 'datetime'], ['amount', 'Баллы', 'num'],
      ['type', 'Тип'], ['reason', 'За что'], ['ref', 'Ссылка']] },
    rewards: { sheet: 'Награды', cols: [
      ['id', 'ID'], ['title', 'Название'], ['description', 'Описание'], ['cost', 'Стоимость', 'num'],
      ['stock', 'Осталось (пусто = без лимита)'], ['active', 'Активна', 'bool']] },
    requests: { sheet: 'Заявки на обмен', cols: [
      ['id', 'ID'], ['student_id', 'ID ученика'], ['reward_id', 'ID награды'], ['reward_title', 'Награда'],
      ['cost', 'Стоимость', 'num'], ['status', 'Статус'], ['created_at', 'Создана', 'datetime'],
      ['decided_at', 'Решение', 'datetime'], ['comment', 'Комментарий']] },
    invites: { sheet: 'Приглашения', cols: [
      ['code', 'Код'], ['role', 'Роль'], ['student_id', 'ID ученика'], ['max_uses', 'Макс. использований', 'num'],
      ['uses', 'Использовано', 'num'], ['created_at', 'Создан', 'datetime'], ['active', 'Активен', 'bool']] },
    // Журнал сохранений учителя — для кнопок «Отменить» / «Вернуть». Хранится 30 дней.
    journal: { sheet: 'Журнал действий', cols: [
      ['id', 'ID'], ['at', 'Когда', 'datetime'], ['action', 'Действие'], ['title', 'Что сделано'], ['ref', 'Ссылка'],
      ['students', 'Учеников', 'num'], ['amount', 'Баллы', 'num'], ['status', 'Статус'], ['data', 'Данные для отмены (не менять)']] },
    // Значки, выданные учителем (хорошие видны одноклассникам, замечания — только ученику и родителю)
    badges: { sheet: 'Значки', cols: [
      ['id', 'ID'], ['student_id', 'ID ученика'], ['key', 'Вид'], ['title', 'Название'], ['kind', 'Тип (good/warn)'],
      ['note', 'Комментарий'], ['at', 'Выдан', 'datetime'], ['until', 'Действует до (для замечаний)', 'date'], ['ref', 'Ссылка']] },
    // Общая цель класса: все заработанные баллы класса идут в копилку цели
    goals: { sheet: 'Цели класса', cols: [
      ['id', 'ID'], ['class_id', 'ID класса'], ['title', 'Приз'], ['target', 'Нужно баллов', 'num'], ['from', 'С даты', 'date'],
      ['until', 'До даты', 'date'], ['status', 'Статус'], ['done_at', 'Достигнута', 'datetime']] },
    // Купленные украшения (аватар, рамки, темы, титулы). Баллы списываются в «Истории баллов».
    shop: { sheet: 'Украшения', cols: [
      ['id', 'ID'], ['student_id', 'ID ученика'], ['item', 'Украшение'], ['cost', 'Цена', 'num'], ['at', 'Куплено', 'datetime']] }
  };

  // Настройки по умолчанию: [параметр, значение, пояснение для учителя]
  var DEFAULT_SETTINGS = [
    ['teacher_name', 'Учитель', 'Как к вам обращаться в приложении'],
    ['bot_username', '', 'Имя бота без @ (заполняется при подключении бота)'],
    ['app_short_name', '', 'Короткое имя Mini App из BotFather (нужно для ссылок-приглашений)'],
    ['points_attendance', '1', 'Баллы за присутствие на уроке'],
    ['points_late', '0', 'Баллы, если ученик опоздал'],
    ['points_homework', '2', 'Баллы за выполненное ДЗ'],
    ['points_homework_partial', '1', 'Баллы за частично выполненное ДЗ'],
    ['points_activity', '1', 'Баллы за одно нажатие «+» активности'],
    ['streak_length', '5', 'Сколько ДЗ подряд нужно для бонуса (0 = без бонуса)'],
    ['streak_bonus', '5', 'Размер бонуса за серию'],
    ['points_grade_5', '3', 'Баллы за оценку «5»'],
    ['points_grade_4', '2', 'Баллы за оценку «4»'],
    ['points_grade_3', '1', 'Баллы за оценку «3»'],
    ['points_grade_2', '0', 'Баллы за оценку «2»'],
    ['points_uniform', '0', 'Баллы за школьную форму'],
    ['check_subjects', '', 'Предметы, по которым вы проверяете ДЗ (через запятую; пусто = все)'],
    ['check_ask_grade', 'true', 'Мастер проверки спрашивает оценку'],
    ['check_ask_uniform', 'false', 'Мастер проверки спрашивает про школьную форму'],
    ['remind_enabled', 'true', 'Напоминать о проверке ДЗ в Telegram'],
    ['remind_hour', '7', 'Во сколько часов присылать напоминание (0–23)'],
    ['parent_show_attendance', 'true', 'Родитель видит посещаемость'],
    ['parent_show_homework', 'true', 'Родитель видит сдачу ДЗ'],
    ['parent_show_points', 'true', 'Родитель видит баллы и историю'],
    ['parent_show_materials', 'true', 'Родитель видит темы и конспекты'],
    ['game_enabled', 'true', 'Игровой режим для учеников: уровни, значки, цель класса, украшения'],
    ['shop_price_pct', '100', 'Цены украшений, % от обычных (50 = вдвое дешевле)']
  ];

  var ATTENDANCE = ['', 'present', 'absent', 'late', 'excused'];
  var HOMEWORK = ['', 'done', 'partial', 'none'];
  var UNIFORM = ['', 'yes', 'no'];

  // Действия, которые только читают данные (сервер выполняет их без блокировки — быстрее).
  var READ_ACTIONS = {
    'bootstrap': 1, 't.home': 1, 't.class': 1, 't.student': 1, 't.week': 1, 't.lesson': 1,
    't.rewards': 1, 't.ext.info': 1, 't.checks': 1, 't.journal': 1, 't.mass.preview': 1, 't.goal': 1, 's.classmate': 1, 's.shop': 1, 't.stats': 1, 's.stats': 1, 'p.stats': 1, 's.home': 1, 's.week': 1, 's.lesson': 1, 's.rewards': 1, 's.history': 1, 'p.home': 1
  };

  // ───────────────────────── Маленькие помощники ─────────────────────────
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDateTime(d) { return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function weekday(s) { return (parseDate(s).getDay() + 6) % 7 + 1; } // 1 = понедельник
  function mondayOf(s) { return addDays(s, 1 - weekday(s)); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function truthy(v) { return v === true || /^(true|1|да|yes)$/i.test(String(v == null ? '' : v).trim()); }
  function str(v, max) { var s = v == null ? '' : String(v).trim(); return max ? s.slice(0, max) : s; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
  function normTime(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(str(s));
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return pad(+m[1]) + ':' + m[2];
  }
  function randomChars(n) {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789', out = '';
    for (var i = 0; i < n; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return out;
  }
  function uid(prefix) { return prefix + '_' + randomChars(8); }
  function fail(msg) { throw new Error(msg); }
  function same(a, b) { return String(a) === String(b); }
  function byId(db, table, id) {
    if (id === undefined || id === null || id === '') return null;
    return db.all(table).find(function (r) { return same(r.id, id); }) || null;
  }
  function sortBy(arr, fn) {
    return arr.slice().sort(function (a, b) { var x = fn(a), y = fn(b); return x < y ? -1 : x > y ? 1 : 0; });
  }
  function plural(n, f) {
    var a = Math.abs(n) % 100, b = a % 10;
    return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2];
  }
  function userName(u) { return str([u.first_name, u.last_name].filter(Boolean).join(' ')) || ('ID ' + u.id); }

  // ───────────────────────── Настройки ─────────────────────────
  function getSettings(db) {
    var s = {};
    DEFAULT_SETTINGS.forEach(function (d) { s[d[0]] = d[1]; });
    db.all('settings').forEach(function (r) { if (r.key) s[str(r.key)] = str(r.value); });
    return s;
  }
  function setSetting(db, key, value) {
    var v = String(value == null ? '' : value);
    var row = db.all('settings').find(function (r) { return str(r.key) === key; });
    if (row) { if (str(row.value) !== v) db.update('settings', row, { value: v }); return; }
    var def = DEFAULT_SETTINGS.find(function (d) { return d[0] === key; });
    db.insert('settings', { key: key, value: v, note: def ? def[2] : '' });
  }
  function rulesOf(s) {
    return {
      attendance: num(s.points_attendance), late: num(s.points_late),
      homework: num(s.points_homework), homeworkPartial: num(s.points_homework_partial),
      activity: num(s.points_activity), streakLength: num(s.streak_length), streakBonus: num(s.streak_bonus),
      grade5: num(s.points_grade_5), grade4: num(s.points_grade_4), grade3: num(s.points_grade_3), grade2: num(s.points_grade_2),
      uniform: num(s.points_uniform)
    };
  }

  // ───────────────────────── Пользователи и роли ─────────────────────────
  function rolesOf(db, tgId) {
    var rows = db.all('users').filter(function (u) { return same(u.tg_id, tgId); });
    var roles = [];
    if (rows.some(function (r) { return r.role === 'teacher'; })) roles.push('teacher');
    if (rows.some(function (r) { return r.role === 'student' && activeStudent(db, r.student_id); })) roles.push('student');
    if (rows.some(function (r) { return r.role === 'parent' && activeStudent(db, r.student_id); })) roles.push('parent');
    return { roles: roles, rows: rows };
  }
  function activeStudent(db, id) {
    var s = byId(db, 'students', id);
    return s && s.status !== 'archived' ? s : null;
  }

  // ───────────────────────── Приглашения ─────────────────────────
  function createInvite(db, nowStr, role, studentId) {
    db.all('invites').filter(function (i) {
      return i.role === role && same(i.student_id, studentId || '') && truthy(i.active);
    }).forEach(function (i) { db.update('invites', i, { active: false }); });
    var prefix = { teacher: 't', student: 's', parent: 'p' }[role];
    var inv = {
      code: prefix + '_' + randomChars(role === 'teacher' ? 12 : 8), role: role, student_id: studentId || '',
      max_uses: role === 'parent' ? 3 : 1, uses: 0, created_at: nowStr, active: true
    };
    return db.insert('invites', inv);
  }
  // Короткое имя приложения: из «t.me/bot/app» или «https://t.me/bot/app?x» берём только «app»
  function appShortName(v) {
    var parts = str(v).replace(/^https?:\/\//i, '').split(/[?#]/)[0].split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }
  function inviteLink(settings, code) {
    var bot = str(settings.bot_username).replace(/^@/, ''), app = appShortName(settings.app_short_name);
    if (!bot || !app) return '';
    return 'https://t.me/' + bot + '/' + app + '?startapp=' + code;
  }

  // ───────────────────────── Классы и ученики ─────────────────────────
  function classList(db) {
    var counts = {};
    db.all('students').forEach(function (s) {
      if (s.status !== 'archived') counts[s.class_id] = (counts[s.class_id] || 0) + 1;
    });
    return sortBy(db.all('classes'), function (c) { return pad(num(c.sort)) + str(c.name); }).map(function (c) {
      return { id: c.id, name: c.name, count: counts[c.id] || 0 };
    });
  }
  function classMap(db) {
    var m = {};
    db.all('classes').forEach(function (c) { m[c.id] = c; });
    return m;
  }
  function studentsOfClass(db, classId) {
    return sortBy(db.all('students').filter(function (s) {
      return s.status !== 'archived' && same(s.class_id, classId || '');
    }), function (s) { return str(s.name).toLowerCase(); });
  }

  // ───────────────────────── Баллы ─────────────────────────
  function balanceMap(db) {
    var m = {};
    db.all('ledger').forEach(function (l) { m[l.student_id] = (m[l.student_id] || 0) + num(l.amount); });
    return m;
  }
  // «Заработано» — только плюсовые начисления (траты на награды не уменьшают). from — дата 'YYYY-MM-DD' или ''.
  function earnedMap(db, from) {
    var m = {};
    db.all('ledger').forEach(function (l) {
      var a = num(l.amount);
      if (a > 0 && (!from || str(l.at).slice(0, 10) >= from)) m[l.student_id] = (m[l.student_id] || 0) + a;
    });
    return m;
  }
  function pendingMap(db) {
    var m = {};
    db.all('requests').forEach(function (r) {
      if (r.status === 'pending') m[r.student_id] = (m[r.student_id] || 0) + num(r.cost);
    });
    return m;
  }
  function refreshBalances(db, studentIds) {
    var bal = balanceMap(db);
    studentIds.forEach(function (sid) {
      var st = byId(db, 'students', sid);
      if (st && num(st.balance) !== (bal[sid] || 0)) db.update('students', st, { balance: bal[sid] || 0 });
    });
  }
  // Одна строка истории на (тип + ссылку). Если сумма стала 0 — строка удаляется. Так исправление
  // отметки не создаёт дублей.
  function upsertLedger(db, sid, type, ref, amount, reason, at) {
    var ex = db.all('ledger').find(function (l) { return l.ref === ref && l.type === type; });
    if (!amount) { if (ex) db.remove('ledger', ex); return; }
    if (ex) {
      if (num(ex.amount) !== amount || ex.reason !== reason) db.update('ledger', ex, { amount: amount, reason: reason });
    } else {
      db.insert('ledger', { id: uid('p'), student_id: sid, at: at, amount: amount, type: type, reason: reason, ref: ref });
    }
  }

  // ───────────────────────── Расписание и уроки ─────────────────────────
  function virtualId(templateId, date) { return 'v~' + templateId + '~' + date; }
  function virtualLesson(t, date) {
    return {
      id: virtualId(t.id, date), virtual: true, class_id: t.class_id, template_id: t.id, orig_date: date,
      date: date, start: t.start, end: t.end, subject: t.subject, room: t.room || '', topic: '', homework: '',
      notes: '', checklist: '', material_url: '', material_name: '', status: 'planned', check_flag: ''
    };
  }
  function lessonView(l) {
    return {
      id: l.id, virtual: false, class_id: l.class_id, template_id: l.template_id || '', orig_date: l.orig_date || '',
      date: l.date, start: l.start, end: l.end, subject: l.subject, topic: l.topic || '', homework: l.homework || '',
      notes: l.notes || '', checklist: l.checklist || '', material_url: l.material_url || '',
      material_name: l.material_name || '', status: l.status || 'planned', check_flag: l.check || ''
    };
  }
  var TEACHER_ONLY = { notes: 1, check_flag: 1, check: 1 };
  function forPupil(v) { var c = {}; Object.keys(v).forEach(function (k) { if (!TEACHER_ONLY[k]) c[k] = v[k]; }); return c; }

  // Уроки за период [from, from+days): шаблон недели + изменённые/разовые уроки из листа «Уроки».
  function lessonsInRange(db, from, days, classIds) {
    var to = addDays(from, days - 1);
    var classes = classMap(db);
    var okClass = function (cid) { return classes[cid] && (!classIds || classIds.some(function (c) { return same(c, cid); })); };
    var rows = db.all('lessons').filter(function (l) { return okClass(l.class_id); });
    var replaced = {};
    rows.forEach(function (r) { if (r.template_id && r.orig_date) replaced[r.template_id + '|' + r.orig_date] = true; });
    var out = [];
    var templates = db.all('templates').filter(function (t) { return okClass(t.class_id); });
    for (var i = 0; i < days; i++) {
      var date = addDays(from, i), wd = weekday(date);
      templates.forEach(function (t) {
        if (num(t.weekday) === wd && !replaced[t.id + '|' + date]) out.push(virtualLesson(t, date));
      });
    }
    rows.forEach(function (r) { if (r.date >= from && r.date <= to && r.status !== 'deleted') out.push(lessonView(r)); });
    out.forEach(function (l) { l.class_name = classes[l.class_id] ? classes[l.class_id].name : ''; });
    return sortBy(out, function (l) { return l.date + ' ' + l.start + ' ' + l.class_name; });
  }
  function resolveLesson(db, id) {
    id = str(id);
    if (id.indexOf('v~') === 0) {
      var parts = id.split('~'), tid = parts[1], date = parts[2];
      var ex = db.all('lessons').find(function (l) { return same(l.template_id, tid) && l.orig_date === date; });
      if (ex) return { row: ex, view: lessonView(ex) };
      var t = byId(db, 'templates', tid);
      if (!t || !isDate(date)) fail('Урок не найден — возможно, расписание изменилось. Обновите экран.');
      return { row: null, view: virtualLesson(t, date) };
    }
    var row = byId(db, 'lessons', id);
    if (!row) fail('Урок не найден — возможно, его удалили. Обновите экран.');
    return { row: row, view: lessonView(row) };
  }
  // «Материализовать» урок из шаблона — создать для него строку в листе «Уроки».
  function materialize(db, ctx, id) {
    var r = resolveLesson(db, id);
    if (r.row) return r.row;
    var v = r.view;
    return db.insert('lessons', {
      id: uid('l'), class_id: v.class_id, template_id: v.template_id, orig_date: v.orig_date, date: v.date,
      start: v.start, end: v.end, subject: v.subject, topic: '', homework: '', notes: '', checklist: '',
      material_url: '', material_name: '', status: 'planned', updated_at: ctx.nowStr
    });
  }
  function marksOfLesson(db, lessonId) {
    var m = {};
    db.all('marks').forEach(function (x) { if (same(x.lesson_id, lessonId)) m[x.student_id] = x; });
    return m;
  }
  function markCounts(db) {
    var m = {};
    db.all('marks').forEach(function (x) { if (x.attendance) m[x.lesson_id] = (m[x.lesson_id] || 0) + 1; });
    return m;
  }

  // ───────────────────────── Проверка ДЗ ─────────────────────────
  // Предметы учителя (из настроек). Пустой список = проверяются все предметы.
  function checkSubjects(settings) {
    return str(settings.check_subjects).split(',').map(function (x) { return str(x); }).filter(Boolean);
  }
  function subjectChecked(settings, subject) {
    var list = checkSubjects(settings), n = normText(subject);
    return !list.length || list.some(function (x) { return normText(x) === n; });
  }
  /**
   * Помечает уроки полем check:
   *   'due' — надо проверить ДЗ, 'done' — проверено, 'off' — проверка отменена, '' — проверки нет.
   * Проверка бывает, если: урок вручную помечен «проверить» ИЛИ (предмет учителя И в шаблоне недели отмечен день проверки).
   */
  function decorateChecks(db, settings, lessons) {
    var tpl = {};
    // в шаблоне хранится дата, с которой включена проверка: более ранние уроки не считаются «непроверенными»
    db.all('templates').forEach(function (t) { var v = str(t.check); if (v && !/^(false|0|нет)$/i.test(v)) tpl[t.id] = isDate(v) ? v : '0000'; });
    lessons.forEach(function (l) {
      var f = l.check_flag || '';
      var planned = f === 'yes' || f === 'done' || f === 'no' ||
        (!!l.template_id && !!tpl[l.template_id] && l.date >= tpl[l.template_id] && subjectChecked(settings, l.subject));
      if (!planned || l.status === 'cancelled') l.check = '';
      else l.check = f === 'done' ? 'done' : f === 'no' ? 'off' : 'due';
    });
    return lessons;
  }
  function sameSubjectStrict(a, b) { return normText(a) === normText(b); }
  function slotOn(t) { var v = str(t.check); return !!v && !/^(false|0|нет)$/i.test(v); }

  // ───────────────────────── Статистика, серии, достижения ─────────────────────────
  // Возвращает для каждого ученика: посещаемость %, ДЗ %, активность, текущие и лучшие серии.
  function statsFor(db, studentIds, from) {
    var lessons = {};
    db.all('lessons').forEach(function (l) { lessons[l.id] = l; });
    var wanted = {};
    studentIds.forEach(function (id) { wanted[id] = true; });
    var marks = sortBy(db.all('marks').filter(function (m) {
      return wanted[m.student_id] && (!from || m.date >= from);
    }), function (m) { return m.date + ' ' + (lessons[m.lesson_id] ? lessons[m.lesson_id].start : ''); });
    var res = {};
    studentIds.forEach(function (id) {
      res[id] = { marked: 0, present: 0, late: 0, absent: 0, excused: 0, hwDone: 0, hwPartial: 0, hwNone: 0,
        activity: 0, hwStreak: 0, hwBest: 0, attStreak: 0, attBest: 0, attendancePct: null, homeworkPct: null,
        fives: 0, uniStreak: 0, uniBest: 0 };
    });
    marks.forEach(function (m) {
      var s = res[m.student_id];
      if (m.attendance) {
        s.marked++;
        s[m.attendance] = (s[m.attendance] || 0) + 1;
        if (m.attendance === 'present' || m.attendance === 'late') { s.attStreak++; s.attBest = Math.max(s.attBest, s.attStreak); }
        else if (m.attendance === 'absent') s.attStreak = 0; // уважительная причина серию не прерывает
      }
      if (m.homework === 'done') { s.hwDone++; s.hwStreak++; s.hwBest = Math.max(s.hwBest, s.hwStreak); }
      else if (m.homework === 'partial') { s.hwPartial++; s.hwStreak = 0; }
      else if (m.homework === 'none') { s.hwNone++; s.hwStreak = 0; }
      s.activity += num(m.activity);
      if (num(m.grade) === 5) s.fives++;
      if (m.uniform === 'yes') { s.uniStreak++; s.uniBest = Math.max(s.uniBest, s.uniStreak); } else if (m.uniform === 'no') s.uniStreak = 0;
    });
    Object.keys(res).forEach(function (id) {
      var s = res[id], att = s.present + s.late + s.absent, hw = s.hwDone + s.hwPartial + s.hwNone;
      s.attendancePct = att ? Math.round((s.present + s.late) / att * 100) : null;
      s.homeworkPct = hw ? Math.round((s.hwDone + s.hwPartial * 0.5) / hw * 100) : null;
    });
    return res;
  }
  // Рейтинг успеваемости 0–100: ДЗ 50 %, посещаемость 30 %, активность 20 % (относительно лучшего в классе).
  function ratingScore(s, maxActivity) {
    if (!s.marked && !(s.hwDone + s.hwPartial + s.hwNone)) return 0;
    var act = maxActivity > 0 ? s.activity / maxActivity * 100 : 0;
    return Math.round((s.homeworkPct || 0) * 0.5 + (s.attendancePct || 0) * 0.3 + act * 0.2);
  }
  // extra = { month, prev } — заработано в этом и прошлом месяце (для значка «Рывок»)
  function achievements(st, earnedTotal, extra) {
    var rise = extra && extra.prev > 0 && extra.month > extra.prev ? 1 : 0;
    var list = [
      ['first', 'Первый шаг', 'Получить первые баллы', earnedTotal, 1, 'star'],
      ['p50', '50 баллов', 'Заработать 50 баллов', earnedTotal, 50, 'coin'],
      ['p100', '100 баллов', 'Заработать 100 баллов', earnedTotal, 100, 'coin'],
      ['p250', '250 баллов', 'Заработать 250 баллов', earnedTotal, 250, 'trophy'],
      ['hw5', 'Серия ×5', '5 домашних заданий подряд', st.hwBest, 5, 'flame'],
      ['hw10', 'Серия ×10', '10 домашних заданий подряд', st.hwBest, 10, 'flame'],
      ['att10', 'Без пропусков', '10 уроков подряд без пропусков', st.attBest, 10, 'calendar'],
      ['act20', 'Активный', '20 раз отличиться на уроке', st.activity, 20, 'bolt'],
      ['p500', '500 баллов', 'Заработать 500 баллов', earnedTotal, 500, 'trophy'],
      ['p1000', '1000 баллов', 'Заработать 1000 баллов', earnedTotal, 1000, 'trophy'],
      ['hw20', 'Серия ×20', '20 домашних заданий подряд', st.hwBest, 20, 'flame'],
      ['five1', 'Первая пятёрка', 'Получить оценку «5»', st.fives || 0, 1, 'star'],
      ['five10', 'Отличник', 'Получить 10 пятёрок', st.fives || 0, 10, 'star'],
      ['five25', 'Круглый отличник', 'Получить 25 пятёрок', st.fives || 0, 25, 'star'],
      ['uni10', 'Опрятный', 'Школьная форма 10 проверок подряд', st.uniBest || 0, 10, 'check'],
      ['rise', 'Рывок', 'Заработать в этом месяце больше, чем в прошлом', rise, 1, 'bolt']
    ];
    return list.map(function (a) {
      return { key: a[0], title: a[1], desc: a[2], value: Math.min(a[3], a[4]), target: a[4], icon: a[5], done: a[3] >= a[4] };
    });
  }

  // ───────────────────────── Уровни ─────────────────────────
  // Уровень считается по ВСЕМ заработанным баллам: покупки наград его не уменьшают, поэтому уровень не падает.
  var LEVELS = [[0, 'Новичок'], [50, 'Ученик'], [150, 'Старатель'], [300, 'Знаток'], [500, 'Мастер'],
    [800, 'Эксперт'], [1200, 'Чемпион'], [1700, 'Легенда']];
  function levelOf(earned) {
    var i = 0;
    while (i + 1 < LEVELS.length && earned >= LEVELS[i + 1][0]) i++;
    var cur = LEVELS[i], next = LEVELS[i + 1];
    return { level: i + 1, name: cur[1], earned: earned, from: cur[0], to: next ? next[0] : null, next: next ? next[1] : null,
      toNext: next ? next[0] - earned : 0, pct: next ? Math.round((earned - cur[0]) / (next[0] - cur[0]) * 100) : 100 };
  }
  function earnedBetween(db, sid, from, to) {
    var sum = 0;
    db.all('ledger').forEach(function (l) {
      var a = num(l.amount), d = str(l.at).slice(0, 10);
      if (a > 0 && same(l.student_id, sid) && d >= from && (!to || d <= to)) sum += a;
    });
    return sum;
  }
  function monthExtra(db, sid, today) {
    var m = today.slice(0, 8) + '01', prev = addDays(m, -1).slice(0, 8) + '01';
    return { month: earnedBetween(db, sid, m, ''), prev: earnedBetween(db, sid, prev, addDays(m, -1)) };
  }

  // ───────────────────────── Значки от учителя ─────────────────────────
  // [название, значок, тип]. good — видят одноклассники; warn — замечание: видят только ученик и родитель,
  // исчезает само через 7 дней (учитель может снять раньше).
  var BADGES = {
    helper: ['Помощник', 'users', 'good'], leader: ['Лидер', 'trophy', 'good'], answer: ['Лучший ответ', 'bolt', 'good'],
    creative: ['Творец', 'star', 'good'], sport: ['Спортсмен', 'flame', 'good'], team: ['Командный игрок', 'users', 'good'],
    custom_good: ['Свой значок', 'star', 'good'],
    late: ['Опоздания', 'clock', 'warn'], nohw: ['Без ДЗ', 'book', 'warn'], behavior: ['Поведение', 'bell', 'warn'],
    nouniform: ['Без формы', 'x', 'warn'], custom_warn: ['Замечание', 'bell', 'warn']
  };
  var WARN_DAYS = 7;
  function badgeView(b, today) {
    var c = BADGES[b.key] || BADGES[b.kind === 'warn' ? 'custom_warn' : 'custom_good'];
    var v = { id: b.id, key: b.key, title: b.title || c[0], icon: c[1], kind: b.kind === 'warn' ? 'warn' : 'good', note: b.note || '', at: b.at };
    if (v.kind === 'warn') {
      v.until = b.until;
      v.active = !b.until || b.until >= today;
      v.daysLeft = b.until ? Math.max(0, Math.round((parseDate(b.until) - parseDate(today)) / 86400000)) : null;
    }
    return v;
  }
  // opts.warn — показывать замечания (только сам ученик, родитель, учитель); opts.expired — и истёкшие (учителю)
  function badgesOf(db, sid, today, opts) {
    opts = opts || {};
    return sortBy(db.all('badges').filter(function (b) { return same(b.student_id, sid); }), function (b) { return b.at; }).reverse()
      .map(function (b) { return badgeView(b, today); })
      .filter(function (v) { return v.kind === 'good' || (opts.warn && (v.active || opts.expired)); });
  }
  function badgeCatalog() {
    return Object.keys(BADGES).filter(function (k) { return k !== 'team'; }).map(function (k) {
      return { key: k, title: BADGES[k][0], icon: BADGES[k][1], kind: BADGES[k][2], custom: /^custom_/.test(k) };
    });
  }

  // ───────────────────────── Цель класса ─────────────────────────
  // В копилку идут все заработанные баллы учеников класса с даты начала цели (минусы не вычитаются,
  // личный баланс не тратится).
  function goalProgress(db, g) {
    var ids = {}, per = {}, total = 0;
    studentsOfClass(db, g.class_id).forEach(function (s) { ids[s.id] = s; });
    db.all('ledger').forEach(function (l) {
      var a = num(l.amount), d = str(l.at).slice(0, 10);
      if (a > 0 && ids[l.student_id] && d >= str(g.from) && (!g.until || d <= g.until)) { per[l.student_id] = (per[l.student_id] || 0) + a; total += a; }
    });
    return { total: total, per: per, students: ids };
  }
  function goalView(db, ctx, g, opts) {
    opts = opts || {};
    var pr = goalProgress(db, g), target = Math.max(1, num(g.target));
    var v = { id: g.id, class_id: g.class_id, title: g.title, target: target, progress: Math.min(pr.total, target), raw: pr.total,
      pct: Math.min(100, Math.round(pr.total / target * 100)), from: g.from, until: g.until || '', status: g.status, done_at: g.done_at || '',
      daysLeft: g.until ? Math.round((parseDate(g.until) - parseDate(ctx.today)) / 86400000) : null };
    if (opts.sid) v.mine = pr.per[opts.sid] || 0;
    if (opts.teacher) {
      v.members = Object.keys(pr.students).map(function (id) { return { id: id, name: pr.students[id].name, amount: pr.per[id] || 0 }; })
        .sort(function (a, b) { return b.amount - a.amount || (a.name < b.name ? -1 : 1); });
    }
    return v;
  }
  // Текущая цель класса: активная, или достигнутая за последние 7 дней (чтобы ученики увидели праздник).
  function currentGoal(db, ctx, classId) {
    var list = db.all('goals').filter(function (g) { return same(g.class_id, classId); });
    var act = list.find(function (g) { return g.status === 'active'; });
    if (act) return act;
    var recent = sortBy(list.filter(function (g) { return g.status === 'done' && str(g.done_at).slice(0, 10) >= addDays(ctx.today, -7); }),
      function (g) { return g.done_at; });
    return recent[recent.length - 1] || null;
  }
  // После каждого сохранения учителя: не достигнута ли цель? Если да — значок «Командный игрок» всему классу
  // и сообщение учителю в Telegram (ctx.notify — сервер отправит его после сохранения).
  function checkGoals(db, ctx) {
    db.all('goals').filter(function (g) { return g.status === 'active'; }).forEach(function (g) {
      var pr = goalProgress(db, g), cls = byId(db, 'classes', g.class_id);
      if (pr.total >= num(g.target) && num(g.target) > 0) {
        db.update('goals', g, { status: 'done', done_at: ctx.nowStr });
        Object.keys(pr.students).forEach(function (sid) {
          var has = db.all('badges').some(function (b) { return same(b.student_id, sid) && b.ref === 'goal:' + g.id; });
          if (!has) db.insert('badges', { id: uid('b'), student_id: sid, key: 'team', title: 'Командный игрок', kind: 'good',
            note: 'Цель класса: ' + g.title, at: ctx.nowStr, until: '', ref: 'goal:' + g.id });
        });
        (ctx.notify = ctx.notify || []).push('🎉 ' + (cls ? cls.name : 'Класс') + ' достиг цели «' + g.title + '» — собрано ' + pr.total +
          ' из ' + num(g.target) + ' баллов. Пора выдать приз!');
      } else if (g.until && g.until < ctx.today) {
        db.update('goals', g, { status: 'missed' });
      }
    });
  }
  function teacherChats(db) {
    return db.all('users').filter(function (u) { return u.role === 'teacher'; }).map(function (u) { return String(u.tg_id); });
  }

  // ───────────────────────── Украшения: аватар, рамки, темы, титулы ─────────────────────────
  // [id, вид, название, цена, с какого уровня, редкость, сезон 'ММДД-ММДД']. Цена 0 — есть у всех сразу.
  // Всё рисуется кодом в приложении (avatar.js), картинки не нужны.
  var SHOP = [
    ['cat', 'char', 'Кот', 0, 1], ['bear', 'char', 'Медвежонок', 0, 1], ['robot', 'char', 'Робот', 0, 1],
    ['fox', 'char', 'Лиса', 30, 1], ['owl', 'char', 'Сова', 30, 2], ['astro', 'char', 'Космонавт', 60, 3, 'rare'],
    ['dragon', 'char', 'Дракончик', 120, 4, 'epic'],
    ['blue', 'color', 'Голубой', 0, 1], ['green', 'color', 'Зелёный', 0, 1], ['orange', 'color', 'Оранжевый', 0, 1],
    ['pink', 'color', 'Розовый', 15, 1], ['purple', 'color', 'Фиолетовый', 15, 1], ['mint', 'color', 'Мятный', 15, 2],
    ['gold', 'color', 'Золотой', 80, 4, 'rare'],
    ['cap', 'hat', 'Кепка', 25, 1], ['headphones', 'hat', 'Наушники', 40, 2], ['wizard', 'hat', 'Шляпа волшебника', 50, 3],
    ['crown', 'hat', 'Корона', 100, 4, 'epic'], ['santa', 'hat', 'Новогодняя шапка', 40, 1, 'season', '1201-0115'],
    ['flowers', 'hat', 'Венок к Навруз', 40, 1, 'season', '0310-0331'],
    ['glasses', 'acc', 'Очки', 25, 1], ['bowtie', 'acc', 'Бабочка', 30, 2], ['scarf', 'acc', 'Шарф', 35, 2], ['medal', 'acc', 'Медаль', 70, 3, 'rare'],
    ['silver', 'frame', 'Серебряная рамка', 60, 3, 'rare'], ['goldframe', 'frame', 'Золотая рамка', 150, 5, 'epic'],
    ['rainbow', 'frame', 'Радужная рамка', 200, 6, 'legend'],
    ['space', 'theme', 'Космос', 50, 2], ['ocean', 'theme', 'Океан', 50, 2], ['forest', 'theme', 'Лес', 50, 3], ['sunset', 'theme', 'Закат', 70, 4, 'rare'],
    ['t_smart', 'title', 'Умник', 40, 2], ['t_star', 'title', 'Звезда класса', 120, 4, 'rare'], ['t_hero', 'title', 'Герой знаний', 200, 5, 'epic'],
    ['t_legend', 'title', 'Легенда', 300, 8, 'legend']
  ];
  var LOOK_SLOTS = ['char', 'color', 'hat', 'acc', 'frame', 'theme', 'title'];
  var SHOP_BY_ID = {};
  SHOP.forEach(function (x) { SHOP_BY_ID[x[0]] = x; });
  function inSeason(item, today) {
    if (!item[6]) return true;
    var md = today.slice(5, 7) + today.slice(8, 10), r = item[6].split('-');
    return r[0] <= r[1] ? md >= r[0] && md <= r[1] : md >= r[0] || md <= r[1];
  }
  function priceOf(item, settings) {
    var pct = Math.max(25, Math.min(400, num(settings.shop_price_pct) || 100));
    return Math.round(item[3] * pct / 100);
  }
  function ownedItems(db, sid) {
    var m = {};
    db.all('shop').forEach(function (r) { if (same(r.student_id, sid)) m[r.item] = 1; });
    SHOP.forEach(function (x) { if (!x[3]) m[x[0]] = 1; });
    return m;
  }
  // Образ ученика. Кто ещё ничего не выбирал — получает одного из бесплатных персонажей (разных у разных детей).
  function lookOf(st, owned) {
    var raw = {};
    try { raw = JSON.parse(str(st.look) || '{}') || {}; } catch (e) { raw = {}; }
    var h = 0, id = String(st.id);
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    var look = { char: ['cat', 'bear', 'robot'][h % 3], color: ['blue', 'green', 'orange'][(h >> 2) % 3], hat: '', acc: '', frame: '', theme: '', title: '' };
    LOOK_SLOTS.forEach(function (slot) {
      var it = SHOP_BY_ID[raw[slot]];
      if (it && it[1] === slot && (!owned || owned[it[0]])) look[slot] = it[0];
    });
    look.titleText = look.title ? SHOP_BY_ID[look.title][2] : '';
    return look;
  }
  function lookMap(db) {
    var m = {};
    db.all('students').forEach(function (s) { m[s.id] = lookOf(s); });
    return m;
  }

  // ───────────────────────── Топ лучших ─────────────────────────
  function topSettings(cls) {
    var size = num(cls.top_size);
    return {
      enabled: truthy(cls.top_enabled),
      size: [3, 5, 10].indexOf(size) >= 0 ? size : 3,
      mode: ['points', 'rating', 'manual'].indexOf(cls.top_mode) >= 0 ? cls.top_mode : 'points',
      period: ['week', 'month', 'all'].indexOf(cls.top_period) >= 0 ? cls.top_period : 'month',
      manual: str(cls.top_manual).split(',').map(function (x) { return x.trim(); }).filter(Boolean)
    };
  }
  // Режим «Вручную» — только выбранные учителем. В остальных режимах выбранные учителем «закреплены»
  // наверху (с пометкой «выбор учителя»), а оставшиеся места заполняются по баллам или успеваемости.
  function computeTop(db, ctx, cls) {
    var t = topSettings(cls);
    var from = t.period === 'month' ? ctx.today.slice(0, 8) + '01' : t.period === 'week' ? mondayOf(ctx.today) : '';
    var students = studentsOfClass(db, cls.id);
    var pinned = t.manual.map(function (id) { return students.find(function (s) { return same(s.id, id); }); }).filter(Boolean);
    var ranked;
    if (t.mode === 'manual') {
      ranked = pinned.map(function (s) { return { s: s, value: null, pinned: true }; });
    } else if (t.mode === 'rating') {
      var stats = statsFor(db, students.map(function (s) { return s.id; }), from);
      var maxAct = 0;
      students.forEach(function (s) { maxAct = Math.max(maxAct, stats[s.id].activity); });
      ranked = students.map(function (s) { return { s: s, value: ratingScore(stats[s.id], maxAct) }; });
    } else {
      var earned = earnedMap(db, from);
      ranked = students.map(function (s) { return { s: s, value: earned[s.id] || 0 }; });
    }
    if (t.mode !== 'manual') {
      var pin = pinned.map(function (s) { return String(s.id); });
      var top = ranked.filter(function (x) { return pin.indexOf(String(x.s.id)) >= 0; })
        .sort(function (a, b) { return pin.indexOf(String(a.s.id)) - pin.indexOf(String(b.s.id)); })
        .map(function (x) { x.pinned = true; return x; });
      ranked = top.concat(ranked.filter(function (x) { return x.value > 0 && pin.indexOf(String(x.s.id)) < 0; })
        .sort(function (a, b) { return b.value - a.value || (a.s.name < b.s.name ? -1 : 1); }));
    }
    t.items = ranked.slice(0, t.size).map(function (x, i) {
      return { place: i + 1, student_id: x.s.id, name: x.s.name, value: x.value, pinned: !!x.pinned, look: lookOf(x.s) };
    });
    return t;
  }
  // Ученикам и родителям — только имена и места, без чужих баллов.
  function publicTop(top, myId) {
    return { size: top.size, mode: top.mode, period: top.period, items: top.items.map(function (x) {
      return { place: x.place, id: x.student_id, name: x.name, me: same(x.student_id, myId), pinned: top.mode !== 'manual' && x.pinned, look: x.look };
    }) };
  }

  // ───────────────────────── Начисление баллов за отметки ─────────────────────────
  var REASONS = { attendance: 'Присутствие', homework: 'Домашнее задание', activity: 'Активность на уроке',
    grade: 'Оценка', uniform: 'Школьная форма' };
  function lessonLabel(lesson) {
    var d = parseDate(lesson.date);
    return lesson.subject + ', ' + d.getDate() + '.' + pad(d.getMonth() + 1);
  }
  function syncMarkPoints(db, ctx, mark, lesson) {
    var r = rulesOf(ctx.settings);
    var at = lesson.date + ' ' + (lesson.start || '00:00');
    var desired = {
      attendance: mark.attendance === 'present' ? r.attendance : mark.attendance === 'late' ? r.late : 0,
      homework: mark.homework === 'done' ? r.homework : mark.homework === 'partial' ? r.homeworkPartial : 0,
      activity: num(mark.activity) * r.activity,
      grade: num(r['grade' + num(mark.grade)]),
      uniform: mark.uniform === 'yes' ? r.uniform : 0
    };
    Object.keys(desired).forEach(function (type) {
      var reason = REASONS[type] + (type === 'activity' && num(mark.activity) > 1 ? ' ×' + num(mark.activity) : '') +
        (type === 'grade' ? ' «' + num(mark.grade) + '»' : '') +
        (type === 'homework' && mark.homework === 'partial' ? ' (частично)' : '') + ' · ' + lessonLabel(lesson);
      upsertLedger(db, mark.student_id, type, 'mark:' + mark.id, desired[type], reason, at);
    });
  }
  // Бонус за серию ДЗ: если на этом уроке серия стала кратной N — начисляем бонус.
  function syncStreakBonus(db, ctx, mark, lesson) {
    var r = rulesOf(ctx.settings), amount = 0, streak = 0;
    if (r.streakLength > 0 && r.streakBonus > 0 && mark.homework === 'done') {
      var lessons = {};
      db.all('lessons').forEach(function (l) { lessons[l.id] = l; });
      var mine = sortBy(db.all('marks').filter(function (m) { return same(m.student_id, mark.student_id); }),
        function (m) { return m.date + ' ' + (lessons[m.lesson_id] ? lessons[m.lesson_id].start : ''); });
      for (var i = 0; i < mine.length; i++) {
        var h = mine[i].homework;
        if (h === 'done') streak++; else if (h === 'partial' || h === 'none') streak = 0;
        if (mine[i] === mark || same(mine[i].id, mark.id)) break;
      }
      if (streak > 0 && streak % r.streakLength === 0) amount = r.streakBonus;
    }
    upsertLedger(db, mark.student_id, 'streak', 'streak:' + mark.id, amount,
      'Бонус за серию: ' + streak + ' ДЗ подряд', lesson.date + ' ' + (lesson.start || '00:00'));
  }

  // ═════════════════════════ Журнал действий: «Отменить» и «Вернуть» ═════════════════════════
  // Пока выполняется сохранение учителя, «запоминатель» (Recorder) записывает, что было ДО и что стало ПОСЛЕ
  // в отметках, уроках (проверка/статус) и ручных баллах. Баллы за отметки не записываются — при отмене
  // они пересчитываются из отметок сами, поэтому снятая отметка не «вернёт» баллы позже.
  var MARK_FIELDS = ['attendance', 'homework', 'activity', 'grade', 'uniform'];
  var LESSON_FIELDS = ['check', 'status'];
  var JOURNAL_DAYS = 30, JOURNAL_MAX = 150, JOURNAL_MERGE_MIN = 15, JOURNAL_DATA_MAX = 45000;
  function nv(v) { return v === null || v === undefined || v === '' || v === 0 || v === '0' || v === false ? '' : String(v); }
  function emptyMark() { return { attendance: '', homework: '', activity: 0, grade: 0, uniform: '' }; }
  function markEmpty(m) { return MARK_FIELDS.every(function (f) { return nv(m[f]) === ''; }); }
  function derivedLedger(row) { return /^(mark|streak):/.test(str(row.ref)); }
  function pick(row, fields) { var o = {}; fields.forEach(function (f) { o[f] = row[f]; }); return o; }
  function ledgerCopy(row) { return pick(row, SCHEMA.ledger.cols.map(function (c) { return c[0]; })); }

  function Recorder(db) { this.db = db; this.ops = []; this.map = {}; }
  Recorder.prototype.all = function (t) { return this.db.all(t); };
  Recorder.prototype.op_ = function (t, id, init) {
    var key = t + '|' + id;
    if (!this.map[key]) { this.map[key] = init; this.ops.push(init); }
    return this.map[key];
  };
  Recorder.prototype.insert = function (t, obj) {
    var row = this.db.insert(t, obj);
    if (t === 'marks') {
      var op = this.op_(t, row.id, { t: t, id: row.id, k: pick(row, ['lesson_id', 'student_id', 'date']), b: emptyMark(), a: {} });
      MARK_FIELDS.forEach(function (f) { op.a[f] = row[f]; });
    } else if (t === 'ledger' && !derivedLedger(row)) {
      this.op_(t, row.id, { t: t, id: row.id, b: null, a: ledgerCopy(row) });
    }
    return row;
  };
  Recorder.prototype.update = function (t, row, patch) {
    var fields = t === 'marks' ? MARK_FIELDS : t === 'lessons' ? LESSON_FIELDS : [];
    var changed = fields.filter(function (f) { return f in patch; });
    if (changed.length) {
      var op = this.op_(t, row.id, { t: t, id: row.id, b: {}, a: {} });
      if (t === 'marks' && !op.k) op.k = pick(row, ['lesson_id', 'student_id', 'date']);
      changed.forEach(function (f) { if (!(f in op.b)) op.b[f] = row[f]; });
    }
    var res = this.db.update(t, row, patch);
    if (changed.length) changed.forEach(function (f) { op.a[f] = row[f]; });
    return res;
  };
  Recorder.prototype.remove = function (t, row) {
    if (t === 'marks') {
      var op = this.op_(t, row.id, { t: t, id: row.id, k: pick(row, ['lesson_id', 'student_id', 'date']), b: {}, a: {} });
      MARK_FIELDS.forEach(function (f) { if (!(f in op.b)) op.b[f] = row[f]; op.a[f] = emptyMark()[f]; });
    } else if (t === 'ledger' && !derivedLedger(row)) {
      var key = 'ledger|' + row.id, ex = this.map[key];
      if (ex && ex.b === null) { this.ops.splice(this.ops.indexOf(ex), 1); delete this.map[key]; } // создали и удалили в одном действии
      else this.op_(t, row.id, { t: t, id: row.id, b: ledgerCopy(row), a: null });
    }
    return this.db.remove(t, row);
  };
  // Убрать «пустые» записи (до и после одинаковы).
  function cleanOps(ops) {
    return ops.filter(function (op) {
      if (op.t === 'ledger') return true;
      return Object.keys(op.a).some(function (f) { return nv(op.a[f]) !== nv(op.b[f]); });
    });
  }
  function opStudents(db, ops) {
    var ids = {};
    ops.forEach(function (op) {
      if (op.t === 'marks') ids[op.k.student_id] = 1;
      if (op.t === 'ledger') ids[(op.a || op.b).student_id] = 1;
    });
    return Object.keys(ids);
  }
  // Пересчитать баллы за отметку (или удалить их, если отметки больше нет).
  function resyncMark(db, ctx, mark, k) {
    var lesson = byId(db, 'lessons', k.lesson_id) || { date: k.date, start: '', subject: '' };
    var m = mark || Object.assign({ id: mark ? mark.id : k.id, student_id: k.student_id }, emptyMark());
    syncMarkPoints(db, ctx, m, lesson);
    syncStreakBonus(db, ctx, m, lesson);
  }
  // dir = 'undo' (вернуть «как было») или 'redo' (снова «как стало»). Возвращает число пропущенных полей:
  // их меняли позже другим действием, и затирать чужие изменения мы не будем.
  function applyOps(db, ctx, ops, dir) {
    var skipped = 0, list = dir === 'undo' ? ops.slice().reverse() : ops;
    list.forEach(function (op) {
      var from = dir === 'undo' ? op.a : op.b, to = dir === 'undo' ? op.b : op.a;
      var cur = byId(db, op.t, op.id);
      if (op.t === 'ledger') {
        if (!to) { if (cur) { if (num(cur.amount) === num(from.amount)) db.remove('ledger', cur); else skipped++; } }
        else if (!cur) db.insert('ledger', to);
        return;
      }
      var patch = {}, n = 0;
      Object.keys(to).forEach(function (f) {
        if (nv(from[f]) === nv(to[f])) return; // это поле действие не меняло
        var now = cur ? cur[f] : '';
        if (nv(now) === nv(from[f])) { if (nv(now) !== nv(to[f])) { patch[f] = to[f]; n++; } }
        else if (nv(now) !== nv(to[f])) skipped++;
      });
      if (op.t === 'lessons') { if (cur && n) db.update('lessons', cur, patch); return; }
      // отметки
      if (!cur) {
        if (!n) return;
        cur = db.insert('marks', Object.assign({ id: op.id }, op.k, emptyMark(), patch, { updated_at: ctx.nowStr }));
      } else if (n) {
        db.update('marks', cur, Object.assign(patch, { updated_at: ctx.nowStr }));
      } else return;
      if (markEmpty(cur)) { db.remove('marks', cur); resyncMark(db, ctx, null, Object.assign({ id: op.id }, op.k)); }
      else resyncMark(db, ctx, cur, op.k);
    });
    return skipped;
  }

  // Какие действия попадают в журнал и как они называются.
  var JOURNALED = {
    't.marks.save': function (db, ctx, p, res) {
      var l = byId(db, 'lessons', res.lessonId), c = l && byId(db, 'classes', l.class_id);
      return { ref: 'lesson:' + res.lessonId, merge: true,
        title: (p.check === 'done' ? 'Проверка ДЗ' : 'Отметки на уроке') + (c ? ' · ' + c.name : '') + (l ? ' · ' + lessonLabel(l) : '') };
    },
    't.points': function (db, ctx, p) {
      var st = byId(db, 'students', p.studentId);
      return { ref: '', title: (num(p.amount) > 0 ? 'Баллы вручную' : 'Списание вручную') + ' · ' + (st ? st.name : '') };
    },
    't.points.delete': function () { return { ref: '', title: 'Удалена запись из истории баллов' }; },
    't.mass.apply': function (db, ctx, p, res) { return { ref: '', title: 'Массовая отмена · ' + res.title }; }
  };
  function pruneJournal(db, ctx) {
    var limit = addDays(ctx.today, -JOURNAL_DAYS), rows = db.all('journal');
    rows.filter(function (r) { return str(r.at).slice(0, 10) < limit; }).forEach(function (r) { db.remove('journal', r); });
    rows = db.all('journal').slice();
    while (rows.length > JOURNAL_MAX) db.remove('journal', rows.shift());
  }
  function writeJournal(db, ctx, action, p, res, rec, bal0) {
    var ops = cleanOps(rec.ops);
    if (!ops.length) return;
    var info = JOURNALED[action](db, ctx, p, res), bal1 = balanceMap(db);
    var amountOf = function (list) {
      return opStudents(db, list).reduce(function (s, id) { return s + (bal1[id] || 0) - (bal0[id] || 0); }, 0);
    };
    // Отметки на одном уроке в течение 15 минут — одна строка журнала (режим урока сохраняет понемногу).
    var last = db.all('journal').slice(-1)[0];
    var minutes = last ? (parseDateTime(ctx.nowStr) - parseDateTime(last.at)) / 60000 : 1e9;
    if (info.merge && last && last.action === action && last.ref === info.ref && !last.status && str(last.data) && minutes <= JOURNAL_MERGE_MIN) {
      var old = JSON.parse(last.data), map = {};
      old.forEach(function (op) { map[op.t + '|' + op.id] = op; });
      ops.forEach(function (op) {
        var ex = map[op.t + '|' + op.id];
        if (!ex) { old.push(op); return; }
        if (op.t === 'ledger') { ex.a = op.a; return; }
        Object.keys(op.a).forEach(function (f) { if (!(f in ex.b)) ex.b[f] = op.b[f]; ex.a[f] = op.a[f]; });
      });
      old = cleanOps(old);
      db.update('journal', last, { at: ctx.nowStr, title: p.check === 'done' ? info.title : last.title, students: opStudents(db, old).length,
        amount: num(last.amount) + amountOf(ops), data: JSON.stringify(old) });
      return;
    }
    var data = JSON.stringify(ops);
    db.insert('journal', { id: uid('j'), at: ctx.nowStr, action: action, title: str(info.title, 200), ref: info.ref,
      students: opStudents(db, ops).length, amount: amountOf(ops),
      status: data.length > JOURNAL_DATA_MAX ? 'big' : '', data: data.length > JOURNAL_DATA_MAX ? '' : data });
    pruneJournal(db, ctx);
  }
  function parseDateTime(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(str(s));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : 0;
  }

  // ─── Массовая отмена: что попадёт под фильтр ───
  var MASS_KINDS = ['attendance', 'homework', 'grade', 'uniform', 'activity', 'manual'];
  function massSelect(db, ctx, p) {
    var kinds = (p.kinds || []).filter(function (k) { return MASS_KINDS.indexOf(k) >= 0; });
    if (!kinds.length) fail('Выберите, что отменить.');
    var lessonId = str(p.lessonId), from = str(p.from), to = str(p.to);
    if (!lessonId) {
      if (!isDate(from) || !isDate(to)) fail('Укажите период: с какой и по какую дату.');
      if (from > to) { var x = from; from = to; to = x; }
    }
    var pool = p.classId ? studentsOfClass(db, p.classId)
      : db.all('students').filter(function (s) { return s.status !== 'archived'; });
    var chosen = (p.studentIds || []).map(String);
    if (chosen.length) pool = pool.filter(function (s) { return chosen.indexOf(String(s.id)) >= 0; });
    var ids = {};
    pool.forEach(function (s) { ids[s.id] = s; });
    var markKinds = kinds.filter(function (k) { return k !== 'manual'; });
    var marks = !markKinds.length ? [] : db.all('marks').filter(function (m) {
      if (!ids[m.student_id]) return false;
      if (lessonId ? !same(m.lesson_id, lessonId) : (m.date < from || m.date > to)) return false;
      return markKinds.some(function (k) { return nv(m[k]) !== ''; });
    });
    var manual = lessonId || kinds.indexOf('manual') < 0 ? [] : db.all('ledger').filter(function (l) {
      var d = str(l.at).slice(0, 10);
      return l.type === 'manual' && ids[l.student_id] && d >= from && d <= to;
    });
    // Какие баллы исчезнут: начисления за выбранные поля отметок, бонусы серии (если снимаем ДЗ) и ручные баллы.
    var refs = {};
    marks.forEach(function (m) {
      markKinds.forEach(function (k) { refs[k + '|mark:' + m.id] = 1; });
      if (markKinds.indexOf('homework') >= 0) refs['streak|streak:' + m.id] = 1;
    });
    var per = {};
    var add = function (sid, a) { per[sid] = (per[sid] || 0) + a; };
    db.all('ledger').forEach(function (l) { if (refs[l.type + '|' + l.ref]) add(l.student_id, -num(l.amount)); });
    manual.forEach(function (l) { add(l.student_id, -num(l.amount)); });
    marks.forEach(function (m) { if (!(m.student_id in per)) per[m.student_id] = 0; });
    var who = Object.keys(per).map(function (sid) { return { id: sid, name: ids[sid] ? ids[sid].name : '—', amount: per[sid] }; });
    return { kinds: markKinds, marks: marks, manual: manual, lessonId: lessonId,
      students: sortBy(who, function (x) { return str(x.name).toLowerCase(); }),
      amount: who.reduce(function (s, x) { return s + x.amount; }, 0) };
  }

  // ═════════════════════════ ДЕЙСТВИЯ (API) ═════════════════════════
  var A = {};

  // ─── Вход ───
  function bootstrap(db, ctx) {
    var info = rolesOf(db, ctx.user.id);
    return {
      roles: info.roles, user: { id: String(ctx.user.id), name: userName(ctx.user) },
      startParam: ctx.startParam || '', teacherName: ctx.settings.teacher_name, version: VERSION, today: ctx.today
    };
  }
  function redeem(db, ctx, code) {
    code = str(code).toLowerCase();
    if (!code) fail('Введите код приглашения.');
    var inv = db.all('invites').find(function (i) { return str(i.code).toLowerCase() === code; });
    var tg = String(ctx.user.id), info = rolesOf(db, tg);
    // Уже подключён по этой ссылке (открыл её ещё раз) — просто входим, даже если ссылка использована
    if (inv && inv.role !== 'teacher' && info.rows.some(function (r) { return r.role === inv.role && same(r.student_id, inv.student_id); })) {
      return bootstrap(db, ctx);
    }
    if (!inv || !truthy(inv.active)) fail('Код не найден или больше не действует. Попросите у учителя новую ссылку.');
    if (num(inv.uses) >= Math.max(1, num(inv.max_uses))) fail('Этой ссылкой уже воспользовались. Попросите у учителя новую ссылку.');
    var base = { tg_id: tg, name: userName(ctx.user), username: str(ctx.user.username), created_at: ctx.nowStr };
    if (inv.role === 'teacher') {
      if (info.roles.indexOf('teacher') < 0) {
        db.insert('users', Object.assign({ role: 'teacher', student_id: '' }, base));
        if (ctx.settings.teacher_name === 'Учитель') setSetting(db, 'teacher_name', base.name);
      }
    } else {
      var st = activeStudent(db, inv.student_id);
      if (!st) fail('Ученик по этому коду не найден. Попросите у учителя новую ссылку.');
      var already = info.rows.find(function (r) { return r.role === inv.role && same(r.student_id, st.id); });
      if (already) return bootstrap(db, ctx);
      if (inv.role === 'student') {
        if (info.roles.indexOf('student') >= 0) fail('Этот Telegram-аккаунт уже подключён как ученик.');
        var taken = db.all('users').find(function (u) { return u.role === 'student' && same(u.student_id, st.id); });
        if (taken) fail('К этому ученику уже подключён другой аккаунт. Учитель может отвязать его в карточке ученика.');
      }
      db.insert('users', Object.assign({ role: inv.role, student_id: st.id }, base));
    }
    db.update('invites', inv, { uses: num(inv.uses) + 1 });
    return bootstrap(db, ctx);
  }

  // ─── Учитель: главная ───
  // Учитель видит только свои предметы (Настройки → Мои предметы). p.all — показать все уроки.
  function onlyMine(settings, lessons, all) {
    return all || !checkSubjects(settings).length ? lessons : lessons.filter(function (l) { return subjectChecked(settings, l.subject); });
  }
  A['t.home'] = function (db, ctx, p) {
    p = p || {};
    var counts = markCounts(db);
    var upcoming = onlyMine(ctx.settings, decorateChecks(db, ctx.settings, lessonsInRange(db, ctx.today, 7, null)), p.all).map(function (l) {
      l.marked = counts[l.id] || 0; return l;
    });
    // Проверки ДЗ: сегодня и пропущенные за последнюю неделю
    var checks = decorateChecks(db, ctx.settings, lessonsInRange(db, addDays(ctx.today, -7), 8, null))
      .filter(function (l) { return l.check === 'due'; });
    // Ближайшие проверки (на неделю вперёд) — чтобы заранее видеть, какие классы и когда
    var nextChecks = decorateChecks(db, ctx.settings, lessonsInRange(db, addDays(ctx.today, 1), 7, null))
      .filter(function (l) { return l.check === 'due'; }).slice(0, 5);
    return {
      today: ctx.today, settings: ctx.settings, classes: classList(db), upcoming: upcoming, checks: checks, nextChecks: nextChecks,
      mine: checkSubjects(ctx.settings), all: !!p.all, askGrade: truthy(ctx.settings.check_ask_grade),
      pending: db.all('requests').filter(function (r) { return r.status === 'pending'; }).length,
      unassigned: studentsOfClass(db, '').length
    };
  };

  // ─── Учитель: классы ───
  A['t.class'] = function (db, ctx, p) {
    var cls = p.id === '__none' ? { id: '', name: 'Без класса' } : byId(db, 'classes', p.id);
    if (!cls) fail('Класс не найден.');
    var students = studentsOfClass(db, cls.id), ids = students.map(function (s) { return s.id; });
    var stats = statsFor(db, ids, ''), bal = balanceMap(db);
    return {
      cls: { id: cls.id, name: cls.name, virtual: !cls.id },
      students: students.map(function (s) {
        var st = stats[s.id];
        return { id: s.id, name: s.name, balance: bal[s.id] || 0, attendancePct: st.attendancePct,
          homeworkPct: st.homeworkPct, activity: st.activity, hwStreak: st.hwStreak };
      }),
      top: cls.id ? computeTop(db, ctx, cls) : null,
      classes: classList(db)
    };
  };
  A['t.classes.save'] = function (db, ctx, p) {
    var name = str(p.name, 40);
    if (!name) fail('Введите название класса.');
    var dup = db.all('classes').find(function (c) { return str(c.name).toLowerCase() === name.toLowerCase() && !same(c.id, p.id); });
    if (dup) fail('Класс с таким названием уже есть.');
    if (p.id) {
      var cls = byId(db, 'classes', p.id);
      if (!cls) fail('Класс не найден.');
      db.update('classes', cls, { name: name });
      if (ctx.drive && cls.folder_id) { try { ctx.drive.renameFolder(cls.folder_id, name); } catch (e) { /* не критично */ } }
      return { id: cls.id };
    }
    var maxSort = 0;
    db.all('classes').forEach(function (c) { maxSort = Math.max(maxSort, num(c.sort)); });
    var row = db.insert('classes', { id: uid('c'), name: name, sort: maxSort + 1, top_enabled: false, top_size: 3,
      top_mode: 'points', top_period: 'month', top_manual: '', folder_id: '' });
    if (ctx.drive) { try { db.update('classes', row, { folder_id: ctx.drive.ensureClassFolder(row) }); } catch (e) { /* создастся позже */ } }
    return { id: row.id };
  };
  A['t.classes.delete'] = function (db, ctx, p) {
    var cls = byId(db, 'classes', p.id);
    if (!cls) fail('Класс не найден.');
    studentsOfClass(db, cls.id).forEach(function (s) { db.update('students', s, { class_id: '' }); });
    db.all('templates').filter(function (t) { return same(t.class_id, cls.id); })
      .forEach(function (t) { db.remove('templates', t); });
    db.remove('classes', cls);
    return { ok: true };
  };

  // ─── Учитель: ученики ───
  A['t.students.save'] = function (db, ctx, p) {
    if (p.id) {
      var st = activeStudent(db, p.id);
      if (!st) fail('Ученик не найден.');
      var nm = str(p.name, 80);
      if (!nm) fail('Введите имя.');
      db.update('students', st, { name: nm });
      return { id: st.id };
    }
    if (p.classId && !byId(db, 'classes', p.classId)) fail('Класс не найден.');
    // Можно добавить сразу несколько учеников: каждое имя с новой строки.
    var names = String(p.names || p.name || '').split(/\r?\n/).map(function (n) { return str(n, 80); }).filter(Boolean);
    if (!names.length) fail('Введите хотя бы одно имя.');
    if (names.length > 60) fail('За один раз можно добавить до 60 учеников.');
    var ids = names.map(function (n) { return newStudent(db, ctx, p.classId || '', n).id; });
    return { ids: ids };
  };
  function newStudent(db, ctx, classId, name) {
    return db.insert('students', { id: uid('s'), class_id: classId, name: name, status: 'active', balance: 0,
      note_good: '', note_weak: '', note_repeat: '', note_parent: false, note_updated: '', created_at: ctx.nowStr });
  }
  A['t.students.move'] = function (db, ctx, p) {
    var st = activeStudent(db, p.id);
    if (!st) fail('Ученик не найден.');
    if (p.classId && !byId(db, 'classes', p.classId)) fail('Класс не найден.');
    db.update('students', st, { class_id: p.classId || '' });
    return { ok: true };
  };
  // «Удаление» = перенос в архив: ученик пропадает из приложения, но история остаётся в таблице.
  A['t.students.delete'] = function (db, ctx, p) {
    var st = activeStudent(db, p.id);
    if (!st) fail('Ученик не найден.');
    db.update('students', st, { status: 'archived' });
    db.all('users').filter(function (u) { return same(u.student_id, st.id); }).forEach(function (u) { db.remove('users', u); });
    db.all('invites').filter(function (i) { return same(i.student_id, st.id) && truthy(i.active); })
      .forEach(function (i) { db.update('invites', i, { active: false }); });
    db.all('requests').filter(function (r) { return same(r.student_id, st.id) && r.status === 'pending'; })
      .forEach(function (r) { db.update('requests', r, { status: 'cancelled', decided_at: ctx.nowStr }); });
    return { ok: true };
  };
  A['t.student'] = function (db, ctx, p) {
    var st = activeStudent(db, p.id);
    if (!st) fail('Ученик не найден.');
    var stats = statsFor(db, [st.id], '')[st.id];
    var earned = earnedMap(db, '')[st.id] || 0;
    var cls = byId(db, 'classes', st.class_id);
    var lessons = {};
    db.all('lessons').forEach(function (l) { lessons[l.id] = l; });
    var marks = sortBy(db.all('marks').filter(function (m) { return same(m.student_id, st.id); }), function (m) { return m.date; })
      .reverse().slice(0, 15).map(function (m) {
        var l = lessons[m.lesson_id] || {};
        return { date: m.date, subject: l.subject || '', topic: l.topic || '', attendance: m.attendance,
          homework: m.homework, activity: num(m.activity), grade: num(m.grade), uniform: m.uniform || '' };
      });
    return {
      student: { id: st.id, name: st.name, class_id: st.class_id, class_name: cls ? cls.name : 'Без класса',
        note_good: st.note_good, note_weak: st.note_weak, note_repeat: st.note_repeat,
        note_parent: truthy(st.note_parent), note_updated: st.note_updated },
      balance: balanceMap(db)[st.id] || 0, pending: pendingMap(db)[st.id] || 0, earned: earned, stats: stats,
      achievements: achievements(stats, earned, monthExtra(db, st.id, ctx.today)),
      level: levelOf(earned), badges: badgesOf(db, st.id, ctx.today, { warn: true, expired: true }), catalog: badgeCatalog(), look: lookOf(st, ownedItems(db, st.id)),
      ledger: sortBy(db.all('ledger').filter(function (l) { return same(l.student_id, st.id); }), function (l) { return l.at; })
        .reverse().slice(0, 60).map(function (l) { return { id: l.id, at: l.at, amount: num(l.amount), type: l.type, reason: l.reason }; }),
      marks: marks,
      accounts: db.all('users').filter(function (u) { return same(u.student_id, st.id); }).map(function (u) {
        return { tg_id: String(u.tg_id), role: u.role, name: u.name, username: u.username };
      }),
      classes: classList(db)
    };
  };
  A['t.notes.save'] = function (db, ctx, p) {
    var st = activeStudent(db, p.id);
    if (!st) fail('Ученик не найден.');
    db.update('students', st, { note_good: str(p.good, 2000), note_weak: str(p.weak, 2000),
      note_repeat: str(p.repeat, 2000), note_parent: !!p.parent, note_updated: ctx.nowStr });
    return { ok: true };
  };
  A['t.invite'] = function (db, ctx, p) {
    if (p.role !== 'student' && p.role !== 'parent') fail('Неизвестная роль.');
    var st = activeStudent(db, p.studentId);
    if (!st) fail('Ученик не найден.');
    var inv = !p.renew && db.all('invites').find(function (i) {
      return i.role === p.role && same(i.student_id, st.id) && truthy(i.active) && num(i.uses) < Math.max(1, num(i.max_uses));
    });
    if (!inv) inv = createInvite(db, ctx.nowStr, p.role, st.id);
    return { code: inv.code, link: inviteLink(ctx.settings, inv.code), maxUses: num(inv.max_uses), uses: num(inv.uses), renewed: !!p.renew };
  };
  A['t.unlink'] = function (db, ctx, p) {
    var row = db.all('users').find(function (u) { return same(u.tg_id, p.tgId) && same(u.student_id, p.studentId) && u.role === p.role; });
    if (!row) fail('Привязка не найдена.');
    db.remove('users', row);
    return { ok: true };
  };
  A['t.points'] = function (db, ctx, p) {
    var st = activeStudent(db, p.studentId);
    if (!st) fail('Ученик не найден.');
    var amount = Math.round(num(p.amount));
    if (!amount || Math.abs(amount) > 1000) fail('Укажите количество баллов от −1000 до 1000 (не 0).');
    var reason = str(p.reason, 200) || (amount > 0 ? 'Бонус от учителя' : 'Списание учителем');
    db.insert('ledger', { id: uid('p'), student_id: st.id, at: ctx.nowStr, amount: amount, type: 'manual', reason: reason, ref: '' });
    refreshBalances(db, [st.id]);
    return { balance: balanceMap(db)[st.id] || 0 };
  };

  // Удалить запись из истории баллов (например, после эксперимента). Баланс пересчитывается сам.
  A['t.points.delete'] = function (db, ctx, p) {
    var row = byId(db, 'ledger', p.id);
    if (!row) fail('Запись уже удалена. Обновите экран.');
    db.remove('ledger', row);
    refreshBalances(db, [row.student_id]);
    return { balance: balanceMap(db)[row.student_id] || 0 };
  };

  // ─── Учитель: журнал действий и массовая отмена ───
  A['t.journal'] = function (db, ctx) {
    var rows = db.all('journal').slice().reverse().slice(0, 60); // новые строки всегда дописываются в конец
    return { days: JOURNAL_DAYS, classes: classList(db), items: rows.map(function (r) {
      return { id: r.id, at: r.at, title: r.title, students: num(r.students), amount: num(r.amount), status: r.status || '',
        canUndo: !!str(r.data) && r.status !== 'big' };
    }) };
  };
  function journalRow(db, id) {
    var row = byId(db, 'journal', id);
    if (!row) fail('Запись журнала не найдена (возможно, ей больше 30 дней). Обновите экран.');
    if (!str(row.data)) fail('Это действие слишком большое — его нельзя отменить автоматически.');
    return row;
  }
  A['t.journal.undo'] = function (db, ctx, p) {
    var row = journalRow(db, p.id);
    if (row.status === 'undone') fail('Уже отменено.');
    var ops = JSON.parse(row.data), skipped = applyOps(db, ctx, ops, 'undo');
    db.update('journal', row, { status: 'undone' });
    refreshBalances(db, opStudents(db, ops));
    return { skipped: skipped };
  };
  A['t.journal.redo'] = function (db, ctx, p) {
    var row = journalRow(db, p.id);
    if (row.status !== 'undone') fail('Это действие не было отменено.');
    var ops = JSON.parse(row.data), skipped = applyOps(db, ctx, ops, 'redo');
    db.update('journal', row, { status: '' });
    refreshBalances(db, opStudents(db, ops));
    return { skipped: skipped };
  };
  A['t.mass.preview'] = function (db, ctx, p) {
    var s = massSelect(db, ctx, p);
    return { marks: s.marks.length, manual: s.manual.length, amount: s.amount, students: s.students,
      tooMany: s.marks.length + s.manual.length > MASS_MAX };
  };
  var MASS_MAX = 250;
  A['t.mass.apply'] = function (db, ctx, p) {
    var s = massSelect(db, ctx, p);
    if (!s.marks.length && !s.manual.length) fail('Под фильтр ничего не попало.');
    if (s.marks.length + s.manual.length > MASS_MAX) fail('Слишком много записей за один раз (больше ' + MASS_MAX + '). Выберите период короче или меньше учеников.');
    var touched = {}, lessons = {};
    s.marks.forEach(function (m) {
      var patch = { updated_at: ctx.nowStr }, empty = emptyMark();
      s.kinds.forEach(function (k) { patch[k] = empty[k]; });
      db.update('marks', m, patch);
      var k = { id: m.id, lesson_id: m.lesson_id, student_id: m.student_id, date: m.date };
      if (markEmpty(m)) { db.remove('marks', m); resyncMark(db, ctx, null, k); } else resyncMark(db, ctx, m, k);
      touched[m.student_id] = 1;
      lessons[m.lesson_id] = 1;
    });
    // Сняли ДЗ — урок снова «нужно проверить»
    if (s.kinds.indexOf('homework') >= 0) Object.keys(lessons).forEach(function (id) {
      var l = byId(db, 'lessons', id);
      if (l && l.check === 'done') db.update('lessons', l, { check: '' });
    });
    s.manual.forEach(function (l) { touched[l.student_id] = 1; db.remove('ledger', l); });
    refreshBalances(db, Object.keys(touched));
    var parts = [];
    if (s.marks.length) parts.push(s.marks.length + ' ' + plural(s.marks.length, ['отметка', 'отметки', 'отметок']));
    if (s.manual.length) parts.push(s.manual.length + ' ручн. ' + plural(s.manual.length, ['запись', 'записи', 'записей']));
    return { title: parts.join(', ') + ' · ' + Object.keys(touched).length + ' уч.', students: Object.keys(touched).length };
  };

  // ─── Учитель: расписание ───
  A['t.week'] = function (db, ctx, p) {
    var from = mondayOf(isDate(p.from) ? p.from : ctx.today);
    var classIds = p.classId ? [p.classId] : null;
    var counts = markCounts(db);
    return {
      from: from, today: ctx.today, classId: p.classId || '',
      lessons: onlyMine(ctx.settings, decorateChecks(db, ctx.settings, lessonsInRange(db, from, 7, classIds)), p.all).map(function (l) { l.marked = counts[l.id] || 0; return l; }),
      mine: checkSubjects(ctx.settings), all: !!p.all,
      templates: sortBy(db.all('templates').filter(function (t) { return !classIds || same(t.class_id, p.classId); }),
        function (t) { return num(t.weekday) + ' ' + t.start; }).map(function (t) {
        var c = byId(db, 'classes', t.class_id);
        return { id: t.id, class_id: t.class_id, class_name: c ? c.name : '?', weekday: num(t.weekday),
          start: t.start, end: t.end, subject: t.subject, room: t.room, check: slotOn(t) };
      }),
      classes: classList(db)
    };
  };
  function checkTimes(start, end) {
    if (!start || !end) fail('Укажите время в формате ЧЧ:ММ, например 09:00.');
    if (end <= start) fail('Время окончания должно быть позже начала.');
  }
  A['t.template.save'] = function (db, ctx, p) {
    if (!byId(db, 'classes', p.classId)) fail('Выберите класс.');
    var wd = Math.round(num(p.weekday));
    if (wd < 1 || wd > 7) fail('Выберите день недели.');
    var start = normTime(p.start), end = normTime(p.end), subject = str(p.subject, 60);
    checkTimes(start, end);
    if (!subject) fail('Введите предмет.');
    var data = { class_id: p.classId, weekday: wd, start: start, end: end, subject: subject, room: str(p.room, 20) };
    if (p.id) {
      var t = byId(db, 'templates', p.id);
      if (!t) fail('Запись расписания не найдена.');
      db.update('templates', t, data);
      return { id: t.id };
    }
    return { id: db.insert('templates', Object.assign({ id: uid('r') }, data)).id };
  };
  A['t.template.delete'] = function (db, ctx, p) {
    var t = byId(db, 'templates', p.id);
    if (!t) fail('Запись расписания не найдена.');
    db.remove('templates', t);
    return { ok: true };
  };
  A['t.lesson'] = function (db, ctx, p) {
    var r = resolveLesson(db, p.id), v = r.view;
    var cls = byId(db, 'classes', v.class_id);
    v.class_name = cls ? cls.name : '';
    decorateChecks(db, ctx.settings, [v]);
    var marks = r.row ? marksOfLesson(db, r.row.id) : {};
    var bal = balanceMap(db);
    // ДЗ, которое проверяется на этом уроке, — задано на предыдущем уроке того же предмета в этом классе
    var prev = sortBy(db.all('lessons').filter(function (l) {
      return same(l.class_id, v.class_id) && sameSubjectStrict(l.subject, v.subject) && str(l.homework) && l.status !== 'cancelled' &&
        (l.date < v.date || (l.date === v.date && l.start < v.start));
    }), function (l) { return l.date + ' ' + l.start; }).pop();
    return {
      lesson: v, today: ctx.today, rules: rulesOf(ctx.settings),
      prevHomework: prev ? { date: prev.date, text: prev.homework } : null,
      ask: { grade: truthy(ctx.settings.check_ask_grade), uniform: truthy(ctx.settings.check_ask_uniform) },
      students: studentsOfClass(db, v.class_id).map(function (s) {
        var m = marks[s.id] || {};
        return { id: s.id, name: s.name, balance: bal[s.id] || 0,
          mark: { attendance: m.attendance || '', homework: m.homework || '', activity: num(m.activity),
            grade: num(m.grade), uniform: m.uniform || '', saved: !!marks[s.id] } };
      })
    };
  };
  A['t.lesson.save'] = function (db, ctx, p) {
    var row = materialize(db, ctx, p.id), patch = { updated_at: ctx.nowStr };
    ['topic', 'homework', 'notes', 'checklist', 'material_name'].forEach(function (k) {
      if (p[k] !== undefined) patch[k] = str(p[k], k === 'topic' ? 200 : 3000);
    });
    if (p.material_url !== undefined) {
      var url = str(p.material_url, 500);
      if (url && !/^https?:\/\//i.test(url)) fail('Ссылка на конспект должна начинаться с https://');
      patch.material_url = url;
      if (!url) patch.material_name = '';
    }
    if (p.subject !== undefined) { patch.subject = str(p.subject, 60); if (!patch.subject) fail('Введите предмет.'); }
    if (p.date !== undefined) { if (!isDate(p.date)) fail('Неверная дата.'); patch.date = p.date; }
    if (p.start !== undefined || p.end !== undefined) {
      patch.start = normTime(p.start !== undefined ? p.start : row.start);
      patch.end = normTime(p.end !== undefined ? p.end : row.end);
      checkTimes(patch.start, patch.end);
    }
    if (p.status !== undefined) {
      if (['planned', 'done', 'cancelled'].indexOf(p.status) < 0) fail('Неизвестный статус урока.');
      patch.status = p.status;
    }
    db.update('lessons', row, patch);
    return { id: row.id };
  };
  A['t.lesson.create'] = function (db, ctx, p) {
    if (!byId(db, 'classes', p.classId)) fail('Выберите класс.');
    if (!isDate(p.date)) fail('Укажите дату.');
    var start = normTime(p.start), end = normTime(p.end), subject = str(p.subject, 60);
    checkTimes(start, end);
    if (!subject) fail('Введите предмет.');
    return { id: db.insert('lessons', { id: uid('l'), class_id: p.classId, template_id: '', orig_date: '', date: p.date,
      start: start, end: end, subject: subject, topic: str(p.topic, 200), homework: '', notes: '', checklist: '',
      material_url: '', material_name: '', status: 'planned', updated_at: ctx.nowStr }).id };
  };
  A['t.lesson.delete'] = function (db, ctx, p) {
    var r = resolveLesson(db, p.id);
    if (!r.row || r.row.template_id) fail('Урок из шаблона нельзя удалить — его можно отменить.');
    var marks = marksOfLesson(db, r.row.id);
    if (Object.keys(marks).length) fail('На уроке уже есть отметки — его можно только отменить.');
    db.remove('lessons', r.row);
    return { ok: true };
  };
  A['t.material.upload'] = function (db, ctx, p) {
    if (!ctx.drive) fail('Загрузка файлов работает после подключения Google Диска. В демо-режиме вставьте ссылку.');
    var name = str(p.name, 150), data = String(p.data || '');
    if (!name || !data) fail('Файл не выбран.');
    if (data.length > 14 * 1024 * 1024) fail('Файл слишком большой (максимум около 10 МБ).');
    var row = materialize(db, ctx, p.lessonId);
    var cls = byId(db, 'classes', row.class_id);
    var res = ctx.drive.upload(cls, row, name, str(p.mime) || 'application/octet-stream', data);
    if (cls && res.folderId && cls.folder_id !== res.folderId) db.update('classes', cls, { folder_id: res.folderId });
    db.update('lessons', row, { material_url: res.url, material_name: res.name, updated_at: ctx.nowStr });
    return { id: row.id };
  };

  // ─── Учитель: быстрые отметки на уроке ───
  A['t.marks.save'] = function (db, ctx, p) {
    var row = materialize(db, ctx, p.lessonId);
    var existing = marksOfLesson(db, row.id), touched = [];
    // Меняются только присланные поля: мастер проверки не трогает активность, режим урока — оценки.
    (p.marks || []).forEach(function (m) {
      var st = activeStudent(db, m.studentId);
      if (!st) return;
      var patch = { date: row.date, updated_at: ctx.nowStr };
      if (m.attendance !== undefined) patch.attendance = ATTENDANCE.indexOf(m.attendance) >= 0 ? m.attendance : '';
      if (m.homework !== undefined) patch.homework = HOMEWORK.indexOf(m.homework) >= 0 ? m.homework : '';
      if (m.activity !== undefined) patch.activity = Math.max(0, Math.min(99, Math.round(num(m.activity))));
      if (m.grade !== undefined) { var g = Math.round(num(m.grade)); patch.grade = g >= 1 && g <= 5 ? g : 0; }
      if (m.uniform !== undefined) patch.uniform = UNIFORM.indexOf(m.uniform) >= 0 ? m.uniform : '';
      var mk = existing[st.id];
      if (mk) db.update('marks', mk, patch);
      else mk = existing[st.id] = db.insert('marks', Object.assign({ id: uid('m'), lesson_id: row.id, student_id: st.id }, patch));
      syncMarkPoints(db, ctx, mk, row);
      syncStreakBonus(db, ctx, mk, row);
      touched.push(st.id);
    });
    var patch = { updated_at: ctx.nowStr };
    if (p.finish) patch.status = 'done';
    if (p.check === 'done') patch.check = 'done';
    db.update('lessons', row, patch);
    refreshBalances(db, touched);
    var bal = balanceMap(db), balances = {};
    touched.forEach(function (sid) { balances[sid] = bal[sid] || 0; });
    return { lessonId: row.id, balances: balances };
  };

  // ─── Учитель: топ, награды, правила, настройки ───
  A['t.top.save'] = function (db, ctx, p) {
    var cls = byId(db, 'classes', p.classId);
    if (!cls) fail('Класс не найден.');
    var size = [3, 5, 10].indexOf(num(p.size)) >= 0 ? num(p.size) : 3;
    var valid = studentsOfClass(db, cls.id).map(function (s) { return String(s.id); });
    var manual = (p.manual || []).map(String).filter(function (id) { return valid.indexOf(id) >= 0; }).slice(0, size);
    db.update('classes', cls, {
      top_enabled: !!p.enabled, top_size: size,
      top_mode: ['points', 'rating', 'manual'].indexOf(p.mode) >= 0 ? p.mode : 'points',
      top_period: ['week', 'month', 'all'].indexOf(p.period) >= 0 ? p.period : 'month', top_manual: manual.join(',')
    });
    return { top: computeTop(db, ctx, cls) };
  };
  A['t.rewards'] = function (db, ctx) {
    var students = {}, classes = classMap(db), bal = balanceMap(db);
    db.all('students').forEach(function (s) { students[s.id] = s; });
    var reqs = sortBy(db.all('requests'), function (r) { return r.created_at; }).reverse();
    var pending = reqs.filter(function (r) { return r.status === 'pending'; });
    var done = reqs.filter(function (r) { return r.status !== 'pending'; }).slice(0, 30);
    return {
      rewards: sortBy(db.all('rewards'), function (r) { return num(r.cost); }).map(function (r) {
        return { id: r.id, title: r.title, description: r.description, cost: num(r.cost), stock: str(r.stock), active: truthy(r.active) };
      }),
      requests: pending.concat(done).map(function (r) {
        var s = students[r.student_id] || {}, c = classes[s.class_id];
        return { id: r.id, student_id: r.student_id, student_name: s.name || '—', class_name: c ? c.name : '',
          reward_title: r.reward_title, cost: num(r.cost), status: r.status, created_at: r.created_at,
          decided_at: r.decided_at, comment: r.comment, balance: bal[r.student_id] || 0 };
      }),
      rules: rulesOf(ctx.settings)
    };
  };
  A['t.rewards.save'] = function (db, ctx, p) {
    var title = str(p.title, 80), cost = Math.round(num(p.cost));
    if (!title) fail('Введите название награды.');
    if (cost <= 0) fail('Стоимость должна быть больше нуля.');
    var stock = str(p.stock);
    if (stock !== '' && !(num(stock) >= 0)) fail('Количество — число или пусто (без лимита).');
    var data = { title: title, description: str(p.description, 300), cost: cost,
      stock: stock === '' ? '' : String(Math.round(num(stock))), active: p.active !== false };
    if (p.id) {
      var r = byId(db, 'rewards', p.id);
      if (!r) fail('Награда не найдена.');
      db.update('rewards', r, data);
      return { id: r.id };
    }
    return { id: db.insert('rewards', Object.assign({ id: uid('w') }, data)).id };
  };
  A['t.rewards.delete'] = function (db, ctx, p) {
    var r = byId(db, 'rewards', p.id);
    if (!r) fail('Награда не найдена.');
    if (db.all('requests').some(function (q) { return same(q.reward_id, r.id) && q.status === 'pending'; })) {
      fail('По этой награде есть заявки, ожидающие решения. Сначала подтвердите или отклоните их.');
    }
    db.remove('rewards', r);
    return { ok: true };
  };
  A['t.requests.decide'] = function (db, ctx, p) {
    var q = byId(db, 'requests', p.id);
    if (!q || q.status !== 'pending') fail('Заявка уже обработана.');
    if (p.approve) {
      var bal = balanceMap(db)[q.student_id] || 0;
      if (bal < num(q.cost)) fail('У ученика недостаточно баллов (' + bal + ' из ' + num(q.cost) + ').');
      var reward = byId(db, 'rewards', q.reward_id);
      if (reward && str(reward.stock) !== '') {
        if (num(reward.stock) <= 0) fail('Эта награда закончилась. Отклоните заявку или пополните количество.');
        db.update('rewards', reward, { stock: String(num(reward.stock) - 1) });
      }
      db.insert('ledger', { id: uid('p'), student_id: q.student_id, at: ctx.nowStr, amount: -num(q.cost), type: 'reward',
        reason: 'Награда: ' + q.reward_title, ref: 'req:' + q.id });
      refreshBalances(db, [q.student_id]);
    }
    db.update('requests', q, { status: p.approve ? 'approved' : 'rejected', decided_at: ctx.nowStr, comment: str(p.comment, 200) });
    return { ok: true };
  };
  A['t.rules.save'] = function (db, ctx, p) {
    var map = { attendance: 'points_attendance', late: 'points_late', homework: 'points_homework',
      homeworkPartial: 'points_homework_partial', activity: 'points_activity', streakLength: 'streak_length', streakBonus: 'streak_bonus',
      grade5: 'points_grade_5', grade4: 'points_grade_4', grade3: 'points_grade_3', grade2: 'points_grade_2', uniform: 'points_uniform' };
    Object.keys(map).forEach(function (k) {
      if (p[k] === undefined) return;
      var v = Math.round(num(p[k]));
      if (v < 0 || v > 100) fail('Значения правил — от 0 до 100.');
      setSetting(db, map[k], v);
    });
    return { ok: true };
  };
  A['t.settings.save'] = function (db, ctx, p) {
    if (p.teacher_name !== undefined) setSetting(db, 'teacher_name', str(p.teacher_name, 60) || 'Учитель');
    if (p.bot_username !== undefined) setSetting(db, 'bot_username', str(p.bot_username, 60).replace(/^@/, ''));
    if (p.app_short_name !== undefined) setSetting(db, 'app_short_name', appShortName(str(p.app_short_name, 120)));
    ['parent_show_attendance', 'parent_show_homework', 'parent_show_points', 'parent_show_materials',
      'check_ask_grade', 'check_ask_uniform', 'remind_enabled', 'game_enabled'].forEach(function (k) {
      if (p[k] !== undefined) setSetting(db, k, p[k] ? 'true' : 'false');
    });
    if (p.check_subjects !== undefined) {
      var subj = (Array.isArray(p.check_subjects) ? p.check_subjects : String(p.check_subjects).split(','))
        .map(function (x) { return str(x, 60).replace(/,/g, ' '); }).filter(Boolean);
      setSetting(db, 'check_subjects', subj.join(', '));
    }
    if (p.shop_price_pct !== undefined) {
      var pct = Math.round(num(p.shop_price_pct));
      if (pct < 25 || pct > 400) fail('Цены украшений — от 25% до 400%.');
      setSetting(db, 'shop_price_pct', pct);
    }
    if (p.remind_hour !== undefined) {
      var h = Math.round(num(p.remind_hour));
      if (h < 0 || h > 23) fail('Час напоминания — от 0 до 23.');
      setSetting(db, 'remind_hour', h);
    }
    return { ok: true };
  };

  // ─── Учитель: проверка ДЗ ───
  // Календарь проверок: пропущенные (неделя назад), сегодня и на две недели вперёд + настройка «дней проверки».
  A['t.checks'] = function (db, ctx) {
    var from = addDays(ctx.today, -7);
    var list = decorateChecks(db, ctx.settings, lessonsInRange(db, from, 22, null)).filter(function (l) { return l.check; });
    var classes = classMap(db), subjects = {};
    db.all('templates').forEach(function (t) { if (classes[t.class_id] && str(t.subject)) subjects[normText(t.subject)] = str(t.subject); });
    var mine = checkSubjects(ctx.settings);
    var slots = sortBy(db.all('templates').filter(function (t) { return classes[t.class_id] && mine.length && subjectChecked(ctx.settings, t.subject); }),
      function (t) { return str(classes[t.class_id].name) + ' ' + num(t.weekday) + ' ' + t.start; }).map(function (t) {
      return { id: t.id, class_name: classes[t.class_id].name, weekday: num(t.weekday), start: t.start, subject: t.subject, check: slotOn(t) };
    });
    return {
      today: ctx.today, items: list, slots: slots, mine: mine,
      subjects: sortBy(Object.keys(subjects).map(function (k) { return subjects[k]; }), function (x) { return x.toLowerCase(); }),
      ask: { grade: truthy(ctx.settings.check_ask_grade), uniform: truthy(ctx.settings.check_ask_uniform) },
      remind: { enabled: truthy(ctx.settings.remind_enabled), hour: num(ctx.settings.remind_hour) }
    };
  };
  // Отметить в шаблоне недели, что на этом уроке проверяется ДЗ (каждую неделю).
  A['t.check.slot'] = function (db, ctx, p) {
    var t = byId(db, 'templates', p.id);
    if (!t) fail('Урок в расписании не найден. Обновите экран.');
    var from = isDate(p.from) ? p.from : ctx.today;
    if (!p.on) db.update('templates', t, { check: '' });
    else if (!slotOn(t)) db.update('templates', t, { check: from });
    return { ok: true };
  };
  // Для одного урока: 'yes' — проверить, 'no' — отменить проверку, '' — как в шаблоне.
  A['t.check.set'] = function (db, ctx, p) {
    if (['yes', 'no', ''].indexOf(p.value) < 0) fail('Неизвестное значение.');
    var row = materialize(db, ctx, p.id);
    db.update('lessons', row, { check: p.value, updated_at: ctx.nowStr });
    return { id: row.id };
  };

  // ─── Учитель: импорт из вставленной таблицы (emaktab, Excel) ───
  // Каждое действие умеет «пробный прогон» (dryRun): возвращает план изменений, ничего не записывая.
  function normText(s) { return str(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }
  function sameSubject(a, b) {
    a = normText(a); b = normText(b);
    return !a || !b || a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }
  function importClass(db, p) {
    var cls = byId(db, 'classes', p.classId);
    if (!cls) fail('Выберите класс.');
    return cls;
  }

  // «10-A», «10 А», «10а» — один и тот же класс (кириллица и латиница тоже считаются одинаковыми)
  var CYR_LAT = { 'а': 'a', 'в': 'v', 'б': 'b', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'j', 'з': 'z', 'и': 'i', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x' };
  function classKey(s) {
    return normText(s).replace(/sinf|класс/g, '').replace(/[\s\-–"«»'()]/g, '').replace(/[а-я]/g, function (ch) { return CYR_LAT[ch] || ch; });
  }
  // ─── Расширение Chrome «перенос из emaktab» ───
  // Ключ хранится в строке учителя на листе «Пользователи». Повторный запрос — тот же ключ; renew — новый; off — отключить.
  A['t.ext.key'] = function (db, ctx, p) {
    var me = db.all('users').find(function (u) { return u.role === 'teacher' && same(u.tg_id, ctx.user.id); });
    if (!me) fail('Нет доступа.');
    if (p.off) { db.update('users', me, { ext_key: '' }); return { key: '' }; }
    var key = str(me.ext_key);
    if (!key || p.renew) { key = 'ext_' + randomChars(28); db.update('users', me, { ext_key: key }); }
    return { key: key };
  };
  A['t.ext.info'] = function (db, ctx) {
    return { teacher: str(ctx.settings.teacher_name) || 'Учитель', classes: classList(db).map(function (c) { return { id: c.id, name: c.name }; }),
      subjects: str(ctx.settings.check_subjects), today: ctx.today, version: VERSION };
  };

  A['t.import.classes'] = function (db, ctx, p) {
    var list = (p.classes || []).map(function (c) { return { name: str(c.name, 40), subjects: (c.subjects || []).map(function (x) { return str(x, 60); }).filter(Boolean) }; })
      .filter(function (c) { return c.name; }).slice(0, 40);
    if (!list.length) fail('Не найдено ни одного класса.');
    var have = {};
    db.all('classes').forEach(function (c) { have[classKey(c.name)] = c.name; });
    var plan = list.map(function (c) {
      var k = classKey(c.name), x = { name: c.name, subjects: c.subjects, status: 'new' };
      if (have[k]) { x.status = 'skip'; x.note = 'уже есть' + (have[k] !== c.name ? ' («' + have[k] + '»)' : ''); }
      have[k] = have[k] || c.name;
      return x;
    });
    if (!p.dryRun) {
      var maxSort = 0;
      db.all('classes').forEach(function (c) { maxSort = Math.max(maxSort, num(c.sort)); });
      plan.forEach(function (x) {
        if (x.status !== 'new') return;
        var row = db.insert('classes', { id: uid('c'), name: x.name, sort: ++maxSort, top_enabled: false, top_size: 3,
          top_mode: 'points', top_period: 'month', top_manual: '', folder_id: '' });
        if (ctx.drive) { try { db.update('classes', row, { folder_id: ctx.drive.ensureClassFolder(row) }); } catch (e) { /* создастся позже */ } }
      });
    }
    return { plan: plan };
  };

  /**
   * Импорт сразу по нескольким классам (расписание учителя, ДЗ по всем классам).
   * groups: [{ className, rows | items }]; createClasses — создать классы, которых ещё нет.
   */
  A['t.import.multi'] = function (db, ctx, p) {
    var action = { templates: 't.import.templates', topics: 't.import.topics' }[p.kind];
    if (!action) fail('Неизвестный вид импорта.');
    var byKey = {}, plan = [], maxSort = 0;
    db.all('classes').forEach(function (c) { byKey[classKey(c.name)] = c; maxSort = Math.max(maxSort, num(c.sort)); });
    var groups = (p.groups || []).slice(0, 40);
    if (!groups.length) fail('Нечего импортировать.');
    groups.forEach(function (g) {
      var name = str(g.className, 40), list = g.rows || g.items || [];
      if (!name) {
        list.forEach(function (r) { plan.push(Object.assign({}, r, { status: 'error', note: 'не понят класс' })); });
        return;
      }
      var cls = byKey[classKey(name)];
      if (!cls) {
        if (!p.createClasses) {
          list.forEach(function (r) { plan.push(Object.assign({}, r, { className: name, status: 'error', note: 'такого класса нет в приложении' })); });
          return;
        }
        if (p.dryRun) { // в пробном прогоне класс не создаём — просто показываем, что будет
          list.forEach(function (r) {
            plan.push(Object.assign({}, r, { className: name, status: p.kind === 'templates' ? 'new' : 'create', note: 'класс «' + name + '» будет создан' }));
          });
          return;
        }
        cls = db.insert('classes', { id: uid('c'), name: name, sort: ++maxSort, top_enabled: false, top_size: 3,
          top_mode: 'points', top_period: 'month', top_manual: '', folder_id: '' });
        if (ctx.drive) { try { db.update('classes', cls, { folder_id: ctx.drive.ensureClassFolder(cls) }); } catch (e) { /* создастся позже */ } }
        byKey[classKey(name)] = cls;
      }
      try {
        var res = A[action](db, ctx, Object.assign({}, p, { classId: cls.id, rows: g.rows, items: g.items }));
        res.plan.forEach(function (x) { x.className = cls.name; plan.push(x); });
      } catch (e) {
        plan.push({ className: cls.name, status: 'error', note: e.message });
      }
    });
    return { plan: plan };
  };

  A['t.import.students'] = function (db, ctx, p) {
    var cls = importClass(db, p);
    var names = (p.names || []).map(function (n) { return str(n, 80); }).filter(Boolean);
    if (!names.length) fail('Не найдено ни одного имени. Проверьте, какой столбец выбран как «Имя».');
    if (names.length > 80) fail('За один раз — не больше 80 учеников.');
    var classes = classMap(db), where = {}, seen = {};
    db.all('students').forEach(function (s) { if (s.status !== 'archived') where[normText(s.name)] = s.class_id; });
    var plan = names.map(function (n) {
      var k = normText(n), x = { name: n, status: 'new' };
      if (seen[k]) { x.status = 'skip'; x.note = 'повтор в списке'; }
      else if (where[k] !== undefined && same(where[k], cls.id)) { x.status = 'skip'; x.note = 'уже в классе'; }
      else if (where[k] !== undefined) {
        x.status = 'skip'; x.note = 'уже есть в ' + (classes[where[k]] ? classes[where[k]].name : '«Без класса»') + ' — переведите вручную';
      }
      seen[k] = true;
      return x;
    });
    if (!p.dryRun) plan.forEach(function (x) { if (x.status === 'new') newStudent(db, ctx, cls.id, x.name); });
    return { plan: plan };
  };

  A['t.import.templates'] = function (db, ctx, p) {
    var cls = importClass(db, p);
    var rows = (p.rows || []).slice(0, 100);
    if (!rows.length) fail('Не найдено ни одного урока. Проверьте назначение столбцов.');
    var key = function (wd, start, subject) { return wd + '|' + start + '|' + normText(subject); };
    var existing = db.all('templates').filter(function (t) { return same(t.class_id, cls.id); });
    var exKeys = {}, keep = {}, seen = {};
    existing.forEach(function (t) { exKeys[key(num(t.weekday), t.start, t.subject)] = true; });
    var plan = rows.map(function (r) {
      var x = { weekday: Math.round(num(r.weekday)), start: normTime(r.start), end: normTime(r.end),
        subject: str(r.subject, 60), room: str(r.room, 20), status: 'new' };
      var k = key(x.weekday, x.start, x.subject);
      if (x.weekday < 1 || x.weekday > 7) { x.status = 'error'; x.note = 'не понят день недели'; }
      else if (!x.start || !x.end || x.end <= x.start) { x.status = 'error'; x.note = 'не понято время'; }
      else if (!x.subject) { x.status = 'error'; x.note = 'нет предмета'; }
      else if (seen[k]) { x.status = 'skip'; x.note = 'повтор'; }
      else if (exKeys[k]) { x.status = 'skip'; x.note = 'уже есть'; keep[k] = true; }
      seen[k] = true;
      return x;
    });
    if (p.replace) {
      existing.forEach(function (t) {
        if (!keep[key(num(t.weekday), t.start, t.subject)]) {
          plan.push({ id: t.id, weekday: num(t.weekday), start: t.start, end: t.end, subject: t.subject, status: 'remove', note: 'нет в новом расписании' });
        }
      });
    }
    if (!p.dryRun) {
      plan.forEach(function (x) {
        if (x.status === 'remove') { var t = byId(db, 'templates', x.id); if (t) db.remove('templates', t); }
        if (x.status === 'new') db.insert('templates', { id: uid('r'), class_id: cls.id, weekday: x.weekday, start: x.start, end: x.end, subject: x.subject, room: x.room });
      });
    }
    plan.forEach(function (x) { delete x.id; });
    return { plan: plan };
  };

  /**
   * Темы и ДЗ. Параметры:
   *   mode: 'dates' — по датам из таблицы; 'sequence' — КТП без дат, по порядку начиная с from;
   *   overwrite — заменять уже заполненные темы/ДЗ;
   *   hwDue — дата в таблице означает урок, К КОТОРОМУ задано ДЗ: тогда ДЗ пишем в предыдущий урок
   *           этого предмета (у нас ДЗ хранится в уроке, на котором его задали);
   *   createMissing — если урока нет в расписании, создать разовый урок (время — по номеру урока).
   */
  A['t.import.topics'] = function (db, ctx, p) {
    var cls = importClass(db, p);
    var items = (p.items || []).filter(function (it) { return str(it.topic) || str(it.homework); }).slice(0, 400);
    if (!items.length) fail('Не найдено ни одной темы или задания. Проверьте назначение столбцов.');
    var plan = [], used = {}, created = {}, batch = [], hwTargets = {}; // batch — уроки, которые будут созданы этим импортом
    var fits = function (l, it) {
      return l.status !== 'cancelled' && sameSubject(it.subject || p.subject, l.subject) && (!it.start || normTime(it.start) === l.start);
    };
    var previous = function (l) {
      var from = addDays(l.date, -21);
      var list = lessonsInRange(db, from, 21, [cls.id]).concat(batch.filter(function (b) { return b.date >= from && b.date < l.date; }))
        .filter(function (x) { return x.status !== 'cancelled' && sameSubject(l.subject, x.subject); });
      list = sortBy(list, function (x) { return x.date + ' ' + x.start; });
      return list.length ? list[list.length - 1] : null;
    };
    var entry = function (l, it) {
      var isNew = !!l.key;
      var x = { date: l.date, start: l.start, subject: l.subject, topic: str(it.topic, 200), homework: str(it.homework, 3000),
        status: isNew ? 'create' : 'update', _l: isNew ? null : l.id, _key: l.key || null, _new: isNew ? l : null };
      var topicChange = !!x.topic && normText(l.topic) !== normText(x.topic);
      var topicBlocked = topicChange && !!l.topic && !p.overwrite;
      var hl = l, noPrev = false;
      if (p.hwDue && x.homework) {
        var prev = previous(l);
        if (prev) hl = prev;
        else { noPrev = true; x.note = 'ДЗ задано раньше, чем начинается таблица — не записываем'; }
      }
      if (x.homework && !noPrev) x.hwDate = hl.date;
      var hwChange = !noPrev && !!x.homework && normText(hl.homework) !== normText(x.homework);
      var hwBlocked = hwChange && !!hl.homework && !p.overwrite;
      x._doTopic = topicChange && !topicBlocked;
      x._doHw = hwChange && !hwBlocked;
      x._hwText = x.homework;
      x._hl = hl === l || hl.key ? null : hl.id;
      x._hlKey = hl !== l && hl.key ? hl.key : null;
      // два задания на один и тот же урок — объединяем, а не затираем одно другим
      var target = hl.key || hl.id;
      if (x._doHw) {
        var first = hwTargets[target];
        if (first) { first._hwText += '\n' + x.homework; x._doHw = false; x.note = 'добавлено к другому ДЗ урока ' + hl.date; }
        else hwTargets[target] = x;
      }
      if (!isNew && !x._doTopic && !x._doHw && !(x.note && x.note.indexOf('добавлено') === 0)) {
        x.status = 'skip';
        if (!noPrev) x.note = topicBlocked || hwBlocked ? 'уже заполнено (включите «Заменять заполненное»)' : 'без изменений';
      }
      return x;
    };
    if (p.mode === 'sequence') {
      var from = isDate(p.from) ? p.from : ctx.today;
      var pool = lessonsInRange(db, from, 240, [cls.id]).filter(function (l) { return fits(l, {}) && (p.overwrite || !l.topic); });
      items.forEach(function (it, i) {
        var l = pool[i];
        plan.push(l ? entry(l, it) : { topic: str(it.topic, 200), status: 'nolesson', note: 'в расписании не хватило уроков' });
      });
    } else {
      // 1-й проход: для каждой строки находим урок в расписании или готовим новый
      var resolved = items.map(function (it) {
        if (!isDate(it.date)) return { x: { topic: str(it.topic, 200), homework: str(it.homework, 300), status: 'error', note: 'не понята дата' } };
        var l = lessonsInRange(db, it.date, 1, [cls.id]).find(function (x) { return fits(x, it) && !used[x.id]; });
        if (l) { used[l.id] = true; return { l: l, it: it }; }
        var subject = str(it.subject || p.subject, 60), start = normTime(it.newStart), end = normTime(it.newEnd);
        var key = it.date + '|' + start + '|' + normText(subject);
        if (p.createMissing && subject && start && end > start && !created[key]) {
          created[key] = { key: key, date: it.date, start: start, end: end, subject: subject, topic: '', homework: '', status: 'planned' };
          batch.push(created[key]);
          return { l: created[key], it: it };
        }
        return { x: { date: it.date, subject: subject, topic: str(it.topic, 200), homework: str(it.homework, 300), status: 'nolesson',
          note: p.createMissing ? 'не хватает предмета или номера урока' : 'в этот день нет такого урока в расписании' } };
      });
      // 2-й проход: что именно меняем (нужны все уроки, чтобы найти «предыдущий» для ДЗ)
      resolved.forEach(function (r) { plan.push(r.x || entry(r.l, r.it)); });
    }
    if (!p.dryRun) {
      var rows = {}; // сначала создаём новые уроки, потом записываем темы и ДЗ
      plan.forEach(function (x) {
        if (x.status !== 'create') return;
        var n = x._new;
        rows[x._key] = db.insert('lessons', { id: uid('l'), class_id: cls.id, template_id: '', orig_date: '', date: n.date, start: n.start,
          end: n.end, subject: n.subject, topic: '', homework: '', notes: '', checklist: '', material_url: '', material_name: '',
          status: 'planned', updated_at: ctx.nowStr });
      });
      plan.forEach(function (x) {
        if (x.status !== 'update' && x.status !== 'create') return;
        var row = x._l ? materialize(db, ctx, x._l) : rows[x._key];
        var patch = { updated_at: ctx.nowStr };
        if (x._doTopic) patch.topic = x.topic;
        if (x._doHw && !x._hl && !x._hlKey) patch.homework = x._hwText;
        db.update('lessons', row, patch);
        if (x._doHw && (x._hl || x._hlKey)) {
          var hr = x._hl ? materialize(db, ctx, x._hl) : rows[x._hlKey];
          db.update('lessons', hr, { homework: x._hwText, updated_at: ctx.nowStr });
        }
      });
    }
    plan.forEach(function (x) { Object.keys(x).forEach(function (k) { if (k.charAt(0) === '_') delete x[k]; }); });
    return { plan: plan };
  };

  // ─── Учитель: значки ───
  A['t.badge.give'] = function (db, ctx, p) {
    var c = BADGES[p.key];
    if (!c || p.key === 'team') fail('Выберите значок.');
    var title = /^custom_/.test(p.key) ? str(p.title, 40) : c[0];
    if (!title) fail('Напишите название значка.');
    var ids = (p.studentIds || []).map(String).filter(function (id) { return activeStudent(db, id); });
    if (!ids.length) fail('Выберите ученика.');
    var days = Math.max(1, Math.min(60, Math.round(num(p.days)) || WARN_DAYS));
    ids.forEach(function (sid) {
      db.insert('badges', { id: uid('b'), student_id: sid, key: p.key, title: title, kind: c[2], note: str(p.note, 200),
        at: ctx.nowStr, until: c[2] === 'warn' ? addDays(ctx.today, days) : '', ref: '' });
    });
    return { count: ids.length };
  };
  A['t.badge.remove'] = function (db, ctx, p) {
    var b = byId(db, 'badges', p.id);
    if (!b) fail('Значок уже снят. Обновите экран.');
    db.remove('badges', b);
    return { ok: true };
  };

  // ─── Учитель: цель класса ───
  A['t.goal'] = function (db, ctx, p) {
    var classes = classList(db);
    var cls = byId(db, 'classes', p.classId) || (classes[0] && byId(db, 'classes', classes[0].id));
    if (!cls) return { classes: classes, cls: null };
    var list = sortBy(db.all('goals').filter(function (g) { return same(g.class_id, cls.id); }), function (g) { return g.from + (g.done_at || ''); }).reverse();
    var act = list.find(function (g) { return g.status === 'active'; });
    return {
      classes: classes, cls: { id: cls.id, name: cls.name }, today: ctx.today,
      goal: act ? goalView(db, ctx, act, { teacher: true }) : null,
      history: list.filter(function (g) { return g !== act; }).slice(0, 10).map(function (g) { return goalView(db, ctx, g); })
    };
  };
  A['t.goal.save'] = function (db, ctx, p) {
    var title = str(p.title, 100), target = Math.round(num(p.target)), until = str(p.until);
    if (!title) fail('Напишите, какой приз получит класс.');
    if (target < 10 || target > 100000) fail('Сколько баллов нужно собрать: от 10 до 100 000.');
    if (until && (!isDate(until) || until < ctx.today)) fail('Срок должен быть не раньше сегодняшнего дня.');
    if (p.id) {
      var g = byId(db, 'goals', p.id);
      if (!g || g.status !== 'active') fail('Эту цель уже нельзя изменить.');
      db.update('goals', g, { title: title, target: target, until: until });
      return { id: g.id };
    }
    var cls = byId(db, 'classes', p.classId);
    if (!cls) fail('Класс не найден.');
    if (db.all('goals').some(function (x) { return same(x.class_id, cls.id) && x.status === 'active'; })) {
      fail('У класса уже есть цель. Закройте её или измените.');
    }
    return { id: db.insert('goals', { id: uid('g'), class_id: cls.id, title: title, target: target, from: ctx.today, until: until,
      status: 'active', done_at: '' }).id };
  };
  A['t.goal.close'] = function (db, ctx, p) {
    var g = byId(db, 'goals', p.id);
    if (!g || g.status !== 'active') fail('Цель уже закрыта.');
    db.update('goals', g, { status: 'closed' });
    return { ok: true };
  };

  // ─── Игровой профиль ученика (уровень, значки, цель класса) ───
  function gameOn(ctx) { return truthy(ctx.settings.game_enabled); }
  function pupilGame(db, ctx, st, earned) {
    if (!gameOn(ctx)) return null;
    var g = st.class_id ? currentGoal(db, ctx, st.class_id) : null;
    return { level: levelOf(earned), badges: badgesOf(db, st.id, ctx.today, { warn: true }), look: lookOf(st, ownedItems(db, st.id)),
      goal: g ? goalView(db, ctx, g, { sid: st.id }) : null };
  }
  // Профиль одноклассника: только имя, уровень и хорошие значки (без баллов, оценок и замечаний).
  A['s.classmate'] = function (db, ctx, p) {
    var me = activeStudent(db, ctx.studentId), st = activeStudent(db, p.id);
    if (!st || !same(st.class_id, me.class_id)) fail('Ученик не найден.');
    if (!gameOn(ctx)) fail('Профили одноклассников выключены.');
    var stats = statsFor(db, [st.id], '')[st.id], earned = earnedMap(db, '')[st.id] || 0;
    var auto = achievements(stats, earned, monthExtra(db, st.id, ctx.today)).filter(function (a) { return a.done; })
      .map(function (a) { return { title: a.title, icon: a.icon, kind: 'good' }; });
    var lvl = levelOf(earned);
    return { name: st.name, me: same(st.id, me.id), level: { level: lvl.level, name: lvl.name }, look: lookOf(st, ownedItems(db, st.id)),
      badges: badgesOf(db, st.id, ctx.today).map(function (b) { return { title: b.title, icon: b.icon, kind: 'good', note: b.note }; }).concat(auto) };
  };

  // ─── Ученик: «Мой образ» — украшения покупаются сразу за те же баллы, что и награды ───
  A['s.shop'] = function (db, ctx) {
    if (!gameOn(ctx)) fail('Украшения выключены учителем.');
    var st = activeStudent(db, ctx.studentId), owned = ownedItems(db, st.id), look = lookOf(st, owned);
    var bal = balanceMap(db)[st.id] || 0, pend = pendingMap(db)[st.id] || 0, lvl = levelOf(earnedMap(db, '')[st.id] || 0);
    var items = SHOP.filter(function (x) { return owned[x[0]] || inSeason(x, ctx.today); }).map(function (x) {
      return { id: x[0], type: x[1], name: x[2], price: priceOf(x, ctx.settings), level: x[4], rarity: x[5] || '',
        season: x[6] ? x[6].split('-')[1] : '', owned: !!owned[x[0]], worn: look[x[1]] === x[0], locked: !owned[x[0]] && lvl.level < x[4] };
    });
    return { name: st.name, look: look, items: items, balance: bal, available: bal - pend, level: lvl };
  };
  A['s.shop.buy'] = function (db, ctx, p) {
    if (!gameOn(ctx)) fail('Украшения выключены учителем.');
    var st = activeStudent(db, ctx.studentId), it = SHOP_BY_ID[p.item], owned = ownedItems(db, st.id);
    if (!it || (!inSeason(it, ctx.today) && !owned[it[0]])) fail('Этого украшения сейчас нет.');
    if (owned[it[0]]) fail('Это уже ваше — просто наденьте.');
    var lvl = levelOf(earnedMap(db, '')[st.id] || 0);
    if (lvl.level < it[4]) fail('Откроется на ' + it[4] + ' уровне.');
    var price = priceOf(it, ctx.settings), available = (balanceMap(db)[st.id] || 0) - (pendingMap(db)[st.id] || 0);
    if (available < price) fail('Не хватает баллов: нужно ' + price + ', доступно ' + available + '.');
    var row = db.insert('shop', { id: uid('s'), student_id: st.id, item: it[0], cost: price, at: ctx.nowStr });
    if (price) db.insert('ledger', { id: uid('p'), student_id: st.id, at: ctx.nowStr, amount: -price, type: 'shop', reason: 'Украшение: ' + it[2], ref: 'shop:' + row.id });
    owned[it[0]] = 1;
    var look = lookOf(st, owned);
    look[it[1]] = it[0];
    saveLook(db, st, look);
    refreshBalances(db, [st.id]);
    return { ok: true };
  };
  function saveLook(db, st, look) {
    var out = {};
    LOOK_SLOTS.forEach(function (s) { if (look[s]) out[s] = look[s]; });
    db.update('students', st, { look: JSON.stringify(out) });
  }
  // Надеть / снять. p.slot + p.item ('' — снять; персонажа и цвет снять нельзя).
  A['s.look.save'] = function (db, ctx, p) {
    if (!gameOn(ctx)) fail('Украшения выключены учителем.');
    var st = activeStudent(db, ctx.studentId), owned = ownedItems(db, st.id), look = lookOf(st, owned);
    if (LOOK_SLOTS.indexOf(p.slot) < 0) fail('Неизвестный вид украшения.');
    if (!p.item) { if (p.slot === 'char' || p.slot === 'color') fail('Это снять нельзя — выберите другое.'); look[p.slot] = ''; }
    else {
      var it = SHOP_BY_ID[p.item];
      if (!it || it[1] !== p.slot) fail('Неизвестное украшение.');
      if (!owned[it[0]]) fail('Сначала купите это украшение.');
      look[p.slot] = it[0];
    }
    saveLook(db, st, look);
    return { look: lookOf(st, owned) };
  };

  // ─── Статистика: посещаемость и оценки за месяц ───
  // Учителю — сетка «ученики × уроки» по классу (только его предметы, можно выбрать любой предмет).
  // Ученику и родителю — только своя строка (чужие отметки не видны).
  function monthOf(p, ctx) { return /^\d{4}-\d{2}$/.test(str(p.month)) ? str(p.month) : ctx.today.slice(0, 7); }
  function monthDays(month) { var d = parseDate(month + '-01'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function shiftMonth(month, n) { var d = parseDate(month + '-01'); d.setMonth(d.getMonth() + n); return fmtDate(d).slice(0, 7); }
  function monthLessons(db, classId, month) {
    return lessonsInRange(db, month + '-01', monthDays(month), [classId]).filter(function (l) { return l.status !== 'cancelled'; });
  }
  function markIndex(db, lessons) {
    var ids = {}, m = {};
    lessons.forEach(function (l) { if (l.id.indexOf('v~') !== 0) ids[l.id] = 1; });
    db.all('marks').forEach(function (k) { if (ids[k.lesson_id]) m[k.lesson_id + '|' + k.student_id] = k; });
    return m;
  }
  function emptyCounts() { return { present: 0, late: 0, excused: 0, absent: 0, grades: { 5: 0, 4: 0, 3: 0, 2: 0 }, gradeSum: 0, gradeN: 0 }; }
  function addCell(c, mk) {
    if (!mk) return;
    if (c[mk.attendance] !== undefined) c[mk.attendance]++;
    var g = num(mk.grade);
    if (g >= 2 && g <= 5) { c.grades[g]++; c.gradeSum += g; c.gradeN++; }
  }
  function finishCounts(c) {
    var att = c.present + c.late + c.absent;
    c.pct = att ? Math.round((c.present + c.late) / att * 100) : null;
    c.avg = c.gradeN ? Math.round(c.gradeSum / c.gradeN * 10) / 10 : null;
    delete c.gradeSum;
    return c;
  }
  function cellOf(mk, l, today) {
    if (!mk) return { a: '', g: 0, h: '', future: l.date > today };
    return { a: mk.attendance || '', g: num(mk.grade), h: mk.homework || '', future: false };
  }
  function lessonHead(l) { return { id: l.id, date: l.date, start: l.start, subject: l.subject }; }
  A['t.stats'] = function (db, ctx, p) {
    var classes = classList(db), cls = byId(db, 'classes', p.classId) || (classes[0] && byId(db, 'classes', classes[0].id));
    if (!cls) return { classes: classes, cls: null };
    var month = monthOf(p, ctx), all = monthLessons(db, cls.id, month);
    var subjects = [];
    all.forEach(function (l) { if (subjects.indexOf(l.subject) < 0) subjects.push(l.subject); });
    var subject = str(p.subject);
    var lessons = all.filter(function (l) {
      return subject === '*' ? true : subject ? normText(l.subject) === normText(subject) : subjectChecked(ctx.settings, l.subject);
    });
    var idx = markIndex(db, lessons), total = emptyCounts();
    var rows = studentsOfClass(db, cls.id).map(function (s) {
      var c = emptyCounts();
      var cells = lessons.map(function (l) { var mk = idx[l.id + '|' + s.id]; addCell(c, mk); addCell(total, mk); return cellOf(mk, l, ctx.today); });
      return { id: s.id, name: s.name, cells: cells, sum: finishCounts(c) };
    });
    rows.sort(function (a, b) { return (b.sum.pct === null ? -1 : b.sum.pct) - (a.sum.pct === null ? -1 : a.sum.pct) || (b.sum.avg || 0) - (a.sum.avg || 0) || (a.name < b.name ? -1 : 1); });
    return { classes: classes, cls: { id: cls.id, name: cls.name }, month: month, prev: shiftMonth(month, -1),
      next: month < ctx.today.slice(0, 7) ? shiftMonth(month, 1) : '', today: ctx.today,
      subjects: subjects, subject: subject, mine: checkSubjects(ctx.settings),
      lessons: lessons.map(lessonHead), rows: rows, total: finishCounts(total) };
  };
  function pupilStats(db, ctx, st, month, show) {
    var lessons = st.class_id ? monthLessons(db, st.class_id, month) : [];
    var idx = markIndex(db, lessons), c = emptyCounts(), bySubj = {};
    var cells = lessons.map(function (l) {
      var mk = idx[l.id + '|' + st.id];
      addCell(c, mk);
      if (mk && num(mk.grade) >= 2) { var b = bySubj[l.subject] = bySubj[l.subject] || { subject: l.subject, sum: 0, n: 0 }; b.sum += num(mk.grade); b.n++; }
      var cell = cellOf(mk, l, ctx.today);
      if (!show.attendance) cell.a = '';
      if (!show.homework) { cell.g = 0; cell.h = ''; }
      return cell;
    });
    var stats = statsFor(db, [st.id], '')[st.id];
    var sum = finishCounts(c);
    if (!show.homework) { sum.grades = null; sum.avg = null; }
    return { month: month, prev: shiftMonth(month, -1), next: month < ctx.today.slice(0, 7) ? shiftMonth(month, 1) : '', today: ctx.today,
      name: st.name, lessons: lessons.map(lessonHead), cells: cells, sum: sum, show: show,
      streak: show.attendance ? stats.attStreak : null,
      subjects: show.homework ? Object.keys(bySubj).map(function (k) { var b = bySubj[k]; return { subject: k, avg: Math.round(b.sum / b.n * 10) / 10, n: b.n }; })
        .sort(function (a, b) { return a.subject < b.subject ? -1 : 1; }) : [] };
  }
  A['s.stats'] = function (db, ctx, p) {
    return pupilStats(db, ctx, activeStudent(db, ctx.studentId), monthOf(p, ctx), { attendance: true, homework: true });
  };
  A['p.stats'] = function (db, ctx, p) {
    var kids = ctx.childIds.map(function (id) { return activeStudent(db, id); }).filter(Boolean);
    if (!kids.length) fail('Ребёнок не найден.');
    var st = kids.find(function (k) { return same(k.id, p.studentId); }) || kids[0], s = ctx.settings;
    var out = pupilStats(db, ctx, st, monthOf(p, ctx), { attendance: truthy(s.parent_show_attendance), homework: truthy(s.parent_show_homework) });
    out.children = kids.map(function (k) { return { id: k.id, name: k.name }; });
    out.childId = st.id;
    return out;
  };

  // ─── Ученик ───
  function lastHomework(db, classId, today) {
    var withHw = sortBy(db.all('lessons').filter(function (l) {
      return same(l.class_id, classId) && l.date <= today && str(l.homework) && l.status !== 'cancelled';
    }), function (l) { return l.date + ' ' + l.start; });
    var l = withHw[withHw.length - 1];
    return l ? { date: l.date, subject: l.subject, text: l.homework } : null;
  }
  function pupilSummary(db, ctx, st) {
    var stats = statsFor(db, [st.id], '')[st.id];
    var earned = earnedMap(db, '')[st.id] || 0, r = rulesOf(ctx.settings);
    return {
      balance: balanceMap(db)[st.id] || 0, pending: pendingMap(db)[st.id] || 0, earned: earned, stats: stats,
      streak: { current: stats.hwStreak, length: r.streakLength, bonus: r.streakBonus,
        toBonus: r.streakLength > 0 ? r.streakLength - (stats.hwStreak % r.streakLength) : 0 },
      achievements: achievements(stats, earned, monthExtra(db, st.id, ctx.today)),
      game: pupilGame(db, ctx, st, earned)
    };
  }
  function myLedger(db, sid, limit) {
    return sortBy(db.all('ledger').filter(function (l) { return same(l.student_id, sid); }), function (l) { return l.at; })
      .reverse().slice(0, limit).map(function (l) { return { at: l.at, amount: num(l.amount), type: l.type, reason: l.reason }; });
  }
  A['s.home'] = function (db, ctx) {
    var st = activeStudent(db, ctx.studentId), cls = byId(db, 'classes', st.class_id);
    var out = pupilSummary(db, ctx, st);
    out.student = { id: st.id, name: st.name, class_name: cls ? cls.name : '' };
    out.today = ctx.today;
    out.upcoming = cls ? lessonsInRange(db, ctx.today, 14, [cls.id]).map(forPupil) : [];
    out.homework = cls ? lastHomework(db, cls.id, ctx.today) : null;
    out.ledger = myLedger(db, st.id, 5);
    out.top = cls && truthy(cls.top_enabled) ? publicTop(computeTop(db, ctx, cls), st.id) : null;
    return out;
  };
  A['s.week'] = function (db, ctx, p) {
    var st = activeStudent(db, ctx.studentId);
    var from = mondayOf(isDate(p.from) ? p.from : ctx.today);
    return { from: from, today: ctx.today,
      lessons: st.class_id ? lessonsInRange(db, from, 7, [st.class_id]).map(forPupil) : [] };
  };
  A['s.lesson'] = function (db, ctx, p) {
    var st = activeStudent(db, ctx.studentId), r = resolveLesson(db, p.id);
    if (!same(r.view.class_id, st.class_id)) fail('Этот урок не из вашего класса.');
    var m = r.row ? marksOfLesson(db, r.row.id)[st.id] : null;
    var cls = byId(db, 'classes', st.class_id);
    var v = forPupil(r.view);
    v.class_name = cls ? cls.name : '';
    return { lesson: v, today: ctx.today,
      mark: m ? { attendance: m.attendance, homework: m.homework, activity: num(m.activity), grade: num(m.grade) } : null };
  };
  A['s.history'] = function (db, ctx) {
    return { ledger: myLedger(db, ctx.studentId, 500), balance: balanceMap(db)[ctx.studentId] || 0 };
  };
  A['s.rewards'] = function (db, ctx) {
    var sid = ctx.studentId, bal = balanceMap(db)[sid] || 0, pend = pendingMap(db)[sid] || 0;
    return {
      balance: bal, pending: pend, available: bal - pend,
      rewards: sortBy(db.all('rewards').filter(function (r) { return truthy(r.active); }), function (r) { return num(r.cost); })
        .map(function (r) { return { id: r.id, title: r.title, description: r.description, cost: num(r.cost),
          soldOut: str(r.stock) !== '' && num(r.stock) <= 0 }; }),
      requests: sortBy(db.all('requests').filter(function (r) { return same(r.student_id, sid); }), function (r) { return r.created_at; })
        .reverse().slice(0, 30).map(function (r) { return { id: r.id, reward_title: r.reward_title, cost: num(r.cost),
          status: r.status, created_at: r.created_at, comment: r.comment }; })
    };
  };
  A['s.request'] = function (db, ctx, p) {
    var sid = ctx.studentId, r = byId(db, 'rewards', p.rewardId);
    if (!r || !truthy(r.active)) fail('Награда недоступна.');
    if (str(r.stock) !== '' && num(r.stock) <= 0) fail('Эта награда закончилась.');
    var available = (balanceMap(db)[sid] || 0) - (pendingMap(db)[sid] || 0);
    if (available < num(r.cost)) fail('Не хватает баллов: нужно ' + num(r.cost) + ', доступно ' + available + '.');
    var open = db.all('requests').filter(function (q) { return same(q.student_id, sid) && q.status === 'pending'; });
    if (open.length >= 3) fail('У вас уже 3 заявки ждут решения учителя. Дождитесь ответа.');
    db.insert('requests', { id: uid('q'), student_id: sid, reward_id: r.id, reward_title: r.title, cost: num(r.cost),
      status: 'pending', created_at: ctx.nowStr, decided_at: '', comment: '' });
    return { ok: true };
  };
  A['s.request.cancel'] = function (db, ctx, p) {
    var q = byId(db, 'requests', p.id);
    if (!q || !same(q.student_id, ctx.studentId) || q.status !== 'pending') fail('Заявку нельзя отменить.');
    db.update('requests', q, { status: 'cancelled', decided_at: ctx.nowStr });
    return { ok: true };
  };

  // ─── Родитель ───
  A['p.home'] = function (db, ctx, p) {
    var kids = ctx.childIds.map(function (id) { return activeStudent(db, id); }).filter(Boolean);
    if (!kids.length) fail('Ребёнок не найден. Попросите у учителя новую ссылку.');
    var st = kids.find(function (k) { return same(k.id, p.studentId); }) || kids[0];
    var cls = byId(db, 'classes', st.class_id), s = ctx.settings;
    var show = {
      attendance: truthy(s.parent_show_attendance), homework: truthy(s.parent_show_homework),
      points: truthy(s.parent_show_points), materials: truthy(s.parent_show_materials), notes: truthy(st.note_parent)
    };
    var sum = pupilSummary(db, ctx, st);
    var lessons = cls ? lessonsInRange(db, addDays(ctx.today, -28), 36, [cls.id]) : [];
    var marks = {};
    db.all('marks').forEach(function (m) { if (same(m.student_id, st.id)) marks[m.lesson_id] = m; });
    var items = lessons.map(function (l) {
      var m = marks[l.id], v = { id: l.id, date: l.date, start: l.start, end: l.end, subject: l.subject, status: l.status };
      if (show.materials) { v.topic = l.topic; v.homework = l.homework; v.material_url = l.material_url; v.material_name = l.material_name; }
      if (m && show.attendance) v.attendance = m.attendance;
      if (m && show.homework) { v.hw = m.homework; v.grade = num(m.grade); }
      if (m && show.points) v.activity = num(m.activity);
      return v;
    });
    return {
      today: ctx.today, show: show,
      children: kids.map(function (k) { var c = byId(db, 'classes', k.class_id); return { id: k.id, name: k.name, class_name: c ? c.name : '' }; }),
      child: { id: st.id, name: st.name, class_name: cls ? cls.name : '' },
      stats: { attendancePct: show.attendance ? sum.stats.attendancePct : null, homeworkPct: show.homework ? sum.stats.homeworkPct : null,
        present: sum.stats.present + sum.stats.late, absent: sum.stats.absent, hwDone: sum.stats.hwDone },
      points: show.points ? { balance: sum.balance, earned: sum.earned, streak: sum.streak, achievements: sum.achievements, game: sum.game,
        ledger: myLedger(db, st.id, 40) } : null,
      notes: show.notes ? { good: st.note_good, weak: st.note_weak, repeat: st.note_repeat, updated: st.note_updated } : null,
      homework: show.materials && cls ? lastHomework(db, cls.id, ctx.today) : null,
      past: items.filter(function (l) { return l.date < ctx.today || (l.date === ctx.today && l.status === 'done'); }).reverse(),
      upcoming: items.filter(function (l) { return l.date >= ctx.today && l.status !== 'done'; }).slice(0, 10)
    };
  };

  // ═════════════════════════ Главная точка входа ═════════════════════════
  // req = { action: 'имя.действия', params: {...} }
  // ctx = { user: {id, first_name, ...} из Telegram, now: Date, startParam, drive (только на сервере) }
  function handle(db, req, ctx) {
    var action = str(req && req.action), p = (req && req.params) || {};
    if (ctx.extKey !== undefined) {
      var ek = str(ctx.extKey);
      var owner = ek.length >= 20 && db.all('users').find(function (u) { return u.role === 'teacher' && str(u.ext_key) === ek; });
      if (!owner) fail('Ключ расширения не подходит. Возьмите его в приложении, открытом через Telegram (не в демо-режиме): Настройки → Расширение для Chrome.');
      if (!EXT_ACTIONS[action]) fail('Расширению это действие недоступно.');
      ctx.user = { id: owner.tg_id, first_name: owner.name };
    }
    if (!ctx.user || !ctx.user.id) fail('Не удалось определить пользователя Telegram.');
    ctx.now = ctx.now || new Date();
    ctx.nowStr = fmtDateTime(ctx.now);
    ctx.today = fmtDate(ctx.now);
    ctx.settings = getSettings(db);
    if (action === 'bootstrap') return bootstrap(db, ctx);
    if (action === 'redeem') return redeem(db, ctx, p.code);
    var need = { t: 'teacher', s: 'student', p: 'parent' }[action.split('.')[0]];
    if (!need || !A[action]) fail('Неизвестное действие: ' + action);
    var info = rolesOf(db, ctx.user.id);
    if (info.roles.indexOf(need) < 0) fail('Нет доступа к этому разделу.');
    if (need === 'student') {
      ctx.studentId = info.rows.find(function (r) { return r.role === 'student' && activeStudent(db, r.student_id); }).student_id;
    }
    if (need === 'parent') {
      ctx.childIds = info.rows.filter(function (r) { return r.role === 'parent'; }).map(function (r) { return String(r.student_id); });
    }
    var res;
    if (!JOURNALED[action]) res = A[action](db, ctx, p);
    else {
      var rec = new Recorder(db), bal0 = balanceMap(db);
      res = A[action](rec, ctx, p);
      writeJournal(db, ctx, action, p, res, rec, bal0);
    }
    if (need === 'teacher' && !READ_ACTIONS[action]) checkGoals(db, ctx);
    return res;
  }
  function isReadOnly(action) { return !!READ_ACTIONS[action]; }
  // Что можно делать с ключом расширения Chrome (перенос из emaktab)
  var EXT_ACTIONS = { 't.ext.info': 1, 't.import.templates': 1, 't.import.topics': 1, 't.import.multi': 1 };

  /**
   * Текст утреннего напоминания учителю: какие ДЗ проверить сегодня, какие проверки отменены,
   * что осталось непроверенным с прошлых дней. Возвращает null, если писать не о чем.
   */
  function reminder(db, now) {
    var settings = getSettings(db), today = fmtDate(now || new Date());
    if (!truthy(settings.remind_enabled)) return null;
    var list = decorateChecks(db, settings, lessonsInRange(db, addDays(today, -7), 8, null));
    var line = function (l) { return '• ' + l.start + ' ' + l.class_name + ', ' + l.subject; };
    var todayDue = list.filter(function (l) { return l.date === today && l.check === 'due'; });
    var todayOff = list.filter(function (l) { return l.date === today && l.check === 'off'; });
    var missed = list.filter(function (l) { return l.date < today && l.check === 'due'; });
    if (!todayDue.length && !todayOff.length && !missed.length) return null;
    var parts = [];
    if (todayDue.length) parts.push('Сегодня проверить ДЗ:\n' + todayDue.map(line).join('\n'));
    if (todayOff.length) parts.push('Проверка отменена:\n' + todayOff.map(line).join('\n'));
    if (missed.length) parts.push('Не проверено с прошлых дней: ' + missed.length);
    return {
      chats: db.all('users').filter(function (u) { return u.role === 'teacher'; }).map(function (u) { return String(u.tg_id); }),
      text: parts.join('\n\n'),
      link: inviteLink(settings, 'check').replace('?startapp=check', '')
    };
  }

  // ─── Хранилище в памяти (для демо-режима и тестов) ───
  function MemoryDB(data) {
    var self = this;
    self.data = data || {};
    Object.keys(SCHEMA).forEach(function (t) { if (!self.data[t]) self.data[t] = []; });
  }
  MemoryDB.prototype.all = function (t) { return this.data[t]; };
  MemoryDB.prototype.insert = function (t, obj) {
    var row = {};
    SCHEMA[t].cols.forEach(function (c) { row[c[0]] = obj[c[0]] !== undefined ? obj[c[0]] : ''; });
    this.data[t].push(row);
    return row;
  };
  MemoryDB.prototype.update = function (t, row, patch) {
    Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
    return row;
  };
  MemoryDB.prototype.remove = function (t, row) {
    var i = this.data[t].indexOf(row);
    if (i >= 0) this.data[t].splice(i, 1);
  };

  return {
    VERSION: VERSION, SCHEMA: SCHEMA, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    handle: handle, isReadOnly: isReadOnly, teacherChats: teacherChats, createInvite: createInvite, inviteLink: inviteLink, appShortName: appShortName, reminder: reminder,
    getSettings: getSettings, setSetting: setSetting, MemoryDB: MemoryDB,
    util: { fmtDate: fmtDate, fmtDateTime: fmtDateTime, addDays: addDays, mondayOf: mondayOf, weekday: weekday,
      parseDate: parseDate, uid: uid, truthy: truthy, num: num }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
