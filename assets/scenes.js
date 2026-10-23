/* Console Lorick — scènes 3D (Three.js + halo lumineux). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BG = 0x06070C;
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; }
}

/* Socle commun : rendu, halo, caméra orbitale douce, survol, pause hors écran. */
function stage(el, o) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, o.fogNear || 28, o.fogFar || 70);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), o.bloom || 0.7, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.AmbientLight(0x8DB2FF, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-6, 14, 10); scene.add(key);
  const rim = new THREE.PointLight(0x0F62FF, 60, 60, 1.6); rim.position.set(8, 6, -8); scene.add(rim);

  const view = { yaw: o.yaw || 0, pitch: o.pitch || 0.42, radius: o.radius || 20, target: new THREE.Vector3(0, 2, 0) };
  const user = { yaw: 0, pitch: 0 }, cur = { yaw: 0, pitch: 0 };
  let dragging = false, lx = 0, ly = 0, lastMove = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', e => { dragging = false; try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
  cv.addEventListener('pointercancel', () => { dragging = false; });

  const mouse = new THREE.Vector2(-9, -9); let mx = 0, my = 0, hasMouse = false;
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top; hasMouse = true;
    mouse.set(mx / r.width * 2 - 1, -(my / r.height) * 2 + 1);
    if (dragging) {
      user.yaw = Math.max(-1.1, Math.min(1.1, user.yaw - (e.clientX - lx) * 0.006));
      if (e.pointerType !== 'touch') user.pitch = Math.max(-0.3, Math.min(0.45, user.pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY; lastMove = performance.now();
    }
  });
  cv.addEventListener('pointerleave', () => { hasMouse = false; mouse.set(-9, -9); });

  const ray = new THREE.Raycaster();
  let w = 0, h = 0;
  function resize() {
    w = el.clientWidth; h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (o.onResize) o.onResize(w, h);
  }
  new ResizeObserver(resize).observe(el);

  let visible = true, raf = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) loop(); }, { rootMargin: '100px' }).observe(el);

  const api = { scene, camera, renderer, view, ray, mouse, size: () => [w, h], hovered: () => hasMouse, tick: null, pickables: [], onPick: null };
  const t0 = performance.now();
  function loop() {
    raf = 0;
    if (!visible) return;
    const t = (performance.now() - t0) / 1000;
    const idle = performance.now() - lastMove > 3500 && !dragging;
    if (idle && !REDUCE) { user.yaw *= 0.985; user.pitch *= 0.985; }
    const sway = REDUCE ? 0 : Math.sin(t * 0.18) * 0.22;
    cur.yaw += (view.yaw + user.yaw + (idle ? sway : 0) - cur.yaw) * 0.06;
    cur.pitch += (view.pitch + user.pitch - cur.pitch) * 0.06;
    const r = view.radius * Math.pow(Math.max(1, 1.5 / (camera.aspect || 1.5)), 0.85); // recule sur écrans étroits
    camera.position.set(
      view.target.x + r * Math.sin(cur.yaw) * Math.cos(cur.pitch),
      view.target.y + r * Math.sin(cur.pitch),
      view.target.z + r * Math.cos(cur.yaw) * Math.cos(cur.pitch));
    camera.lookAt(view.target);
    if (api.tick) api.tick(t);
    if (api.onPick && api.pickables.length) {
      ray.setFromCamera(mouse, camera);
      const hit = hasMouse ? ray.intersectObjects(api.pickables, false)[0] : null;
      api.onPick(hit ? hit.object : null, mx, my);
    }
    composer.render();
    raf = requestAnimationFrame(loop);
  }
  resize(); loop();
  return api;
}

function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
  g.clear();
}
function project(v, cam, w, h) { const p = v.clone().project(cam); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h, p.z]; }

/* ---------------- Visites : ville de barres lumineuses ---------------- */
export function barsScene(el, labelsEl, tipEl) {
  if (!webgl()) { el.insertAdjacentHTML('beforeend', '<p class="empty" style="padding:90px 24px;text-align:center">La 3D n’est pas disponible sur ce navigateur.</p>'); return { set() {} }; }
  const s = stage(el, { yaw: -0.32, pitch: 0.36, radius: 26, bloom: 0.75 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(220, 96), new THREE.MeshStandardMaterial({ color: 0x07080F, roughness: 0.85, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; s.scene.add(floor);
  const grid = new THREE.GridHelper(200, 200, 0x1B2550, 0x111733); grid.position.y = 0.002;
  grid.material.transparent = true; grid.material.opacity = 0.55; s.scene.add(grid);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshBasicMaterial({ color: 0x0F62FF, transparent: true, opacity: 0.07 }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.01; s.scene.add(halo);

  const group = new THREE.Group(); s.scene.add(group);
  let bars = [], born = 0, labels = [];

  s.tick = t => {
    const k = (performance.now() - born) / 1000;
    const [w, h] = s.size();
    bars.forEach((b, i) => {
      const g = REDUCE ? 1 : ease((k - i * 0.025) / 1.1);
      b.mesh.scale.y = Math.max(0.001, b.h * g);
      b.cap.position.y = b.h * g + 0.03;
      b.mesh.material.emissiveIntensity += ((b === s._hot ? 1.1 : b.ei) - b.mesh.material.emissiveIntensity) * 0.15;
      if (b.dot) { b.dot.position.y = b.h * g + 0.55 + (REDUCE ? 0 : Math.sin(t * 2 + i) * 0.08); b.dot.scale.setScalar(g); }
    });
    labels.forEach(l => {
      const [x, y] = project(l.p, s.camera, w, h);
      l.el.style.left = x + 'px'; l.el.style.top = (y + 6) + 'px';
    });
  };
  s.onPick = (obj, mx, my) => {
    const b = obj ? obj.userData.bar : null;
    s._hot = b;
    s.renderer.domElement.style.cursor = b ? 'pointer' : 'grab';
    if (b) { tipEl.innerHTML = b.tip; tipEl.style.left = mx + 'px'; tipEl.style.top = (my - 10) + 'px'; tipEl.classList.add('on'); }
    else tipEl.classList.remove('on');
  };

  return {
    set(items) {
      disposeGroup(group); bars = []; labelsEl.innerHTML = ''; labels = []; s.pickables = [];
      const n = Math.max(1, items.length);
      const total = Math.min(26, Math.max(8, n * 1.15));
      const step = total / n, bw = Math.min(1.3, step * 0.62);
      const max = Math.max(1, ...items.map(x => x.v));
      items.forEach((it, i) => {
        const x = -total / 2 + step * (i + 0.5);
        const ratio = it.v / max;
        const hh = it.v ? 0.25 + 7.2 * ratio : 0.06;
        const col = new THREE.Color(0x0645C9).lerp(new THREE.Color(0x4D8BFF), ratio);
        const geo = new THREE.BoxGeometry(bw, 1, bw); geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 + ratio * 0.45, metalness: 0.35, roughness: 0.3, transparent: true, opacity: 0.94 });
        const mesh = new THREE.Mesh(geo, mat); mesh.position.x = x; group.add(mesh);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.02, 0.06, bw * 1.02), new THREE.MeshBasicMaterial({ color: it.v ? 0xBFD4FF : 0x2A3150 }));
        cap.position.x = x; group.add(cap);
        const b = { mesh, cap, h: hh, ei: 0.25 + ratio * 0.45, tip: it.tip };
        if (it.c > 0) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.42, 0.16 + it.c * 0.05), 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFE100 }));
          dot.position.x = x; group.add(dot); b.dot = dot;
        }
        mesh.userData.bar = b; s.pickables.push(mesh);
        bars.push(b);
      });
      const want = Math.max(2, Math.floor(el.clientWidth / 72));
      const every = Math.max(1, Math.ceil(n / want));
      items.forEach((it, i) => {
        if (i % every && i !== n - 1) return;
        if (i !== n - 1 && n - 1 - i < every && n > 1) return;
        const sp = document.createElement('span'); sp.textContent = it.label; labelsEl.appendChild(sp);
        labels.push({ el: sp, p: new THREE.Vector3(-total / 2 + step * (i + 0.5), -0.15, bw / 2 + 0.4) });
      });
      s.view.radius = total * 0.82 + 10;
      s.view.target.set(0, 2.4, 0);
      born = performance.now();
    }
  };
}

/* ---------------- Attention : la page en relief ---------------- */
function heat(t) {
  const a = new THREE.Color(0x0645C9), b = new THREE.Color(0x4D8BFF), c = new THREE.Color(0xFFE100);
  return t < 0.55 ? a.lerp(b, t / 0.55) : b.lerp(c, (t - 0.55) / 0.45);
}
export function attentionScene(el, tipEl, onHover) {
  if (!webgl()) { el.insertAdjacentHTML('beforeend', '<p class="empty" style="padding:90px 24px;text-align:center;color:#979DB2">La 3D n’est pas disponible sur ce navigateur.</p>'); return { set() {}, focus() {} }; }
  const s = stage(el, { yaw: -0.58, pitch: 0.74, radius: 30, bloom: 0.5, fogNear: 40, fogFar: 110 });
  const group = new THREE.Group(); s.scene.add(group);
  let slabs = [], born = 0, focusKey = null;

  s.tick = t => {
    const k = (performance.now() - born) / 1000;
    slabs.forEach((b, i) => {
      const g = REDUCE ? 1 : ease((k - i * 0.05) / 1.2);
      const lift = b.key === focusKey ? 0.35 : 0;
      b.mesh.scale.y = Math.max(0.001, b.h * g);
      b.mesh.position.y = 0.06 + lift;
      b.edge.scale.y = b.mesh.scale.y; b.edge.position.y = b.mesh.position.y;
      b.cap.position.y = 0.06 + lift + b.h * g + 0.02;
      const target = b.key === focusKey ? b.ei + 0.6 : b.ei;
      b.mesh.material.emissiveIntensity += (target - b.mesh.material.emissiveIntensity) * 0.15;
      if (b.ring) { b.ring.position.y = b.cap.position.y + 0.02; b.ring.rotation.z = t * 0.6; b.ring.scale.setScalar(g); }
    });
  };
  s.onPick = (obj, mx, my) => {
    const b = obj ? obj.userData.slab : null;
    const k = b ? b.key : null;
    if (k !== s._k) { s._k = k; focusKey = k; if (onHover) onHover(k); }
    s.renderer.domElement.style.cursor = b ? 'pointer' : 'grab';
    if (b) { tipEl.innerHTML = b.tip; tipEl.style.left = mx + 'px'; tipEl.style.top = (my - 10) + 'px'; tipEl.classList.add('on'); }
    else tipEl.classList.remove('on');
  };

  return {
    focus(k) { if (!s._k) focusKey = k; },
    set(items) {
      disposeGroup(group); slabs = []; s.pickables = [];
      const W = 8, D = 0.9, G = 0.16;
      const L = items.length * (D + G) - G;
      // Feuille de la page
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.06, L + 1.4), new THREE.MeshStandardMaterial({ color: 0x0C0E18, roughness: 0.6, metalness: 0.3 }));
      group.add(sheet);
      const sheetEdge = new THREE.LineSegments(new THREE.EdgesGeometry(sheet.geometry), new THREE.LineBasicMaterial({ color: 0x4D8BFF, transparent: true, opacity: 0.35 }));
      group.add(sheetEdge);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, L) * 0.9, 64), new THREE.MeshBasicMaterial({ color: 0x0F62FF, transparent: true, opacity: 0.08 }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = -0.04; group.add(glow);

      const max = Math.max(1, ...items.map(x => x.avg));
      const sorted = items.slice().sort((a, b) => b.avg - a.avg).filter(x => x.avg > 0).slice(0, 3).map(x => x.key);
      items.forEach((it, i) => {
        const tt = it.avg / max;
        const hh = 0.08 + 3.4 * tt;
        const col = heat(tt);
        const geo = new THREE.BoxGeometry(W, 1, D); geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.08 + tt * 0.32, metalness: 0.45, roughness: 0.42, transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(geo, mat);
        const z = -L / 2 + i * (D + G) + D / 2;
        mesh.position.z = z; group.add(mesh);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }));
        edge.position.z = z; group.add(edge);
        const cap = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.12 + tt * 0.18), transparent: true, opacity: 0.35 + tt * 0.6 }));
        cap.rotation.x = -Math.PI / 2; cap.position.z = z; group.add(cap);
        const b = { key: it.key, mesh, edge, cap, h: hh, ei: 0.08 + tt * 0.32, tip: it.tip };
        const rank = sorted.indexOf(it.key);
        if (rank > -1) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: 0xFFE100, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(W / 2 - 0.7, 0, z); group.add(ring); b.ring = ring;
        }
        mesh.userData.slab = b; s.pickables.push(mesh);
        slabs.push(b);
      });
      s.view.radius = L * 1.25 + 12;
      s.view.target.set(0, 0.4, 0.4);
      born = performance.now();
    }
  };
}
