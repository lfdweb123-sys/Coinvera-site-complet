(function () {
  'use strict';
  var cfg = window.CVTC || {};
  var MSG = { ok: ['ENTRÉE VALIDE', 'ok'], used: ['DÉJÀ UTILISÉ', 'ko'], void: ['BILLET ANNULÉ', 'ko'], other_event: ['AUTRE ÉVÉNEMENT', 'ko'], unknown: ['BILLET INCONNU', 'ko'], invalid: ['CODE INVALIDE', 'ko'], rate: ['TROP DE SCANS, PATIENTEZ', 'ko'], bad_event: ['ÉVÉNEMENT INVALIDE', 'ko'] };
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  ready(function () {
    Array.prototype.forEach.call(document.querySelectorAll('.cvt-checkin'), function (root) {
      var input = root.querySelector('.cvt-code'), res = root.querySelector('.cvt-result'), video = root.querySelector('.cvt-video'), scanBtn = root.querySelector('.cvt-scan');
      var busy = false, stream = null, timer = null, last = '', lastAt = 0;
      function show(r) {
        var m = MSG[r.result] || ['ERREUR', 'ko'], t = document.createElement('div'); t.className = 'cvt-res cvt-res-' + m[1];
        var h = document.createElement('strong'); h.textContent = m[0]; t.appendChild(h);
        var info = [r.type, r.holder].filter(Boolean).join(' — '); if (r.result === 'used' && r.at) info += (info ? ' · ' : '') + 'à ' + r.at + (r.by ? ' par ' + r.by : '');
        if (info) { var p = document.createElement('div'); p.textContent = info; t.appendChild(p); }   // textContent uniquement
        res.textContent = ''; res.appendChild(t);
        if (typeof r.used === 'number') { root.querySelector('.cvt-used').textContent = r.used; root.querySelector('.cvt-sold').textContent = r.sold; }
        if (navigator.vibrate) navigator.vibrate(m[1] === 'ok' ? 80 : [120, 60, 120]);
      }
      function send(code) {
        if (busy || !code) return; busy = true;
        fetch(cfg.url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce }, body: JSON.stringify({ event: root.getAttribute('data-event'), code: code }) })
          .then(function (r) { return r.json(); }).then(show, function () { show({ result: 'error' }); })
          .then(function () { busy = false; input.value = ''; });
      }
      root.querySelector('.cvt-ck-form').addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
      if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        scanBtn.hidden = false; var det = new window.BarcodeDetector({ formats: ['qr_code'] });
        function stop() { if (timer) clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; video.hidden = true; scanBtn.textContent = 'Scanner'; }
        scanBtn.addEventListener('click', function () {
          if (stream) { stop(); return; }
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
            stream = s; video.srcObject = s; video.hidden = false; video.play(); scanBtn.textContent = 'Arrêter';
            timer = setInterval(function () {
              if (busy) return;
              det.detect(video).then(function (codes) {
                if (!codes.length) return; var v = codes[0].rawValue, now = Date.now();
                if (v === last && now - lastAt < 4000) return; last = v; lastAt = now; send(v);   // même code ignoré 4 s : évite le double scan
              }, function () {});
            }, 400);
          }, function () { res.textContent = 'Caméra indisponible : saisissez le code.'; });
        });
      }
    });
  });
})();
