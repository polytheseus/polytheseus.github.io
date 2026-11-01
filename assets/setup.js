// "Set it up" sections (ops/setup-section.py): app tabs, and the copy-instructions button.
// count('guide') loads /get/<pack>/guide in a hidden frame, so each free "get it" action shows up as a
// page view by path in Cloudflare Web Analytics (hub/get/index.html). Once per action per page view.
var counted = {};
function count(action) {
  var pack = location.pathname.split('/')[1] || 'hub';
  if (counted[action]) return;
  counted[action] = true;
  var f = document.createElement('iframe');
  f.src = '/get/' + pack + '/' + action;
  f.hidden = true;
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  document.body.appendChild(f);
}
document.querySelectorAll('.pt-setup').forEach(function (s) {
  s.querySelectorAll('a[download]').forEach(function (a) {
    a.addEventListener('click', function () { count('guide'); });
  });
  s.querySelectorAll('[data-copy-msg] a').forEach(function (a) {
    a.addEventListener('click', function () { count('instructions'); });
  });
  var code = s.querySelector('#p-code');
  if (code) code.addEventListener('copy', function () { count('install'); });
  var tabs = s.querySelectorAll('.pt-tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      count('tab-' + b.dataset.p);
      s.querySelectorAll('.pt-panel').forEach(function (p) { p.hidden = p.id !== 'p-' + b.dataset.p; });
      s.querySelectorAll('.pt-panel video').forEach(function (v) { v.pause(); });
    });
  });
  var btn = s.querySelector('[data-copy]'), msg = s.querySelector('[data-copy-msg]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var url = btn.dataset.copy;
    count('instructions');
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (t) { return navigator.clipboard.writeText(t); })
      .then(function () { msg.textContent = 'Copied. Now paste it into your app’s Instructions box.'; btn.textContent = 'Copied ✓'; })
      .catch(function () { msg.innerHTML = 'Couldn’t copy automatically. <a href="' + url + '">Open the instructions</a>, select all and copy.'; });
  });
});

// "Try it now" sections (ops/try-section.py): each sample's prompt = its hidden brief + the editable case.
// The app links are real links (so phones can hand them to the app), refreshed as the case is edited.
var TRY_APPS = { chatgpt: 'https://chatgpt.com/?q=', claude: 'https://claude.ai/new?q=' };
document.querySelectorAll('.pt-try').forEach(function (s) {
  var msg = s.querySelector('.pt-try-msg');
  var chips = s.querySelectorAll('.pt-try-chips button');
  function prompt(panel) {
    return panel.dataset.brief + '\n\nThe job:\n' + panel.querySelector('textarea').value.trim();
  }
  s.querySelectorAll('.pt-try-panel').forEach(function (panel) {
    var area = panel.querySelector('textarea');
    function refresh() {
      panel.querySelectorAll('a[data-app]').forEach(function (a) {
        a.href = TRY_APPS[a.dataset.app] + encodeURIComponent(prompt(panel));
      });
    }
    refresh();
    area.addEventListener('input', refresh);
    panel.querySelectorAll('a[data-app]').forEach(function (a) {
      a.addEventListener('click', function () { refresh(); count('try-' + a.dataset.app + '-' + panel.dataset.s); });
    });
    var copy = panel.querySelector('button[data-app="copy"]');
    copy.addEventListener('click', function () {
      count('try-copy-' + panel.dataset.s);
      navigator.clipboard.writeText(prompt(panel)).then(function () {
        msg.textContent = 'Copied. Paste it into Gemini, Copilot or any AI chat app and send.';
        copy.textContent = 'Copied ✓';
      }).catch(function () {
        msg.textContent = 'Couldn’t copy automatically. Select the sample job above, then use ChatGPT or Claude.';
      });
    });
  });
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      chips.forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      s.querySelectorAll('.pt-try-panel').forEach(function (p) { p.hidden = p.dataset.s !== b.dataset.s; });
      msg.textContent = '';
    });
  });
});
