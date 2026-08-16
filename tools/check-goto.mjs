// Проверка перехода к фигурке: кнопка живёт в карточке базы («Иконки»),
// из карточки самой фигурки убрана, переключает локацию и перебирает копии.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Переход ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
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

/* иконка в базе и три фигурки от неё: две в «Подвале», одна во «Дворе» */
await dm.evaluate(([подвал, двор]) => {
  window.__dispatch({ t: 'lib.add', item: { id: 'lib1', name: 'Гоблин', kind: 'enemy', assetId: null } });
  const mk = (id, loc, x, y) => window.__dispatch({
    t: 'token.add',
    token: { id, locId: loc, libId: 'lib1', x, y, cells: 1, name: 'Гоблин', kind: 'enemy', assetId: null, hp: { cur: 7, max: 7 }, statuses: [], vision: 0 },
  });
  mk('г1', подвал, 35, 35); mk('г2', подвал, 245, 105); mk('г3', двор, 175, 175);
}, [подвал, двор]);
await dm.waitForTimeout(600);

/* 1. В карточке фигурки перехода больше нет */
const экран = await dm.evaluate(() => {
  const p = window.__board().worldToScreen(35, 35);
  const r = document.querySelector('#board').getBoundingClientRect();
  return { x: r.x + p.x, y: r.y + p.y };
});
await dm.mouse.click(экран.x, экран.y);
await dm.waitForTimeout(500);
R.карточкаФигурки = {
  заголовок: await dm.$eval('#token-card h4', (h) => h.textContent),
  кнопки: await dm.$$eval('#token-card .btn', (n) => n.map((b) => b.textContent.trim())),
};
await dm.click('#token-card .close');

/* 2. В карточке базы переход есть и считает копии */
await dm.click('[data-ltab=library]');
await dm.waitForTimeout(400);
await dm.click('.lib-item .edit');
await dm.waitForTimeout(400);
const кнопка = () => dm.$eval('#token-card .btn', (b) => b.textContent.trim());
R.карточкаБазы = { заголовок: await dm.$eval('#token-card h4', (h) => h.textContent), кнопка: await кнопка() };
R.карточкаНеПоЦентру = await dm.evaluate(() => {
  const c = document.querySelector('#token-card').getBoundingClientRect();
  const b = document.querySelector('#board').getBoundingClientRect();
  return c.left - b.left < b.width / 3;                 // стоит у края, середина свободна
});

/* 3. Переход перебирает фигурки и переключает локацию */
const где = () => dm.evaluate(() => {
  const s = window.__state();
  const v = window.__board().view();
  const r = document.querySelector('#board').getBoundingClientRect();
  const центр = { x: (r.width / 2 - v.x) / v.scale, y: (r.height / 2 - v.y) / v.scale };
  const рядом = Object.values(s.tokens).find((t) => t.locId === s.activeLoc
    && Math.hypot(t.x - центр.x, t.y - центр.y) < 5);
  return { локация: s.locations[s.activeLoc].name, вЦентре: рядом ? рядом.id : null };
});
R.шаги = [];
for (let i = 0; i < 4; i++) {
  await dm.click('#token-card .btn');
  await dm.waitForTimeout(700);
  R.шаги.push({ ...(await где()), подпись: await кнопка() });
}

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
