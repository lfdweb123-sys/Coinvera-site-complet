(function () {
  'use strict';
  var body = document.querySelector('#cvt-types tbody'); if (!body) return;
  var add = document.getElementById('cvt-add'), tpl = document.getElementById('cvt-tpl');
  if (add && tpl) add.addEventListener('click', function () {
    if (body.querySelectorAll('.cvt-type').length >= 10) return;
    body.insertAdjacentHTML('beforeend', tpl.innerHTML.replace(/__I__/g, String(Date.now() % 1000000)));
  });
  body.addEventListener('click', function (e) {
    var b = e.target.closest('.cvt-rm'); if (b && body.querySelectorAll('.cvt-type').length > 1) b.closest('tr').remove();
  });
})();
