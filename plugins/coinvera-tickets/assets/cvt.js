(function () {
  'use strict';
  var cfg = window.CVT || { url: '', i18n: {} };
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  ready(function () {
    Array.prototype.forEach.call(document.querySelectorAll('form.cvt-form'), function (form) {
      var max = parseInt(form.getAttribute('data-max'), 10) || 1, msg = form.querySelector('.cvt-msg'), btn = form.querySelector('.cvt-btn'), totalEl = form.querySelector('.cvt-total strong');
      var inputs = form.querySelectorAll('.cvt-n');
      function count() { var c = 0; Array.prototype.forEach.call(inputs, function (i) { c += parseInt(i.value, 10) || 0; }); return c; }
      function total() { var t = 0; Array.prototype.forEach.call(form.querySelectorAll('.cvt-type'), function (row) { var i = row.querySelector('.cvt-n'); if (i) t += (parseInt(i.value, 10) || 0) * parseInt(row.getAttribute('data-price'), 10); }); totalEl.textContent = (t / 100).toFixed(2) + ' $'; }
      form.addEventListener('click', function (e) {
        var b = e.target.closest('.cvt-plus, .cvt-minus'); if (!b) return;
        var i = b.parentNode.querySelector('.cvt-n'), v = parseInt(i.value, 10) || 0;
        if (b.classList.contains('cvt-plus') && count() < max) v++; else if (b.classList.contains('cvt-minus') && v > 0) v--;
        i.value = String(v); total();
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); msg.textContent = '';
        var qty = {}; Array.prototype.forEach.call(inputs, function (i) { var n = parseInt(i.value, 10) || 0; if (n > 0) qty[i.getAttribute('data-type')] = n; });
        if (!Object.keys(qty).length) { msg.textContent = cfg.i18n.pick || ''; return; }
        btn.disabled = true;
        var val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
        fetch(cfg.url, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: form.getAttribute('data-event'), qty: qty, name: val('name'), email: val('email'), website: val('website') }) })
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
