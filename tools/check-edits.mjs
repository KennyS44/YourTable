// Проверка правок: магнит стен, ластик стен, факелы, обзор только своих фигурок,
// скрытые имена, выход из боя, перевод существ между локациями, база существ.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Правки ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch();
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(dm, 'DM');
await dm.goto(`${BASE}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
dm.once('dialog', (d) => d.accept('Подвал'));
await dm.click('#btn-add-location');
await dm.waitForTimeout(1000);
await dm.evaluate(() => {
  const s = window.__state();
  window.__dispatch({ t: 'loc.update', id: s.activeLoc, patch: { fogOn: true, grid: { size: 70, ox: 0, oy: 0, feet: 5, show: true } } });
});

const pl = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(pl, 'PL');
await pl.goto(`${BASE}?${q({ r: ROOM, k: KEY })}`);
await pl.fill('#join-form [name=name]', 'Торин');
await pl.click('#join-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(2500);

/* экран ↔ мир: все точки задаём в пикселях самого поля */
const box = await dm.evaluate(() => {
  const r = document.querySelector('#board').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const world = (lx, ly) => dm.evaluate(([x, y]) => window.__board().screenToWorld(x, y), [lx, ly]);
const local = async (wx, wy) => dm.evaluate(([x, y]) => window.__board().worldToScreen(x, y), [wx, wy]);
const drag = async (a, b, mods = []) => {
  for (const m of mods) await dm.keyboard.down(m);
  await dm.mouse.move(box.x + a[0], box.y + a[1]); await dm.mouse.down();
  await dm.mouse.move(box.x + (a[0] + b[0]) / 2, box.y + (a[1] + b[1]) / 2, { steps: 4 });
  await dm.mouse.move(box.x + b[0], box.y + b[1], { steps: 4 }); await dm.mouse.up();
  for (const m of mods) await dm.keyboard.up(m);
  await dm.waitForTimeout(250);
};
const walls = () => dm.evaluate(() => { const s = window.__state(); return (s.locations[s.activeLoc].walls || []).map((w) => ({ ...w })); });
const lights = () => dm.evaluate(() => { const s = window.__state(); return (s.locations[s.activeLoc].lights || []).slice(); });

/* 1. МАГНИТ: второй отрезок начинается ровно в конце первого */
await dm.click('#toolbar [data-tool=wall]');
await dm.click('[data-wallkind=wall]');
await drag([200, 150], [400, 150]);
const w1 = (await walls())[0];
const конец = await local(w1.x2, w1.y2);              // от края первой стены отступаем 20 px
await drag([конец.x, конец.y + 20], [конец.x, конец.y + 240], ['Alt']);   // Alt — без сетки, спасает только магнит
const w = await walls();
R.магнит = {
  стен: w.length,
  щельПиксели: w.length >= 2 ? Math.round(Math.hypot(w[1].x1 - w[0].x2, w[1].y1 - w[0].y2)) : null,
};

await dm.evaluate(() => { const c = document.querySelector('#wall-snap'); c.checked = false; c.dispatchEvent(new Event('change')); });
await drag([конец.x + 200, конец.y + 20], [конец.x + 200, конец.y + 240], ['Alt']);
const w2 = await walls();
R.магнитВыключен = { стен: w2.length, щельПиксели: Math.round(Math.hypot(w2[2].x1 - w2[1].x1, w2[2].y1 - w2[1].y1)) };
await dm.evaluate(() => { const c = document.querySelector('#wall-snap'); c.checked = true; c.dispatchEvent(new Event('change')); });

/* 2. ЛАСТИК СТЕН */
await dm.click('[data-wallkind=erase]');
await drag([конец.x + 200, конец.y + 100], [конец.x + 200, конец.y + 160]);
R.ластикСтен = { было: w2.length, стало: (await walls()).length };

/* 3. ФОНАРЬ */
await dm.click('[data-wallkind=lantern]');
await dm.mouse.click(box.x + 300, box.y + 400);
await dm.waitForTimeout(300);
R.фонарь = (await lights()).map((l) => ({ kind: l.kind, feet: l.feet }));

await dm.click('[data-wallkind=erase]');
await drag([300, 400], [304, 404]);
R.огонёкСтёрт = (await lights()).length === 0;
await dm.click('#toolbar [data-tool=select]');

/* 4. ОБЗОР: игрок видит своё, но не круг соседа */
await dm.evaluate(() => {
  const s = window.__state();
  const mk = (id, name, owner, x) => window.__dispatch({
    t: 'token.add',
    token: {
      id, locId: s.activeLoc, x, y: 5, cells: 1, name, kind: 'pc', assetId: null,
      ownerName: owner, ownerId: null, hp: { cur: 10, max: 10 }, hpPublic: true, namePublic: true,
      statuses: [], vision: 20,
    },
  });
  mk('свой', 'Торин', 'Торин', -355);
  mk('чужой', 'Балин', 'Балин', 355);
  window.__dispatch({
    t: 'token.add',
    token: {
      id: 'враг', locId: s.activeLoc, x: -355, y: 5, cells: 1, name: 'Тайный вурдалак', kind: 'enemy',
      assetId: null, ownerName: null, ownerId: null, hp: { cur: 9, max: 9 }, hpPublic: false,
      namePublic: false, statuses: [], vision: 0,
    },
  });
  window.__dispatch({ t: 'init.set', order: [{ id: 'враг', v: 15 }, { id: 'свой', v: 10 }] });
});
await pl.waitForTimeout(2500);
// плотность тумана (0 — открыто, 255 — глухая темнота) рядом со своей и чужой фигуркой
const туман = (page, wx, wy) => page.evaluate(([x, y]) => {
  const p = window.__board().worldToScreen(x, y);
  const c = document.querySelector('#board');
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const px = c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data;
  return px[3];
}, [wx, wy]);
R.обзорИгрока = { рядомСоСвоей: await туман(pl, -300, 5), рядомСЧужой: await туман(pl, 300, 5) };
R.обзорМастера = { рядомСоСвоей: await туман(dm, -300, 5), рядомСЧужой: await туман(dm, 300, 5) };

/* 5. СКРЫТОЕ ИМЯ в списке боя */
await pl.click('[data-rtab=init]');
await pl.waitForTimeout(400);
R.имена = {
  игрок: await pl.$$eval('#init-list .nm', (n) => n.map((x) => x.textContent)),
  мастер: await dm.$$eval('#init-list .nm', (n) => n.map((x) => x.textContent)),
};

/* 6. ПЕРЕХОД К ФИГУРКЕ */
await pl.evaluate(() => window.__board().zoomBy(1));
const доПерехода = await pl.evaluate(() => ({ ...window.__board().view() }));
await pl.click('#init-list .mini');
await pl.waitForTimeout(300);
const после = await pl.evaluate(() => ({ ...window.__board().view() }));
R.переходКФигурке = { сдвинулась: доПерехода.x !== после.x || доПерехода.y !== после.y };

/* 7. ВЫХОД ИЗ БОЯ ОДНОЙ КНОПКОЙ */
await dm.click('[data-rtab=init]');
R.кнопкаБоя = { видна: await dm.$eval('#init-end', (b) => !b.hidden) };
dm.once('dialog', (d) => d.accept());
await dm.click('#init-end');
await dm.waitForTimeout(400);
R.кнопкаБоя.осталосьВБою = await dm.evaluate(() => window.__state().init.order.length);
await pl.waitForTimeout(1500);
R.кнопкаБоя.уИгрокаОсталось = await pl.evaluate(() => window.__state().init.order.length);

/* 8. ПЕРЕВОД ВСЕХ В ЛОКАЦИЮ */
dm.once('dialog', (d) => d.accept('Двор'));
await dm.click('#btn-add-location');
await dm.waitForTimeout(600);
const первая = await dm.evaluate(() => window.__state().order[0]);
await dm.evaluate((id) => window.__dispatch({ t: 'loc.active', id }), первая);
await dm.waitForTimeout(400);
await dm.click('[data-fold=move] > summary');
dm.once('dialog', (d) => d.accept());
await dm.click('#btn-move-all');
await dm.waitForTimeout(600);
R.переводВсех = await dm.evaluate(() => {
  const s = window.__state();
  const где = (id) => s.tokens[id] && s.locations[s.tokens[id].locId].name;
  return { свой: где('свой'), чужой: где('чужой'), враг: где('враг'), активная: s.locations[s.activeLoc].name };
});

/* 9. БАЗА СУЩЕСТВ: имя и зрение переживают удаление фигурки */
await dm.click('[data-ltab=library]');
await dm.evaluate(() => window.__dispatch({
  t: 'lib.add', item: { id: 'lib1', name: 'Гоблин', kind: 'enemy', assetId: null, stats: undefined },
}));
await dm.waitForTimeout(400);
await dm.click('.lib-item .edit');
await dm.waitForTimeout(300);
await dm.evaluate(() => {
  const card = document.querySelector('#token-card');
  const set = (i, v) => { const el = card.querySelectorAll('input')[i]; el.value = v; el.dispatchEvent(new Event('change')); };
  const name = card.querySelector('.field input');
  name.value = 'Гоблин-вожак'; name.dispatchEvent(new Event('change'));
});
await dm.evaluate(() => {
  const card = document.querySelector('#token-card');
  const fields = [...card.querySelectorAll('.field')];
  const vis = fields.find((f) => f.textContent.includes('Дальность зрения')).querySelector('input');
  vis.value = 45; vis.dispatchEvent(new Event('change'));
});
await dm.waitForTimeout(400);
await dm.dblclick('.lib-item');
await dm.waitForTimeout(600);
R.базаСуществ = await dm.evaluate(() => {
  const s = window.__state();
  const t = Object.values(s.tokens).find((x) => x.libId === 'lib1');
  return { имяВБазе: s.library.lib1.name, зрениеВБазе: s.library.lib1.stats.vision,
    фигурка: t && { имя: t.name, зрение: t.vision, имяВидно: t.namePublic, хитыВидны: t.hpPublic } };
});

/* 10. ПЕРЕХОДЫ И ТОЧКИ ВХОДА */
const локации = await dm.evaluate(() => {
  const s = window.__state();
  return s.order.map((id) => ({ id, name: s.locations[id].name }));
});
const подвал = локации.find((l) => l.name === 'Подвал').id;
const двор = локации.find((l) => l.name === 'Двор').id;

// точки входа во «Дворе»: основная и отдельная для пришедших из «Подвала»
await dm.evaluate((id) => window.__dispatch({ t: 'loc.active', id }), двор);
await dm.waitForTimeout(500);
await dm.click('#toolbar [data-tool=wall]');
await dm.click('[data-wallkind=spawn]');
await dm.mouse.click(box.x + 250, box.y + 250);
await dm.waitForTimeout(400);
await dm.evaluate((from) => {
  const sel = document.querySelector('#token-card select');
  sel.value = from; sel.dispatchEvent(new Event('change'));
}, подвал);
await dm.mouse.click(box.x + 600, box.y + 250);          // вторая — основная
await dm.waitForTimeout(400);
R.зоны = { входов: await dm.evaluate((id) => window.__state().locations[id].spawns.length, двор) };
const входИзПодвала = await dm.evaluate((id) => {
  const z = window.__state().locations[id].spawns.find((x) => x.fromLocId);
  return { x: z.x, y: z.y, main: !!z.main };
}, двор);

// зелёная стрелка в «Подвале», ведёт во «Двор»
await dm.evaluate((id) => window.__dispatch({ t: 'loc.active', id }), подвал);
await dm.waitForTimeout(600);
await dm.evaluate((id) => window.__dispatch({ t: 'loc.update', id, patch: { fogOn: false } }), подвал);
await dm.click('[data-wallkind=portal]');
await dm.mouse.click(box.x + 400, box.y + 350);
await dm.waitForTimeout(400);
R.зоны.карточкаПерехода = await dm.$eval('#token-card h4', (h) => h.textContent);
await dm.evaluate((to) => {
  const sel = document.querySelector('#token-card select');
  sel.value = to; sel.dispatchEvent(new Event('change'));
}, двор);
await dm.waitForTimeout(300);
const стрелка = await dm.evaluate((id) => {
  const z = window.__state().locations[id].portals[0];
  return { x: z.x, y: z.y, toLocId: z.toLocId };
}, подвал);
R.зоны.стрелкаВедёт = стрелка.toLocId === двор;
await dm.click('#toolbar [data-tool=select]');
await dm.waitForTimeout(300);

// зоны видит только Мастер: у игрока в этой клетке пусто
const пиксель = (page, wx, wy) => page.evaluate(([x, y]) => {
  const p = window.__board().worldToScreen(x, y);
  const c = document.querySelector('#board');
  const d = Math.min(window.devicePixelRatio || 1, 2);
  return [...c.getContext('2d').getImageData(Math.round(p.x * d), Math.round(p.y * d), 1, 1).data];
}, [wx, wy]);
await pl.waitForTimeout(1500);
R.зоны.уМастераВидна = (await пиксель(dm, стрелка.x, стрелка.y))[3] > 0;
R.зоны.уИгрокаНевидима = (await пиксель(pl, стрелка.x, стрелка.y))[3] === 0;

// фигурку тащат на стрелку — она уходит во «Двор», на точку входа из «Подвала»
await dm.evaluate(([x, y]) => window.__dispatch({ t: 'token.update', id: 'враг', patch: { x, y } }), [стрелка.x - 140, стрелка.y]);
await dm.waitForTimeout(400);
const откуда = await dm.evaluate(([x, y]) => { const p = window.__board().worldToScreen(x, y); return p; }, [стрелка.x - 140, стрелка.y]);
const куда = await dm.evaluate(([x, y]) => window.__board().worldToScreen(x, y), [стрелка.x, стрелка.y]);
await dm.mouse.move(box.x + откуда.x, box.y + откуда.y);
await dm.mouse.down();
await dm.mouse.move(box.x + куда.x, box.y + куда.y, { steps: 8 });
await dm.mouse.up();
await dm.waitForTimeout(700);
R.переходФигурки = await dm.evaluate(([id, вход]) => {
  const s = window.__state();
  const t = s.tokens.враг;
  const g = s.locations[t.locId].grid;
  const кл = (x, y) => Math.floor((x - g.ox) / g.size) + ',' + Math.floor((y - g.oy) / g.size);
  return { локация: s.locations[t.locId].name, наТочкеВхода: кл(t.x, t.y) === кл(вход.x, вход.y) };
}, [двор, входИзПодвала]);

// второй пришелец: клетка занята — встаёт рядом, а не поверх
await dm.evaluate(([подвал, x, y]) => {
  window.__dispatch({ t: 'token.update', id: 'чужой', patch: { locId: подвал, x, y } });
}, [подвал, стрелка.x - 140, стрелка.y]);
await dm.waitForTimeout(400);
await dm.mouse.move(box.x + откуда.x, box.y + откуда.y);
await dm.mouse.down();
await dm.mouse.move(box.x + куда.x, box.y + куда.y, { steps: 8 });
await dm.mouse.up();
await dm.waitForTimeout(700);
R.втораяФигурка = await dm.evaluate(() => {
  const s = window.__state();
  const a = s.tokens.враг, b = s.tokens.чужой;
  const g = s.locations[a.locId].grid;
  const кл = (t) => Math.floor((t.x - g.ox) / g.size) + ',' + Math.floor((t.y - g.oy) / g.size);
  return { локация: s.locations[b.locId].name, вРазныхКлетках: кл(a) !== кл(b), рядом: кл(a) + ' и ' + кл(b) };
});

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
