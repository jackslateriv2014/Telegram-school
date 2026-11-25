/**
 * parent.js — экраны родителя (только просмотр): Сводка · Уроки · Баллы.
 * Родитель видит только своего ребёнка и только то, что разрешил учитель.
 * Если детей несколько — сверху переключатель.
 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon, S = App.state;

  function load() {
    return Api.call('p.home', { studentId: S.childId || '' }).then(function (d) { S.childId = d.child.id; return d; });
  }
  function header(d) {
    var html = '<div class="kicker">' + (d.child.class_name ? esc(d.child.class_name) + ' · ' : '') + 'только просмотр</div>' +
      '<div class="topline"><h1>' + esc(d.child.name) + '</h1></div>';
    if (d.children.length > 1) {
      html += '<div class="chips">' + d.children.map(function (c) {
        return '<button class="chip' + (c.id === d.child.id ? ' on' : '') + '" data-act="child" data-id="' + esc(c.id) + '">' + esc(c.name.split(' ')[0]) +
          (c.class_name ? ' · ' + esc(c.class_name) : '') + '</button>';
      }).join('') + '</div>';
    }
    return html + App.roleSwitcher();
  }
  var childAction = { child: function (el) { S.childId = el.dataset.id; App.reload(); } };

  App.screen('p.summary', {
    title: null, live: true, load: load, actions: childAction,
    render: function (d) {
      var html = header(d), st = d.stats, tiles = [];
      if (st.attendancePct !== null || d.show.attendance) tiles.push(['' + UI.pct(st.attendancePct), 'посещаемость']);
      if (d.show.homework) tiles.push([UI.pct(st.homeworkPct), 'выполнение ДЗ']);
      if (d.points) { tiles.push([d.points.balance, 'баллов сейчас']); tiles.push([d.points.streak.current, 'ДЗ подряд']); }
      if (tiles.length) html += '<div class="tiles">' + tiles.map(function (t) { return '<div class="tile"><div class="val">' + t[0] + '</div><div class="lbl">' + t[1] + '</div></div>'; }).join('') + '</div>';
      if (d.show.attendance && st.absent) html += '<div class="sub" style="margin:-2px 4px 10px">Пропусков без уважительной причины: ' + st.absent + '</div>';
      if (d.notes && (d.notes.good || d.notes.weak || d.notes.repeat)) {
        html += '<div class="section-title">' + icon('edit', 15) + ' Заметки учителя</div><div class="card">' +
          (d.notes.good ? '<div class="note-block"><div class="lbl">Что получается</div><div class="textblock">' + esc(d.notes.good) + '</div></div>' : '') +
          (d.notes.weak ? '<div class="note-block"><div class="lbl">Над чем поработать</div><div class="textblock">' + esc(d.notes.weak) + '</div></div>' : '') +
          (d.notes.repeat ? '<div class="note-block"><div class="lbl">Повторить дома</div><div class="textblock">' + esc(d.notes.repeat) + '</div></div>' : '') +
          (d.notes.updated ? '<div class="sub" style="margin-top:10px">Обновлено ' + UI.dateTime(d.notes.updated) + '</div>' : '') + '</div>';
      }
      if (d.homework) {
        html += '<div class="section-title">' + icon('book', 15) + ' Домашнее задание</div><div class="card"><div class="sub">' + esc(d.homework.subject) +
          ' · задано ' + UI.dayShort(d.homework.date) + '</div><div class="textblock" style="margin-top:4px">' + esc(d.homework.text) + '</div></div>';
      }
      html += '<div class="section-title">Расписание</div>' + Views.hero(d.upcoming, { today: d.today });
      if (d.points) html += '<div class="section-title">Достижения</div>' + Views.badges(d.points.achievements);
      return html;
    }
  });

  function lessonLine(l, today) {
    var pills = (l.attendance ? Views.attPill(l.attendance) : '') + ' ' + (l.hw ? Views.hwPill(l.hw) : '') +
      (l.activity ? ' <span class="pill accent">+' + l.activity + '</span>' : '');
    if (l.status === 'cancelled') pills = '<span class="pill bad">отменён</span>';
    var tap = l.material_url ? ' tap" data-act="url" data-url="' + esc(l.material_url) : '';
    return '<div class="row' + tap + '"><div class="time-col">' + UI.dayShort(l.date).replace(/ (\S{3})\S*/, ' $1') + '<small>' + l.start + '</small></div>' +
      '<div class="row-main"><div class="row-title">' + esc(l.subject) + '</div>' +
      (l.topic ? '<div class="row-sub wrap">' + esc(l.topic) + '</div>' : '') +
      (l.homework ? '<div class="row-sub wrap">ДЗ: ' + esc(l.homework) + '</div>' : '') +
      (pills.trim() ? '<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">' + pills + '</div>' : '') + '</div>' +
      (l.material_url ? '<span title="Конспект">' + icon('file', 20) + '</span>' : '') + '</div>';
  }

  App.screen('p.lessons', {
    title: null, load: load, actions: childAction,
    render: function (d) {
      var html = header(d);
      if (d.upcoming.length) html += '<div class="section-title">Ближайшие уроки</div><div class="card flat">' + d.upcoming.map(function (l) { return lessonLine(l, d.today); }).join('') + '</div>';
      html += '<div class="section-title">Прошедшие уроки (4 недели)</div>';
      html += d.past.length ? '<div class="card flat">' + d.past.map(function (l) { return lessonLine(l, d.today); }).join('') + '</div>'
        : '<div class="card empty">Пока нет проведённых уроков</div>';
      if (!d.show.attendance || !d.show.homework) html += '<div class="sub" style="margin:4px">Часть отметок скрыта учителем.</div>';
      return html;
    }
  });

  App.screen('p.points', {
    title: null, load: load, actions: childAction,
    render: function (d) {
      var html = header(d);
      if (!d.points) return html + '<div class="card empty">' + icon('lock', 28) + '<div>Учитель не показывает баллы родителям</div></div>';
      html += '<div class="card"><div class="sub">Баллы ребёнка</div><div class="balance"><span class="big">' + d.points.balance + '</span><span class="unit">' +
        UI.plural(d.points.balance, ['балл', 'балла', 'баллов']) + '</span></div><div class="sub" style="margin-top:6px">Всего заработано: ' + d.points.earned + '</div></div>';
      html += Views.streak(d.points.streak);
      html += '<div class="section-title">История</div><div class="card flat">' + Views.ledger(d.points.ledger) + '</div>';
      return html;
    }
  });
})();
