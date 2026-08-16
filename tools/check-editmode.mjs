// Проверка правки объектов: фонарь один и с настраиваемой дальностью, зона входа
// растягивается и переезжает, режим правки двигает и настраивает всё поставленное.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Правка ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];

// при падении всё равно показываем, что успели собрать
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });

const browser = await chromium.launch();
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
dm.on('console', (m) => m.type() === 'error' && errors.push('DM: ' + m.text()));
dm.on('pageerror', (e) => errors.push('DM: ' + e.message));
const ответы = [];
dm.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });

await dm.goto(`${BASE}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
ответы.push('Подвал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(800);
ответы.push('Двор');
await dm.click('#btn-add-location');
await dm.waitForTimeout(800);
const [подвал, двор] = await dm.evaluate(() => window.__state().order);
await dm.evaluate((id) => window.__dispatch({ t: 'loc.active', id }), подвал);
await dm.waitForTimeout(600);

const box = await dm.evaluate(() => { const r = document.querySelector('#board').getBoundingClientRect(); return { x: r.x, y: r.y }; });
const click = async (lx, ly) => { await dm.mouse.click(box.x + lx, box.y + ly); await dm.waitForTimeout(350); };
const drag = async (a, b) => {
  await dm.mouse.move(box.x + a[0], box.y + a[1]); await dm.mouse.down();
  await dm.mouse.move(box.x + (a[0] + b[0]) / 2, box.y + (a[1] + b[1]) / 2, { steps: 4 });
  await dm.mouse.move(box.x + b[0], box.y + b[1], { steps: 6 }); await dm.mouse.up();
  await dm.waitForTimeout(400);
};
const locData = () => dm.evaluate((id) => {
  const l = window.__state().locations[id];
  const g = l.grid;
  const кл = (x, y) => Math.floor((x - g.ox) / g.size) + ',' + Math.floor((y - g.oy) / g.size);
  return {
    lights: (l.lights || []).map((z) => ({ kind: z.kind, feet: z.feet, cell: кл(z.x, z.y) })),
    spawns: (l.spawns || []).map((z) => ({ cw: z.cw, ch: z.ch, cell: кл(z.x, z.y), main: !!z.main, from: z.fromLocId })),
    portals: (l.portals || []).map((z) => ({ cw: z.cw, ch: z.ch, cell: кл(z.x, z.y), to: z.toLocId })),
    walls: (l.walls || []).map((w) => ({ type: w.type, open: !!w.open })),
  };
}, подвал);

/* 1. В панели остался один источник света */
await dm.click('#toolbar [data-tool=wall]');
R.кнопкиПанели = await dm.$$eval('#wall-bar [data-wallkind]', (n) => n.map((b) => b.textContent));

/* 2. Фонарь ставится, дальность правится в карточке */
await dm.click('[data-wallkind=lantern]');
await click(300, 300);
await click(300, 300);                                   // щелчок по фонарю — его карточка
R.карточкаФонаря = await dm.$eval('#token-card h4', (h) => h.textContent);
await dm.evaluate(() => {
  const i = document.querySelector('#token-card .field input');
  i.value = 75; i.dispatchEvent(new Event('change'));
});
await dm.waitForTimeout(300);
R.фонарь = (await locData()).lights;

/* 3. Точка входа: ставим, растягиваем уголком, двигаем телом */
await dm.click('[data-wallkind=spawn]');
await click(600, 300);
await dm.click('#token-card .close');
const уголок = async (id) => dm.evaluate((zid) => {
  const s = window.__state();
  const l = s.locations[s.activeLoc];
  const z = l.spawns.find((x) => x.id === zid) || l.spawns[0];
  const g = l.grid;
  const cx = Math.floor((z.x - g.ox) / g.size), cy = Math.floor((z.y - g.oy) / g.size);
  const b = window.__board();
  const a = b.worldToScreen(g.ox + (cx + (z.cw || 1)) * g.size, g.oy + (cy + (z.ch || 1)) * g.size);
  const c = b.worldToScreen(z.x, z.y);
  return { handle: a, center: c };
}, id);

await dm.click('#toolbar [data-tool=edit]');
await dm.waitForTimeout(300);
R.правка = { панельВидна: await dm.$eval('#edit-bar', (b) => !b.hidden), счётчики: await dm.$eval('#edit-counts', (b) => b.textContent) };

let g1 = await уголок();
await drag([g1.handle.x, g1.handle.y], [g1.handle.x + 145, g1.handle.y + 75]);
R.растянули = (await locData()).spawns;

g1 = await уголок();
await drag([g1.center.x, g1.center.y], [g1.center.x - 140, g1.center.y + 140]);
R.подвинули = (await locData()).spawns;

/* 4. Фонарь тоже двигается в правке */
const фонарьЭкран = await dm.evaluate(() => {
  const s = window.__state();
  const x = s.locations[s.activeLoc].lights[0];
  return window.__board().worldToScreen(x.x, x.y);
});
await drag([фонарьЭкран.x, фонарьЭкран.y], [фонарьЭкран.x + 210, фонарьЭкран.y]);
R.фонарьПереехал = (await locData()).lights;

/* 5. Клик по стене в правке открывает её карточку и меняет тип */
await dm.click('#toolbar [data-tool=wall]');
await dm.click('[data-wallkind=wall]');
await drag([200, 640], [400, 640]);
await dm.click('#toolbar [data-tool=edit]');
await dm.waitForTimeout(300);
const серединаСтены = await dm.evaluate(() => {
  const s = window.__state();
  const w = s.locations[s.activeLoc].walls[0];
  return window.__board().worldToScreen((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2);
});
await click(серединаСтены.x, серединаСтены.y);
R.карточкаСтены = await dm.$eval('#token-card h4', (h) => h.textContent);
await dm.evaluate(() => {
  const s = document.querySelector('#token-card select');
  s.value = 'door'; s.dispatchEvent(new Event('change'));
});
await dm.waitForTimeout(300);
R.стенаСталаДверью = (await locData()).walls;
await dm.click('#token-card .close');

/* 6. Несколько пришедших занимают разные клетки растянутой зоны */
await dm.evaluate(([двор, подвал]) => {
  const s = window.__state();
  const mk = (id, x) => window.__dispatch({
    t: 'token.add',
    token: { id, locId: подвал, x, y: 0, cells: 1, name: id, kind: 'pc', assetId: null, hp: { cur: 5, max: 5 }, statuses: [], vision: 0 },
  });
  mk('т1', 0); mk('т2', 70); mk('т3', 140); mk('т4', 210);
}, [двор, подвал]);
await dm.waitForTimeout(400);
// зону входа переносим во «Двор» и растягиваем на 3×2, затем гоним туда всех
await dm.evaluate(([подвал, двор]) => {
  const s = window.__state();
  const z = s.locations[подвал].spawns[0];
  window.__dispatch({ t: 'zone.remove', locId: подвал, kind: 'spawns', id: z.id });
  window.__dispatch({
    t: 'zone.add', locId: двор, kind: 'spawns',
    zone: { id: 'sp1', x: 35, y: 35, cw: 3, ch: 2, fromLocId: null, main: true },
  });
}, [подвал, двор]);
await dm.waitForTimeout(400);
await dm.click('[data-ltab=locations]');
await dm.click('[data-fold=move] > summary');
await dm.evaluate((двор) => { const s = document.querySelector('#move-all-to'); s.value = двор; }, двор);
ответы.push('');
await dm.click('#btn-move-all');
await dm.waitForTimeout(800);
R.пришлиВРазныеКлетки = await dm.evaluate((двор) => {
  const s = window.__state();
  const g = s.locations[двор].grid;
  const cells = Object.values(s.tokens).filter((t) => t.locId === двор)
    .map((t) => Math.floor((t.x - g.ox) / g.size) + ',' + Math.floor((t.y - g.oy) / g.size));
  return { клетки: cells, разных: new Set(cells).size, всего: cells.length };
}, двор);

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
