/**
 * api.js — отправка запросов.
 *   Боевой режим: запрос уходит в Google Apps Script вместе с «подписанной справкой» Telegram.
 *   Демо-режим: тот же запрос обрабатывается прямо в браузере (файл demo.js) — без интернета и без Google.
 */
var Api = (function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  var isTg = !!(tg && tg.initData);
  var forceDemo = /[?&]demo=1/.test(location.search);
  var mode = !forceDemo && CONFIG.API_URL && isTg ? 'live' : 'demo';

  // Одинаковые запросы на чтение, отправленные одновременно (экран + фоновая подгрузка), идут на сервер один раз
  // (и повторный такой же запрос в течение 5 секунд берёт уже полученный ответ). Любое изменение сбрасывает это.
  var inflight = {}, REUSE_MS = 5000;
  function call(action, params) {
    if (!Logic.isReadOnly(action)) { inflight = {}; return send(action, params); }
    var key = action + '|' + JSON.stringify(params || {}), x = inflight[key];
    if (!x || (x.done && Date.now() - x.done > REUSE_MS)) {
      x = inflight[key] = { p: queued(action, params), done: 0 };
      x.p.then(function () { x.done = Date.now(); }, function () { if (inflight[key] === x) delete inflight[key]; });
    }
    return x.p;
  }

  // Запросы на чтение, сделанные почти одновременно (например, подгрузка всех вкладок), уходят на сервер
  // ОДНИМ пакетом: Google тратит около 2 секунд на каждый запрос, а пакет читает таблицу один раз.
  var queue = [], timer = null;
  function queued(action, params) {
    if (mode === 'demo') return send(action, params);
    return new Promise(function (resolve, reject) {
      queue.push({ action: action, params: params || {}, resolve: resolve, reject: reject });
      if (!timer) timer = setTimeout(flushQueue, 12);
    });
  }
  function flushQueue() {
    var list = queue.splice(0, 12);
    timer = queue.length ? setTimeout(flushQueue, 0) : null;
    if (list.length === 1) {
      var one = list[0];
      return send(one.action, one.params).then(one.resolve, one.reject);
    }
    send('batch', { calls: list.map(function (x) { return { action: x.action, params: x.params }; }) }).then(function (res) {
      list.forEach(function (x, i) {
        var r = res && res[i];
        if (r && r.ok) x.resolve(r.data); else x.reject(new Error((r && r.error) || 'Неизвестная ошибка сервера.'));
      });
    }, function (err) { list.forEach(function (x) { x.reject(err); }); });
  }

  function send(action, params) {
    if (mode === 'demo') return Demo.call(action, params || {});
    // text/plain — чтобы браузер не делал лишний «предварительный» запрос, который Google не поддерживает
    return fetch(CONFIG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, params: params || {}, initData: tg.initData })
    }).then(function (r) {
      if (!r.ok) throw new Error('Сервер ответил ошибкой (' + r.status + '). Попробуйте позже.');
      return r.json();
    }, function () {
      throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Неизвестная ошибка сервера.');
      return res.data;
    });
  }

  return {
    call: call,
    get mode() { return mode; },
    useDemo: function () { mode = 'demo'; },
    isTg: isTg,
    // Сайт подключён к серверу, но открыт не из Telegram — войти нельзя (нет «справки» Telegram)
    needTelegram: !!CONFIG.API_URL && !isTg && !forceDemo
  };
})();
