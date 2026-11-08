// Injected into the landing page by record.py. Adds a "camera" (a transform on the page's .tm root that frames one
// element) and a caption overlay in the page's own type. Nothing here ships with the site.
window.REEL = (function () {
  var W = 1080, H = 1350;
  var tm = document.querySelector('.tm');
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
    '#reel-cap .t i{font-style:normal;color:#8A8F95}'
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
  return { box: box, union: union, cam: cam, say: say, matte: matte, css: css, zoomMode: zoomMode };
})();
