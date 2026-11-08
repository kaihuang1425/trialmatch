/* Relay board kit: shared micro-interaction helpers. Plain browser JS, no build step.
   Exposes window.Kit. Every board uses these so motion feels like one product. */
(function () {
  "use strict";

  const reduced = () =>
    document.documentElement.dataset.motion === "off" ||
    (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- Icons: inline stroke SVG, never emoji ---------- */
  const P = {
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    queue: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5"/><path d="M16 4.5a3.5 3.5 0 010 7M21 20c-.5-2.6-1.8-4.1-3.6-4.7"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
    history: '<path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0118.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }

  /* ---------- State glyphs: shape AND colour ---------- */
  const GLYPH = {
    supported: '<circle cx="9" cy="9" r="8" fill="currentColor"/><path d="M5.2 9.3l2.5 2.5 5-5.2" style="stroke:var(--glyph-ink,#fff)" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    conflicting: '<path d="M9 1.2l7.8 7.8L9 16.8 1.2 9z" fill="currentColor"/><path d="M6.6 6.6l4.8 4.8M11.4 6.6l-4.8 4.8" style="stroke:var(--glyph-ink,#fff)" stroke-width="1.8" stroke-linecap="round"/>',
    unknown: '<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3.2 2.6"/>',
    needs_review: '<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 1.8a7.2 7.2 0 010 14.4z" fill="currentColor"/>',
  };
  const STATE_LABEL = { supported: "Supported", conflicting: "Conflicting", unknown: "Unknown", needs_review: "Needs clinical review" };
  function glyph(state, label) {
    return '<svg class="glyph glyph--' + state + '" viewBox="0 0 18 18" role="img" aria-label="' + (label || STATE_LABEL[state]) + '">' + GLYPH[state] + "</svg>";
  }

  /* ---------- Replay a CSS animation by alternating A/B keyframe names ---------- */
  function replay(el, base, dur, ease) {
    if (!el) return;
    const next = el.dataset.rp === "A" ? "B" : "A";
    el.dataset.rp = next;
    el.style.animation = base + next + " " + (dur || 240) + "ms " + (ease || "cubic-bezier(.2,.8,.2,1)") + " both";
  }

  /* ---------- Count roll: digits travel up (increase) or down (decrease) ---------- */
  function roll(el, value) {
    if (!el) return;
    const prev = el.dataset.v == null ? null : Number(el.dataset.v);
    el.dataset.v = String(value);
    el.setAttribute("aria-label", String(value));
    if (prev === null || prev === value || reduced()) { el.textContent = String(value); return; }
    const up = value > prev;
    el.classList.add("roll");
    el.innerHTML = "";
    const col = document.createElement("span");
    col.className = "roll__col";
    col.setAttribute("aria-hidden", "true");
    col.innerHTML = up ? "<span>" + prev + "</span><br><span>" + value + "</span>" : "<span>" + value + "</span><br><span>" + prev + "</span>";
    col.style.transform = up ? "translateY(0)" : "translateY(-1.2em)";
    el.appendChild(col);
    void col.offsetWidth;
    col.style.transform = up ? "translateY(-1.2em)" : "translateY(0)";
    const done = () => { if (el.dataset.v === String(value)) { el.classList.remove("roll"); el.textContent = String(value); } };
    col.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 400);
  }

  /* ---------- FLIP: animate list reorders ---------- */
  function flip(container, mutate, opts) {
    const o = Object.assign({ dur: 300, sel: "[data-flip]" }, opts || {});
    const before = new Map();
    container.querySelectorAll(o.sel).forEach((el) => before.set(el.dataset.flip, el.getBoundingClientRect()));
    mutate();
    if (reduced()) return;
    container.querySelectorAll(o.sel).forEach((el) => {
      const b = before.get(el.dataset.flip);
      if (!b) { el.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }); return; }
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: o.dur, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
  }

  /* ---------- Fly a ghost of `from` to `to` (item leaves toward its destination) ---------- */
  function flyTo(fromEl, toEl, opts) {
    const o = Object.assign({ dur: 320 }, opts || {});
    if (!fromEl || !toEl || reduced()) return Promise.resolve();
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const ghost = fromEl.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    Object.assign(ghost.style, { position: "fixed", left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px", margin: 0, zIndex: 80, pointerEvents: "none", transformOrigin: "top left" });
    ghost.setAttribute("aria-hidden", "true");
    document.body.appendChild(ghost);
    const sx = Math.max(b.width / a.width, 0.08), sy = Math.max(b.height / a.height, 0.08);
    const anim = ghost.animate([
      { transform: "none", opacity: 1, borderRadius: "18px" },
      { transform: "translate(" + (b.left - a.left) + "px," + (b.top - a.top) + "px) scale(" + sx + "," + sy + ")", opacity: 0.15, borderRadius: "40px" },
    ], { duration: o.dur, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" });
    // timers still run in a throttled/background tab where the animation timeline may not advance
    const fallback = new Promise((r) => setTimeout(r, o.dur + 250));
    return Promise.race([anim.finished.catch(() => {}), fallback]).then(() => ghost.remove());
  }

  /* ---------- The one toast ---------- */
  let toastSeq = 0;
  function host() {
    let h = document.querySelector(".toasts");
    if (!h) { h = document.createElement("div"); h.className = "toasts"; h.setAttribute("role", "status"); h.setAttribute("aria-live", "polite"); document.body.appendChild(h); }
    return h;
  }
  /** toast({ msg, sub, icon, action: { label, run, doneLabel }, onExpire }) → { id, dismiss } */
  function toast(opts) {
    const h = host();
    const id = "t" + ++toastSeq;
    const el = document.createElement("div");
    el.className = "toast"; el.dataset.toast = id;
    el.innerHTML =
      '<span class="toast__icon">' + icon(opts.icon || "check") + "</span>" +
      '<div class="toast__body"><div class="toast__msg"></div>' + (opts.sub ? '<div class="toast__sub"></div>' : "") + "</div>" +
      (opts.action ? '<button class="toast__act" type="button"></button>' : "") +
      '<span class="toast__drain" aria-hidden="true"></span>';
    el.querySelector(".toast__msg").textContent = opts.msg;
    if (opts.sub) el.querySelector(".toast__sub").textContent = opts.sub;
    // at most two: older tucks behind, oldest leaves
    const live = [...h.querySelectorAll(".toast:not([data-leaving])")];
    if (live.length >= 2) dismissEl(live[0]);
    live.forEach((t) => (t.dataset.behind = "true"));
    h.appendChild(el);
    let used = false;
    const btn = el.querySelector(".toast__act");
    if (btn) {
      btn.textContent = opts.action.label;
      btn.addEventListener("click", () => {
        if (used) return; used = true;
        opts.action.run && opts.action.run();
        btn.textContent = opts.action.doneLabel || "Undone"; btn.dataset.done = "true";
        setTimeout(() => dismissEl(el), 900);
      });
    }
    const drain = el.querySelector(".toast__drain");
    drain.addEventListener("animationend", () => { if (!used && opts.onExpire) opts.onExpire(); dismissEl(el); });
    return { id, el, dismiss: () => dismissEl(el) };
  }
  function dismissEl(el) {
    if (!el || el.dataset.leaving) return;
    if (el.contains(document.activeElement)) { const fb = document.querySelector("[data-focus-fallback]"); if (fb) fb.focus({ preventScroll: true }); }
    el.dataset.leaving = "true";
    const done = () => {
      el.remove();
      const rest = [...document.querySelectorAll(".toasts .toast:not([data-leaving])")];
      rest.forEach((t, i) => (t.dataset.behind = i < rest.length - 1 ? "true" : "false"));
    };
    if (reduced()) done(); else { el.addEventListener("animationend", done, { once: true }); setTimeout(done, 400); }
  }

  /* ---------- Theme + motion toggles for the board chrome ---------- */
  function setTheme(t) { if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; }
  function setMotion(on) { if (on) delete document.documentElement.dataset.motion; else document.documentElement.dataset.motion = "off"; }

  window.Kit = { icon, glyph, STATE_LABEL, replay, roll, flip, flyTo, toast, reduced, setTheme, setMotion, wait: (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms)) };
})();
