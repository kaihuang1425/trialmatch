// Injected into the landing page by record.py. Adds a "camera" (a transform on the page's .tm root that frames one
// element) and a caption overlay in the page's own type. Nothing here ships with the site.
window.REEL = (function () {
  var W = 1080, H = 1350;
  var tm = document.querySelector('.tm') || document.body;   // the landing page's root; the app has none, and isn't zoomed
  var st = document.createElement('style');
  st.textContent = [
    'html.reel-z,html.reel-z body{overflow:hidden!important;scroll-behavior:auto!important}',
    'html.reel-z .tm .topbar{visibility:hidden!important}',
    '.tm.reel-cam{transform-origin:0 0}',
    '#reel-shade{position:fixed;left:0;right:0;top:0;height:330px;z-index:9998;pointer-events:none;background:linear-gradient(#0E0E0F 72%,rgba(14,14,15,0));opacity:0;transition:opacity .5s}',
    '#reel-shade.on{opacity:1}',
    '.reel-matte{position:fixed;left:0;right:0;z-index:9997;pointer-events:none;transition:opacity .5s}',
    '#reel-cap{position:fixed;left:0;right:0;top:0;z-index:9999;pointer-events:none;font-family:"Google Sans Flex","Google Sans",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
    '#reel-cap .c{position:absolute;left:64px;right:64px;top:70px;display:flex;flex-direction:column;gap:14px;opacity:0;transform:translateY(18px);transition:opacity .45s cubic-bezier(.2,.8,.2,1),transform .6s cubic-bezier(.2,.8,.2,1)}',
    '#reel-cap .c.on{opacity:1;transform:none}',
    '#reel-cap .c.off{opacity:0;transform:translateY(-14px);transition-duration:.3s}',
    '#reel-cap .k{font-size:24px;font-weight:500;letter-spacing:.01em}',
    '#reel-cap .t{font-size:54px;line-height:1.08;font-weight:400;letter-spacing:-.02em;color:#E3E3E3}',
    '#reel-cap .t i{font-style:normal;color:#8A8F95}',
    '#reel-cur{position:fixed;left:0;top:0;z-index:10000;width:34px;height:34px;pointer-events:none;opacity:0;transform-origin:4px 3px;',
    '  transition:opacity .25s,transform .75s cubic-bezier(.45,0,.2,1);filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}',
    '#reel-cur.on{opacity:1}#reel-cur svg{width:100%;height:100%;transition:transform .12s}#reel-cur.dn svg{transform:scale(.82)}'
  ].join('\n');
  document.head.appendChild(st);
  var shade = document.createElement('div'); shade.id = 'reel-shade';
  var cap = document.createElement('div'); cap.id = 'reel-cap';
  document.body.appendChild(shade); document.body.appendChild(cap);

  // Layout position in document pixels, ignoring every transform (reveal animations, the camera itself).
  function box(el) {
    if (typeof el === 'string') el = document.querySelector(el);
    var x = 0, y = 0, w = el.offsetWidth, h = el.offsetHeight, n = el;
    while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: w, h: h };
  }
  function union(list) {
    var bs = list.map(box), x0 = Math.min.apply(null, bs.map(function (b) { return b.x; })), y0 = Math.min.apply(null, bs.map(function (b) { return b.y; }));
    var x1 = Math.max.apply(null, bs.map(function (b) { return b.x + b.w; })), y1 = Math.max.apply(null, bs.map(function (b) { return b.y + b.h; }));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function zoomMode(on) {
    document.documentElement.classList.toggle('reel-z', on);
    if (on) { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); tm.classList.add('reel-cam'); }
    else { tm.classList.remove('reel-cam'); tm.style.transform = ''; tm.style.transition = ''; }
  }
  // Frame `target` (selector, element, list of them, or a box) inside frame f = {x,y,w,h} of the 1080x1350 screen.
  // o.s forces a scale; o.ms animates the move; o.pad adds room around the target; o.ay aligns vertically (0 top, .5 centre).
  function cam(target, f, o) {
    o = o || {};
    var r = Array.isArray(target) ? union(target) : (target && target.w ? target : box(target));
    var pad = o.pad || 0; r = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
    f = f || { x: 40, y: 40, w: W - 80, h: H - 80 };
    var s = o.s || Math.min(f.w / r.w, f.h / r.h);
    var ay = o.ay === undefined ? 0.5 : o.ay;
    var o0 = box(tm);
    var tx = f.x + f.w / 2 - o0.x - s * (r.x + r.w / 2 - o0.x);
    var ty = f.y + (f.h - s * r.h) * ay - o0.y - s * (r.y - o0.y);
    zoomMode(true);
    tm.style.transition = o.ms ? 'transform ' + o.ms + 'ms ' + (o.ease || 'cubic-bezier(.65,0,.35,1)') : 'none';
    tm.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
    return s;
  }
  // Caption: k = kicker, kc = kicker colour, t = headline (may hold <i>muted</i> text). null clears it.
  function say(c) {
    Array.prototype.forEach.call(cap.children, function (n) { n.classList.remove('on'); n.classList.add('off'); setTimeout(function () { n.remove(); }, 400); });
    shade.classList.toggle('on', !!c);
    if (!c) return;
    var d = document.createElement('div'); d.className = 'c';
    d.innerHTML = (c.k ? '<span class="k" style="color:' + (c.kc || '#A8C7FA') + '">' + c.k + '</span>' : '') + '<span class="t">' + c.t + '</span>';
    cap.appendChild(d);
    setTimeout(function () { d.classList.add('on'); }, c.delay || 120);
  }
  // Darkens the screen above y0 and below y1 (with a soft edge), so neighbouring sections don't show. null removes it.
  var mattes = [];
  function matte(y0, y1) {
    mattes.forEach(function (m) { m.remove(); }); mattes = [];
    if (y0 == null) return;
    var e = 90, top = document.createElement('div'), bot = document.createElement('div');
    top.className = bot.className = 'reel-matte';
    top.style.cssText = 'top:0;height:' + y0 + 'px;background:linear-gradient(#0E0E0F calc(100% - ' + e + 'px),rgba(14,14,15,0))';
    bot.style.cssText = 'top:' + y1 + 'px;bottom:0;background:linear-gradient(rgba(14,14,15,0),#0E0E0F ' + e + 'px)';
    document.body.appendChild(top); document.body.appendChild(bot); mattes = [top, bot];
  }
  // Extra page CSS for one scene, e.g. hiding a section's own heading while a caption says it instead.
  var extra = document.createElement('style'); document.head.appendChild(extra);
  function css(text) { extra.textContent = text || ''; }
  // Sound cues. The page's own motion is watched, and every typed character ('key') and every press ('tap') is logged
  // with its wall-clock time, so record.py can lay the sound effects exactly where they happen in the video.
  var log = [];
  function hit(k) {
    var t = performance.timeOrigin + performance.now();
    if (k === 'tap' && log.some(function (e) { return e.k === 'tap' && t - e.t < 120; })) return;   // one press, one sound
    log.push({ k: k, t: t });
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      if (m.type === 'attributes') {
        var was = ' ' + (m.oldValue || '') + ' ', now = m.target.classList;
        if (now.contains('tap') && was.indexOf(' tap ') < 0) hit('tap');                          // scene buttons pressed (s.tap)
        if (now.contains('dn') && was.indexOf(' dn ') < 0 && now.contains('cw-cur')) hit('tap');   // the trial team's cursor clicks
        return;
      }
      var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      el = el && el.closest('.at-typed, .at-ans');                                                // the agent team's typing
      if (!el) return;
      var n = el.textContent.length;
      if (n > (el._reelN || 0)) hit('key');
      el._reelN = n;
    });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  ['animationstart', 'animationiteration'].forEach(function (ev) {   // the relay's Care team presses Invite, in CSS only
    document.addEventListener(ev, function (e) { if (e.animationName === 'rlPress') setTimeout(function () { hit('tap'); }, 450); }, true);
  });
  function take() { var out = log; log = []; return out; }

  // A pointer for scenes that have none of their own: glides to an element, then presses it (with a 'tap' cue).
  var cur = document.createElement('div'); cur.id = 'reel-cur';
  cur.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3l14 8.2-6.2 1.4 3.6 6.6-2.6 1.4-3.6-6.6L5 18.6z" fill="#fff" stroke="#131314" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  function find(sel, text) {
    return Array.prototype.filter.call(document.querySelectorAll(sel), function (e) { return !text || e.textContent.trim() === text; })[0];
  }
  function point(x, y, ms) {
    cur.style.transition = ms === 0 ? 'opacity .25s' : '';
    cur.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 3) + 'px)';
    cur.classList.add('on');
  }
  function aim(sel, text) { var r = find(sel, text).getBoundingClientRect(); point(r.left + r.width * 0.42, r.top + r.height * 0.55); }
  function press(sel, text) {
    var el = find(sel, text);
    cur.classList.add('dn'); hit('tap'); el.click();
    setTimeout(function () { cur.classList.remove('dn'); }, 160);
    setTimeout(function () { cur.classList.remove('on'); }, 1400);
  }
  return { box: box, union: union, cam: cam, say: say, matte: matte, css: css, zoomMode: zoomMode, take: take, point: point, aim: aim, press: press };
})();
