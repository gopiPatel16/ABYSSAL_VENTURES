/* ABYSSAL VENTURES — scroll-scrubbed descent */
(() => {
  const MAX_DEPTH = 3800;
  // scroll progress -> depth, keyed to the five clip boundaries
  // (surface / sunlit / twilight / midnight / floor at fifths of the scrub)
  const DEPTH_CURVE = [
    [0.0, 0], [0.2, 10], [0.4, 200], [0.6, 1000], [0.8, 3600], [1.0, MAX_DEPTH],
  ];
  const ZONES = [
    { max: 200, label: 'SUNLIT' },
    { max: 1000, label: 'TWILIGHT' },
    { max: 3500, label: 'MIDNIGHT' },
    { max: Infinity, label: 'THE FLOOR' },
  ];

  const canvas = document.getElementById('dive');
  const ctx = canvas.getContext('2d');
  const loader = document.getElementById('loader');
  const loaderFill = document.getElementById('loaderFill');
  const loaderPct = document.getElementById('loaderPct');
  const hudMarker = document.getElementById('hudMarker');
  const hudDepth = document.getElementById('hudDepth');
  const hudZone = document.getElementById('hudZone');
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  const railLabels = [...document.querySelectorAll('.hud-zone-label')]
    .map(el => ({ el, at: parseFloat(el.style.getPropertyValue('--at')) }));

  let frames = [];
  let frameCount = 0;
  let rendered = -1;   // last drawn frame
  let current = 0;     // lerped frame position
  let progress = 0;
  let zoneLabel = '';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ----- HUD rail ticks ----- */
  const ticks = document.querySelector('.hud-ticks');
  for (let i = 0; i <= 38; i++) {
    const el = document.createElement('i');
    if (i % 5 === 0) el.className = 'major';
    el.style.top = (i / 38) * 100 + '%';
    ticks.appendChild(el);
  }

  /* ----- canvas sizing ----- */
  function resize() {
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    rendered = -1; // force redraw
  }
  addEventListener('resize', resize);
  resize();

  /* ----- frame preload ----- */
  fetch('assets/frames/manifest.json')
    .then(r => r.json())
    .then(m => {
      frameCount = m.count;
      frames = new Array(frameCount);
      let loaded = 0;
      return Promise.all(
        Array.from({ length: frameCount }, (_, i) => new Promise(res => {
          const img = new Image();
          img.onload = img.onerror = () => {
            loaded++;
            const pct = Math.round((loaded / frameCount) * 100);
            loaderFill.style.width = pct + '%';
            loaderPct.textContent = String(pct).padStart(3, '0');
            res();
          };
          img.src = `assets/frames/frame_${String(i).padStart(4, '0')}.jpg`;
          frames[i] = img;
        }))
      );
    })
    .then(start)
    .catch(err => {
      loaderPct.parentElement.textContent = 'DESCENT BUFFER OFFLINE — ' + err.message;
    });

  /* ----- draw (cover fit, graded darker + cooler with depth) ----- */
  let drawnP = -1;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function draw(idx) {
    const img = frames[idx];
    if (!img || !img.naturalWidth) return;
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const sink = smoothstep(0.15, 0.85, progress); // sunlight dies on the way down
    ctx.filter = `brightness(${(1 - 0.78 * sink).toFixed(3)}) saturate(${(1 - 0.45 * sink).toFixed(3)}) contrast(${(1 + 0.08 * sink).toFixed(3)})`;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    ctx.filter = 'none';
    drawnP = progress;
  }

  /* ----- HUD + reveals ----- */
  function depthAt(p) {
    for (let i = 0; i < DEPTH_CURVE.length - 1; i++) {
      const [t0, d0] = DEPTH_CURVE[i];
      const [t1, d1] = DEPTH_CURVE[i + 1];
      if (p <= t1) return d0 + (d1 - d0) * ((p - t0) / (t1 - t0));
    }
    return MAX_DEPTH;
  }

  function updateHUD() {
    const depth = Math.round(depthAt(progress));
    hudDepth.textContent = String(depth).padStart(4, '0');
    const markerPct = (depth / MAX_DEPTH) * 100;
    hudMarker.style.top = markerPct.toFixed(3) + '%';
    for (const { el, at } of railLabels) {
      el.style.opacity = Math.abs(at - markerPct) < 8 ? '0' : '1';
    }

    const z = ZONES.find(z => depth <= z.max).label;
    if (z !== zoneLabel) {
      zoneLabel = z;
      hudZone.textContent = z;
      hudZone.classList.remove('tick');
      void hudZone.offsetWidth; // restart animation
      hudZone.classList.add('tick');
    }

    // page colour grade: deep navy -> pure black
    const g = 1 - progress;
    document.body.style.backgroundColor =
      `rgb(${Math.round(6 * g)}, ${Math.round(13 * g)}, ${Math.round(31 * g)})`;
  }

  function updateReveals() {
    const vh = innerHeight;
    for (const el of reveals) {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const dist = Math.abs(center - vh / 2);
      const vis = clamp(1 - (dist - vh * 0.14) / (vh * 0.42), 0, 1);
      el.style.opacity = vis.toFixed(3);
      el.style.transform = `translateY(${((1 - vis) * 34).toFixed(1)}px)`;
    }
  }

  /* ----- main loop ----- */
  function update(instant) {
    const doc = document.documentElement;
    const maxScroll = doc.scrollHeight - innerHeight;
    progress = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;

    // lerp toward target frame for buttery scrub
    const target = progress * (frameCount - 1);
    current = instant ? target : current + (target - current) * 0.22;
    if (Math.abs(target - current) < 0.02) current = target;
    const idx = clamp(Math.round(current), 0, frameCount - 1);
    if (idx !== rendered || Math.abs(progress - drawnP) > 0.004) {
      draw(idx);
      rendered = idx;
    }

    updateHUD();
    updateReveals();
  }

  function start() {
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });

    function raf(time) {
      lenis.raf(time);
      update(false);
      requestAnimationFrame(raf);
    }

    // keep the scrub honest when rAF is throttled (hidden/low-power tabs)
    addEventListener('scroll', () => { if (document.hidden) update(true); }, { passive: true });
    setInterval(() => { if (document.hidden) update(true); }, 400);
    // debug hook: lets tooling force a synchronous frame (e.g. hidden-tab screenshots)
    window.__abyssalTick = () => update(true);

    update(true);
    requestAnimationFrame(raf);
    loader.classList.add('done');
  }

  /* CTA — fictional company, keep it on-tone */
  document.getElementById('joinBtn').addEventListener('click', e => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.textContent = 'MANIFEST RECEIVED — STAND BY';
    btn.style.pointerEvents = 'none';
  });
})();
