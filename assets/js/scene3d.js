/* =========================================================================
   3D-сцена первого экрана (Three.js) — общая для обоих вариантов.
   Объёмный знак Академии (шестигранник с кнопкой Play), монеты
   и «лайк». Объекты цепляются к углам экрана с видео, парят
   и поворачиваются за курсором. Three.js грузится лениво с jsDelivr
   после отрисовки страницы; без WebGL сайт просто остаётся без 3D.

   Scene3D.start({ canvas, host, anchor, preset: "game" | "classic" })
   ========================================================================= */
window.Scene3D = (() => {
  "use strict";

  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.186.0/+esm";
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  function hasWebGL() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
  }

  /* многоугольник со скруглёнными углами */
  function roundedPoly(THREE, n, r, rad, rot) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    const shape = new THREE.Shape();
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const a = p1.clone().add(p0.clone().sub(p1).normalize().multiplyScalar(rad));
      const b = p1.clone().add(p2.clone().sub(p1).normalize().multiplyScalar(rad));
      if (i === 0) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
      shape.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
    }
    shape.closePath();
    return shape;
  }

  /* «студия» для отражений: софтбоксы в палитре варианта */
  function makeStudio(THREE, preset) {
    const s = new THREE.Scene();
    const game = preset !== "classic";
    // тёмная бордовая «комната» — под палитру сайта (ink / burgundy / red / ember / cream)
    s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: game ? 0x1c0610 : 0x140a0e, side: THREE.BackSide })));
    const panel = (hex, k, w, h, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    if (game) {
      panel(0xffffff, 4.6, 5, 2, 0, 5.2, 3);
      panel(0xff0f2d, 1.8, 2.4, 5, -5.6, 0, 2);
      panel(0xff6a2b, 2.2, 2.4, 5, 5.6, 0.4, 2);
      panel(0xffb08a, 2.2, 5, 1.4, 0, -5.6, 2);
      panel(0xfff4ec, 1.8, 4, 4, 0, 0, 5.8);
    } else {
      panel(0xffffff, 5, 6, 2.4, 0, 5.2, 3);
      panel(0xf5f0ea, 2.2, 2.4, 5, -5.6, 0, 2);
      panel(0xff0f2d, 1.4, 2.4, 5, 5.6, 0.4, 2);
      panel(0xff6a2b, 1.2, 5, 1.4, 0, -5.6, 2);
      panel(0xfff4ec, 2.2, 4, 4, 0, 0, 5.8);
    }
    return s;
  }

  function makeBadge(THREE, m) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.ExtrudeGeometry(roundedPoly(THREE, 6, 1, 0.26, Math.PI / 2), {
      depth: 0.34, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 6, curveSegments: 10,
    });
    bodyGeo.translate(0, 0, -0.17);
    g.add(new THREE.Mesh(bodyGeo, m.red));

    const outer = roundedPoly(THREE, 6, 1.22, 0.3, Math.PI / 2);
    outer.holes.push(new THREE.Path(roundedPoly(THREE, 6, 1.03, 0.26, Math.PI / 2).getPoints(12)));
    const rimGeo = new THREE.ExtrudeGeometry(outer, {
      depth: 0.4, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4, curveSegments: 10,
    });
    rimGeo.translate(0, 0, -0.2);
    g.add(new THREE.Mesh(rimGeo, m.rim));

    const playGeo = new THREE.ExtrudeGeometry(roundedPoly(THREE, 3, 0.5, 0.13, 0), {
      depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8,
    });
    const play = new THREE.Mesh(playGeo, m.cream);
    play.position.set(0.08, 0, 0.3);
    g.add(play);
    return { obj: g, unit: 2.5 };
  }

  function makeCoin(THREE, m) {
    const prof = [[0, 0.1], [0.62, 0.1], [0.66, 0.14], [0.8, 0.14], [0.86, 0.1], [0.9, 0.05], [0.9, -0.05], [0.86, -0.1], [0.8, -0.14], [0.66, -0.14], [0.62, -0.1], [0, -0.1]];
    const geo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), 48);
    geo.rotateX(Math.PI / 2);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, m.gold));
    const triGeo = new THREE.ExtrudeGeometry(roundedPoly(THREE, 3, 0.34, 0.08, 0), {
      depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6,
    });
    const front = new THREE.Mesh(triGeo, m.gold);
    front.position.set(0.05, 0, 0.09);
    const back = new THREE.Mesh(triGeo, m.gold);
    back.rotation.y = Math.PI;
    back.position.set(-0.05, 0, -0.09);
    g.add(front, back);
    return { obj: g, unit: 1.8 };
  }

  function makeHeart(THREE, mat) {
    const s = new THREE.Shape();
    s.moveTo(0.5, 0.5);
    s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
    s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
    s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
    s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
    s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
    s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.16, bevelSegments: 8, curveSegments: 16 });
    geo.center();
    geo.rotateZ(Math.PI);
    return { obj: new THREE.Mesh(geo, mat), unit: 2.5 };
  }

  /* раскладка: place(F, mobile) → {x, y, s} в CSS-пикселях относительно host; null — скрыть на этой ширине.
     Видео стоит сразу под заголовком (на компьютере — слева), поэтому знак сидит на правом верхнем
     углу видео и не заходит ни на заголовок сверху, ни на колонку с уроками справа. */
  function itemsFor(preset, THREE, mats) {
    if (preset === "classic") {
      return [
        { ...makeBadge(THREE, mats), kind: "badge", depth: 1.1,
          place: (F, mob) => mob
            ? { x: F.R - F.w * 0.09, y: F.T + F.h * 0.15, s: clamp(F.w * 0.22, 66, 96) }
            : { x: F.R - F.w * 0.07, y: F.T + F.h * 0.14, s: clamp(F.w * 0.2, 100, 136) } },
        { ...makeHeart(THREE, mats.heart), kind: "heart", depth: 0.9,
          place: (F, mob) => mob
            ? { x: F.L + 6, y: F.T + F.h * 0.42, s: 36 }
            : { x: F.L - F.w * 0.03, y: F.T + F.h * 0.3, s: 54 } },
        { ...makeCoin(THREE, mats), kind: "coin", depth: 0.7, spin: 1.3,
          place: (F, mob) => mob
            ? { x: F.R - 8, y: F.B - 10, s: 40 }
            : { x: F.R + F.w * 0.01, y: F.B - F.h * 0.12, s: 56 } },
      ];
    }
    return [
      { ...makeBadge(THREE, mats), kind: "badge", depth: 1.2,
        place: (F, mob) => mob
          ? { x: F.R - F.w * 0.1, y: F.T + F.h * 0.13, s: clamp(F.w * 0.24, 70, 100) }
          : { x: F.R - F.w * 0.07, y: F.T + F.h * 0.12, s: clamp(F.w * 0.22, 104, 146) } },
      { ...makeCoin(THREE, mats), kind: "coin", depth: 0.8, spin: 1.5,
        place: (F, mob) => mob
          ? { x: F.R - 10, y: F.B - 8, s: 42 }
          : { x: F.L + F.w * 0.14, y: F.B + F.h * 0.1, s: 58 } },
      { ...makeCoin(THREE, mats), kind: "coin", depth: 0.6, spin: -1.2,
        place: (F, mob) => mob ? null : { x: F.R + F.w * 0.02, y: F.B - F.h * 0.34, s: 46 } },
      { ...makeHeart(THREE, mats.heart), kind: "heart", depth: 1,
        place: (F, mob) => mob
          ? { x: F.R - 4, y: F.T + F.h * 0.42, s: 38 }
          : { x: F.R + F.w * 0.01, y: F.T + F.h * 0.4, s: 52 } },
    ];
  }

  async function start({ canvas, host, anchor, reduce = false, preset = "game" } = {}) {
    if (!canvas || !host || !anchor || !hasWebGL()) return null;

    // в однофайловой сборке Three.js встроен в страницу (window.__ACADEMY_THREE__), иначе — грузится с CDN.
    // Имя не __THREE__: туда сам Three.js пишет номер версии.
    let THREE = window.__ACADEMY_THREE__;
    if (!THREE) {
      try { THREE = await import(THREE_URL); } catch (err) { console.warn("3D: three.js не загрузился", err); return null; }
    }

    const coarse = matchMedia("(pointer: coarse)").matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.6 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = preset === "classic" ? 1 : 1.05;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    camera.position.set(0, 0, 32);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(makeStudio(THREE, preset), 0.035).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 8);
    const rim = new THREE.DirectionalLight(preset === "classic" ? 0xffd9cc : 0xff6a2b, 1.3);
    rim.position.set(-6, -3, -2);
    scene.add(key, rim);

    const classic = preset === "classic";
    // палитра: red #ff0f2d, ember #ff6a2b, cream #f5f0ea, burgundy #6d001a
    const mats = {
      red: new THREE.MeshPhysicalMaterial({ color: 0xff0f2d, roughness: 0.26, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
      rim: classic
        ? new THREE.MeshPhysicalMaterial({ color: 0xf5f0ea, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 })
        : new THREE.MeshStandardMaterial({ color: 0xff8f4a, metalness: 0.85, roughness: 0.24, emissive: 0x5a1d05, emissiveIntensity: 0.35 }),
      cream: new THREE.MeshPhysicalMaterial({ color: 0xf5f0ea, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffb45c, metalness: 0.85, roughness: 0.24, emissive: 0x5a2605, emissiveIntensity: 0.35 }),
      heart: new THREE.MeshPhysicalMaterial({ color: 0xff0f2d, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }),
    };

    const items = itemsFor(preset, THREE, mats);
    items.forEach((it, i) => {
      it.home = new THREE.Vector3();
      it.scale = 1;
      it.phase = i * 1.37;
      it.delay = 0.1 + i * 0.09;
      it.obj.scale.setScalar(0.0001);
      if (it.kind === "coin") it.obj.rotation.x = 0.35;
      scene.add(it.obj);
    });

    /* позиция якоря внутри host без учёта transform — анимации входа её не сбивают */
    const rectIn = () => {
      let x = 0, y = 0, n = anchor;
      while (n && n !== host) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      if (n !== host) {
        const hb = host.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
        return { L: ab.left - hb.left, T: ab.top - hb.top, R: ab.right - hb.left, B: ab.bottom - hb.top, w: ab.width, h: ab.height };
      }
      const w = anchor.offsetWidth, h = anchor.offsetHeight;
      return { L: x, T: y, R: x + w, B: y + h, w, h };
    };

    let running = false;
    let raf = 0;
    let visible = true;
    let done = false;
    let W = 0, H = 0, k = 0.01;

    function layout() {
      W = host.clientWidth;
      H = host.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / H;
      const F = rectIn();
      const mobile = W < 1000;
      items.forEach(it => {
        const p = it.place(F, mobile);
        it.hidden = !p;
        it.obj.visible = !!p;
        if (!p) return;
        const x = clamp(p.x, p.s / 2 + 4, W - p.s / 2 - 4);
        it.home.set((x - W / 2) * k, -(p.y - H / 2) * k, 0);
        it.scale = (p.s * k) / it.unit;
      });
      if (!running) render(performance.now());
    }

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!coarse) {
      window.addEventListener("pointermove", e => {
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
      }, { passive: true });
    }

    const t0 = performance.now();
    let exitAt = 0;
    let last = t0;
    function render(now) {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      const hb = host.getBoundingClientRect();
      const sp = clamp(-hb.top / Math.max(1, hb.height), 0, 1);
      const exitK = exitAt ? Math.max(0, 1 - (now - exitAt) / 450) : 1;

      items.forEach(it => {
        if (it.hidden) return;
        const intro = reduce ? 1 : easeOutBack(clamp((t - it.delay) / 0.9, 0, 1));
        const px = 6 * k;
        const o = it.obj;
        const floatY = reduce ? 0 : Math.sin(t * 1.1 + it.phase) * px * 1.4;
        o.position.set(
          it.home.x + pointer.x * it.depth * px * 1.6,
          it.home.y + floatY + pointer.y * it.depth * px * 1.2 + sp * it.depth * 90 * k,
          it.home.z,
        );
        let s = it.scale * Math.max(0.0001, intro) * exitK;
        if (it.kind === "heart" && !reduce) s *= 1 + Math.max(0, Math.sin(t * 5.2)) * 0.06;
        o.scale.setScalar(Math.max(0.0001, s));
        if (reduce) return;
        if (it.kind === "badge") {
          o.rotation.y = Math.sin(t * 0.7) * 0.38 + pointer.x * 0.5;
          o.rotation.x = -pointer.y * 0.35 + Math.sin(t * 0.5) * 0.08 + sp * 0.8;
          o.rotation.z = Math.sin(t * 0.4) * 0.06;
        } else if (it.kind === "coin") {
          o.rotation.y += dt * it.spin;
        } else {
          o.rotation.y = Math.sin(t * 1.2) * 0.5 + pointer.x * 0.3;
        }
      });
      renderer.render(scene, camera);
    }

    const stop = () => { running = false; cancelAnimationFrame(raf); };
    const loop = now => {
      render(now);
      if (exitAt && now - exitAt > 500) { done = true; stop(); canvas.style.visibility = "hidden"; return; }
      raf = requestAnimationFrame(loop);
    };
    const play = () => { if (running || reduce || done) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); };
    const sync = () => (visible && !document.hidden ? play() : stop());

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(host);
    document.addEventListener("visibilitychange", sync);
    const ro = new ResizeObserver(() => layout());
    ro.observe(host);
    ro.observe(anchor);
    document.fonts?.ready.then(layout);
    window.addEventListener("load", layout, { once: true });
    setTimeout(layout, 1200);
    layout();
    if (reduce) render(performance.now()); else sync();

    return {
      exit() {
        if (!exitAt) exitAt = performance.now();
        if (!running) { done = true; canvas.style.visibility = "hidden"; }
      },
      relayout: layout,
    };
  }

  return { start };
})();
