/* =========================================================================
   CLASSIC — интерфейс и анимации варианта B «Студия» (без геймификации).
   Полоса-таймлайн с главами страницы, мягкое появление блоков (GSAP),
   красный маркер «дорисовывается», плавный скролл Lenis, 3D-сцена у плеера,
   табличка «Полный доступ» наклоняется за курсором.
   ========================================================================= */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;

  /* ---------- плавный скролл (только мышь; на телефоне — нативный) ---------- */
  let lenis = null;
  if (!reduce && fine && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.11 });
    if (gsap && ST) {
      lenis.on("scroll", ST.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  const headerH = () => ($(".top")?.offsetHeight || 68) + 8;
  const scrollToEl = el => {
    if (lenis) lenis.scrollTo(el, { offset: -headerH(), duration: 1.1 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - headerH(), behavior: reduce ? "auto" : "smooth" });
  };

  /* ---------- окна: блокировка скролла под окном ---------- */
  const anyOpen = () => $$("dialog").some(d => d.open);
  $$("dialog").forEach(d => d.addEventListener("close", () => {
    if (!anyOpen()) { document.documentElement.classList.remove("is-modal-open"); lenis?.start(); }
  }));
  document.addEventListener("lead:open", () => lenis?.stop());
  document.addEventListener("lead:close", () => { if (!anyOpen()) lenis?.start(); });

  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    requestAnimationFrame(() => scrollToEl(target));
  });

  document.addEventListener("lightbox:empty", e => {
    const el = e.detail?.el;
    if (!el) return;
    el.classList.remove("is-nudge");
    void el.offsetWidth;
    el.classList.add("is-nudge");
  });

  /* ---------- полоса-таймлайн с главами ---------- */
  function initChapters() {
    const bar = $("[data-chapters]");
    const secs = $$("[data-chapter]");
    if (!bar || !secs.length) return;
    bar.innerHTML = secs.map(s => `<span title="${s.dataset.chapter}"><i></i></span>`).join("");
    const segs = [...bar.children];
    segs.forEach((seg, i) => seg.addEventListener("click", () => scrollToEl(secs[i])));

    let ticking = false;
    const measure = () => segs.forEach((seg, i) => seg.style.setProperty("--g", secs[i].offsetHeight));
    const update = () => {
      ticking = false;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const line = window.scrollY + window.innerHeight * 0.35;
      let active = -1;
      secs.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const top = r.top + window.scrollY;
        const p = atEnd ? 1 : Math.min(1, Math.max(0, (line - top) / r.height));
        segs[i].style.setProperty("--p", (p * 100).toFixed(1));
        if (p > 0 && p < 1) active = i;
      });
      segs.forEach((seg, i) => seg.classList.toggle("is-active", i === active));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    new ResizeObserver(() => { measure(); update(); }).observe(document.body);
    measure();
    update();
  }

  /* ---------- 3D у плеера ---------- */
  let scene3d = null;
  function init3D() {
    const canvas = $("[data-hero-3d]");
    const hero = $(".hero");
    const player = $("[data-screen]");
    if (!canvas || !hero || !player || !window.Scene3D) return;
    const boot = () => window.Scene3D.start({ canvas, host: hero, anchor: player, reduce, preset: "classic" }).then(s => {
      scene3d = s;
      if (s) hero.classList.add("has-3d");
    });
    if ("requestIdleCallback" in window) requestIdleCallback(boot, { timeout: 1500 }); else setTimeout(boot, 500);
  }
  document.addEventListener("video:play", () => scene3d?.exit());

  /* ---------- табличка «Полный доступ»: наклон за курсором над всей карточкой ---------- */
  function initPlaque() {
    const el = $("[data-plaque]");
    if (!el || !fine || reduce) return;
    const area = el.closest(".offer") || el;
    let raf = 0;
    area.addEventListener("pointermove", e => {
      const r = el.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--rx", `${((0.5 - py) * 12).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${((px - 0.5) * 16).toFixed(2)}deg`);
        el.classList.add("is-tilting");
      });
    });
    area.addEventListener("pointerleave", () => {
      cancelAnimationFrame(raf);
      el.classList.remove("is-tilting");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  }

  /* ---------- анимации ---------- */
  function initMotion() {
    if (!gsap || reduce) return;
    if (ST) gsap.registerPlugin(ST);

    gsap.timeline({ defaults: { ease: "power3.out" } })
      .from(".hero .kicker", { y: 12, opacity: 0, duration: 0.4, clearProps: "transform,opacity" })
      .from(".hero__title", { y: 36, opacity: 0, duration: 0.7, clearProps: "transform,opacity" }, "-=.2")
      .fromTo(".hero .mark", { "--mk": "0%" }, { "--mk": "100%", duration: 0.7, ease: "power2.inOut" }, "-=.25")
      .from(".player", { y: 40, scale: 0.96, opacity: 0, duration: 0.8, clearProps: "transform,opacity" }, "-=.5")
      .from(".hero__lessons-title, .hero .checklist li, .hero__cta .btn", { y: 18, opacity: 0, duration: 0.45, stagger: 0.07, clearProps: "transform,opacity" }, "-=.45");

    if (!ST) return;
    const once = (trigger, start = "top 86%") => ({ trigger, start, once: true });
    $$(".sec-head").forEach(h => {
      gsap.from(h.children, { y: 28, duration: 0.7, stagger: 0.08, ease: "power3.out", clearProps: "transform", scrollTrigger: once(h) });
    });
    ST.batch(".proof", {
      start: "top 92%",
      once: true,
      onEnter: els => gsap.from(els, { y: 40, duration: 0.7, ease: "power3.out", stagger: 0.08, clearProps: "transform" }),
    });
    $$(".pl-item").forEach(item => {
      gsap.from(item, { y: 44, duration: 0.7, ease: "power3.out", clearProps: "transform", scrollTrigger: once(item, "top 90%") });
    });
    gsap.from(".case", { y: 40, duration: 0.7, ease: "power3.out", stagger: 0.08, clearProps: "transform", scrollTrigger: once(".cases", "top 88%") });
    gsap.from(".offer", { y: 50, duration: 0.8, ease: "power3.out", clearProps: "transform", scrollTrigger: once(".offer", "top 88%") });
    gsap.from(".offer__disc", { scale: 0.6, rotate: -8, duration: 0.6, ease: "back.out(2.4)", delay: 0.2, clearProps: "transform", scrollTrigger: once(".offer", "top 80%") });
    gsap.from(".plaque__frame", { y: 40, rotateX: 16, opacity: 0, duration: 0.9, ease: "power3.out", clearProps: "transform,opacity", scrollTrigger: once(".offer", "top 80%") });
    gsap.from(".plaque__sticker", { scale: 0.4, rotate: -40, opacity: 0, duration: 0.6, ease: "back.out(2)", delay: 0.45, clearProps: "transform,opacity", scrollTrigger: once(".offer", "top 80%") });
  }

  function boot() {
    initChapters();
    initMotion();
    initPlaque();
    init3D();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
