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
  return f;
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

// Buy buttons: a click counts as /get/<page's pack>/buy-<product>. Checkout opens in the same tab, which would
// cancel the frame, so a plain click waits for the frame to load (0.7 s at most). New-tab clicks don't wait.
var BUY = {
  polar_cl_19uEMlN6kE8J27Q8r57PBiUyR8C8ILlhTi5eY08MpbQ: 'teacher-pro',
  polar_cl_PuaJ5VOVryUtrRoYynuaxNDJ5kqoSBYkLw3o93BVDIm: 'comment-bank',
  polar_cl_P9pcPL5q1yoTYLHyFFVmtFG777JYDdqLGUISd0h5oAl: 'bookkeeper-pro',
  polar_cl_GEpYqkQpXmLzTzuHjUzsX0fGRuM3HzlmR0poH3uRaaD: 'trades-pro',
  polar_cl_0GwxHuqIEUJtaUKbU0xavChaqsCruOEBOTzp70pHJ7x: 'landlord-pro',
  polar_cl_DWRX6mrjQb051G7e7lAoQMjmZD9aVtQHId7VL4dOOMI: 'landlord-kit',
  polar_cl_GuFAPenA5N8sxyI67sftnJdFQkg3KuXwFQ2As1oeXkP: 'landlord-sheet',
  polar_cl_g41fOfhxzIiJIH2FBiysw9SwUg6rQ1taC13c42Y5QnU: 'seller-sheet',
  polar_cl_9iRu19qGMpF9y0ZXuEsXnergnqs6Tb1jac9gy0l9iRa: 'seller-pro',
  polar_cl_0Pxbnxcg3LelN56xPW1mHTS7D9pUfwF9rbAAj1Y256V: 'real-estate-pro',
  polar_cl_kBCc4yOmosne80NBVS2a772DVWXfB9iRuzNnQ2JC9M9: 'sre-solo',
  polar_cl_xHCTZ211EsV9DJX7gPWJZelYwyzDGlRkgkzii23oPkR: 'sre-team'
};
document.querySelectorAll('a[href^="https://buy.polar.sh/"]').forEach(function (a) {
  var id = a.pathname.slice(1);
  var action = 'buy-' + (BUY[id] || id.slice(-6));
  a.addEventListener('auxclick', function (e) { if (e.button === 1) count(action); });
  a.addEventListener('click', function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || a.target === '_blank') { count(action); return; }
    var frame = count(action);
    if (!frame) return;
    e.preventDefault();
    var gone = false;
    function go() { if (!gone) { gone = true; location.href = a.href; } }
    frame.addEventListener('load', function () { setTimeout(go, 100); });
    setTimeout(go, 700);
  });
});
