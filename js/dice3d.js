// Настоящие кости: объёмные дайсы, которые падают на стол, стукаются и катятся.
//
// Число решает не физика, а бросок в dice.js — иначе у каждого за столом
// выпало бы своё. Поэтому порядок обратный привычному: сначала мы прогоняем
// падение без картинки и смотрим, что легло кверху, а потом доворачиваем кость
// её же собственной симметрией — так, чтобы наверху оказалось нужное число.
// Поворот симметрии переводит кость саму в себя: раскладка цифр остаётся
// настоящей (противоположные грани по-прежнему дают в сумме N+1), кость всё так
// же честно лежит на грани, а результат один на всех.
//
// Библиотеки тянутся с CDN и только при первом броске. Не дотянулись или нет
// WebGL — бросок покажет прежняя плоская анимация из dice.js.

import { playAnimation } from './dice.js';

const TILT = 24 * Math.PI / 180;      // наклон взгляда от отвеса
const PX = 30;                        // пикселей на единицу мира

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
   `labelled` — сколько первых граней несут цифру: у d10 остальные десять
   это вторые половинки её «воздушных змеев», на них писать нечего.
   `top` — на какую вершину грани смотрит макушка цифры; так цифра стоит
   ровно, как на настоящей кости, а не повёрнутой наугад.
   `corners` у d4: числа стоят не в середине грани, а у её углов — читают
   такую кость по верхней вершине. */

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
    r: 1.4, font: .3, top: 0, corners: true, stretch: 1.45,
  },
  6: {
    verts: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    faces: [[0, 3, 2, 1], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [4, 5, 6, 7]],
    r: 1.15, font: .46, top: 0,
  },
  8: {
    verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    faces: [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 3, 4], [1, 4, 2], [1, 2, 5], [1, 5, 3]],
    r: 1.25, font: .4, top: 0,
  },
  10: {
    verts: d10verts(),
    faces: [[5, 7, 11], [4, 2, 10], [1, 3, 11], [0, 8, 10], [7, 9, 11],
      [8, 6, 10], [9, 1, 11], [2, 0, 10], [3, 5, 11], [6, 4, 10],
      [1, 0, 2], [1, 2, 3], [3, 2, 4], [3, 4, 5], [5, 4, 6],
      [5, 6, 7], [7, 6, 8], [7, 8, 9], [9, 8, 0], [9, 0, 1]],
    labelled: 10, r: 1.3, font: .34, top: 2,
  },
  12: {
    verts: [[0, 1 / PHI, PHI], [0, 1 / PHI, -PHI], [0, -1 / PHI, PHI], [0, -1 / PHI, -PHI],
      [PHI, 0, 1 / PHI], [PHI, 0, -1 / PHI], [-PHI, 0, 1 / PHI], [-PHI, 0, -1 / PHI],
      [1 / PHI, PHI, 0], [1 / PHI, -PHI, 0], [-1 / PHI, PHI, 0], [-1 / PHI, -PHI, 0],
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]],
    faces: [[2, 14, 4, 12, 0], [15, 9, 11, 19, 3], [16, 10, 17, 7, 6], [6, 7, 19, 11, 18],
      [6, 18, 2, 0, 16], [18, 11, 9, 14, 2], [1, 17, 10, 8, 13], [1, 13, 5, 15, 3],
      [13, 8, 12, 4, 5], [5, 4, 14, 9, 15], [0, 12, 8, 10, 16], [3, 19, 7, 17, 1]],
    r: 1.3, font: .36, top: 0,
  },
  20: {
    verts: [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
      [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]],
    faces: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
      [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8],
      [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]],
    r: 1.35, font: .3, top: 0,
  },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Кость в цифрах и координатах: вершины, грани с нормалями и развёрткой.
 * Развёртка кладёт описанную вокруг грани окружность в квадрат картинки, а
 * вверх картинки смотрит вершина `top` — цифра встаёт как на настоящей кости.
 */
function shape(kind) {
  const verts = kind.verts.map((v) => norm(v).map((x) => x * kind.r));
  const faces = kind.faces.map((f) => {
    const pts0 = f.map((i) => verts[i]);
    const c = pts0.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((x) => x / pts0.length);
    let n = norm(cross(sub(pts0[1], pts0[0]), sub(pts0[2], pts0[0])));
    // грань должна смотреть наружу: иначе физика сочтёт кость вывернутой
    const idx = dot(n, c) < 0 ? [...f].reverse() : f;
    if (dot(n, c) < 0) n = n.map((x) => -x);

    const pts = idx.map((i) => verts[i]);
    const up = norm(sub(pts[Math.min(kind.top || 0, pts.length - 1)], c));
    const right = norm(cross(up, n));
    const rad = Math.max(...pts.map((p) => len(sub(p, c))));
    const flat = pts.map((p) => {
      const d = sub(p, c);
      return [dot(d, right) / (2 * rad) + .5, dot(d, up) / (2 * rad) + .5];
    });
    return { idx, n, c, up, flat };
  });
  // как высоко центр лежащей кости: по нему и видно, что одна легла на другую
  const inr = Math.min(...faces.map((f) => Math.abs(dot(f.n, f.c))));
  return { verts, faces, inr, labelled: kind.labelled || kind.faces.length };
}

/* ── Настоящая раскладка чисел ─────────────────────────────────────── */

/**
 * Числа по граням, как на покупной кости: противоположные грани дают в сумме
 * N+1 (у d10 — крайние значения списка). Что где окажется наверху, решит потом
 * доворот, поэтому саму раскладку можно раздать раз и навсегда.
 */
function spread(sh, labels) {
  const N = sh.labelled;
  const out = new Array(N).fill(null);
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (out[i]) continue;
    const opp = sh.faces.findIndex((f, j) => j < N && j !== i && dot(f.n, sh.faces[i].n) < -.999);
    out[i] = labels[k];
    if (opp >= 0) out[opp] = labels[N - 1 - k];
    k++;
  }
  return out;
}

/**
 * Повороты, переводящие кость саму в себя: ими и доворачиваем нужное кверху.
 * Ищем их переносом рамки: кладём рамку первой грани на каждую другую грань,
 * перебирая, какая её вершина куда попадёт, и оставляем те повороты, после
 * которых все вершины кости снова сели на прежние места.
 */
const symCache = new Map();
function symmetries(THREE, kindId, sh) {
  if (symCache.has(kindId)) return symCache.get(kindId);
  const V = sh.verts.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
  const Nrm = sh.faces.map((f) => new THREE.Vector3(f.n[0], f.n[1], f.n[2]));
  const tmp = new THREE.Vector3();
  const out = [];

  /** Ортонормальная рамка грани: первая ось — на вершину со сдвигом shift. */
  const frame = (fi, shift) => {
    const f = sh.faces[fi];
    const p = V[f.idx[shift % f.idx.length]];
    const c = new THREE.Vector3(f.c[0], f.c[1], f.c[2]);
    const e3 = Nrm[fi].clone();
    const e1 = p.clone().sub(c).normalize();
    const e2 = e3.clone().cross(e1).normalize();
    return new THREE.Matrix4().makeBasis(e1, e2, e3);
  };
  const back = frame(0, 0).transpose();          // у поворота обратное — это перенос
  const same = (q) => V.every((v) => {
    tmp.copy(v).applyQuaternion(q);
    return V.some((w) => w.distanceToSquared(tmp) < 1e-6);
  });

  const n0 = sh.faces[0].idx.length;
  sh.faces.forEach((f, j) => {
    if (f.idx.length !== n0) return;
    for (let shift = 0; shift < n0; shift++) {
      const q = new THREE.Quaternion().setFromRotationMatrix(frame(j, shift).multiply(back));
      if (!same(q)) continue;
      if (out.some((o) => Math.abs(o.q.dot(q)) > .9999)) continue;
      // куда этот поворот уводит каждую грань и каждую вершину
      const faceTo = Nrm.map((n) => {
        tmp.copy(n).applyQuaternion(q);
        return Nrm.findIndex((m) => m.distanceToSquared(tmp) < 1e-4);
      });
      const vertTo = V.map((v) => {
        tmp.copy(v).applyQuaternion(q);
        return V.findIndex((w) => w.distanceToSquared(tmp) < 1e-4);
      });
      out.push({ q, faceTo, vertTo });
    }
  });
  symCache.set(kindId, out);
  return out;
}

/* ── Цифры на гранях ───────────────────────────────────────────────── */

/** texts: [{ text, at:[u,v], rot }] — место и наклон в координатах развёртки. */
function faceTexture(THREE, texts, fontPart) {
  const S = 180;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#231f18';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f0dcae';
  g.font = `600 ${Math.round(S * fontPart)}px Cinzel, Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  texts.forEach((t) => {
    g.save();
    g.translate(t.at[0] * S, (1 - t.at[1]) * S);
    g.rotate(t.rot || 0);
    // Грани d4 стоят к отвесной камере почти ребром: цифру заранее вытягиваем
    // вдоль сжатого направления, и сверху она видна нормальной.
    if (t.stretch) {
      g.scale(1, t.stretch);
      g.textBaseline = 'top';
    }
    g.fillText(t.text, 0, 0);
    // шестёрку от девятки отличает чёрточка — как на настоящих костях
    if (t.text === '6' || t.text === '9') {
      const w = g.measureText(t.text).width;
      g.fillRect(-w * .35, S * fontPart * .52, w * .7, Math.max(2, S * .016));
    }
    g.textBaseline = 'middle';
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Что написать на грани: одно число в середине или три у углов (d4). */
function faceTexts(kind, sh, fi, values) {
  const face = sh.faces[fi];
  if (!kind.corners) return [{ text: values.face[fi], at: [.5, .5], rot: 0 }];
  return face.idx.map((vi, k) => {
    const [x, y] = face.flat[k];
    const dx = x - .5, dy = y - .5;
    return {
      text: values.vert[vi],
      at: [.5 + dx * .78, .5 + dy * .78],
      rot: Math.atan2(dx, dy),          // макушка цифры смотрит в свой угол
      stretch: kind.stretch,
    };
  });
}

/* ── Что должно лежать на каждой кости ─────────────────────────────── */

const TENS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
const UNITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const plainLabels = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

/** Один бросок — это список костей: у d100 на каждое число их две. */
function plan(result) {
  const out = [];
  result.dice.slice(0, 8).forEach((v) => {
    if (result.sides === 100) {
      out.push({ kind: 10, want: String(Math.floor((v % 100) / 10) * 10).padStart(2, '0'), labels: TENS });
      out.push({ kind: 10, want: String(v % 10), labels: UNITS });
    } else {
      out.push({ kind: result.sides, want: String(v), labels: plainLabels(result.sides) });
    }
  });
  return out.slice(0, 10);
}

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

  // Кости падают на игровое поле, а не поверх панелей: холст занимает его же место
  const area = (document.getElementById('board-wrap') || stage).getBoundingClientRect();
  const W = Math.round(area.width) || 640;
  const H = Math.round(area.height) || 480;
  holder.style.cssText = `left:${area.left}px; top:${area.top}px; width:${W}px; height:${H}px; right:auto; bottom:auto`;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  holder.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Стол ровный и параллелен экрану: проекция без схождения, поэтому ни одна
  // линия никуда не «заваливается» и дальняя кость ровно того же размера, что
  // ближняя. Небольшой наклон взгляда нужен лишь затем, чтобы боковые грани —
  // и особенно грани d4 — не вставали к нам ребром.
  // Пикселей на единицу мира — величина постоянная: кость одинакова и на
  // ноутбуке, и на большом мониторе, а не растёт вместе с окном.
  const wide = Math.max(W / PX, 12);
  const view = Math.max(H / PX, 9);
  const camera = new THREE.OrthographicCamera(-wide / 2, wide / 2, view / 2, -view / 2, 1, 220);
  camera.position.set(0, Math.cos(TILT) * 80, Math.sin(TILT) * 80 + 2);
  camera.lookAt(0, 0, 2);
  // без этого мировая матрица камеры пустая, и промер стола лучом мимо кассы:
  // борта вставали по запасным числам, а стол выходил вчетверо меньше
  camera.updateMatrixWorld(true);

  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x4a4136, 1.35));
  const key = new THREE.DirectionalLight(0xffe9bd, 2.2);
  key.position.set(-9, 15, -7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const d = 14;
  Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 44 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, .85);
  rim.position.set(9, 6, 7);
  scene.add(rim);

  // пол ловит только тень: самого стола не видно, кости лежат на поле игры
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ opacity: .36 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ── стол с бортами ── */
  const b = bounds(THREE, camera);

  /** Один прогон падения — без картинки, только числа. */
  const throwOnce = () => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -42, 0) });
    world.allowSleep = true;
    world.defaultContactMaterial.friction = .45;
    world.defaultContactMaterial.restitution = .3;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);

    // Дальний борт ближе остальных: наверху экрана верхняя панель, кости не
    // должны на неё наезжать.
    [[-1, 0, b.x], [1, 0, b.x], [0, -1, b.near], [0, 1, b.far]].forEach(([nx, nz, dist]) => {
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
      wall.quaternion.setFromEuler(0, Math.atan2(nx, nz), 0);
      wall.position.set(-nx * dist, 0, -nz * dist);
      world.addBody(wall);
    });

    // Бросаем с четырёх сторон по очереди: кости идут навстречу друг другу и
    // расходятся по столу, а не выстраиваются в очередь к дальнему борту.
    const turn = Math.floor(Math.random() * 4);
    const dice = list.map((item, i) => {
      const kind = KINDS[item.kind];
      const sh = shape(kind);
      const bd = body(CANNON, sh, 260);
      bd.linearDamping = .16;
      bd.angularDamping = .12;

      const side = (i + turn) % 4;
      const along = (k) => (Math.random() - .5) * 1.4 * k;      // разброс вдоль борта
      // Скорость по задуманному пути: дальше половины стола кость не улетает,
      // иначе весь бросок кончается у противоположного борта.
      const ходу = (d) => 1.2 + .8 * d * (.3 + Math.random() * .22);
      let px, pz, vx, vz;
      if (side === 0) { px = -b.x + .6; pz = along(b.near); vx = ходу(2 * b.x); vz = -pz * .35; }
      else if (side === 1) { px = b.x - .6; pz = along(b.near); vx = -ходу(2 * b.x); vz = -pz * .35; }
      else if (side === 2) { pz = b.near - .6; px = along(b.x); vz = -ходу(b.near + b.far); vx = -px * .35; }
      else { pz = -b.far + .6; px = along(b.x); vz = ходу(b.near + b.far); vx = -px * .35; }

      bd.position.set(px, 4 + (i % 3) * .9, pz);
      bd.velocity.set(vx, 1, vz);
      bd.angularVelocity.set(rnd(9), rnd(9), rnd(9));
      bd.quaternion.setFromEuler(rnd(3), rnd(3), rnd(3));
      world.addBody(bd);
      return { item, kind, sh, bd, frames: [] };
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
    return dice;
  };

  /**
   * Чем плох этот бросок: кость забралась на соседку, уткнулась в борт или
   * стоит к соседке вплотную. Ноль — значит все лежат врозь и читаются.
   */
  const faults = (d) => {
    let bad = 0;
    d.forEach((x, i) => {
      const p = x.bd.position;
      if (p.y > x.sh.inr * 1.6) bad++;                                    // залезла на другую
      const edge = x.kind.r * .9;
      if (Math.abs(p.x) > b.x - edge || p.z > b.near - edge || p.z < -b.far + edge) bad++;
      for (let j = i + 1; j < d.length; j++) {
        const q = d[j].bd.position;
        const need = (x.kind.r + d[j].kind.r) * 1.12;
        if (Math.hypot(p.x - q.x, p.z - q.z) < need) bad++;               // жмётся к соседке
      }
    });
    return bad;
  };

  // Плохой бросок просто переигрываем: прогон идёт без картинки и стоит доли
  // миллисекунды, поэтому со стороны это всё тот же один бросок.
  let dice = null;
  let worst = Infinity;
  for (let again = 0; again < 12; again++) {
    const d = throwOnce();
    const bad = faults(d);
    if (bad < worst) { worst = bad; dice = d; }
    if (!bad) break;
  }

  /* ── доворот: нужное число кверху, раскладка при этом остаётся настоящей ── */
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3();
  const qf = new THREE.Quaternion();
  const qt = new THREE.Quaternion();
  dice.forEach((x) => {
    const f = x.frames[x.frames.length - 1];
    qf.set(f[3], f[4], f[5], f[6]);

    const values = { face: spread(x.sh, x.item.labels) };
    if (x.kind.corners) values.vert = x.item.labels.slice(0, x.sh.verts.length);
    x.values = values;

    // что сейчас наверху и что должно там быть
    const ups = x.kind.corners
      ? best(x.sh.verts, (p) => v3.set(p[0], p[1], p[2]).applyQuaternion(qf).dot(up))
      : best(x.sh.faces.slice(0, x.sh.labelled), (fc) => v3.set(fc.n[0], fc.n[1], fc.n[2]).applyQuaternion(qf).dot(up));
    const want = x.kind.corners
      ? values.vert.indexOf(x.item.want)
      : values.face.indexOf(x.item.want);

    // Доворотов, кладущих нужное наверх, обычно несколько — берём тот, после
    // которого верхняя цифра стоит к смотрящему макушкой, а не боком.
    const syms = symmetries(THREE, x.item.kind, x.sh);
    const fit = syms.filter((o) => (x.kind.corners ? o.vertTo[want] === ups : o.faceTo[want] === ups));
    const face = x.sh.faces[x.kind.corners ? 0 : want];
    let s = null, look = -Infinity;
    fit.forEach((o) => {
      qt.copy(qf).multiply(o.q);
      v3.set(face.up[0], face.up[1], face.up[2]).applyQuaternion(qt);
      const k = -v3.z / (Math.hypot(v3.x, v3.z) || 1);      // вверх экрана — это −z
      if (k > look) { look = k; s = o; }
    });
    x.turn = s ? s.q : new THREE.Quaternion();
    x.shown = s
      ? (x.kind.corners ? values.vert[want] : values.face[want])
      : (x.kind.corners ? values.vert[ups] : values.face[ups]);
  });
  // для проверки: что просили показать и что в самом деле легло кверху
  window.__dice3dLast = dice.map((x) => ({
    надо: x.item.want, сверху: x.shown, r: x.kind.r,
    x: +x.bd.position.x.toFixed(2), y: +x.bd.position.y.toFixed(2), z: +x.bd.position.z.toFixed(2),
  }));
  window.__dice3dTray = { x: +b.x.toFixed(2), near: +b.near.toFixed(2), far: +b.far.toFixed(2) };
  window.__dice3dFaults = worst;      // сколько огрехов осталось в раскладке костей

  /* ── и только теперь собираем видимые кости ── */
  const trash = [];
  dice.forEach((x) => {
    const mats = [];
    for (let fi = 0; fi < x.sh.labelled; fi++) {
      const tex = faceTexture(THREE, faceTexts(x.kind, x.sh, fi, x.values), x.kind.font);
      trash.push(tex);
      mats.push(new THREE.MeshStandardMaterial({ map: tex, roughness: .4, metalness: .2 }));
    }
    mats.push(new THREE.MeshStandardMaterial({ color: 0x231f18, roughness: .4, metalness: .2 }));
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
        x.mesh.quaternion.set(f[3], f[4], f[5], f[6]).multiply(x.turn);
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

/** Геометрия кости: каждая грань — свой кусок со своей картинкой. */
function geometry(THREE, sh) {
  const pos = [];
  const uv = [];
  const groups = [];
  sh.faces.forEach((face, fi) => {
    const start = pos.length / 3;
    const pts = face.idx.map((i) => sh.verts[i]);
    for (let i = 1; i < pts.length - 1; i++) {
      [0, i, i + 1].forEach((k) => {
        pos.push(pts[k][0], pts[k][1], pts[k][2]);
        uv.push(face.flat[k][0], face.flat[k][1]);
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
  const zz = Math.min(z * .5, 7.5);
  return { x: Math.min(x * .8, 11), near: zz, far: zz * .55, z: zz };
}

/** Кто из списка дальше всех «вверх» — по мерке score. */
function best(list, score) {
  let at = 0, top = -Infinity;
  list.forEach((item, i) => { const s = score(item); if (s > top) { top = s; at = i; } });
  return at;
}

const rnd = (k) => (Math.random() - .5) * 2 * k;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
