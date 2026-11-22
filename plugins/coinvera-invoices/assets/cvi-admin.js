(function () {
  'use strict';
  var body = document.querySelector('#cvi-lines tbody'); if (!body) return;
  // Aperçu indicatif uniquement : le serveur recalcule et vérifie tous les montants à l'enregistrement.
  function num(v, scale) { v = String(v || '').replace(',', '.').trim(); if (!/^\d*\.?\d*$/.test(v) || v === '' || v === '.') return 0; return Math.round(parseFloat(v) * scale); }
  function money(c) { return (c / 100).toFixed(2) + ' $'; }
  function recalc() {
    var sub = 0;
    body.querySelectorAll('.cvi-line').forEach(function (tr) {
      var q = num(tr.querySelector('.cvi-qty').value, 100), u = num(tr.querySelector('.cvi-unit').value, 100);
      var t = Math.floor((q * u + 50) / 100); sub += t; tr.querySelector('.cvi-lt').textContent = money(t);
    });
    var d = num(document.getElementById('discount').value, 100), tx = num(document.getElementById('tax').value, 100);
    var taxable = Math.max(0, sub - d), tax = Math.floor((taxable * tx + 5000) / 10000);
    var el = document.getElementById('cvi-total'); if (el) el.textContent = 'Total indicatif : ' + money(taxable + tax);
  }
  document.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('#cvi-lines, #discount, #tax') || e.target.id === 'discount' || e.target.id === 'tax') recalc(); });
  var add = document.getElementById('cvi-add'), tpl = document.getElementById('cvi-tpl');
  if (add && tpl) add.addEventListener('click', function () {
    var i = body.querySelectorAll('.cvi-line').length + Date.now() % 100000;
    body.insertAdjacentHTML('beforeend', tpl.innerHTML.replace(/__I__/g, i)); recalc();
  });
  body.addEventListener('click', function (e) {
    var b = e.target.closest('.cvi-rm'); if (!b) return;
    if (body.querySelectorAll('.cvi-line').length > 1) { b.closest('tr').remove(); recalc(); }
  });
  recalc();
})();
