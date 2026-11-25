/**
 * importer.js — разбор таблицы, скопированной из emaktab (или Excel, Word, Google Таблиц).
 *
 * Когда в браузере выделяют таблицу и нажимают Ctrl+C, в буфер попадает текст:
 * строки таблицы — с новой строки, ячейки — через знак табуляции. Этот файл:
 *   1) превращает такой текст в строки и ячейки;
 *   2) угадывает, какой столбец что означает (по заголовкам на русском/узбекском и по содержимому);
 *   3) понимает даты («25.11.2026», «25.11», «25 ноября», «25-noyabr»), время («08:30–09:15»,
 *      «8.30-9.15» или номер урока), дни недели (Пн, Dushanba, Душанба…);
 *   4) собирает из этого учеников, расписание или темы уроков.
 * Учитель всегда видит результат и может поправить назначение столбцов.
 */
var Importer = (function () {
  'use strict';

  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function low(s) { return clean(s).toLowerCase().replace(/ё/g, 'е').replace(/[ʻʼ‘’`]/g, "'"); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // Ссылки в виде [текст](адрес) — оставляем только текст
  function stripMd(s) { return String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); }
  // Внутри ячейки строки разделены знаком «¶» (так мы сохраняем многострочные ячейки)
  function flat(s) { return clean(String(s || '').replace(/\s*¶\s*/g, ' ')); }
  var CELL_SEP = ' ¶ ';

  // ─── 0. Таблица прямо из буфера обмена ───
  // При копировании со страницы браузер кладёт в буфер не только текст, но и HTML с настоящей таблицей.
  // Из него точно видно, где кончается одна ячейка и начинается другая (в тексте это теряется).
  var BLOCK = { BR: 1, DIV: 1, P: 1, LI: 1, TR: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, TABLE: 1, UL: 1, OL: 1, SECTION: 1 };
  function cellText(node) {
    var out = [];
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName, block = BLOCK[tag];
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (block) out.push('\n');
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (tag === 'TD' || tag === 'TH') out.push('\n');
      if (block) out.push('\n');
    })(node);
    return out.join('').split('\n').map(clean).filter(Boolean).join(CELL_SEP);
  }
  function htmlToTsv(html) {
    if (typeof DOMParser === 'undefined' || !/<table/i.test(html || '')) return '';
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tables = Array.prototype.filter.call(doc.querySelectorAll('table'), function (t) { return !t.parentElement.closest('table'); });
    if (!tables.length) return '';
    var best = tables.reduce(function (a, b) { return (b.textContent.length > a.textContent.length) ? b : a; });
    return Array.prototype.map.call(best.rows, function (tr) {
      return Array.prototype.map.call(tr.cells, function (td) {
        var t = cellText(td), span = td.colSpan > 1 ? td.colSpan : 1, cells = [t];
        for (var i = 1; i < span; i++) cells.push('');
        return cells.join('\t');
      }).join('\t');
    }).join('\n');
  }

  // ─── 1. Текст → таблица ───
  function parseTable(text) {
    var lines = stripMd(String(text || '')).replace(/\r/g, '').split('\n');
    var tab = lines.some(function (l) { return l.indexOf('\t') >= 0; });
    var semi = !tab && lines.filter(function (l) { return l.indexOf(';') >= 0; }).length > lines.length / 2;
    var rows = lines.map(function (l) { return (tab ? l.split('\t') : semi ? l.split(';') : [l]).map(clean); })
      .filter(function (r) { return r.some(Boolean); });
    // Страницу часто копируют целиком: сверху фильтры и надписи. Ищем строку заголовков таблицы
    // и отбрасываем всё, что выше неё.
    var h = -1;
    for (var i = 0; i < Math.min(40, rows.length) && h < 0; i++) {
      if (rows[i].length >= 2 && rows[i].filter(function (c) { return headerRole(c); }).length >= 2) h = i;
    }
    if (h > 0) rows = rows.slice(h);
    // строки без табуляции под таблицей — это надписи страницы («Показать ещё»), а не записи
    if (h >= 0 && tab) rows = rows.filter(function (r, i) { return i === 0 || r.length > 1; });
    // Ячейка с переносом строки (например, «26 декабря 2026 ⏎ 5 урок») разрывает запись на две строки.
    // Склеиваем, пока строка короче заголовка.
    if (h >= 0 && tab) {
      var W = rows[0].length, out = [rows[0]];
      for (i = 1; i < rows.length; i++) {
        var cur = rows[i].slice();
        while (cur.length < W && i + 1 < rows.length && cur.length + rows[i + 1].length - 1 <= W) {
          var nx = rows[++i];
          cur[cur.length - 1] = clean(cur[cur.length - 1] + ' ' + nx[0]);
          cur = cur.concat(nx.slice(1));
        }
        out.push(cur);
      }
      rows = out;
    }
    var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    rows.forEach(function (r) { while (r.length < width) r.push(''); });
    // убираем полностью пустые столбцы
    var keep = [];
    for (var c = 0; c < width; c++) if (rows.some(function (r) { return r[c]; })) keep.push(c);
    return rows.map(function (r) { return keep.map(function (c) { return r[c]; }); });
  }

  // ─── 2. Распознавание значений ───
  var WEEKDAYS = [
    [1, ['понедельник', 'пн', 'dushanba', 'du', 'душанба', 'monday', 'mon']],
    [2, ['вторник', 'вт', 'seshanba', 'se', 'сешанба', 'tuesday', 'tue']],
    [3, ['среда', 'ср', 'chorshanba', 'chor', 'чоршанба', 'wednesday', 'wed']],
    [4, ['четверг', 'чт', 'payshanba', 'pay', 'пайшанба', 'thursday', 'thu']],
    [5, ['пятница', 'пт', 'juma', 'ju', 'жума', 'friday', 'fri']],
    [6, ['суббота', 'сб', 'shanba', 'sha', 'шанба', 'saturday', 'sat']],
    [7, ['воскресенье', 'вс', 'yakshanba', 'yak', 'якшанба', 'sunday', 'sun']]
  ];
  function weekdayOf(s) {
    var w = low(s).replace(/[.,:;()]/g, ' ').trim().split(' ')[0];
    if (!w) return 0;
    for (var i = 0; i < WEEKDAYS.length; i++) if (WEEKDAYS[i][1].indexOf(w) >= 0) return WEEKDAYS[i][0];
    return 0;
  }

  var MONTHS = [['янв', 1], ['фев', 2], ['мар', 3], ['апр', 4], ['мая', 5], ['май', 5], ['июн', 6], ['июл', 7], ['авг', 8], ['сен', 9],
    ['окт', 10], ['ноя', 11], ['дек', 12], ['yan', 1], ['fev', 2], ['mar', 3], ['apr', 4], ['may', 5], ['iyun', 6], ['iyul', 7],
    ['avg', 8], ['sen', 9], ['okt', 10], ['noy', 11], ['dek', 12], ['jan', 1], ['feb', 2], ['jun', 6], ['jul', 7], ['aug', 8],
    ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12], ['ян', 1], ['фев', 2], ['ноя', 11], ['дек', 12]];
  // Год не указан → берём учебный год: сентябрь–декабрь — год начала, январь–август — следующий.
  function parseDate(s, today) {
    s = low(s);
    var y, mo, d, m;
    if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /(?:^|[^\d:])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:])/.exec(' ' + s))) { d = +m[1]; mo = +m[2]; y = m[3] ? +m[3] : 0; }
    else if ((m = /(\d{1,2})[\s-]+([a-zа-я']{3,})\.?(?:[\s,]+(\d{4}))?/.exec(s))) {
      d = +m[1];
      var word = m[2];
      var hit = MONTHS.find(function (x) { return word.indexOf(x[0]) === 0; });
      if (!hit) return '';
      mo = hit[1]; y = m[3] ? +m[3] : 0;
    } else return '';
    if (y && y < 100) y += 2000;
    if (!y) {
      var t = today ? today.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
      var startYear = t[1] >= 8 ? t[0] : t[0] - 1;
      y = mo >= 8 ? startYear : startYear + 1;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return '';
    return y + '-' + pad(mo) + '-' + pad(d);
  }

  function parseTimeRange(s, minutes) {
    s = clean(s);
    var m = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/.exec(s);
    if (m && +m[1] < 24 && +m[3] < 24) return { start: pad(+m[1]) + ':' + m[2], end: pad(+m[3]) + ':' + m[4] };
    m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m && +m[1] < 24) {
      var total = +m[1] * 60 + +m[2] + (minutes || 45);
      return { start: pad(+m[1]) + ':' + m[2], end: pad(Math.floor(total / 60) % 24) + ':' + pad(total % 60) };
    }
    return null;
  }
  function lessonNumber(s) {
    var m = /^(\d{1,2})\s*(?:[-.)]?\s*(?:урок|dars|soat|соат|дарс)?)?\.?$/i.exec(clean(s));
    return m ? +m[1] : 0;
  }
  // «Расписание звонков»: строки вида «1 08:30-09:15»
  function parseBells(text) {
    var map = {};
    String(text || '').split('\n').forEach(function (line) {
      var m = /^\s*(\d{1,2})\D+(.+)$/.exec(line), r = m && parseTimeRange(m[2]);
      if (r) map[+m[1]] = r;
    });
    return map;
  }
  var DEFAULT_BELLS = '1 08:30-09:15\n2 09:25-10:10\n3 10:20-11:05\n4 11:15-12:00\n5 12:10-12:55\n6 13:05-13:50\n7 14:00-14:45\n8 14:55-15:40';
  function timeOf(cell, bells) {
    var r = parseTimeRange(cell);
    if (r) return r;
    var n = lessonNumber(cell);
    return n && bells[n] ? bells[n] : null;
  }

  // ─── 3. Угадываем назначение столбцов ───
  var ROLE_NAMES = { name: 'Имя ученика', number: '№ / номер урока', date: 'Дата', topic: 'Тема', homework: 'Домашнее задание',
    subject: 'Предмет', time: 'Время', weekday: 'День недели', room: 'Кабинет', 'class': 'Класс' };
  var ROLES = { students: ['name', 'number'], schedule: ['weekday', 'time', 'number', 'subject', 'room', 'class'],
    topics: ['date', 'topic', 'homework', 'subject', 'time', 'number', 'class'] };
  var KEYS = [
    ['homework', ['домаш', 'дз', 'д/з', 'uy vazifa', 'уй вазифа', 'vazifa', 'вазифа', 'homework', 'задани']],
    ['topic', ['тема', 'mavzu', 'мавзу', 'topic']],
    ['name', ['фио', 'ф.и.о', 'ученик', 'учащ', 'имя', 'фамил', "o'quvchi", 'oquvchi', 'ўқувчи', 'f.i.sh', 'fish', 'ism', 'familiya', 'name']],
    ['date', ['дата', 'sana', 'сана', 'date']],
    ['subject', ['предмет', 'fan', 'фан', 'subject', 'дисциплин']],
    ['time', ['время', 'vaqt', 'вақт', 'time', 'soat', 'соат', 'звон']],
    ['weekday', ['день', 'hafta kuni', 'kun']],
    ['room', ['кабинет', 'каб', 'xona', 'хона', 'room']],
    ['class', ['кому выдано', 'кому', 'класс', 'sinf', 'kimga', 'синф', 'class']],
    ['skip', ['отчет', 'отчёт', 'статус', 'hisobot', 'holat', 'оценк', 'baho']],
    ['number', ['№', '#', 'номер', 'raqam', 'n', 'урок', 'dars']]
  ];
  function headerRole(cell) {
    var c = low(cell);
    if (!c || c.length > 40) return '';
    for (var i = 0; i < KEYS.length; i++) {
      var ok = KEYS[i][1].some(function (k) { return k.length <= 2 ? c === k || c.split(/[\s.,]/)[0] === k : c.indexOf(k) >= 0; });
      if (ok) return KEYS[i][0];
    }
    return '';
  }
  function ratio(rows, col, test) {
    var vals = rows.map(function (r) { return r[col]; }).filter(Boolean);
    if (!vals.length) return 0;
    return vals.filter(test).length / vals.length;
  }
  function avgLen(rows, col) {
    var vals = rows.map(function (r) { return r[col]; }).filter(Boolean);
    return vals.length ? vals.reduce(function (s, v) { return s + v.length; }, 0) / vals.length : 0;
  }

  /** Возвращает { header: номер строки заголовка или -1, mapping: [роль для каждого столбца] } */
  function guess(kind, rows, today) {
    var allowed = ROLES[kind], width = rows[0] ? rows[0].length : 0;
    var header = -1, best = 0;
    for (var r = 0; r < Math.min(3, rows.length); r++) {
      var score = rows[r].filter(function (c) { var x = headerRole(c); return x && allowed.indexOf(x) >= 0; }).length;
      var hasDates = rows[r].some(function (c) { return parseDate(c, today) || parseTimeRange(c); });
      if (score > best && !hasDates) { best = score; header = r; }
    }
    var mapping = [], locked = [];
    for (var c = 0; c < width; c++) {
      var role = header >= 0 ? headerRole(rows[header][c]) : '';
      locked.push(role === 'skip'); // «Отчет», «Статус» и т.п. — не трогаем
      mapping.push(allowed.indexOf(role) >= 0 && mapping.indexOf(role) < 0 ? role : '');
    }
    var body = rows.slice(header + 1, header + 31);
    var free = function (role) { return mapping.indexOf(role) < 0 && allowed.indexOf(role) >= 0; };
    // Если в столбце в основном даты — это дата, даже если заголовок «Урок»
    for (c = 0; c < width; c++) {
      if (!locked[c] && mapping[c] !== 'date' && free('date') && ratio(body, c, function (v) { return !!parseDate(v, today); }) >= 0.6) mapping[c] = 'date';
    }
    for (c = 0; c < width; c++) {
      if (mapping[c] || locked[c]) continue;
      if (free('time') && ratio(body, c, function (v) { return !!parseTimeRange(v); }) >= 0.6) mapping[c] = 'time';
      else if (free('date') && ratio(body, c, function (v) { return !!parseDate(v, today); }) >= 0.6) mapping[c] = 'date';
      else if (free('weekday') && ratio(body, c, function (v) { return !!weekdayOf(v); }) >= 0.6) mapping[c] = 'weekday';
      else if (free('number') && ratio(body, c, function (v) { return !!lessonNumber(v); }) >= 0.8) mapping[c] = 'number';
      else if (free('class') && ratio(body, c, function (v) { return !!classNameOf(v); }) >= 0.6) mapping[c] = 'class';
    }
    // Оставшиеся текстовые столбцы: самый «длинный» — имя/тема/предмет
    var text = [];
    var wordy = function (col) { return ratio(body, col, function (v) { return /[a-zа-яё]{3,}/i.test(v); }) >= 0.6; };
    for (c = 0; c < width; c++) if (!mapping[c] && !locked[c] && wordy(c)) text.push(c);
    text.sort(function (a, b) { return avgLen(body, b) - avgLen(body, a); });
    var main = { students: 'name', schedule: 'subject', topics: 'topic' }[kind];
    // На странице «Домашние задания» тем нет: если ДЗ уже найдено, короткие тексты темой не считаем
    if (free(main) && text.length && !(kind === 'topics' && !free('homework') && avgLen(body, text[0]) < 12)) mapping[text.shift()] = main;
    if (kind === 'topics' && free('homework') && text.length && avgLen(body, text[0]) > 6) mapping[text.shift()] = 'homework';
    return { header: header, mapping: mapping };
  }

  // Сетка расписания: в строке заголовка есть хотя бы два дня недели (дни — по столбцам)
  function detectGrid(rows) {
    for (var r = 0; r < Math.min(4, rows.length); r++) {
      var days = {};
      rows[r].forEach(function (cell, c) { var w = weekdayOf(cell); if (w) days[c] = w; });
      if (Object.keys(days).length >= 2) return { header: r, days: days };
    }
    return null;
  }

  // ─── Класс в ячейке («5-A sinf Matematika», «5А Математика») ───
  var LAT = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'j', 'з': 'z', 'и': 'i', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x' };
  function classKey(s) {
    return low(s).replace(/sinf|класс|кл\./g, '').replace(/[\s\-–"«»'()]/g, '').replace(/[а-я]/g, function (ch) { return LAT[ch] || ch; });
  }
  var CLASS_RE = /(^|\s)\d{1,2}\s*[-–]?\s*["«]?[a-zа-яё]["»]?(?=\s|$|sinf|класс)(\s*(sinf|класс))?/i;
  function cellHasClass(s) { return CLASS_RE.test(clean(s)); }
  function cellIsClass(s, className) {
    var m = CLASS_RE.exec(clean(s));
    return !!m && classKey(m[0]) === classKey(className);
  }
  function stripClass(s) { return clean(clean(s).replace(CLASS_RE, ' ')); }
  function splitRoom(s) {
    var m = /(?:кабинет|каб\.?|xona|хона)\s*№?\s*([\w-]+)/i.exec(s);
    return m ? { subject: clean(s.replace(m[0], '')).replace(/[,;]$/, ''), room: m[1] } : { subject: clean(s), room: '' };
  }

  /** Название класса: «6-A (1-gr)» → «6-A», «10 а» → «10-А». Пусто, если это не класс. */
  var CLASS_ONLY = /^\d{1,2}\s*[-–]?\s*[A-Za-zА-Яа-яЁё]{1,2}(\s*\([^)]*\))?$/;
  function classNameOf(s) {
    var m = /^(\d{1,2})\s*[-–]?\s*([A-Za-zА-Яа-яЁё]{1,2})(?![A-Za-zА-Яа-яЁё])/.exec(flat(s));
    return m && +m[1] >= 1 && +m[1] <= 11 ? m[1] + '-' + m[2].toUpperCase() : '';
  }

  /** Разбор ячейки расписания emaktab: «Литература ¶ UTANOVA R.D. ¶ 10:30 - 11:15 ¶ Нет кабинета» (уроков может быть несколько). */
  var ROOM_LINE = /^(нет кабинета|кабинет|каб\.?|xona|хона|xonasi yo.q)/i;
  function parseLessonCell(cell) {
    var parts = String(cell || '').split('¶').map(clean).filter(Boolean), out = [], last = -1;
    parts.forEach(function (p, i) {
      var t = parseTimeRange(p);
      if (!t || !/[-–—]/.test(p)) return;
      var subjIdx = i - 2 > last ? i - 2 : i - 1;
      var teacherLine = subjIdx === i - 2 ? parts[i - 1] : '';
      // В расписании учителя вместо учителя в ячейке указан класс («10-A», «3-F (2-gr)»)
      var cls = CLASS_ONLY.test(teacherLine) ? classNameOf(teacherLine) : '';
      if (cls) teacherLine = '';
      var subject = subjIdx > last ? parts[subjIdx] : '';
      var room = '', next = parts[i + 1] || '';
      if (ROOM_LINE.test(next)) { room = /^нет кабинета|yo.q/i.test(next) ? '' : clean(next.replace(/^(кабинет|каб\.?|xona|хона)\s*№?/i, '')); last = i + 1; }
      else last = i;
      if (subject) out.push({ subject: subject, teacher: /^нет учителя/i.test(teacherLine) ? '' : teacherLine, cls: cls, start: t.start, end: t.end, room: room });
    });
    return out;
  }

  /** Список классов со страницы «Мои классы»: «10-A», под ним «Журнал предмета: Литература, Русский язык». */
  var CLASS_LINE = /^(\d{1,2})\s*[-–]?\s*([A-Za-zА-Яа-яЁёʻ'’]{1,2})$/;
  function toClasses(text) {
    var lines = stripMd(String(text || '')).replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
    var out = [], cur = null;
    lines.forEach(function (l) {
      var m = CLASS_LINE.exec(l);
      if (m) { cur = { name: m[1] + '-' + m[2].toUpperCase(), subjects: [] }; if (!out.some(function (c) { return c.name === cur.name; })) out.push(cur); return; }
      var s = /^(журнал предмета|fan jurnali|фан журнали)\s*:\s*(.+)$/i.exec(l);
      if (s && cur) s[2].split(',').map(clean).filter(Boolean).forEach(function (x) { if (cur.subjects.indexOf(x) < 0) cur.subjects.push(x); });
    });
    return out;
  }

  /** Расписание вставлено простым текстом, и границы ячеек потерялись — дни недели определить нельзя. */
  function lostCells(text) {
    var lines = String(text || '').split('\n');
    var header = lines.some(function (l) { return l.split('\t').filter(function (c) { return weekdayOf(c); }).length >= 2; });
    var loose = lines.filter(function (l) { return l.indexOf('\t') < 0 && /\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}/.test(l); }).length;
    return header && loose >= 3;
  }

  /** Разложить строки по классам: [{ className, list: [...] }] (для импорта «сразу все классы») */
  function groupByClass(list) {
    var map = {}, out = [];
    list.forEach(function (x) {
      var k = x.className || '';
      if (!map[k]) { map[k] = { className: k, list: [] }; out.push(map[k]); }
      map[k].list.push(x);
    });
    return out;
  }

  // ─── 4. Сборка результата ───
  function colOf(mapping, role) { return mapping.indexOf(role); }

  function titleCase(s) {
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s-])(\S)/g, function (a, sp, ch) { return sp + ch.toUpperCase(); });
  }
  /**
   * Ученики. format: 'full' — как есть; 'first_last' — «Имя Фамилия» без отчества; 'short' — «Имя Ф.».
   * surnameFirst — в журнале сначала фамилия (обычно так).
   */
  function toStudents(rows, g, opts) {
    var col = colOf(g.mapping, 'name');
    if (col < 0) return { names: [], problems: ['Выберите столбец «Имя ученика»'] };
    return formatNames(rows.slice(g.header + 1).map(function (r) { return flat(r[col]); }), opts);
  }

  /**
   * Список учеников, который на странице не таблица, а перечень (как «Люди → Ученики» в emaktab):
   * сверху меню сайта, каждое имя может повторяться дважды, под ним возраст «16 лет», внизу подвал.
   */
  var NAME_RE = /^[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳʻʼ'’‘`-]+(?:\s+[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳʻʼ'’‘`-]+){1,4}$/;
  var STOP_RE = /^(чаты|о проекте|мобильное приложение|пользовательское соглашение|служба поддержки|loyiha haqida|chatlar|mobil ilova)/i;
  var TOTAL_RE = /(всего учеников|jami o.quvchilar|o.quvchilar soni|ўқувчилар сони)\s*:?\s*(\d+)/i;
  function studentsFromText(text, opts) {
    var lines = stripMd(String(text || '')).replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
    var start = 0, total = 0;
    lines.forEach(function (l, i) { var m = TOTAL_RE.exec(l); if (m && !total) { total = +m[2]; start = i + 1; } });
    var names = [];
    for (var i = start; i < lines.length; i++) {
      var l = lines[i].replace(/^\d+[.)]\s*/, '');
      if (STOP_RE.test(l)) break;
      if (/\d/.test(l) || !NAME_RE.test(l)) continue; // «16 лет», служебные надписи
      if (names.length && names[names.length - 1] === l) continue; // имя повторено дважды подряд
      names.push(l);
    }
    // без строки «Всего учеников» отбрасываем пункты меню сайта (короткие, одно-два слова с заглавной)
    if (!total) names = names.filter(function (n) { return n.split(' ').length >= 2 && !/^(моя|мои|домашние|журнал|служба|новости|помощь)/i.test(n); });
    var res = formatNames(names, opts);
    res.total = total;
    if (total && names.length !== total) res.problems.push('На странице указано учеников: ' + total + ', найдено: ' + names.length + '. Проверьте список.');
    return res;
  }

  function formatNames(fullNames, opts) {
    opts = opts || {};
    var parsed = fullNames.map(function (raw) {
      var full = titleCase(clean(raw).replace(/^\d+[.)]\s*/, ''));
      if (!full || /^\d+$/.test(full) || headerRole(full) === 'name') return null;
      var w = full.split(' ');
      var first = opts.surnameFirst === false ? w[0] : (w[1] || w[0]), last = opts.surnameFirst === false ? (w[1] || '') : (w[1] ? w[0] : '');
      return { full: full, first: first, last: last };
    }).filter(Boolean);
    var make = function (p, fmt) {
      if (fmt === 'full' || !p.last) return p.full;
      return fmt === 'short' ? p.first + ' ' + p.last.charAt(0) + '.' : p.first + ' ' + p.last;
    };
    var fmt = opts.format || 'first_last';
    var names = parsed.map(function (p) { return make(p, fmt); });
    if (fmt === 'short') { // одинаковые «Азиз К.» — для них оставляем полную фамилию
      var count = {};
      names.forEach(function (n) { count[n] = (count[n] || 0) + 1; });
      names = names.map(function (n, i) { return count[n] > 1 ? make(parsed[i], 'first_last') : n; });
    }
    return { names: names, problems: [] };
  }

  function toTemplates(rows, g, opts) {
    opts = opts || {};
    var bells = parseBells(opts.bells || DEFAULT_BELLS), out = [], problems = [];
    var grid = opts.grid;
    var filterClass = opts.className && opts.onlyClass;
    var pick = function (cell) {
      if (!cell || /^[-–—.]+$/.test(cell)) return null;
      if (filterClass && !cellIsClass(cell, opts.className)) return null;
      return splitRoom(stripClass(cell));
    };
    var teacher = low(opts.teacher || '');
    if (grid) {
      rows.slice(grid.header + 1).forEach(function (r, i) {
        var t = null;
        for (var c = 0; c < r.length && !t; c++) if (!grid.days[c]) t = timeOf(r[c], bells);
        Object.keys(grid.days).forEach(function (c) {
          if (!r[c]) return;
          // В ячейке emaktab может быть несколько уроков (подгруппы): предмет ¶ учитель ¶ время ¶ кабинет
          var lessons = parseLessonCell(r[c]);
          if (!lessons.length) {
            var raw = flat(r[c]);
            if (!raw || /^[-–—.]+$/.test(raw)) return;
            lessons = [{ subject: raw, room: '', teacher: '' }];
          }
          lessons.forEach(function (ls) {
            if (teacher && low(ls.teacher).indexOf(teacher) < 0) return; // только уроки этого учителя
            if (filterClass && !cellIsClass(ls.subject, opts.className)) return;
            var tt = ls.start ? ls : t;
            if (!tt) { problems.push('Строка ' + (grid.header + i + 2) + ': не понято время урока'); return; }
            var sr = splitRoom(stripClass(ls.subject));
            var row = { weekday: grid.days[c], start: tt.start, end: tt.end, subject: sr.subject, room: ls.room || sr.room, teacher: ls.teacher || '' };
            if (ls.cls) row.className = ls.cls;
            out.push(row);
          });
        });
      });
    } else {
      var m = g.mapping, cw = colOf(m, 'weekday'), ct = colOf(m, 'time'), cn = colOf(m, 'number'), cs = colOf(m, 'subject'), cr = colOf(m, 'room'), cc = colOf(m, 'class');
      if (cs < 0) return { rows: [], problems: ['Выберите столбец «Предмет»'] };
      var wd = 0;
      rows.slice(g.header + 1).forEach(function (r, i) {
        if (cw >= 0 && weekdayOf(r[cw])) wd = weekdayOf(r[cw]); // пустая ячейка дня = тот же день, что выше
        var s = pick(r[cs]);
        if (!s || !s.subject) return;
        var t = (ct >= 0 && timeOf(r[ct], bells)) || (cn >= 0 && timeOf(r[cn], bells)) || null;
        if (!wd || !t) { problems.push('Строка ' + (g.header + i + 2) + ': ' + (!wd ? 'не понят день недели' : 'не понято время')); return; }
        var row = { weekday: wd, start: t.start, end: t.end, subject: s.subject, room: cr >= 0 ? clean(r[cr]) : s.room };
        if (cc >= 0 && classNameOf(r[cc])) row.className = classNameOf(r[cc]);
        out.push(row);
      });
    }
    return { rows: out, problems: problems };
  }

  function toTopics(rows, g, opts) {
    opts = opts || {};
    var m = g.mapping, cd = colOf(m, 'date'), ct = colOf(m, 'topic'), ch = colOf(m, 'homework'), cs = colOf(m, 'subject'),
      ctm = colOf(m, 'time'), cn = colOf(m, 'number'), cc = colOf(m, 'class');
    if (ct < 0 && ch < 0) return { items: [], problems: ['Выберите столбец «Тема» или «Домашнее задание»'] };
    var bells = parseBells(opts.bells || DEFAULT_BELLS);
    var date = '', items = [], problems = [];
    rows.slice(g.header + 1).forEach(function (r, i) {
      if (cd >= 0 && r[cd]) {
        var d = parseDate(r[cd], opts.today);
        if (d) date = d; else problems.push('Строка ' + (g.header + i + 2) + ': не понята дата «' + r[cd] + '»');
      }
      var topic = ct >= 0 ? flat(r[ct]) : '', hw = ch >= 0 ? flat(r[ch]) : '';
      if (!topic && !hw) return;
      var t = ctm >= 0 ? parseTimeRange(r[ctm]) : null;
      // номер урока: отдельный столбец или «5 урок» внутри ячейки с датой
      var no = cn >= 0 ? lessonNumber(r[cn]) : 0;
      var mm = cd >= 0 && /(\d{1,2})\s*[-.]?\s*(?:урок|dars|дарс|soat)/i.exec(r[cd]);
      if (!no && mm) no = +mm[1];
      var bt = t || (no && bells[no]) || null;
      var item = { date: cd >= 0 ? date : '', topic: topic, homework: hw, subject: cs >= 0 ? flat(r[cs]) : '',
        start: t ? t.start : '', lessonNo: no, newStart: bt ? bt.start : '', newEnd: bt ? bt.end : '' };
      if (cc >= 0) item.className = classNameOf(r[cc]);
      items.push(item);
    });
    return { items: items, problems: problems, hasDates: cd >= 0 };
  }

  return {
    parseTable: parseTable, guess: guess, detectGrid: detectGrid, toStudents: toStudents, toTemplates: toTemplates, toTopics: toTopics,
    htmlToTsv: htmlToTsv, classNameOf: classNameOf, groupByClass: groupByClass, studentsFromText: studentsFromText, parseLessonCell: parseLessonCell, toClasses: toClasses, lostCells: lostCells,
    parseDate: parseDate, parseTimeRange: parseTimeRange, weekdayOf: weekdayOf, parseBells: parseBells, cellHasClass: cellHasClass,
    ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, DEFAULT_BELLS: DEFAULT_BELLS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Importer;
