/* ABYSSAL VENTURES — real-time 3D scroll descent (Three.js) */
import * as THREE from './vendor/three.module.js';

(() => {
  const canvas = document.getElementById('dive');

  // WebGL fallback -> frame-scrub build
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw 0;
  } catch {
    const s = document.createElement('script');
    s.src = 'js/main-frames.js';
    document.body.appendChild(s);
    return;
  }

  /* ---------------- constants ---------------- */
  const MAX_DEPTH = 3800;
  const DEPTH_CURVE = [
    [0.0, 0], [0.2, 10], [0.4, 200], [0.6, 1000], [0.8, 3600], [1.0, MAX_DEPTH],
  ];
  const ZONES = [
    { max: 200, label: 'SUNLIT' },
    { max: 1000, label: 'TWILIGHT' },
    { max: 3500, label: 'MIDNIGHT' },
    { max: Infinity, label: 'THE FLOOR' },
  ];
  // world descends 420 units; zone set-dressing lives at negative y bands
  const WORLD_H = 420;
  const COLOR_STOPS = [
    [0.00, 0x2e7cb4, 0x0c4074],
    [0.20, 0x14588f, 0x072c5c],
    [0.40, 0x092850, 0x03112c],
    [0.60, 0x020918, 0x01030b],
    [0.80, 0x010309, 0x000105],
    [1.00, 0x010206, 0x000002],
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function depthAt(p) {
    for (let i = 0; i < DEPTH_CURVE.length - 1; i++) {
      const [t0, d0] = DEPTH_CURVE[i], [t1, d1] = DEPTH_CURVE[i + 1];
      if (p <= t1) return d0 + (d1 - d0) * ((p - t0) / (t1 - t0));
    }
    return MAX_DEPTH;
  }

  /* ---------------- renderer / scene ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2e7cb4);
  scene.fog = new THREE.FogExp2(0x2e7cb4, 0.016);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

  const world = new THREE.Group();
  scene.add(world);

  /* ---------------- soft sprite / gradient textures ---------------- */
  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = makeGlowTexture();

  function makeBeamTexture() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');    // wide end fades out
    grad.addColorStop(0.75, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');    // bright at the lamp
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 128);
    return new THREE.CanvasTexture(c);
  }
  const beamTex = makeBeamTexture();

  /* ---------------- lights ---------------- */
  const sun = new THREE.DirectionalLight(0xcfeaff, 2.6);
  sun.position.set(6, 30, 4);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x9fd4f0, 1.1);
  scene.add(ambient);

  /* ---------------- the Triton-X ---------------- */
  const sub = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x0b0e13, metalness: 0.65, roughness: 0.38 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 3.1, 8, 24), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 0.78, 0.9);
  sub.add(hull);

  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.15, 4), hullMat);
  fin.position.set(-0.7, 1.05, 0);
  fin.rotation.y = Math.PI / 4;
  fin.scale.set(1, 1, 0.28);
  sub.add(fin);

  for (const sz of [-1, 1]) {
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 14), hullMat);
    thr.rotation.z = Math.PI / 2;
    thr.position.set(-2.45, 0.15, sz * 0.55);
    sub.add(thr);
  }

  // glowing viewport ring + dark glass
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x00151c, emissive: 0x00e5ff, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.2,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.085, 12, 40), ringMat);
  ring.position.set(2.05, 0.02, 0);
  ring.rotation.y = Math.PI / 2;
  sub.add(ring);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.56, 32),
    new THREE.MeshStandardMaterial({ color: 0x02181f, emissive: 0x043038, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.4 })
  );
  glass.position.set(2.08, 0.02, 0);
  glass.rotation.y = Math.PI / 2;
  sub.add(glass);
  const ringLight = new THREE.PointLight(0x00e5ff, 5, 16, 1.6);
  ringLight.position.set(2.4, 0, 0);
  sub.add(ringLight);

  // twin floodlights: housings, spotlights, additive beam cones
  const beams = [];
  const spots = [];
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xbfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    map: beamTex,
  });
  for (const sz of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.3, 12), hullMat);
    housing.rotation.z = Math.PI / 2;
    housing.position.set(1.7, 0.42, sz * 0.62);
    sub.add(housing);

    const spot = new THREE.SpotLight(0xdff4ff, 0, 70, 0.42, 0.7, 1.1);
    spot.position.copy(housing.position);
    spot.target.position.set(30, -1.5, sz * 2.5);
    sub.add(spot); sub.add(spot.target);
    spots.push(spot);

    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 15, 20, 1, true), beamMat.clone());
    beam.rotation.z = Math.PI / 2 + 0.09;
    beam.position.set(1.7 + 7.4, 0.42 - 0.7, sz * 1.0);
    beams.push(beam);
    sub.add(beam);
  }
  scene.add(sub);

  /* ---------------- surface (seen from below) ---------------- */
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500, 40, 40),
    new THREE.MeshBasicMaterial({
      color: 0xeac89a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false,
    })
  );
  surface.rotation.x = Math.PI / 2;
  surface.position.y = 10;
  world.add(surface);
  const surfPos = surface.geometry.attributes.position;
  const surfBase = surfPos.array.slice();

  /* ---------------- god rays ---------------- */
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xcfeaff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 6.5, 220, 8, 1, true), rayMat.clone());
    r.position.set(-40 + i * 14 + (i % 3) * 4, -70, -18 - (i % 4) * 9);
    r.rotation.z = 0.10 + (i % 3) * 0.045;
    rays.add(r);
  }
  world.add(rays);

  /* ---------------- particles helper ---------------- */
  function makePoints(n, { size, color, opacity, spread, blending = THREE.NormalBlending }) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread[0];
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size, color, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true,
      map: glowTex, alphaTest: 0.01,
    });
    return new THREE.Points(g, m);
  }

  // marine snow around the camera (wraps vertically)
  const snow = makePoints(700, { size: 0.09, color: 0xcfe0ee, opacity: 0.55, spread: [70, 60, 70] });
  scene.add(snow);

  // bubbles (rise; upper zones only)
  const bubbles = makePoints(260, { size: 0.16, color: 0xdff4ff, opacity: 0.5, spread: [60, 60, 60], blending: THREE.AdditiveBlending });
  scene.add(bubbles);

  // bioluminescent starfield (midnight band)
  const bio = new THREE.Group();
  const bioA = makePoints(500, { size: 0.46, color: 0x00e5ff, opacity: 0, spread: [46, 70, 46], blending: THREE.AdditiveBlending });
  const bioB = makePoints(350, { size: 0.58, color: 0x9a5cff, opacity: 0, spread: [46, 70, 46], blending: THREE.AdditiveBlending });
  const bioC = makePoints(250, { size: 0.34, color: 0x33ffd6, opacity: 0, spread: [30, 70, 30], blending: THREE.AdditiveBlending });
  bio.add(bioA, bioB, bioC);
  bio.position.y = 0;
  scene.add(bio);

  /* ---------------- whale (sunlit band) ---------------- */
  const whale = new THREE.Group();
  const whaleMat = new THREE.MeshStandardMaterial({ color: 0x061626, roughness: 0.9, metalness: 0 });
  const wBody = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 8.5, 6, 14), whaleMat);
  wBody.rotation.z = Math.PI / 2;
  wBody.scale.set(1, 0.62, 0.7);
  whale.add(wBody);
  const wTail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.8, 4), whaleMat);
  wTail.rotation.z = Math.PI / 2; // apex trails behind the body
  wTail.position.set(-5.3, 0.4, 0); // body length is compressed by its y-scale
  wTail.scale.set(1, 1, 0.22);
  whale.add(wTail);
  for (const sz of [-1, 1]) {
    const flip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 4), whaleMat);
    flip.position.set(2.2, -1.0, sz * 1.6);
    flip.rotation.set(sz * 0.9, 0, -1.2);
    flip.scale.set(1, 1, 0.2);
    whale.add(flip);
  }
  // whale band: during its window (p 0.2-0.4) the world sits ~84-168 units up,
  // so local y ≈ -126 keeps it crossing at camera height
  whale.position.set(60, -126, -30);
  world.add(whale);

  /* ---------------- jellyfish (twilight band) ---------------- */
  const jellies = [];
  const jGroup = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const j = new THREE.Group();
    const hue = Math.random() < 0.5 ? 0xd9c2ff : 0xffc9ec;
    const bellMat = new THREE.MeshStandardMaterial({
      color: hue, emissive: hue, emissiveIntensity: 1.2, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false, roughness: 0.6,
    });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
    j.add(bell);
    const tentMat = new THREE.LineBasicMaterial({ color: hue, transparent: true, opacity: 0.28 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pts = [];
      for (let s = 0; s <= 6; s++) pts.push(new THREE.Vector3(Math.cos(a) * 0.55, -s * 0.55, Math.sin(a) * 0.55));
      j.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tentMat));
    }
    const scale = 0.7 + Math.random() * 1.5;
    j.scale.setScalar(scale);
    // jelly band: window p 0.40-0.63 puts the world 168-265 units up
    j.position.set((Math.random() - 0.5) * 70, -175 - Math.random() * 85, (Math.random() - 0.5) * 36);
    j.userData = { phase: Math.random() * Math.PI * 2, baseY: j.position.y, drift: 0.4 + Math.random() };
    jGroup.add(j);
    jellies.push(j);
  }
  world.add(jGroup);

  /* ---------------- the floor ---------------- */
  const floorGroup = new THREE.Group();
  floorGroup.position.y = -WORLD_H;
  const terrGeo = new THREE.PlaneGeometry(420, 240, 96, 48);
  {
    const p = terrGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const h = Math.sin(x * 0.08) * Math.cos(y * 0.11) * 2.4
        + Math.sin(x * 0.021 + 4) * 4.2 + Math.cos(y * 0.043 + 1) * 2.6
        + Math.sin(x * 0.31) * Math.sin(y * 0.27) * 0.7;
      p.setZ(i, h);
    }
    terrGeo.computeVertexNormals();
  }
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 0.95, metalness: 0.05 }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -9;
  floorGroup.add(terrain);

  const ventLights = [];
  const ventCols = [];
  const ventGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ventGlows = [];
  for (let i = 0; i < 9; i++) {
    const h = 6 + Math.random() * 14;
    const chim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 + Math.random() * 0.8, 2.2 + Math.random() * 2.4, h, 9),
      new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.9 })
    );
    const x = -55 + Math.random() * 110, z = -48 + Math.random() * 52;
    chim.position.set(x, -9 + h / 2, z);
    floorGroup.add(chim);

    if (i % 2 === 0) {
      const vl = new THREE.PointLight(0xff7a30, 0, 24, 1.6);
      vl.position.set(x, -8 + h + 1, z);
      floorGroup.add(vl);
      ventLights.push(vl);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), ventGlowMat.clone());
      glow.position.set(x, -9 + h + 0.3, z);
      floorGroup.add(glow);
      ventGlows.push(glow);
      const smoke = makePoints(60, { size: 0.5, color: 0x664433, opacity: 0.0, spread: [2.5, 16, 2.5] });
      smoke.position.set(x, -8 + h + 8, z);
      floorGroup.add(smoke);
      ventCols.push(smoke);
    }
  }
  world.add(floorGroup);

  // faint fill that keeps the hull silhouette readable in the black zones
  const camFill = new THREE.PointLight(0x22506e, 0, 45, 1.2);
  scene.add(camFill);
  // cold wash over the vent field so the landscape reads at the bottom
  const floorWash = new THREE.PointLight(0x2fa8c8, 0, 90, 1.1);
  floorWash.position.set(0, 14, -18);
  floorGroup.add(floorWash);

  /* ---------------- HUD / sections (same contract as frame build) ---------------- */
  const loader = document.getElementById('loader');
  const loaderFill = document.getElementById('loaderFill');
  const loaderPct = document.getElementById('loaderPct');
  const hudMarker = document.getElementById('hudMarker');
  const hudDepth = document.getElementById('hudDepth');
  const hudZone = document.getElementById('hudZone');
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  const railLabels = [...document.querySelectorAll('.hud-zone-label')]
    .map(el => ({ el, at: parseFloat(el.style.getPropertyValue('--at')) }));

  const ticks = document.querySelector('.hud-ticks');
  for (let i = 0; i <= 38; i++) {
    const el = document.createElement('i');
    if (i % 5 === 0) el.className = 'major';
    el.style.top = (i / 38) * 100 + '%';
    ticks.appendChild(el);
  }

  let zoneLabel = '';
  function updateHUD(progress) {
    const depth = Math.round(depthAt(progress));
    hudDepth.textContent = String(depth).padStart(4, '0');
    const markerPct = (depth / MAX_DEPTH) * 100;
    hudMarker.style.top = markerPct.toFixed(3) + '%';
    for (const { el, at } of railLabels) el.style.opacity = Math.abs(at - markerPct) < 8 ? '0' : '1';
    const z = ZONES.find(z => depth <= z.max).label;
    if (z !== zoneLabel) {
      zoneLabel = z;
      hudZone.textContent = z;
      hudZone.classList.remove('tick');
      void hudZone.offsetWidth;
      hudZone.classList.add('tick');
    }
    const g = 1 - progress;
    document.body.style.backgroundColor =
      `rgb(${Math.round(6 * g)}, ${Math.round(13 * g)}, ${Math.round(31 * g)})`;
  }

  function updateReveals() {
    const vh = innerHeight;
    for (const el of reveals) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - vh / 2);
      const vis = clamp(1 - (dist - vh * 0.14) / (vh * 0.42), 0, 1);
      el.style.opacity = vis.toFixed(3);
      el.style.transform = `translateY(${((1 - vis) * 34).toFixed(1)}px)`;
    }
  }

  /* ---------------- colour grading ---------------- */
  const cTop = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
  function gradeColor(p, out) {
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
      const [t0, top0] = COLOR_STOPS[i], [t1, top1] = COLOR_STOPS[i + 1];
      if (p <= t1) {
        cA.setHex(top0); cB.setHex(top1);
        out.copy(cA).lerp(cB, (p - t0) / (t1 - t0));
        return out;
      }
    }
    return out.setHex(COLOR_STOPS[COLOR_STOPS.length - 1][1]);
  }

  /* ---------------- resize ---------------- */
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  /* ---------------- mouse parallax ---------------- */
  let mx = 0, my = 0;
  addEventListener('pointermove', e => {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
  });

  /* ---------------- main loop ---------------- */
  const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
  let progress = 0, smoothP = 0, lastP = 0;
  const clock = new THREE.Clock();

  function frame(time) {
    lenis.raf(time);
    tick();
    requestAnimationFrame(frame);
  }

  function tick() {
    const t = clock.getElapsedTime();
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    progress = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
    smoothP += (progress - smoothP) * 0.07;
    const vel = smoothP - lastP;
    lastP = smoothP;
    const p = smoothP;
    const depth = depthAt(p);

    // world rises past the camera = we descend
    world.position.y = p * WORLD_H;

    // camera orbit angle (used to keep set-dressing on the far side of the lens)
    const az = lerp(-1.35, 0.5, smooth(0, 1, p)) + Math.sin(t * 0.05) * 0.04;
    const farSide = -Math.sin(az);

    // colour / fog / light with depth
    gradeColor(p, cTop);
    scene.background = cTop;
    scene.fog.color.copy(cTop);
    scene.fog.density = lerp(0.016, 0.030, smooth(0, 0.7, p)) - smooth(0.8, 1, p) * 0.008;
    sun.intensity = 2.6 * (1 - smooth(0.15, 0.55, p));
    ambient.intensity = lerp(1.15, 0.06, smooth(0.0, 0.75, p));

    // surface shimmer (visible early)
    if (p < 0.3) {
      for (let i = 0; i < surfPos.count; i++) {
        const bx = surfBase[i * 3], bz = surfBase[i * 3 + 1];
        surfPos.setZ(i, Math.sin(bx * 0.25 + t * 1.4) * 0.35 + Math.cos(bz * 0.21 + t * 1.1) * 0.35);
      }
      surfPos.needsUpdate = true;
      surface.material.opacity = 0.9 * (1 - smooth(0.05, 0.22, p));
      surface.visible = true;
    } else surface.visible = false;

    // god rays fade out through sunlit
    const rayA = 0.055 * (1 - smooth(0.25, 0.5, p));
    rays.visible = rayA > 0.003;
    rays.children.forEach((r, i) => {
      r.material.opacity = rayA * (0.7 + 0.3 * Math.sin(t * 0.7 + i * 1.7));
      r.rotation.z = 0.10 + (i % 3) * 0.045 + Math.sin(t * 0.22 + i) * 0.02;
    });

    // sub attitude: pitch with dive speed, gentle bob, settle at floor
    sub.rotation.z = clamp(-vel * 260, -0.24, 0.10) + Math.sin(t * 0.9) * 0.015;
    sub.position.y = Math.sin(t * 0.7) * 0.22 + smooth(0.9, 1.0, p) * 1.4;
    sub.rotation.y = Math.sin(t * 0.13) * 0.05;

    // lights: ring always on but brighter deep; floodlights flicker on entering twilight
    const flick = p > 0.5 && p < 0.56 ? (0.4 + 0.6 * Math.abs(Math.sin(t * 22))) : 1;
    const lightsOn = smooth(0.48, 0.55, p) * flick;
    const floorT = smooth(0.8, 0.95, p);
    spots.forEach(s => {
      s.intensity = (320 + floorT * 260) * lightsOn;
      s.target.position.y = -1.5 - floorT * 9; // rake the beams across the seafloor
    });
    floorWash.intensity = floorT * 10;
    const sweep = smooth(0.82, 0.9, p) * Math.sin(t * 0.5) * 0.35;
    beams.forEach((b, i) => {
      b.material.opacity = 0.05 * lightsOn * (0.8 + 0.2 * Math.sin(t * 2.1 + i));
      b.rotation.y = sweep * (i === 0 ? 1 : 0.85);
      b.rotation.z = Math.PI / 2 + 0.09 + floorT * 0.34; // follow the spot tilt
    });
    sub.rotation.y += sweep * 0.25;
    ringMat.emissiveIntensity = lerp(1.6, 3.4, smooth(0.3, 0.7, p)) * flick;
    ringLight.intensity = lerp(2.5, 7, smooth(0.3, 0.7, p)) * flick;

    // marine snow drifts up relative to descent; wraps around camera
    snow.position.y = ((t * 0.4 + p * 90) % 60) - 30;
    snow.material.opacity = lerp(0.28, 0.6, smooth(0.15, 0.5, p));
    bubbles.position.y = ((t * 2.2 + p * 40) % 60) - 30;
    bubbles.material.opacity = 0.5 * (1 - smooth(0.4, 0.58, p));
    bubbles.visible = bubbles.material.opacity > 0.01;

    // whale crossing during sunlit
    const wT = smooth(0.2, 0.4, p);
    whale.visible = wT > 0.001 && wT < 0.999;
    if (whale.visible) {
      whale.position.x = lerp(80, -90, wT);
      whale.position.y = -126 + Math.sin(t * 0.5) * 2;
      whale.position.z = farSide * 38;
      whale.rotation.z = Math.sin(t * 0.8) * 0.05;
      whale.rotation.y = Math.PI + Math.sin(t * 0.6) * 0.08;
    }

    // jellyfish pulse
    const jVis = smooth(0.38, 0.45, p) * (1 - smooth(0.62, 0.7, p));
    jGroup.visible = jVis > 0.005;
    if (jGroup.visible) {
      jGroup.position.z = farSide * 22;
      for (const j of jellies) {
        const ph = j.userData.phase;
        const pulse = 1 + Math.sin(t * 1.8 + ph) * 0.13;
        j.scale.y = j.scale.x * pulse;
        j.position.y = j.userData.baseY + Math.sin(t * 0.4 + ph) * 3 + t * 0.25 * j.userData.drift;
        j.children[0].material.opacity = 0.5 * jVis;
        j.children.slice(1).forEach(l => (l.material.opacity = 0.4 * jVis));
      }
    }

    // bioluminescence twinkle through midnight
    const bioT = smooth(0.55, 0.65, p) * (1 - smooth(0.86, 0.95, p));
    bio.visible = bioT > 0.005;
    if (bio.visible) {
      bioA.material.opacity = bioT * (0.72 + 0.28 * Math.sin(t * 2.3));
      bioB.material.opacity = bioT * (0.65 + 0.35 * Math.sin(t * 1.7 + 2));
      bioC.material.opacity = bioT * (0.65 + 0.35 * Math.sin(t * 3.1 + 4));
      bio.rotation.y = t * 0.012;
    }

    // camera fill keeps the hull readable once the sun is gone
    camFill.position.copy(camera.position);
    camFill.intensity = 1.4 * smooth(0.5, 0.7, p);

    // vents wake up near the floor
    const vT = smooth(0.8, 0.92, p);
    ventLights.forEach((v, i) => { v.intensity = vT * (7 + 3 * Math.sin(t * 3 + i * 2)); });
    ventGlows.forEach((g, i) => {
      g.material.opacity = vT * (0.55 + 0.25 * Math.sin(t * 4 + i));
      g.scale.setScalar(1 + 0.2 * Math.sin(t * 5 + i * 2));
    });
    ventCols.forEach((s, i) => {
      s.material.opacity = 0.16 * vT;
      s.position.y += 0.03;
      if (s.position.y > 20) s.position.y = 4;
    });

    // cinematic camera: slow 3D orbit surface->floor + mouse parallax
    const radius = lerp(10.5, 8.2, p) + Math.sin(t * 0.11) * 0.3 + floorT * 3.5;
    // sink with the sub, then pull up at the bottom to look down on the floor
    const camY = lerp(2.6, -1.7, smooth(0.1, 0.8, p)) + floorT * 5.6;
    camera.position.set(
      Math.cos(az) * radius + mx * 0.9,
      camY + my * -0.7 + Math.sin(t * 0.18) * 0.15,
      Math.sin(az) * radius
    );
    // keep the vessel right-of-centre under the hero headline, centred once diving
    const lookX = lerp(-3.4, 0, smooth(0.10, 0.3, p));
    camera.lookAt(sub.position.x + lookX, sub.position.y - floorT * 3.2, 0);

    renderer.render(scene, camera);
    updateHUD(progress);
    updateReveals();
  }

  // keep rendering when rAF is throttled (hidden/low-power tabs)
  setInterval(() => { if (document.hidden) { smoothP = progress; tick(); } }, 400);
  // debug hook: lets tooling force a synchronous frame (e.g. hidden-tab screenshots)
  window.__abyssalTick = () => { smoothP = progress; tick(); };

  /* ---------------- boot ---------------- */
  let fake = 0;
  const boot = setInterval(() => {
    fake = Math.min(100, fake + 9 + Math.random() * 14);
    loaderFill.style.width = fake + '%';
    loaderPct.textContent = String(Math.round(fake)).padStart(3, '0');
    if (fake >= 100) {
      clearInterval(boot);
      loader.classList.add('done');
    }
  }, 60);

  renderer.render(scene, camera); // warm compile
  updateHUD(0);
  updateReveals();
  requestAnimationFrame(frame);

  document.getElementById('joinBtn').addEventListener('click', e => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.textContent = 'MANIFEST RECEIVED — STAND BY';
    btn.style.pointerEvents = 'none';
  });
})();
