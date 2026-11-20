(function () {
  'use strict';
  var cfg = window.CVD || { url: '', i18n: {} };
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }

  ready(function () {
    var forms = document.querySelectorAll('form.cvd-form');
    Array.prototype.forEach.call(forms, function (form) {
      var amount = form.querySelector('input[name="amount"]');
      var presets = form.querySelectorAll('input[name="preset"]');
      var msg = form.querySelector('.cvd-msg');
      var btn = form.querySelector('.cvd-btn');
      var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };

      Array.prototype.forEach.call(presets, function (r) {
        r.addEventListener('change', function () { amount.value = r.value; });
      });
      amount.addEventListener('input', function () {
        var v = amount.value.trim().replace(',', '.');
        Array.prototype.forEach.call(presets, function (r) { r.checked = (r.value === v); });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        msg.textContent = '';
        var a = amount.value.trim();
        if (!/^\d{1,6}([.,]\d{1,2})?$/.test(a)) { msg.textContent = cfg.i18n.amount || ''; amount.focus(); return; }
        btn.disabled = true;
        var anon = form.querySelector('[name="anonymous"]');
        var body = {
          campaign: form.getAttribute('data-campaign') || '0', amount: a, name: val('name'), email: val('email'),
          message: val('message'), anonymous: !!(anon && anon.checked), website: val('website')
        };
        fetch(cfg.url, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }, function () { return { ok: false, d: null }; }); })
          .then(function (x) {
            if (x.ok && x.d && typeof x.d.redirect === 'string' && /^https:\/\//.test(x.d.redirect)) {
              msg.textContent = cfg.i18n.sending || '';
              window.location.assign(x.d.redirect);
            } else {
              msg.textContent = (x.d && x.d.message) || cfg.i18n.error || '';   // textContent : jamais de HTML injecté
              btn.disabled = false;
            }
          })
          .catch(function () { msg.textContent = cfg.i18n.error || ''; btn.disabled = false; });
      });
    });
  });
})();
