/**
 * student.js — экраны ученика: Главная · Уроки · Награды · История.
 * Ученик видит только свои данные. Блок «Лучшие» — только если учитель его включил.
 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon, U = Logic.util, S = App.state;

  App.screen('s.home', {
    title: null, live: true,
    load: function () { return Api.call('s.home'); },
    render: function (d) {
      var first = d.student.name.split(' ')[0];
      var html = '<div class="kicker">' + (d.student.class_name ? esc(d.student.class_name) + ' · ' : '') + UI.dayLong(d.today) + '</div>' +
        '<div class="topline"><h1>Привет, ' + esc(first) + '!</h1></div>' + App.roleSwitcher();
      html += '<div class="card"><div class="sub">Мои баллы</div><div class="balance"><span class="big">' + d.balance + '</span><span class="unit">' +
        UI.plural(d.balance, ['балл', 'балла', 'баллов']) + '</span></div>' +
        '<div class="sub" style="margin-top:6px">' + (d.pending ? d.pending + ' в резерве на награды · доступно ' + (d.balance - d.pending) + ' · ' : '') +
        'всего заработано ' + d.earned + '</div>' +
        '<div class="btn-row" style="margin-top:12px"><button class="btn ghost sm" data-act="tab" data-screen="s.rewards">' + icon('gift', 17) + ' Награды</button>' +
        '<button class="btn plain sm" data-act="tab" data-screen="s.history">' + icon('history', 17) + ' История</button></div></div>';
      html += Game.pupilTop(d.game);
      html += Views.streak(d.streak);
      html += Views.hero(d.upcoming, { screen: 's.lesson', today: d.today });
      if (d.homework) {
        html += '<div class="section-title">' + icon('book', 15) + ' Домашнее задание</div><div class="card"><div class="sub">' + esc(d.homework.subject) + ' · задано ' +
          UI.dayShort(d.homework.date) + '</div><div class="textblock" style="margin-top:4px;font-size:16px">' + esc(d.homework.text) + '</div></div>';
      }
      html += Game.pupilBadges(d.game);
      if (d.top) html += '<div class="section-title">Лучшие в классе</div>' + Views.top(d.top, false) +
        (d.game ? '<div class="sub" style="margin:-4px 4px 10px">Нажми на имя — увидишь уровень и значки одноклассника</div>' : '');
      html += '<div class="section-title">Достижения</div>' + Views.badges(d.achievements);
      html += '<div class="section-title">Последние начисления<span class="grow"></span><a data-act="tab" data-screen="s.history">Все</a></div>' +
        '<div class="card flat">' + Views.ledger(d.ledger, 'Баллы появятся после первого урока') + '</div>';
      return html;
    }
  });

  S.sweek = '';
  App.screen('s.week', {
    title: 'Уроки',
    load: function (p) { return Api.call('s.week', { from: p.from || S.sweek }); },
    render: function (d) {
      S.sweek = d.from;
      return '<div class="card" style="display:flex;align-items:center;gap:8px;padding:8px">' +
        '<button class="back" data-act="shift" data-n="-7" aria-label="Предыдущая неделя">' + icon('left') + '</button>' +
        '<div style="flex:1;text-align:center"><b>' + UI.weekRange(d.from) + '</b>' +
        (U.mondayOf(d.today) !== d.from ? '<div><button class="link-btn" data-act="shift" data-n="0">к текущей неделе</button></div>' : '<div class="sub">текущая неделя</div>') +
        '</div><button class="back" data-act="shift" data-n="7" aria-label="Следующая неделя">' + icon('chev') + '</button></div>' +
        Views.byDays(d.lessons, d.today, { screen: 's.lesson' }, { from: d.from });
    },
    actions: {
      shift: function (el, d) {
        var n = +el.dataset.n;
        App.replaceParams({ from: n === 0 ? U.mondayOf(d.today) : U.addDays(d.from, n) });
        App.reload();
      }
    }
  });

  App.screen('s.lesson', {
    title: function (d) { return d ? d.lesson.subject : 'Урок'; },
    load: function (p) { return Api.call('s.lesson', { id: p.id }); },
    render: function (d) {
      var l = d.lesson;
      var html = '<div class="card"><div class="row-title">' + UI.relDay(l.date, d.today) + ', ' + l.start + '–' + l.end + '</div>' +
        (l.status === 'cancelled' ? '<div style="margin-top:6px"><span class="pill bad">Урок отменён</span></div>' : '') +
        '<div class="section-title" style="margin:12px 0 4px">Тема</div><div style="font-size:16px">' + (l.topic ? esc(l.topic) : '<span class="sub">Учитель пока не указал тему</span>') + '</div></div>';
      if (l.material_url) html += '<div class="section-title">' + icon('file', 15) + ' Конспект</div>' + Views.material(l);
      if (l.homework) html += '<div class="section-title">' + icon('book', 15) + ' Домашнее задание</div><div class="card textblock">' + esc(l.homework) + '</div>';
      html += Views.checklist(l.id, l.checklist);
      if (d.mark && (d.mark.attendance || d.mark.homework || d.mark.activity)) {
        html += '<div class="section-title">Мои отметки</div><div class="card" style="display:flex;gap:6px;flex-wrap:wrap">' +
          Views.attPill(d.mark.attendance) + Views.hwPill(d.mark.homework) + Views.gradePill(d.mark.grade) + (d.mark.activity ? '<span class="pill accent">активность +' + d.mark.activity + '</span>' : '') + '</div>';
      }
      return html;
    }
  });

  App.screen('s.rewards', {
    title: 'Награды',
    load: function () { return Api.call('s.rewards'); },
    render: function (d) {
      var html = '<div class="card"><div class="sub">Можно потратить</div><div class="balance"><span class="big">' + d.available + '</span><span class="unit">' +
        UI.plural(d.available, ['балл', 'балла', 'баллов']) + '</span></div>' +
        (d.pending ? '<div class="sub" style="margin-top:6px">Ещё ' + d.pending + ' в резерве — ждут решения учителя</div>' : '') + '</div>';
      html += '<div class="card flat"><div class="row tap" data-act="go" data-screen="s.look">' + icon('star') + '<div class="row-main"><div class="row-title">Украшения для аватара</div>' +
        '<div class="row-sub">Персонажи, шапки, рамки, темы — сразу, без ожидания</div></div><span class="chev">' + icon('chev', 16) + '</span></div></div>';
      html += '<div class="section-title">Настоящие награды (подтверждает учитель)</div>';
      html += d.rewards.length ? '<div class="card flat">' + d.rewards.map(function (r) {
        var lack = r.cost - d.available;
        return '<div class="row"><div class="row-main"><div class="row-title wrap">' + esc(r.title) + '</div>' +
          (r.description ? '<div class="row-sub wrap">' + esc(r.description) + '</div>' : '') +
          '<div class="row-sub">' + (r.soldOut ? 'закончилась' : lack > 0 ? 'не хватает ' + lack : 'можно обменять') + '</div></div>' +
          '<button class="btn sm' + (lack > 0 || r.soldOut ? ' plain' : '') + '" data-act="ask" data-id="' + esc(r.id) + '"' + (lack > 0 || r.soldOut ? ' disabled' : '') + '>' + r.cost + ' б.</button></div>';
      }).join('') + '</div>' : '<div class="card empty">' + icon('gift', 28) + '<div>Учитель пока не добавил награды</div></div>';
      if (d.requests.length) {
        html += '<div class="section-title">Мои заявки</div><div class="card flat">' + d.requests.map(function (r) {
          var st = { pending: ['warn', 'ждёт решения'], approved: ['ok', 'одобрена'], rejected: ['bad', 'отклонена'], cancelled: ['', 'отменена'] }[r.status] || ['', r.status];
          return '<div class="row"><div class="row-main"><div class="row-title">' + esc(r.reward_title) + '</div><div class="row-sub">' + r.cost + ' б. · ' +
            UI.dateTime(r.created_at) + (r.comment ? ' · ' + esc(r.comment) : '') + '</div></div>' +
            (r.status === 'pending' ? '<button class="link-btn" data-act="cancel" data-id="' + esc(r.id) + '">Отменить</button> ' : '') +
            '<span class="pill ' + st[0] + '">' + st[1] + '</span></div>';
        }).join('') + '</div>';
      }
      return html;
    },
    actions: {
      ask: function (el, d) {
        var r = d.rewards.find(function (x) { return x.id === el.dataset.id; });
        UI.confirm('Обменять ' + UI.pts(r.cost) + ' на «' + r.title + '»? Баллы спишутся после подтверждения учителем.', 'Отправить заявку')
          .then(function (ok) { if (ok) App.run('s.request', { rewardId: r.id }, { ok: 'Заявка отправлена учителю' }); });
      },
      cancel: function (el) { App.run('s.request.cancel', { id: el.dataset.id }, { ok: 'Заявка отменена' }); }
    }
  });

  App.screen('s.history', {
    title: 'История баллов',
    load: function () { return Api.call('s.history'); },
    render: function (d) {
      var plus = 0, minus = 0;
      d.ledger.forEach(function (l) { if (l.amount > 0) plus += l.amount; else minus -= l.amount; });
      return '<div class="tiles three"><div class="tile"><div class="val">' + d.balance + '</div><div class="lbl">сейчас</div></div>' +
        '<div class="tile"><div class="val" style="color:var(--ok)">+' + plus + '</div><div class="lbl">заработано</div></div>' +
        '<div class="tile"><div class="val">' + minus + '</div><div class="lbl">потрачено</div></div></div>' +
        '<div class="card flat">' + Views.ledger(d.ledger, 'Баллы появятся после первого урока') + '</div>';
    }
  });
})();
