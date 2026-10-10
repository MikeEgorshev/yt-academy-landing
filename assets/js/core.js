/* =========================================================================
   CORE — общая логика воронки для обоих вариантов сайта.
   Видео с YouTube, счётчик мест, окно бронирования (имя + страна + номер),
   отправка в Google Таблицу / Telegram, переход в бота, лайтбокс для скринов,
   карусель кейсов. От дизайна не зависит: работает через data-атрибуты и
   сообщает о событиях через CustomEvent (video:play, lead:open, lead:success …).
   ========================================================================= */
(() => {
  "use strict";

  const CFG = window.SITE_CONFIG || {};
  const VARIANT = document.querySelector("[data-variant]")?.dataset.variant || "default";
  const COUNTRIES = Array.isArray(CFG.countries) && CFG.countries.length
    ? CFG.countries
    : [{ code: "KZ", dial: "+7", digits: 10, label: "+7" }];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const session = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  };

  /* ---------- аналитика ---------- */
  function track(goal, params = {}) {
    try { if (CFG.metrikaId && typeof window.ym === "function") window.ym(CFG.metrikaId, "reachGoal", goal, { variant: VARIANT, ...params }); } catch { /* нет метрики */ }
    try { (window.dataLayer = window.dataLayer || []).push({ event: goal, variant: VARIANT, ...params }); } catch { /* нет dataLayer */ }
  }

  /* ---------- UTM-метки: запоминаем на время сессии ---------- */
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const utm = (() => {
    const q = new URLSearchParams(location.search);
    const fresh = {};
    UTM_KEYS.forEach(k => { const v = q.get(k); if (v) fresh[k] = v.slice(0, 200); });
    const merged = Object.keys(fresh).length ? fresh : session.get("lead:utm", {});
    session.set("lead:utm", merged);
    return merged;
  })();

  /* ---------- видео: лёгкая вставка YouTube (iframe только по клику) ---------- */
  function initVideo() {
    $$("[data-yt]").forEach(box => {
      const id = (box.dataset.yt || CFG.youtubeId || "").trim();
      const poster = $("[data-yt-poster]", box);
      if (id) {
        box.classList.add("has-video");
        if (poster && !poster.getAttribute("src")) {
          poster.addEventListener("error", () => { poster.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }, { once: true });
          poster.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
          poster.hidden = false;
        }
      }
      const trigger = $("[data-yt-play]", box) || box;
      trigger.addEventListener("click", () => {
        if (box.classList.contains("is-playing")) return;
        if (!id) {
          box.classList.remove("is-nudge");
          void box.offsetWidth; // перезапуск CSS-анимации
          box.classList.add("is-nudge");
          emit("video:missing", { box });
          return;
        }
        const iframe = document.createElement("iframe");
        iframe.className = "yt-frame";
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
        iframe.title = box.dataset.ytTitle || "Видео";
        iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        (box.querySelector("[data-yt-view]") || box).appendChild(iframe);
        box.classList.add("is-playing");
        emit("video:play", { id, box });
        track("video_play");
      });
    });
  }

  /* ---------- таймер (если на странице есть [data-countdown]) ---------- */
  function initCountdown() {
    const els = $$("[data-countdown]");
    if (!els.length) return;
    const end = Date.parse(CFG.offerEndsAt || "");
    const pad = n => String(n).padStart(2, "0");
    const tick = () => {
      const left = Number.isNaN(end) ? 0 : Math.max(0, end - Date.now());
      const s = Math.floor(left / 1000);
      const parts = { d: pad(Math.floor(s / 86400)), h: pad(Math.floor((s % 86400) / 3600)), m: pad(Math.floor((s % 3600) / 60)), s: pad(s % 60) };
      els.forEach(el => {
        const slots = $$("[data-cd]", el);
        if (slots.length) slots.forEach(x => { x.textContent = parts[x.dataset.cd]; });
        else el.textContent = `${parts.d}:${parts.h}:${parts.m}:${parts.s}`;
        el.classList.toggle("is-expired", left === 0);
      });
      if (left > 0) setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
  }

  /* ---------- счётчик мест ----------
     Старт — spotsLeft из config.js, дальше примерно раз в spotsEveryMs одно место «занимают», но не ниже spotsMin.
     Паузы неровные: каждая случайно отклоняется от spotsEveryMs на ±spotsJitter (0.4 = ±40%).
     Счёт у каждого посетителя свой и после перезагрузки продолжается (пока в config.js те же цифры).
     Когда место уходит, над ползунком разбивается сердечко. */
  const SPOTS_KEY = "academy-spots";
  const HEART = {
    game: '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path fill="#ff0f2d" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/><path fill="#ff9aa8" d="M1 1h1v1H1z"/></svg>',
    classic: '<svg viewBox="0 1 24 22"><path fill="#ff0f2d" stroke="#f5f0ea" stroke-width="1.6" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  };

  // сердечко из двух половинок на конце заполненной части полоски (на «ползунке»); половинки разлетаются (стили — в CSS варианта)
  function heartBreak(bar, frac) {
    const host = bar.offsetParent || bar.parentElement;
    const art = HEART[VARIANT] || HEART.classic;
    const el = document.createElement("span");
    el.className = "hb";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--x", `${(bar.offsetLeft + bar.offsetWidth * frac).toFixed(1)}px`);
    el.style.setProperty("--y", `${(bar.offsetTop + bar.offsetHeight / 2).toFixed(1)}px`);
    el.innerHTML = `<span class="hb__half hb__half--l">${art}</span><span class="hb__half hb__half--r">${art}</span>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function initSpots() {
    const total = Math.max(0, Number(CFG.spotsTotal) || 0);
    const start = Math.max(0, Math.min(total, Number(CFG.spotsLeft) || 0));
    const floor = Math.max(0, Math.min(start, Number(CFG.spotsMin) || 0));
    const every = Math.max(0, Number(CFG.spotsEveryMs) || 0);
    const jitter = Math.max(0, Math.min(0.9, Number(CFG.spotsJitter ?? 0.4) || 0));
    const nums = $$("[data-spots-left]");
    const bars = $$("[data-spots-bar]");

    let left = start;
    try {
      const s = JSON.parse(localStorage.getItem(SPOTS_KEY) || "null");
      if (s && s.total === total && s.start === start && s.left >= floor && s.left <= start) left = s.left;
    } catch { /* приватный режим */ }
    const save = () => { try { localStorage.setItem(SPOTS_KEY, JSON.stringify({ total, start, left })); } catch { /* приватный режим */ } };
    const takenPct = n => (total ? ((total - n) / total) * 100 : 0);
    const paint = () => {
      nums.forEach(el => { el.textContent = left; });
      bars.forEach(el => el.style.setProperty("--v", takenPct(left).toFixed(1)));
    };
    const tick = el => { el.classList.remove("is-tick"); void el.offsetWidth; el.classList.add("is-tick"); };

    $$("[data-spots-total]").forEach(el => { el.textContent = total; });
    paint();
    if (!every || !total || !bars.length) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let onScreen = false;
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(bars[0]);

    const takeOne = () => {
      const before = takenPct(left) / 100;
      left -= 1;
      save();
      emit("spots:taken", { left });
      if (!onScreen || reduce) { paint(); return; }
      heartBreak(bars[0], before);
      setTimeout(() => { paint(); nums.forEach(tick); }, 520); // цифра и полоска меняются, когда сердечко раскалывается
    };
    const schedule = () => {
      if (left <= floor) return;
      const delay = every * (1 - jitter + Math.random() * 2 * jitter);
      setTimeout(() => {
        if (!document.hidden && left > floor) takeOne(); // пока вкладка скрыта, места не уходят
        schedule();
      }, delay);
    };
    schedule();
  }

  /* ---------- номер телефона: только цифры после кода страны, с разбивкой на группы ---------- */
  const GROUPS = { 10: [3, 3, 2, 2], 9: [2, 3, 2, 2], 8: [2, 3, 3] };
  function nationalDigits(raw, country) {
    let d = String(raw).replace(/\D/g, "");
    const dial = country.dial.replace(/\D/g, "");
    // вставили номер целиком: с кодом страны или с «8» в начале (для +7)
    if (d.length > country.digits && d.startsWith(dial) && d.length - dial.length === country.digits) d = d.slice(dial.length);
    else if (dial === "7" && d.length === 11 && d[0] === "8") d = d.slice(1);
    return d.slice(0, country.digits);
  }
  function formatNational(d, country) {
    const groups = GROUPS[country.digits] || [country.digits];
    const out = [];
    let i = 0;
    for (const g of groups) {
      if (i >= d.length) break;
      out.push(d.slice(i, i + g));
      i += g;
    }
    return out.map((part, k) => (k === 0 ? part : (k === 1 ? " " : "-") + part)).join("");
  }

  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- окно бронирования ---------- */
  let openLead = () => {};

  function initLeadForm() {
    const dlg = $("#lead-modal");
    if (!dlg) return;
    const form = $("form", dlg);
    const { name, phone } = form.elements;
    const countrySel = form.elements.country;
    const submit = $("[type=submit]", form);
    const submitText = submit ? submit.textContent.trim() : "";
    const steps = $$("[data-step]", dlg);
    let source = "hero";
    let prevDigits = "";
    let redirectTimer = null;

    if (countrySel) countrySel.innerHTML = COUNTRIES.map((c, i) => `<option value="${i}">${c.label}</option>`).join("");
    const country = () => COUNTRIES[Number(countrySel?.value) || 0] || COUNTRIES[0];

    const setStep = step => {
      steps.forEach(el => { el.hidden = el.dataset.step !== step; });
      dlg.dataset.state = step;
    };
    const fieldOf = input => input.closest("[data-field]") || input.parentElement;
    const setError = (input, text) => {
      const f = fieldOf(input);
      f.classList.toggle("is-invalid", !!text);
      const err = $("[data-err]", f);
      if (err) err.textContent = text || "";
    };

    openLead = (src = "hero", trigger = null) => {
      source = src;
      dlg.dataset.source = src;
      clearTimeout(redirectTimer);
      setStep("form");
      if (submit) { submit.disabled = false; submit.textContent = submitText; }
      if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
      document.documentElement.classList.add("is-modal-open");
      if (matchMedia("(hover: hover)").matches) setTimeout(() => name.focus({ preventScroll: true }), 80);
      emit("lead:open", { source: src, trigger });
      track("lead_open", { source: src });
    };

    const close = () => {
      clearTimeout(redirectTimer);
      if (typeof dlg.close === "function" && dlg.open) dlg.close();
      else { dlg.removeAttribute("open"); document.documentElement.classList.remove("is-modal-open"); }
    };

    dlg.addEventListener("close", () => {
      clearTimeout(redirectTimer);
      document.documentElement.classList.remove("is-modal-open");
      emit("lead:close", { source });
    });
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); }); // клик по фону
    $$("[data-close]", dlg).forEach(b => b.addEventListener("click", close));
    $$("[data-retry]", dlg).forEach(b => b.addEventListener("click", () => setStep("form")));

    document.addEventListener("click", e => {
      const t = e.target.closest("[data-lead]");
      if (!t) return;
      e.preventDefault();
      openLead(t.dataset.lead || "hero", t);
    });

    const reformat = e => {
      const c = country();
      let digits = nationalDigits(phone.value, c);
      if (e && e.inputType && e.inputType.startsWith("delete") && digits === prevDigits) digits = digits.slice(0, -1);
      phone.value = formatNational(digits, c);
      prevDigits = digits;
    };
    phone.addEventListener("input", e => { reformat(e); setError(phone, ""); });
    countrySel?.addEventListener("change", () => { reformat(); setError(phone, ""); phone.focus(); });
    name.addEventListener("input", () => setError(name, ""));

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (form.elements.website?.value) return; // ловушка для ботов
      const nm = name.value.trim().replace(/\s+/g, " ");
      const c = country();
      const digits = nationalDigits(phone.value, c);
      let ok = true;
      if (!nm) { setError(name, "Введите имя"); ok = false; } else setError(name, "");
      if (digits.length !== c.digits) { setError(phone, `Введите ${c.digits} цифр номера после ${c.dial}`); ok = false; } else setError(phone, "");
      if (!ok) {
        (nm ? phone : name).focus();
        emit("lead:invalid", {});
        return;
      }

      const lead = {
        id: makeId(),
        name: nm.slice(0, 80),
        phone: c.dial + digits,
        country: c.code || "",
        source,
        variant: VARIANT,
        page: location.href.split("#")[0],
        referrer: document.referrer || "",
        ts: new Date().toISOString(),
        ...utm,
      };

      if (submit) { submit.disabled = true; submit.textContent = "Отправляем…"; }
      emit("lead:sending", lead);
      try {
        await sendLead(lead);
      } catch (err) {
        console.warn("Заявка не отправилась:", err);
        if (submit) { submit.disabled = false; submit.textContent = submitText; }
        setStep("error");
        emit("lead:error", { lead, err });
        return;
      }
      setStep("done");
      emit("lead:success", lead);
      track("lead_submit", { source });
      form.reset();
      prevDigits = "";
      goToBot(lead);
    });

    function goToBot(lead) {
      const link = $("[data-bot-link]", dlg);
      let url = "";
      if (CFG.telegramBot) {
        try {
          const u = new URL(CFG.telegramBot);
          u.searchParams.set("start", `${lead.source}-${lead.variant}-${lead.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64));
          url = u.toString();
        } catch { url = ""; }
      }
      if (link) { link.hidden = !url; if (url) link.href = url; }
      if (url) redirectTimer = setTimeout(() => { window.location.href = url; }, Math.max(300, CFG.redirectDelayMs ?? 1500));
    }
  }

  async function sendLead(lead) {
    if (!CFG.leadEndpoint) {
      console.info("[демо-режим] заявка не отправлена — заполни leadEndpoint в config.js", lead);
      await wait(700);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      if (CFG.leadEndpoint.startsWith("/")) {
        // свой бэкенд на том же сайте (/api/leads, см. platform/): JSON, ответ проверяем
        const res = await fetch(CFG.leadEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
          signal: ctrl.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error?.message || `HTTP ${res.status}`);
        }
        return;
      }
      // Google Apps Script: обычная «форма» (x-www-form-urlencoded) + no-cors — принимает без настроек CORS,
      // поля name и phone доступны в e.parameter — как в скрипте из исходного черновика
      await fetch(CFG.leadEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(lead).toString(),
        signal: ctrl.signal,
        keepalive: true,
      });
    } finally {
      clearTimeout(t);
    }
  }

  /* ---------- лайтбокс для скринов ---------- */
  function initLightbox() {
    const box = $("#lightbox");
    if (!box) return;
    const img = $("img", box);
    const cap = $("[data-lightbox-caption]", box);
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-lightbox]");
      if (!t) return;
      const inner = t.querySelector("img");
      const src = t.dataset.full || inner?.currentSrc || inner?.src;
      if (!src) { emit("lightbox:empty", { el: t }); return; }
      img.src = src;
      img.alt = inner?.alt || "";
      if (cap) cap.textContent = t.dataset.caption || img.alt;
      if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", "");
      emit("lightbox:open", { el: t });
    });
    box.addEventListener("click", e => {
      if (e.target === box || e.target.closest("[data-close]")) { if (box.close) box.close(); else box.removeAttribute("open"); }
    });
  }

  /* ---------- карусель (кейсы): кнопки «назад/вперёд» + свайп ---------- */
  function initCarousels() {
    $$("[data-carousel]").forEach(root => {
      const trackEl = $("[data-track]", root);
      if (!trackEl) return;
      const btns = $$("[data-dir]", root);
      const step = () => {
        const card = trackEl.firstElementChild;
        const gap = parseFloat(getComputedStyle(trackEl).columnGap) || 16;
        return card ? card.getBoundingClientRect().width + gap : trackEl.clientWidth;
      };
      let ended = false;
      const update = () => {
        const max = trackEl.scrollWidth - trackEl.clientWidth - 2;
        btns.forEach(b => { b.disabled = Number(b.dataset.dir) < 0 ? trackEl.scrollLeft <= 2 : trackEl.scrollLeft >= max; });
        if (!ended && max > 0 && trackEl.scrollLeft >= max) { ended = true; emit("carousel:end", { root }); }
      };
      btns.forEach(b => b.addEventListener("click", () => trackEl.scrollBy({ left: step() * Number(b.dataset.dir), behavior: "smooth" })));
      trackEl.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
      new ResizeObserver(update).observe(trackEl);
      update();
    });
  }

  function boot() {
    initVideo();
    initCountdown();
    initSpots();
    initLeadForm();
    initLightbox();
    initCarousels();
    emit("core:ready", { variant: VARIANT });
  }

  window.Funnel = { open: (src, trigger) => openLead(src, trigger), track, config: CFG, variant: VARIANT, utm };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
