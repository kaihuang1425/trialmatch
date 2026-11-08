/* Touch screens have no hover, so on phones and tablets every hover effect also plays while a finger is down.
   Each `:hover` rule in the page's own styles (including styles added later, like the 3D viewer's) gets a twin for
   `.is-press`, and `.is-press` sits on the touched element and its parents for the length of the press, the way
   `:hover` would. It waits a moment before showing, so a finger that starts a scroll doesn't flash what it touched,
   and a quick tap still shows it long enough to see. Loaded by the landing page and the app. */
(function () {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(hover: none)').matches) return;

  var done = typeof WeakSet === 'function' ? new WeakSet() : null;

  function twin(rules, owner) {
    for (var i = rules.length - 1; i >= 0; i--) {   // backwards, so a twin inserted after rule i never moves what is still to read
      var r = rules[i];
      if (!r.selectorText) {                         // @media, @supports and other groups: look inside
        if (r.cssRules) { try { twin(r.cssRules, r); } catch (e) { /* unreadable group */ } }
        continue;
      }
      if (r.selectorText.indexOf(':hover') < 0) continue;
      var sel = r.selectorText.split(',').filter(function (s) { return s.indexOf(':hover') >= 0; })
        .map(function (s) { return s.replace(/:hover/g, '.is-press'); }).join(',');
      try { owner.insertRule(sel + '{' + r.style.cssText + '}', i + 1); } catch (e) { /* a selector this browser can't take */ }
    }
  }
  function sheet(s) {
    if (!s || (done && done.has(s))) return;
    var rules;
    try { rules = s.cssRules; } catch (e) { return; }   // another site's stylesheet (fonts): nothing to twin
    if (!rules) return;
    if (done) done.add(s);
    twin(rules, s);
  }
  function all() { Array.prototype.forEach.call(document.styleSheets, sheet); }
  all();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
  if (window.MutationObserver) {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.tagName === 'STYLE') sheet(n.sheet);
          else if (n.tagName === 'LINK') n.addEventListener('load', function () { sheet(n.sheet); });
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  var on = [], shown = 0, wait = 0, end = 0;
  function clear() { on.forEach(function (n) { n.classList.remove('is-press'); }); on = []; }
  function show(target) {
    clear();
    for (var n = target; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) { n.classList.add('is-press'); on.push(n); }
    shown = Date.now();
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    clearTimeout(wait); clearTimeout(end);
    var t = e.target;
    wait = setTimeout(function () { wait = 0; show(t); }, 70);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', function (e) {
    if (e.pointerType === 'mouse') return;
    if (wait) { var t = e.target; clearTimeout(wait); wait = 0; show(t); }   // a quick tap: show it now
    end = setTimeout(clear, Math.max(0, 180 - (Date.now() - shown)));
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', function () {   // the finger started a scroll
    clearTimeout(wait); wait = 0; clearTimeout(end); clear();
  }, { capture: true, passive: true });
})();
