/**
 * ui.js — общие «кирпичики» интерфейса: иконки, даты, всплывающие формы, уведомления, таймер.
 */
var UI = (function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;

  // ─── Защита текста при вставке в HTML ───
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ─── Иконки (простые линии, без «детской» графики) ───
  var ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.3 4-6.5 8-6.5s7 2.2 8 6.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8S10.5 3.5 8 4.5 9 8 12 8zm0 0s1.5-4.5 4-3.5S15 8 12 8z"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="M5 12.5 10 17l9-10"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chev: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.2 2.2-5.3 3.6-7 .3 1.8 1.2 3 2.4 3.6C11.3 8 12.5 5 15 3c-.3 2.7.8 4.6 2 6.2 1 1.4 1.5 3 1.5 4.6 0 4.6-3 7.2-6.5 7.2z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20.5h7"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M14.5 9.3c-.4-.8-1.3-1.3-2.5-1.3-1.4 0-2.5.7-2.5 1.8s1.1 1.6 2.5 1.9 2.5.8 2.5 2-1.1 1.8-2.5 1.8c-1.2 0-2.1-.5-2.5-1.3"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4M12 7.5V12l3 2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    book: '<path d="M4 4.5h5.5a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H4zM20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    school: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c1.5 1.5 3.3 2.2 5.5 2.2s4-.7 5.5-2.2v-5M21.5 9v5"/>',
    swap: '<path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 11l2 2 4-4M8.5 17h7"/>'
  };
  function icon(name, size) {
    var s = size || 20;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  // ─── Даты и числа по-русски ───
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WD = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(ds, time) {
    var p = String(ds).split('-'), t = String(time || '00:00').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +t[0] || 0, +t[1] || 0);
  }
  function wdIndex(ds) { return (parse(ds).getDay() + 6) % 7; }
  function dayLong(ds) { var d = parse(ds); return WD[wdIndex(ds)] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function dayShort(ds) { var d = parse(ds); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function relDay(ds, today) {
    if (ds === today) return 'Сегодня';
    if (ds === Logic.util.addDays(today, 1)) return 'Завтра';
    if (ds === Logic.util.addDays(today, -1)) return 'Вчера';
    return WD_SHORT[wdIndex(ds)] + ', ' + dayShort(ds);
  }
  function dateTime(at) {
    if (!at) return '';
    var p = String(at).split(' ');
    return dayShort(p[0]) + (p[1] && p[1] !== '00:00' ? ', ' + p[1] : '');
  }
  function weekRange(from) {
    var a = parse(from), b = parse(Logic.util.addDays(from, 6));
    return a.getMonth() === b.getMonth()
      ? a.getDate() + '–' + b.getDate() + ' ' + MONTHS[b.getMonth()]
      : a.getDate() + ' ' + MONTHS[a.getMonth()].slice(0, 3) + ' – ' + b.getDate() + ' ' + MONTHS[b.getMonth()].slice(0, 3);
  }
  function plural(n, f) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return f[2];
    if (n1 > 1 && n1 < 5) return f[1];
    if (n1 === 1) return f[0];
    return f[2];
  }
  function pts(n) { return n + ' ' + plural(n, ['балл', 'балла', 'баллов']); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  function pct(v) { return v === null || v === undefined ? '—' : v + '%'; }
  function duration(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400);
    if (d >= 1) return d + ' ' + plural(d, ['день', 'дня', 'дней']);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (h) return h + ' ч ' + pad(m) + ' мин';
    return pad(m) + ':' + pad(sec);
  }

  // ─── Таймер урока ───
  // Ищет идущий сейчас урок и ближайший следующий.
  function findNow(lessons) {
    var now = new Date(), cur = null, next = null;
    (lessons || []).forEach(function (l) {
      if (l.status === 'cancelled') return;
      var s = parse(l.date, l.start), e = parse(l.date, l.end);
      if (s <= now && now < e) { if (!cur) cur = l; }
      else if (s > now && (!next || s < parse(next.date, next.start))) next = l;
    });
    return { current: cur, next: next };
  }
  function countdown(ms) { return '<span data-cd="' + ms + '">' + duration(ms - Date.now()) + '</span>'; }
  function progress(l) {
    var s = parse(l.date, l.start).getTime(), e = parse(l.date, l.end).getTime();
    return '<div class="progress"><i data-ps="' + s + '" data-pe="' + e + '" style="width:' + progressPct(s, e) + '%"></i></div>';
  }
  function progressPct(s, e) { return Math.max(0, Math.min(100, (Date.now() - s) / (e - s) * 100)).toFixed(1); }
  var onTimerEnd = null;
  setInterval(function () {
    var now = Date.now(), ended = false;
    document.querySelectorAll('[data-cd]').forEach(function (el) {
      var left = +el.getAttribute('data-cd') - now;
      el.textContent = duration(left);
      if (left <= 0 && !el._ended) { el._ended = true; ended = true; }
    });
    document.querySelectorAll('[data-ps]').forEach(function (el) {
      el.style.width = progressPct(+el.getAttribute('data-ps'), +el.getAttribute('data-pe')) + '%';
    });
    if (ended && onTimerEnd) setTimeout(onTimerEnd, 1200);
  }, 1000);

  // ─── Уведомления, вибрация, ссылки ───
  var toastTimer;
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, isError ? 4200 : 2200);
    haptic(isError ? 'error' : null);
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback || !tg.isVersionAtLeast('6.1')) return;
      if (kind === 'error' || kind === 'success') tg.HapticFeedback.notificationOccurred(kind);
      else if (kind === 'select') tg.HapticFeedback.selectionChanged();
      else if (kind) tg.HapticFeedback.impactOccurred(kind);
    } catch (e) { /* вибрация недоступна — не страшно */ }
  }
  function openLink(url) {
    if (!url) return;
    if (tg && tg.initData && tg.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener');
  }
  function copy(text) {
    var done = function () { toast('Скопировано'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function shareLink(url, text) {
    if (tg && tg.initData && tg.openTelegramLink) {
      tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text || ''));
    } else copy(url);
  }

  // ─── Всплывающее окно снизу ───
  var overlay = document.getElementById('overlay');
  var closeCurrent = null;
  function openSheet(html) {
    if (closeCurrent) closeCurrent();
    overlay.innerHTML = '<div class="sheet"><div class="grip"></div>' + html + '</div>';
    overlay.classList.add('open');
    var close = function () {
      overlay.classList.remove('open'); overlay.innerHTML = ''; closeCurrent = null;
      if (window.App) App.syncBackButton();
    };
    closeCurrent = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    if (window.App) App.syncBackButton(); // кнопка «Назад» Telegram сначала закроет это окно
    return { el: overlay.querySelector('.sheet'), close: close };
  }
  function isSheetOpen() { return !!closeCurrent; }
  function closeSheet() { if (closeCurrent) closeCurrent(); }

  function fieldHtml(f) {
    if (Array.isArray(f)) return '<div class="field-row">' + f.map(fieldHtml).join('') + '</div>';
    if (f.type === 'html') return f.html;
    var v = f.value === undefined || f.value === null ? '' : f.value;
    var lab = '<span>' + esc(f.label) + '</span>';
    var hint = f.hint ? '<div class="sub" style="margin:4px 2px 0">' + esc(f.hint) + '</div>' : '';
    var ph = ' placeholder="' + esc(f.placeholder || '') + '"';
    if (f.type === 'toggle') {
      return '<div class="toggle-row"><div class="row-main">' + esc(f.label) + (f.hint ? '<div class="sub">' + esc(f.hint) + '</div>' : '') +
        '</div><label class="switch"><input type="checkbox" name="' + f.name + '"' + (v ? ' checked' : '') + '><span></span></label></div>';
    }
    if (f.type === 'textarea') {
      return '<label class="field">' + lab + '<textarea class="input" name="' + f.name + '" rows="' + (f.rows || 3) + '"' + ph + '>' +
        esc(v) + '</textarea>' + hint + '</label>';
    }
    if (f.type === 'select') {
      return '<label class="field">' + lab + '<select class="input" name="' + f.name + '">' + f.options.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') + '</select>' + hint + '</label>';
    }
    var type = f.type || 'text';
    return '<label class="field">' + lab + '<input class="input" type="' + type + '" name="' + f.name + '" value="' + esc(v) + '"' + ph +
      (type === 'number' ? ' inputmode="numeric"' : '') + (f.autofocus ? ' autofocus' : '') + '>' + hint + '</label>';
  }
  function flatFields(fields) {
    var out = [];
    fields.forEach(function (f) { if (Array.isArray(f)) out = out.concat(f); else if (f.name) out.push(f); });
    return out;
  }

  /**
   * Форма во всплывающем окне.
   * UI.form({ title, desc, fields: [...], submit: 'Сохранить', onSubmit: values => Promise, extra: {label, onClick} })
   * Если onSubmit вернул ошибку — окно не закрывается, введённое не теряется.
   */
  function form(opts) {
    return new Promise(function (resolve) {
      var html = '<form novalidate><h2>' + esc(opts.title) + '</h2>' + (opts.desc ? '<p class="desc">' + esc(opts.desc) + '</p>' : '<div style="height:10px"></div>') +
        opts.fields.map(fieldHtml).join('') +
        '<div class="btn-row"><button type="submit" class="btn">' + esc(opts.submit || 'Сохранить') + '</button></div>' +
        (opts.extra ? '<div class="btn-row"><button type="button" class="btn ' + (opts.extra.cls || 'danger') + '" data-extra>' + esc(opts.extra.label) + '</button></div>' : '') +
        '</form>';
      var s = openSheet(html), formEl = s.el.querySelector('form'), busy = false;
      var first = formEl.querySelector('[autofocus]');
      if (first) setTimeout(function () { first.focus(); }, 250);
      var finish = function (val) { s.close(); resolve(val); };
      formEl.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        var values = {}, bad = null;
        flatFields(opts.fields).forEach(function (f) {
          var el = formEl.elements[f.name];
          values[f.name] = f.type === 'toggle' ? el.checked : el.value;
          if (f.required && !String(values[f.name]).trim() && !bad) bad = el;
        });
        if (bad) { toast('Заполните обязательные поля'); bad.focus(); return; }
        if (!opts.onSubmit) return finish(values);
        busy = true;
        var btn = formEl.querySelector('[type=submit]');
        btn.disabled = true;
        Promise.resolve(opts.onSubmit(values)).then(function (res) { finish(res === undefined ? values : res); })
          .catch(function (err) { busy = false; btn.disabled = false; toast(err.message || String(err), true); });
      });
      var ex = formEl.querySelector('[data-extra]');
      if (ex) ex.addEventListener('click', function () {
        Promise.resolve(opts.extra.onClick()).then(function (r) { if (r !== false) finish(null); })
          .catch(function (err) { toast(err.message || String(err), true); });
      });
    });
  }

  function confirm(text, okLabel, danger) {
    return new Promise(function (resolve) {
      var s = openSheet('<h2>' + esc(text) + '</h2><div style="height:12px"></div><div class="btn-row">' +
        '<button class="btn plain" data-v="0">Отмена</button><button class="btn ' + (danger ? 'danger' : '') + '" data-v="1">' + esc(okLabel || 'Да') + '</button></div>');
      s.el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (b) { s.close(); resolve(b.getAttribute('data-v') === '1'); }
      });
    });
  }

  function info(title, html) {
    var s = openSheet('<h2>' + esc(title) + '</h2><div style="height:8px"></div>' + html +
      '<div class="btn-row"><button class="btn plain" data-close>Закрыть</button></div>');
    s.el.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) s.close(); });
    return s;
  }

  return {
    esc: esc, icon: icon, pad: pad, parse: parse, dayLong: dayLong, dayShort: dayShort, relDay: relDay, dateTime: dateTime,
    weekRange: weekRange, wdIndex: wdIndex, WD: WD, WD_SHORT: WD_SHORT, plural: plural, pts: pts, signed: signed, pct: pct,
    duration: duration, findNow: findNow, countdown: countdown, progress: progress,
    toast: toast, haptic: haptic, openLink: openLink, copy: copy, shareLink: shareLink,
    openSheet: openSheet, isSheetOpen: isSheetOpen, closeSheet: closeSheet, form: form, confirm: confirm, info: info, fieldHtml: fieldHtml,
    set onTimerEnd(fn) { onTimerEnd = fn; }
  };
})();
