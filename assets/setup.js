// "Set it up" sections (ops/setup-section.py): app tabs, and the copy-instructions button.
document.querySelectorAll('.pt-setup').forEach(function (s) {
  var tabs = s.querySelectorAll('.pt-tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      s.querySelectorAll('.pt-panel').forEach(function (p) { p.hidden = p.id !== 'p-' + b.dataset.p; });
      s.querySelectorAll('.pt-panel video').forEach(function (v) { v.pause(); });
    });
  });
  var btn = s.querySelector('[data-copy]'), msg = s.querySelector('[data-copy-msg]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var url = btn.dataset.copy;
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (t) { return navigator.clipboard.writeText(t); })
      .then(function () { msg.textContent = 'Copied. Now paste it into your app’s Instructions box.'; btn.textContent = 'Copied ✓'; })
      .catch(function () { msg.innerHTML = 'Couldn’t copy automatically. <a href="' + url + '">Open the instructions</a>, select all and copy.'; });
  });
});
