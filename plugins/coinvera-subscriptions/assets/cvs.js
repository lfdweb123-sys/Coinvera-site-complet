(function () {
  'use strict';
  var cfg = window.CVS || { url: '', i18n: {} };
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  ready(function () {
    Array.prototype.forEach.call(document.querySelectorAll('form.cvs-form'), function (form) {
      var msg = form.querySelector('.cvs-msg'), btn = form.querySelector('.cvs-btn');
      var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
      form.addEventListener('submit', function (e) {
        e.preventDefault(); msg.textContent = ''; btn.disabled = true;
        var consent = form.querySelector('[name="consent"]');
        var body = { plan: form.getAttribute('data-plan'), name: val('name'), email: val('email'), website: val('website'), consent: !!(consent && consent.checked) };
        fetch(cfg.url, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }, function () { return { ok: false, d: null }; }); })
          .then(function (x) {
            if (x.ok && x.d && typeof x.d.redirect === 'string' && /^https:\/\//.test(x.d.redirect)) { msg.textContent = cfg.i18n.sending || ''; window.location.assign(x.d.redirect); }
            else { msg.textContent = (x.d && x.d.message) || cfg.i18n.error || ''; btn.disabled = false; }   // textContent : jamais de HTML injecté
          })
          .catch(function () { msg.textContent = cfg.i18n.error || ''; btn.disabled = false; });
      });
    });
  });
})();
