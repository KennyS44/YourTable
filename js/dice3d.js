// Настоящие кости: объёмные дайсы, которые падают на стол, стукаются и катятся.
//
// Число решает не физика, а бросок в dice.js — иначе у каждого за столом
// выпало бы своё. Поэтому порядок обратный привычному: сначала мы прогоняем
// падение без картинки и смотрим, какая грань легла кверху, и только потом
// пишем на грани цифры — так, чтобы наверху оказалась нужная. Кость честно
// катится, результат честно один на всех.
//
// Библиотеки тянутся с CDN и только при первом броске. Не дотянулись или нет
// WebGL — бросок покажет прежняя плоская анимация из dice.js.

import { playAnimation } from './dice.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
const CANNON_URL = 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

let libs = null;
function load() {
  if (!libs) {
    libs = Promise.all([import(THREE_URL), import(CANNON_URL)])
      .then(([THREE, CANNON]) => ({ THREE, CANNON }));
    libs.catch(() => { libs = null; });          // не вышло — в следующий раз попробуем снова
  }
  return libs;
}

/* ── Тела костей: вершины и грани, как у настоящих ───────────────────
   Первые `labelled` граней несут цифру; у d10 остальные десять — вторые
   половинки её «воздушных змеев», на них писать нечего. */

const PHI = (1 + Math.sqrt(5)) / 2;
const d10verts = () => {
  const v = [];
  for (let i = 0, b = 0; i < 10; i++, b += Math.PI / 5) v.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
  v.push([0, 0, -1], [0, 0, 1]);
  return v;
};

const KINDS = {
  4: {
    verts: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]],
    faces: [[1, 0, 2], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
    r: 1.35, font: .48,
  },
  6: {
    verts: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    faces: [[0, 3, 2, 1], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [4, 5, 6, 7]],
    r: 1.15, font: .5,
  },
  8: {
    verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    faces: [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 3, 4], [1, 4, 2], [1, 2, 5], [1, 5, 3]],
    r: 1.3, font: .46,
  },
  10: {
    verts: d10verts(),
    faces: [[5, 7, 11], [4, 2, 10], [1, 3, 11], [0, 8, 10], [7, 9, 11],
      [8, 6, 10], [9, 1, 11], [2, 0, 10], [3, 5, 11], [6, 4, 10],
      [1, 0, 2], [1, 2, 3], [3, 2, 4], [3, 4, 5], [5, 4, 6],
      [5, 6, 7], [7, 6, 8], [7, 8, 9], [9, 8, 0], [9, 0, 1]],
    labelled: 10, r: 1.3, font: .4,
  },
  12: {
    verts: [[0, 1 / PHI, PHI], [0, 1 / PHI, -PHI], [0, -1 / PHI, PHI], [0, -1 / PHI, -PHI],
      [PHI, 0, 1 / PHI], [PHI, 0, -1 / PHI], [-PHI, 0, 1 / PHI], [-PHI, 0, -1 / PHI],
      [1 / PHI, PHI, 0], [1 / PHI, -PHI, 0], [-1 / PHI, PHI, 0], [-1 / PHI, -PHI, 0],
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]],
    faces: [[2, 14, 4, 12, 0], [15, 9, 11, 19, 3], [16, 10, 17, 7, 6], [6, 7, 19, 11, 18],
      [6, 18, 2, 0, 16], [18, 11, 9, 14, 2], [1, 17, 10, 8, 13], [1, 13, 5, 15, 3],
      [13, 8, 12, 4, 5], [5, 4, 14, 9, 15], [0, 12, 8, 10, 16], [3, 19, 7, 17, 1]],
    r: 1.35, font: .42,
  },
  20: {
    verts: [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
      [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]],
    faces: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
      [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8],
      [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]],
    r: 1.45, font: .4,
  },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Вершины кости: приведены к одному радиусу и растянуты до нужного размера. */
function shape(kind) {
  const verts = kind.verts.map((v) => norm(v).map((x) => x * kind.r));
  const faces = kind.faces.map((f) => {
    const pts = f.map((i) => verts[i]);
    const c = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / pts.length);
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    // грань должна смотреть наружу: иначе физика сочтёт кость вывернутой
    const idx = dot(n, c) < 0 ? [...f].reverse() : f;
    if (dot(n, c) < 0) n = n.map((x) => -x);
    return { idx, n, c };
  });
  return { verts, faces, labelled: kind.labelled || kind.faces.length };
}

/* ── Цифры: каждая грань — своя маленькая картинка ─────────────────── */

function faceTexture(THREE, text, fontPart) {
  const S = 160;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#272219';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f3e6c4';
  g.font = `600 ${Math.round(S * fontPart)}px Cinzel, Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, S / 2, S / 2 + S * 0.02);
  // шестёрку от девятки отличает чёрточка — как на настоящих костях
  if (text === '6' || text === '9') {
    const w = g.measureText(text).width;
    g.fillRect((S - w * 0.7) / 2, S / 2 + S * fontPart * 0.55, w * 0.7, Math.max(2, S * 0.018));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Геометрия кости: каждая грань — свой кусок с собственной картинкой.
 * Развёртка кладёт описанную вокруг грани окружность в квадрат картинки,
 * поэтому цифра всегда оказывается ровно в середине грани.
 */
function geometry(THREE, sh) {
  const pos = [];
  const uv = [];
  const groups = [];
  sh.faces.forEach((face, fi) => {
    const start = pos.length / 3;
    const pts = face.idx.map((i) => sh.verts[i]);
    const u = norm(sub(pts[0], face.c));
    const w = norm(cross(face.n, u));
    const rad = Math.max(...pts.map((p) => len(sub(p, face.c))));
    const flat = pts.map((p) => {
      const d = sub(p, face.c);
      return [dot(d, u) / (2 * rad) + .5, dot(d, w) / (2 * rad) + .5];
    });
    for (let i = 1; i < pts.length - 1; i++) {
      [0, i, i + 1].forEach((k) => {
        pos.push(pts[k][0], pts[k][1], pts[k][2]);
        uv.push(flat[k][0], flat[k][1]);
      });
    }
    groups.push({ start, count: pos.length / 3 - start, mat: fi < sh.labelled ? fi : sh.labelled });
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  groups.forEach((g) => geo.addGroup(g.start, g.count, g.mat));
  return geo;
}

/** Тело для физики: тот же многогранник, что и на картинке. */
function body(CANNON, sh, mass) {
  const shape = new CANNON.ConvexPolyhedron({
    vertices: sh.verts.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
    faces: sh.faces.map((f) => f.idx),
  });
  const b = new CANNON.Body({ mass, shape, allowSleep: true });
  b.sleepSpeedLimit = .55;
  b.sleepTimeLimit = .2;
  return b;
}

/* ── Что должно лежать на каждой кости ─────────────────────────────── */

/** Один бросок — это список костей: у d100 на каждое число их две. */
function plan(result) {
  const out = [];
  result.dice.slice(0, 8).forEach((v) => {
    if (result.sides === 100) {
      const tens = Math.floor((v % 100) / 10) * 10;
      out.push({ kind: 10, want: String(tens).padStart(2, '0'), labels: TENS });
      out.push({ kind: 10, want: String(v % 10), labels: UNITS });
    } else {
      out.push({ kind: result.sides, want: String(v), labels: plainLabels(result.sides) });
    }
  });
  return out.slice(0, 10);
}
const TENS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
const UNITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const plainLabels = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

/* ── Сам бросок ────────────────────────────────────────────────────── */

let busy = Promise.resolve();
let failed = false;

/**
 * Показать бросок объёмными костями. Броски идут по очереди: два раза подряд
 * кости не летят друг сквозь друга.
 */
export function showRoll(stage, result, caption) {
  const flat = () => playAnimation(stage, result, caption);
  const slow = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (failed || slow) { flat(); return; }
  busy = busy.then(() => run(stage, result, caption).catch((e) => {
    console.warn('3D-кубики не вышли:', e && e.message);
    failed = true;                      // один раз не получилось — дальше показываем плоские
    flat();
  }));
}

async function run(stage, result, caption) {
  const { THREE, CANNON } = await load();
  const list = plan(result);
  if (!list.length) return;

  /* ── сцена ── */
  const holder = document.createElement('div');
  holder.className = 'die-throw dice3d';
  stage.appendChild(holder);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  const W = stage.clientWidth || window.innerWidth;
  const H = stage.clientHeight || window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  holder.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // камера стоит высоко и далеко: кость на экране размером с прежнюю плоскую,
  // а не во весь стол
  const camera = new THREE.PerspectiveCamera(42, W / H, 1, 120);
  camera.position.set(0, 27, 15);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x20201c, 1.15));
  const key = new THREE.DirectionalLight(0xffe9bd, 2.1);
  key.position.set(-6, 14, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const d = 11;
  Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 40 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, .5);
  rim.position.set(7, 6, -6);
  scene.add(rim);

  // пол ловит только тень: самого стола не видно, кости лежат на поле игры
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .34 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ── стол с бортами по краям экрана ── */
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -42, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = .45;
  world.defaultContactMaterial.restitution = .32;
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const b = bounds(THREE, camera);
  [[-1, 0, b.x], [1, 0, b.x], [0, -1, b.z], [0, 1, b.z]].forEach(([nx, nz, dist]) => {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    wall.quaternion.setFromEuler(0, Math.atan2(nx, nz), 0);
    wall.position.set(-nx * dist, 0, -nz * dist);
    world.addBody(wall);
  });

  /* ── кости: сперва падение без картинки ── */
  const dice = list.map((item, i) => {
    const sh = shape(KINDS[item.kind]);
    const bd = body(CANNON, sh, 260);
    // кости влетают слева и укатываются к середине стола, а не в дальний угол
    bd.linearDamping = .16;
    bd.angularDamping = .12;
    bd.position.set(-b.x * .55 + Math.random(), 6 + i * 1.3, b.z * .5 - i * .4);
    bd.velocity.set(3.5 + Math.random() * 3, 1, -2.5 - Math.random() * 3);
    bd.angularVelocity.set(rnd(9), rnd(9), rnd(9));
    bd.quaternion.setFromEuler(rnd(3), rnd(3), rnd(3));
    world.addBody(bd);
    return { item, sh, bd, frames: [] };
  });

  const STEP = 1 / 60;
  let steps = 0;
  while (steps < 780) {
    world.step(STEP);
    dice.forEach((x) => x.frames.push([
      x.bd.position.x, x.bd.position.y, x.bd.position.z,
      x.bd.quaternion.x, x.bd.quaternion.y, x.bd.quaternion.z, x.bd.quaternion.w,
    ]));
    steps++;
    if (steps > 60 && dice.every((x) => x.bd.sleepState === CANNON.Body.SLEEPING)) break;
  }

  /* ── теперь пишем цифры так, чтобы кверху легла нужная ── */
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  dice.forEach((x) => {
    q.set(x.bd.quaternion.x, x.bd.quaternion.y, x.bd.quaternion.z, x.bd.quaternion.w);
    let best = 0, bestDot = -2;
    for (let f = 0; f < x.sh.labelled; f++) {
      n.set(x.sh.faces[f].n[0], x.sh.faces[f].n[1], x.sh.faces[f].n[2]).applyQuaternion(q);
      const k = n.dot(up);
      if (k > bestDot) { bestDot = k; best = f; }
    }
    const labels = [...x.item.labels];
    const j = labels.indexOf(x.item.want);
    if (j >= 0) { const t = labels[best]; labels[best] = labels[j]; labels[j] = t; }
    x.labels = labels;
    x.top = best;
  });
  // для проверки: что просили показать и что в самом деле легло кверху
  window.__dice3dLast = dice.map((x) => ({ надо: x.item.want, сверху: x.labels[x.top] }));

  /* ── и только теперь собираем видимые кости ── */
  const trash = [];
  dice.forEach((x) => {
    const kind = KINDS[x.item.kind];
    const mats = x.labels.slice(0, x.sh.labelled).map((text) => {
      const tex = faceTexture(THREE, text, kind.font);
      trash.push(tex);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: .42, metalness: .18 });
    });
    mats.push(new THREE.MeshStandardMaterial({ color: 0x272219, roughness: .42, metalness: .18 }));
    const geo = geometry(THREE, x.sh);
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    scene.add(mesh);
    // золотой кант по рёбрам: шва между половинками «змея» у d10 не видно
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 12),
      new THREE.LineBasicMaterial({ color: 0xc9a45a, transparent: true, opacity: .75 }),
    );
    mesh.add(edges);
    trash.push(geo, edges.geometry, edges.material, ...mats);
    x.mesh = mesh;
  });

  /* ── проигрываем записанное падение ── */
  const res = document.createElement('div');
  res.className = 'die-result';
  res.innerHTML = `<div class="total-big">${result.total}</div><div class="caption">${escapeHtml(caption)}</div>`;
  holder.appendChild(res);

  const total = dice[0].frames.length;
  await new Promise((done) => {
    const t0 = performance.now();
    const tick = () => {
      const i = Math.min(total - 1, Math.floor((performance.now() - t0) / 1000 * 60));
      dice.forEach((x) => {
        const f = x.frames[i];
        x.mesh.position.set(f[0], f[1], f[2]);
        x.mesh.quaternion.set(f[3], f[4], f[5], f[6]);
      });
      renderer.render(scene, camera);
      if (i < total - 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  res.classList.add('is-on');

  await wait(2600);
  holder.classList.add('is-out');
  await wait(600);

  /* ── убираем за собой: видеопамять сама не освободится ── */
  holder.remove();
  trash.forEach((t) => t.dispose && t.dispose());
  renderer.dispose();
}

/**
 * Борта стола. Видно куда больше, но кости должны остаться в середине экрана,
 * а не укатиться под панели и за верхний край.
 */
function bounds(THREE, camera) {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let x = 8, z = 6;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    ray.setFromCamera({ x: sx, y: sy }, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    x = Math.max(x, Math.min(30, Math.abs(hit.x)));
    z = Math.max(z, Math.min(24, Math.abs(hit.z)));
  });
  return { x: Math.min(x * .38, 9), z: Math.min(z * .36, 6.5) };
}

const rnd = (k) => (Math.random() - .5) * 2 * k;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
