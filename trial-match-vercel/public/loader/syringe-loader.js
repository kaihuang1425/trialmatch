/* Trial Match loading screen: a syringe fills while the page loads, three steps grow into a list, then Ready.
   Include it as the first thing in <body>:
     <script src="/loader/syringe-loader.js" data-wait="load"></script>   finishes when the page has loaded (landing page)
     <script src="/loader/syringe-loader.js" data-wait="app"></script>    finishes when the page calls TMLoader.done() (demo)
   data-max (ms) is the longest it waits before finishing anyway, so the screen never sticks if a connection fails.
   window.TMLoader.leaving is a promise that resolves as the screen starts to slide away (start page animations then).
   While it shows, <html> has the class tm-loading; when it leaves, tm-ready. */
(function () {
  if (window.TMLoader) return;
  var me = document.currentScript;
  var wait = (me && me.getAttribute('data-wait')) || 'load';
  var maxMs = Number((me && me.getAttribute('data-max')) || 8000);
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var html = document.documentElement;
  var leaveResolve;
  var api = { done: function () { ready = true; }, leaving: new Promise(function (r) { leaveResolve = r; }) };
  window.TMLoader = api;
  var ready = false;
  html.classList.add('tm-loading');

  var MONO = "'Google Sans Code','Roboto Mono',ui-monospace,monospace";
  var GRAD = '<stop offset="0" stop-color="#4285F4"></stop><stop offset=".55" stop-color="#9B72CB"></stop><stop offset="1" stop-color="#D96570"></stop>';
  var css = '' +
    '#tml{position:fixed;inset:0;z-index:2147483000;background:#0E0E0F;color:#E3E3E3;font-family:"Google Sans Flex","Google Sans",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;transition:transform .65s cubic-bezier(.7,0,.2,1);will-change:transform}' +
    '#tml.is-out{transform:translateY(-100%)}' +
    '#tml .tml-halo{position:absolute;left:50%;top:40%;width:min(980px,140vw);height:520px;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(66,133,244,.26),rgba(155,114,203,.14) 50%,rgba(217,101,112,.05) 75%,transparent);opacity:.45;transition:opacity .5s;pointer-events:none}' +
    '#tml.is-full .tml-halo{opacity:.9}' +
    '#tml .tml-brand{position:absolute;top:44px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:10px;font-size:16px;font-weight:500;color:#C4C7C5}' +
    '#tml .tml-stage{position:relative;width:min(680px,92vw);margin-top:-30px}' +
    '#tml .tml-stage svg{display:block;width:100%;height:auto;overflow:visible}' +
    '#tml .tml-tag{position:absolute;top:calc(30% - 46px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;font-family:' + MONO + ';font-size:15px;font-weight:500;text-shadow:0 0 14px rgba(168,199,250,.6);transition:opacity .3s}' +
    '#tml .tml-tag i{display:block;width:1px;height:16px;background:linear-gradient(180deg,rgba(168,199,250,.6),rgba(168,199,250,0))}' +
    '#tml.is-push .tml-tag{opacity:0}' +
    '#tml .tml-shine{animation:tmlShine 1.6s linear infinite}' +
    '#tml .tml-drop{opacity:0;transform-box:fill-box;transform-origin:center}' +
    '#tml.is-push .tml-drop{animation:tmlDrop .5s ease-out forwards}' +
    '#tml .tml-caps{position:relative;width:min(560px,86vw);--fs:40px;--ch:48px;--ds:.42;--so:60px;--ss:28px;height:var(--ch);margin-top:150px}' +
    '@media (max-width:600px){#tml .tml-caps{--fs:25px;--ch:34px;--ds:.62;--so:46px;--ss:23px;margin-top:118px}}' +
    '#tml .tml-step{position:absolute;left:0;top:0;height:var(--ch);display:flex;align-items:center;gap:calc(var(--fs) * .35);white-space:nowrap;font-size:var(--fs);line-height:1.2;letter-spacing:-.02em;transform-origin:0 50%;opacity:0;transform:translateY(24px);transition:transform .6s cubic-bezier(.2,.8,.2,1),opacity .45s ease}' +
    '#tml .tml-step.is-active{opacity:1;transform:none}' +
    '#tml .tml-step.is-done{opacity:.92;transform:translateY(calc(-1 * (var(--so) + var(--slot, 0) * var(--ss)))) scale(var(--ds))}' +
    '#tml .tml-ic{position:relative;width:.85em;height:.85em;flex:none}' +
    '#tml .tml-ic svg{position:absolute;inset:0;width:100%;height:100%}' +
    '#tml .tml-spin{opacity:0;transition:opacity .2s;animation:tmlSpin .9s linear infinite}' +
    '#tml .is-active .tml-spin{opacity:1}' +
    '#tml .is-done .tml-spin,#tml .tml-ready .tml-spin{opacity:0}' +
    '#tml .tml-chk{opacity:0;transform:scale(.4)}' +
    '#tml .is-done .tml-chk,#tml .tml-ready.is-active .tml-chk{animation:tmlPop .45s cubic-bezier(.2,1.6,.4,1) forwards}' +
    '#tml .tml-txt{position:relative}' +
    '#tml .tml-txt .pl{opacity:0;transition:opacity .3s .12s}' +
    '#tml .tml-txt .sh{position:absolute;left:0;top:0;opacity:0;transition:opacity .2s;background:linear-gradient(90deg,#E3E3E3 0%,#E3E3E3 38%,#A8C7FA 46%,#D7AEFB 52%,#F2B8B5 58%,#E3E3E3 66%,#E3E3E3 100%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 22px rgba(155,114,203,.55)) drop-shadow(0 8px 24px rgba(0,0,0,.6));animation:tmlShim 1.4s linear infinite}' +
    '#tml .is-active:not(.is-done):not(.tml-ready) .tml-txt .sh{opacity:1}' +
    '#tml .is-done .tml-txt .pl,#tml .tml-ready.is-active .tml-txt .pl{opacity:1}' +
    '#tml .tml-ready .tml-txt{filter:drop-shadow(0 0 22px rgba(109,213,140,.45))}' +
    '#tml .tml-det{font-family:' + MONO + ';font-size:.75em;color:#9AA0A6;margin-left:.1em;opacity:0;transition:opacity .3s .25s}' +
    '#tml .is-done .tml-det{opacity:1}' +
    '@keyframes tmlSpin{to{transform:rotate(360deg)}}' +
    '@keyframes tmlShim{0%{background-position:100% 0}100%{background-position:0% 0}}' +
    '@keyframes tmlPop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.18)}100%{opacity:1;transform:scale(1)}}' +
    '@keyframes tmlShine{from{transform:translateX(-120px)}to{transform:translateX(420px)}}' +
    '@keyframes tmlDrop{0%{opacity:0;transform:translateX(0) scale(.2)}45%{opacity:1;transform:translateX(4px) scale(1)}100%{opacity:0;transform:translateX(24px) scale(.6)}}' +
    '@media (prefers-reduced-motion:reduce){#tml *{animation:none!important;transition:none!important}#tml{transition:opacity .2s}#tml.is-out{transform:none;opacity:0}}';

  var CHECK = '<svg class="tml-chk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#6DD58C"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#0A3818" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  var SPIN = '<svg class="tml-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="url(#tml-sp)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="20 60"></circle></svg>';
  function step(text, det) {
    return '<div class="tml-step"><span class="tml-ic">' + SPIN + CHECK + '</span><span class="tml-txt"><span class="pl">' + text + '</span><span class="sh" aria-hidden="true">' + text + '</span></span><span class="tml-det">' + det + '</span></div>';
  }
  var ticks = '';
  for (var x = 184; x <= 448; x += 33) ticks += '<line x1="' + x + '" y1="' + ((x - 184) % 66 ? 114 : 106) + '" x2="' + x + '" y2="124"></line>';
  var markup = '' +
    '<div class="tml-halo" aria-hidden="true"></div>' +
    '<div class="tml-brand" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 32 32"><rect x="2" y="11" width="28" height="10" rx="5" fill="#7B9BFE"></rect><rect x="11" y="2" width="10" height="28" rx="5" fill="#E48FB0"></rect><rect x="11" y="11" width="10" height="10" fill="#B48BE9"></rect></svg>Trial Match</div>' +
    '<div class="tml-stage" aria-hidden="true">' +
      '<div class="tml-tag"><span class="tml-pct">0%</span><i></i></div>' +
      '<svg viewBox="0 0 680 180"><defs>' +
        '<linearGradient id="tml-lq" x1="0" y1="0" x2="1" y2="0">' + GRAD + '</linearGradient>' +
        '<linearGradient id="tml-sp" x1="0" y1="0" x2="1" y2="1">' + GRAD + '</linearGradient>' +
        '<linearGradient id="tml-sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"></stop><stop offset=".5" stop-color="#fff" stop-opacity=".45"></stop><stop offset="1" stop-color="#fff" stop-opacity="0"></stop></linearGradient>' +
        '<clipPath id="tml-in"><rect x="122" y="56" width="360" height="68" rx="12"></rect></clipPath></defs>' +
        '<line x1="512" y1="90" x2="650" y2="90" stroke="#C4C7C5" stroke-width="2.5" stroke-linecap="round"></line>' +
        '<polygon points="484,66 512,80 512,100 484,114" fill="#5F6368"></polygon>' +
        '<g clip-path="url(#tml-in)"><rect class="tml-liquid" x="154" y="56" width="330" height="68" fill="url(#tml-lq)" transform="translate(484 0) scale(0 1) translate(-484 0)" style="filter:drop-shadow(0 0 14px rgba(155,114,203,.7))"></rect><rect class="tml-shine" x="120" y="56" width="70" height="68" fill="url(#tml-sh)" opacity=".7"></rect></g>' +
        '<rect x="120" y="54" width="364" height="72" rx="14" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"></rect>' +
        '<rect x="134" y="60" width="336" height="6" rx="3" fill="#fff" opacity=".08"></rect>' +
        '<g stroke="rgba(255,255,255,.4)" stroke-width="1.2" stroke-linecap="round">' + ticks + '</g>' +
        '<rect x="112" y="26" width="10" height="128" rx="4" fill="#5F6368"></rect>' +
        '<g class="tml-plunger" transform="translate(330 0)"><rect x="14" y="40" width="12" height="100" rx="4" fill="#80868B"></rect><rect x="26" y="84" width="112" height="12" rx="3" fill="#5F6368"></rect><rect x="136" y="58" width="18" height="64" rx="5" fill="#9AA0A6"></rect></g>' +
        '<g class="tml-drop"><path d="M656 90c0-4 6-9 6-9s6 5 6 9a6 6 0 0 1-12 0z" transform="rotate(90 662 90)" fill="#F28B82"></path></g>' +
      '</svg>' +
    '</div>' +
    '<div class="tml-caps">' +
      step('Reading the record', '4 facts, each quoted') +
      step('Checking entry rules', '9 of 9 met') +
      step('Finding trials that fit', 'LT-301 · London') +
      '<div class="tml-step tml-ready"><span class="tml-ic">' + CHECK + '</span><span class="tml-txt"><span class="pl">Ready</span></span></div>' +
    '</div>';

  var root, steps, liquid, plunger, tag, pct;
  function mount() {
    var st = document.createElement('style'); st.id = 'tml-css'; st.textContent = css; document.head.appendChild(st);
    if (!document.querySelector('link[href*="Google+Sans+Code"]')) {
      var f = document.createElement('link'); f.rel = 'stylesheet';
      f.href = 'https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@400;500&display=swap';
      document.head.appendChild(f);
    }
    root = document.createElement('div');
    root.id = 'tml'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite'); root.setAttribute('aria-label', 'Loading Trial Match');
    root.innerHTML = markup;
    document.body.insertBefore(root, document.body.firstChild);
    steps = root.querySelectorAll('.tml-step');
    liquid = root.querySelector('.tml-liquid'); plunger = root.querySelector('.tml-plunger');
    tag = root.querySelector('.tml-tag'); pct = root.querySelector('.tml-pct');
    steps[0].classList.add('is-active');
    requestAnimationFrame(frame);
  }

  function show(v) {   // v: 0 empty, 1 full
    liquid.setAttribute('transform', 'translate(484 0) scale(' + v.toFixed(4) + ' 1) translate(-484 0)');
    plunger.setAttribute('transform', 'translate(' + (330 * (1 - v)).toFixed(2) + ' 0)');
    tag.style.left = ((145 + 330 * (1 - v)) / 680 * 100).toFixed(3) + '%';
  }
  function finish(i) {   // step i is done: newest done sits just above the active line, older ones move up
    steps[i].classList.add('is-done');
    for (var j = 0; j <= i; j++) steps[j].style.setProperty('--slot', String(i - j));
    if (steps[i + 1]) steps[i + 1].classList.add('is-active');
  }

  var MIN = reduce ? 600 : 1500;
  var t0 = performance.now(), last = t0, p = 0, at = 0, phase = 'fill', pushAt = 0;
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function frame(now) {
    var dt = Math.min(64, now - last); last = now;
    var el = now - t0;
    if (phase === 'fill') {
      var target = ready && el >= MIN ? 1 : 0.86 * easeOut(Math.min(1, el / MIN));
      p = reduce ? target : p + (target - p) * Math.min(1, dt / 110);
      if (target === 1 && p > 0.995) p = 1;
      show(p); pct.textContent = Math.round(p * 100) + '%';
      if (p >= 0.66) root.classList.add('is-full');
      while (at < 3 && p >= [0.33, 0.66, 1][at]) { finish(at); at++; }
      if (at === 3) { phase = 'ready'; pushAt = now + (reduce ? 0 : 560); }
    } else if (phase === 'ready' && now >= pushAt) {
      phase = 'push'; pushAt = now; root.classList.add('is-push');
    } else if (phase === 'push') {
      var k = reduce ? 1 : Math.min(1, (now - pushAt) / 420);
      show(1 - k * k);
      if (k >= 1) { leave(); return; }
    }
    requestAnimationFrame(frame);
  }
  var left = false;
  function leave() {
    if (left || !root) return;
    left = true;
    root.classList.add('is-out');
    html.classList.remove('tm-loading'); html.classList.add('tm-ready');
    leaveResolve();
    setTimeout(function () { if (root && root.parentNode) root.parentNode.removeChild(root); }, reduce ? 250 : 750);
  }

  if (wait === 'load') {
    if (document.readyState === 'complete') ready = true;
    else window.addEventListener('load', function () { ready = true; });
  }
  setTimeout(function () { ready = true; }, maxMs);
  setTimeout(leave, maxMs + 3000);   // last resort if animation frames never run (a tab hidden the whole time)
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
