/**
 * demo.js — демо-режим: вымышленная школа, чтобы посмотреть приложение без подключения к Google.
 *
 * Данные создаются через ту же логику (logic.js), что и на сервере, поэтому всё ведёт себя «по-настоящему».
 * Хранятся в браузере (localStorage) и пересоздаются каждый день, чтобы расписание было актуальным.
 */
var Demo = (function () {
  'use strict';
  var KEY = 'uchpom_demo_v1';
  var USERS = {
    teacher: { id: 900001, first_name: 'Анна', last_name: 'Сергеевна', username: 'anna_teacher' },
    student: { id: 900002, first_name: 'Миша', last_name: 'Котов', username: 'misha_k' },
    parent: { id: 900003, first_name: 'Ольга', last_name: 'Котова', username: 'olga_k' }
  };
  var role = localStorage.getItem(KEY + '_role') || 'teacher';
  var db = null, keep = false; // keep — учитель уже импортировал свои данные: демо больше не пересоздаём
  var U = Logic.util;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      // есть классы, которых нет в демо-примере, — значит, учитель уже добавил свои данные
      var own = raw && raw.data && (raw.data.classes || []).some(function (c) { return ['2А', '3Б'].indexOf(c.name) < 0; });
      if (raw && (raw.keep || own || (raw.seedDate === U.fmtDate(new Date()) && raw.v === Logic.VERSION))) {
        db = new Logic.MemoryDB(raw.data); keep = !!(raw.keep || own); return;
      }
    } catch (e) { /* создадим заново */ }
    seed();
    save();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ seedDate: U.fmtDate(new Date()), v: Logic.VERSION, keep: keep, data: db.data })); } catch (e) { /* нет места — не страшно */ }
  }

  function call(action, params) {
    if (!db) load();
    return new Promise(function (resolve, reject) {
      setTimeout(function () { // небольшая задержка, как у настоящего сервера
        try {
          var res = Logic.handle(db, { action: action, params: params }, { user: USERS[role], now: new Date() });
          if (action.indexOf('t.import.') === 0 && !params.dryRun) keep = true;
          save();
          resolve(JSON.parse(JSON.stringify(res)));
        } catch (e) { reject(e); }
      }, 90 + Math.random() * 110);
    });
  }

  // Предсказуемый генератор случайных чисел — демо каждый раз одинаковое
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var TOPICS = {
    'Математика': [['Сложение двузначных чисел', 'с. 34, № 3, 5'], ['Вычитание с переходом через десяток', 'с. 36, № 2, 4'],
      ['Задачи в два действия', 'с. 38, № 1, 6'], ['Таблица умножения на 7', 'выучить таблицу на 7; с. 40, № 2'],
      ['Деление на равные части', 'с. 42, № 3, 4'], ['Периметр прямоугольника', 'с. 44, № 1, 2, 5'],
      ['Порядок действий в выражениях', 'с. 46, № 4, 7'], ['Единицы длины: см, дм, м', 'с. 48, № 2, 3'],
      ['Устный счёт: закрепление', 'с. 50, № 1–3'], ['Умножение на 8', 'выучить таблицу на 8; с. 52, № 1']],
    'Русский язык': [['Безударные гласные в корне', 'упр. 112'], ['Парные согласные', 'упр. 118'],
      ['Разделительный мягкий знак', 'упр. 124'], ['Имя существительное', 'упр. 131'], ['Словарные слова', 'выучить 10 слов, упр. 136'],
      ['Предложение и текст', 'упр. 140'], ['Однокоренные слова', 'упр. 145']],
    'Литературное чтение': [['Н. Носов «Живая шляпа»', 'читать с. 52–56, пересказ'], ['С. Маршак, стихи', 'выучить стихотворение с. 60'],
      ['Русские народные сказки', 'читать с. 64–70'], ['В. Драгунский «Денискины рассказы»', 'читать с. 72–78, ответить на вопросы']],
    'Окружающий мир': [['Времена года', 'с. 30–33, вопросы'], ['Растения нашего края', 'с. 34–37, гербарий из 3 листьев'],
      ['Вода в природе', 'с. 38–41'], ['Правила дорожного движения', 'нарисовать схему пути до школы']]
  };
  var CHECKLISTS = {
    'Математика': 'Учебник и рабочая тетрадь\nЛинейка и карандаш\nПовторить таблицу умножения',
    'Русский язык': 'Учебник\nТетрадь для упражнений\nСловарик',
    'Литературное чтение': 'Книга для чтения\nПрочитать заданный текст',
    'Окружающий мир': 'Учебник\nЦветные карандаши'
  };

  function seed() {
    db = new Logic.MemoryDB();
    var rand = rng(20261125), now = new Date(), today = U.fmtDate(now), T = USERS.teacher;
    var t = function (action, p) { return Logic.handle(db, { action: action, params: p || {} }, { user: T, now: now }); };
    var stamp = U.fmtDateTime(now);

    db.insert('users', { tg_id: String(T.id), role: 'teacher', name: 'Анна Сергеевна', username: T.username, student_id: '', created_at: stamp });
    t('t.settings.save', { teacher_name: 'Анна Сергеевна', bot_username: 'school_helper_bot', app_short_name: 'app' });

    var c2 = t('t.classes.save', { name: '2А' }).id;
    var c3 = t('t.classes.save', { name: '3Б' }).id;
    var s2 = t('t.students.save', { classId: c2, names: ['Миша Котов', 'Алиса Белова', 'Тимур Ахмедов', 'Варя Соколова',
      'Даня Морозов', 'Соня Лебедева', 'Артём Николаев', 'Ева Кузнецова'].join('\n') }).ids;
    var s3 = t('t.students.save', { classId: c3, names: ['Лиза Котова', 'Матвей Орлов', 'Полина Зайцева', 'Глеб Васильев',
      'Ника Фёдорова', 'Илья Громов', 'Кира Павлова'].join('\n') }).ids;

    [[c2, 1, '08:30', '09:10', 'Математика'], [c2, 1, '09:20', '10:00', 'Русский язык'], [c2, 2, '08:30', '09:10', 'Литературное чтение'],
      [c2, 3, '08:30', '09:10', 'Математика'], [c2, 3, '09:20', '10:00', 'Русский язык'], [c2, 4, '09:20', '10:00', 'Окружающий мир'],
      [c2, 5, '08:30', '09:10', 'Математика'], [c2, 5, '09:20', '10:00', 'Русский язык'],
      [c3, 1, '10:20', '11:00', 'Математика'], [c3, 2, '09:20', '10:00', 'Русский язык'], [c3, 3, '10:20', '11:00', 'Окружающий мир'],
      [c3, 4, '08:30', '09:10', 'Математика'], [c3, 5, '10:20', '11:00', 'Литературное чтение'], [c3, 6, '09:00', '09:40', 'Математика']]
      .forEach(function (r) {
        var tid = t('t.template.save', { classId: r[0], weekday: r[1], start: r[2], end: r[3], subject: r[4] }).id;
        // Учитель проверяет ДЗ по русскому языку: во 2А — по понедельникам и средам, в 3Б — по вторникам
        if (r[4] === 'Русский язык' && (r[0] === c2 ? r[1] === 1 || r[1] === 3 : r[1] === 2)) t('t.check.slot', { id: tid, on: true, from: U.addDays(today, -28) });
      });
    t('t.settings.save', { check_subjects: ['Русский язык'], check_ask_grade: true, check_ask_uniform: false });
    t('t.rules.save', { grade5: 3, grade4: 2, grade3: 1, grade2: 0 });

    // «Характер» учеников: насколько стабильно делают ДЗ и проявляют активность
    var profile = {};
    s2.concat(s3).forEach(function (id, i) { profile[id] = { hw: 0.62 + rand() * 0.35, act: 0.15 + rand() * 0.5 }; if (i === 0) profile[id] = { hw: 0.97, act: 0.55 }; });

    // Прошедшие 3 недели: темы, ДЗ, конспекты, отметки
    var nowTime = UI.pad(now.getHours()) + ':' + UI.pad(now.getMinutes());
    var counters = {}, past = [];
    for (var w = -3; w <= 0; w++) {
      var from = U.addDays(U.mondayOf(today), w * 7);
      t('t.week', { from: from }).lessons.forEach(function (l) {
        if (l.date >= U.addDays(today, -21) && (l.date < today || (l.date === today && l.end <= nowTime))) past.push(l);
      });
    }
    past.forEach(function (l) {
      var key = l.class_id + l.subject, list = TOPICS[l.subject];
      var n = counters[key] = (counters[key] || 0) + 1;
      var topic = list[(n - 1) % list.length];
      var id = t('t.lesson.save', { id: l.id, topic: topic[0], homework: topic[1], checklist: CHECKLISTS[l.subject],
        material_url: rand() < 0.6 ? 'https://drive.google.com/drive/my-drive' : '',
        material_name: 'Конспект — ' + topic[0] + '.pdf' }).id;
      var students = l.class_id === c2 ? s2 : s3, isCheck = l.check === 'due' && l.date < today;
      t('t.marks.save', { lessonId: id, finish: true, check: isCheck ? 'done' : '', marks: students.map(function (sid) {
        var r = rand(), pr = profile[sid];
        var att = r < 0.04 ? 'absent' : r < 0.07 ? 'late' : r < 0.085 ? 'excused' : 'present';
        var here = att === 'present' || att === 'late', h = rand();
        var hw = n === 1 || !here ? '' : h < pr.hw ? 'done' : h < pr.hw + 0.12 ? 'partial' : 'none';
        var a = rand();
        var grade = isCheck && here ? (hw === 'done' ? (rand() < 0.6 ? 5 : 4) : hw === 'partial' ? 3 : 0) : 0;
        return { studentId: sid, attendance: att, homework: hw, activity: here ? (a < pr.act * 0.35 ? 2 : a < pr.act ? 1 : 0) : 0, grade: grade };
      }) });
    });

    // Темы и чек-листы на ближайшие уроки
    t('t.week', { from: today }).lessons.concat(t('t.week', { from: U.addDays(today, 7) }).lessons).forEach(function (l) {
      if (l.date < today || (l.date === today && l.end <= nowTime) || l.date > U.addDays(today, 6)) return;
      var key = l.class_id + l.subject, list = TOPICS[l.subject];
      var n = counters[key] = (counters[key] || 0) + 1, topic = list[(n - 1) % list.length];
      t('t.lesson.save', { id: l.id, topic: topic[0], checklist: CHECKLISTS[l.subject] });
    });

    // Если прямо сейчас нет урока — добавим «живой» урок, чтобы показать таймер и режим отметок
    var all = t('t.week', { from: today }).lessons.filter(function (l) { return l.date === today; });
    if (!UI.findNow(all).current && now.getHours() >= 1 && now.getHours() < 23) {
      var st = new Date(now.getTime() - 12 * 60000);
      st.setMinutes(st.getMinutes() - st.getMinutes() % 5);
      var en = new Date(st.getTime() + 45 * 60000);
      if (en.getDate() === st.getDate()) {
        t('t.lesson.create', { classId: c2, date: today, start: UI.pad(st.getHours()) + ':' + UI.pad(st.getMinutes()),
          end: UI.pad(en.getHours()) + ':' + UI.pad(en.getMinutes()), subject: 'Математика', topic: 'Задачи на смекалку' });
      }
    }

    // Мотивация: заметки, топ, награды, заявки
    t('t.notes.save', { id: s2[0], good: 'Быстро считает устно, хорошо решает задачи на логику.',
      weak: 'Торопится в письменных заданиях, путает разряды при вычитании.',
      repeat: 'Таблица умножения на 7 и 8; вычитание с переходом через десяток.', parent: true });
    t('t.notes.save', { id: s2[2], good: 'Аккуратно ведёт тетрадь.', weak: 'Стесняется отвечать у доски.', repeat: 'Безударные гласные.', parent: false });
    t('t.top.save', { classId: c2, enabled: true, size: 5, mode: 'points', period: 'month' });
    t('t.points', { studentId: s2[0], amount: 5, reason: 'Помог однокласснику разобраться с задачей' });
    t('t.points', { studentId: s2[3], amount: 3, reason: 'Победа в классной викторине' });

    var r1 = t('t.rewards.save', { title: 'Выбрать место в классе на неделю', description: 'Сесть, где хочется (кроме последней парты)', cost: 25 }).id;
    var r2 = t('t.rewards.save', { title: 'Задача для разбора на уроке', description: 'Предложить свою задачу классу', cost: 15 }).id;
    t('t.rewards.save', { title: 'Освобождение от одного устного опроса', description: 'Один раз, по договорённости с учителем', cost: 40 });
    t('t.rewards.save', { title: 'Сертификат «Ученик месяца»', description: 'Вручается на родительском собрании', cost: 80, stock: '1' });

    // Привязки демо-пользователей: ученик Миша и мама Ольга (у неё двое детей — Миша и Лиза)
    db.insert('users', { tg_id: String(USERS.student.id), role: 'student', name: 'Миша Котов', username: 'misha_k', student_id: s2[0], created_at: stamp });
    db.insert('users', { tg_id: String(USERS.parent.id), role: 'parent', name: 'Ольга Котова', username: 'olga_k', student_id: s2[0], created_at: stamp });
    db.insert('users', { tg_id: String(USERS.parent.id), role: 'parent', name: 'Ольга Котова', username: 'olga_k', student_id: s3[0], created_at: stamp });

    Logic.handle(db, { action: 's.request', params: { rewardId: r2 } }, { user: USERS.student, now: now });
    var req = function (sid, rid, title, cost) {
      return db.insert('requests', { id: U.uid('q'), student_id: sid, reward_id: rid, reward_title: title, cost: cost,
        status: 'pending', created_at: U.fmtDateTime(new Date(now.getTime() - 3 * 86400000)), decided_at: '', comment: '' });
    };
    t('t.requests.decide', { id: req(s2[1], r1, 'Выбрать место в классе на неделю', 25).id, approve: true });
    req(s2[3], r2, 'Задача для разбора на уроке', 15);
    // Игровая часть: цель класса (начата неделю назад) и пара значков
    var cls2 = db.all('students').find(function (x) { return x.id === s2[0]; }).class_id;
    db.insert('goals', { id: U.uid('g'), class_id: cls2, title: 'Поход в кино', target: 400, from: U.addDays(U.fmtDate(now), -7), until: U.addDays(U.fmtDate(now), 21), status: 'active', done_at: '' });
    t('t.badge.give', { studentIds: [s2[0]], key: 'helper', note: 'помог подготовить опыт' });
    t('t.badge.give', { studentIds: [s2[0], s2[2]], key: 'answer' });
    t('t.badge.give', { studentIds: [s2[0]], key: 'late', note: 'два опоздания на этой неделе' });
    // Украшения: у Миши кепка и очки, у пары одноклассников свои образы
    var dress = function (sid, items, look) {
      items.forEach(function (it) { db.insert('shop', { id: U.uid('s'), student_id: sid, item: it, cost: 0, at: stamp }); });
      db.all('students').find(function (x) { return x.id === sid; }).look = JSON.stringify(look);
    };
    dress(s2[0], ['fox', 'cap', 'glasses', 'space'], { char: 'fox', color: 'orange', hat: 'cap', acc: 'glasses', theme: 'space' });
    dress(s2[1], ['owl', 'purple', 'headphones'], { char: 'owl', color: 'purple', hat: 'headphones' });
    dress(s2[3], ['pink', 'bowtie', 'silver'], { char: 'bear', color: 'pink', acc: 'bowtie', frame: 'silver' });
    db.data.journal = []; // «История изменений» в демо начинается с чистого листа
  }

  return {
    call: call,
    get role() { return role; },
    setRole: function (r) { role = r; localStorage.setItem(KEY + '_role', r); },
    reset: function () { localStorage.removeItem(KEY); db = null; keep = false; },
    /** Данные, импортированные в демо (для переноса в Google Таблицу) */
    exportData: function () { if (!db) load(); return JSON.parse(JSON.stringify(db.data)); },
    get kept() { if (!db) load(); return keep; },
    ROLES: [['teacher', 'Учитель'], ['student', 'Ученик'], ['parent', 'Родитель']]
  };
})();
