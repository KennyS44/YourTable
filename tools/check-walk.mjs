// Проверка передвижения: линейка скорости считает футы только в бою и только
// у тех, кто стоит в очереди. Вне боя фигурка ходит свободно.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Проверка хода', KEY = 'walkk', DMKEY = 'walkm';
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
ответы.push('Поле');
await dm.click('#btn-add-location');
await dm.waitForTimeout(800);
// стол постоянный: подчищаем за прошлым прогоном, иначе бой окажется уже начат
await dm.evaluate(() => {
  window.__dispatch({ t: 'init.clear' });
  Object.keys(window.__state().tokens).forEach((id) => window.__dispatch({ t: 'token.remove', id }));
});
await dm.waitForTimeout(600);

// фигурка со скоростью 30 футов, клетка 70 пикселей = 5 футов
await dm.evaluate(() => {
  const loc = window.__state().activeLoc;
  window.__dispatch({ t: 'lib.add', item: { id: 'lib1', name: 'Гоблин', kind: 'enemy', assetId: null } });
  window.__dispatch({
    t: 'token.add',
    token: { id: 'т1', locId: loc, libId: 'lib1', x: 35, y: 35, cells: 1, name: 'Гоблин', kind: 'enemy', assetId: null, hp: { cur: 7, max: 7 }, statuses: [], vision: 0, speed: 30 },
  });
});
await dm.waitForTimeout(600);

const точка = (x, y) => dm.evaluate(([x, y]) => {
  const p = window.__board().worldToScreen(x, y);
  const r = document.querySelector('#board').getBoundingClientRect();
  return { x: r.x + p.x, y: r.y + p.y };
}, [x, y]);

async function тянуть(из, в) {
  const a = await точка(из[0], из[1]), b = await точка(в[0], в[1]);
  await dm.mouse.move(a.x, a.y);
  await dm.mouse.down();
  await dm.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await dm.mouse.move(b.x, b.y, { steps: 6 });
  await dm.mouse.up();
  await dm.waitForTimeout(400);
  return dm.evaluate(() => window.__board().walkedFeet('т1'));
}

/* 1. Вне боя счёт не ведётся */
R.внеБоя = await тянуть([35, 35], [175, 35]);          // две клетки вправо

/* 2. В бою считает футы */
await dm.evaluate(() => window.__dispatch({ t: 'init.set', order: [{ id: 'т1', v: 20 }] }));
await dm.waitForTimeout(400);
R.двеКлетки = await тянуть([175, 35], [315, 35]);      // ещё две клетки = 10 футов
R.ещёТри = await тянуть([315, 35], [525, 35]);         // +3 клетки = 25 футов всего

/* 3. Ход ушёл дальше — счёт обнулился */
await dm.evaluate(() => window.__dispatch({ t: 'init.next' }));
await dm.waitForTimeout(400);
R.послеХода = await dm.evaluate(() => window.__board().walkedFeet('т1'));

/* 4. Тот, кого в очереди нет, не считается */
await dm.evaluate(() => {
  const loc = window.__state().activeLoc;
  window.__dispatch({
    t: 'token.add',
    token: { id: 'т2', locId: loc, libId: 'lib1', x: 35, y: 245, cells: 1, name: 'Зритель', kind: 'enemy', assetId: null, hp: { cur: 7, max: 7 }, statuses: [], vision: 0, speed: 30 },
  });
});
await dm.waitForTimeout(400);
{
  const a = await точка(35, 245), b = await точка(245, 245);
  await dm.mouse.move(a.x, a.y); await dm.mouse.down();
  await dm.mouse.move(b.x, b.y, { steps: 8 }); await dm.mouse.up();
  await dm.waitForTimeout(400);
  R.неУчастник = await dm.evaluate(() => window.__board().walkedFeet('т2'));
}

/* 5. Поле скорости есть в карточке фигурки */
await dm.evaluate(() => window.__openToken('т1'));
await dm.waitForSelector('#token-card:not([hidden])', { timeout: 5000 });
R.полеСкорости = await dm.$$eval('#token-card .field', (n) => n.map((f) => f.textContent.trim()).filter((t) => /Скорост/.test(t)));
R.значениеСкорости = await dm.$$eval('#token-card .field', (n) => {
  const f = n.find((x) => /Скорость/.test(x.querySelector('span').textContent));
  return f ? f.querySelector('input').value : null;
});
R.скоростьВСостоянии = await dm.evaluate(() => window.__state().tokens['т1'].speed);
// обзор и скорость встали в одну строку — она не должна вылезать из карточки
R.строкаНеВылезает = await dm.$$eval('#token-card .row-2', (n) => {
  const r = n.find((x) => /Скорость/.test(x.textContent));
  return r ? r.scrollWidth <= r.clientWidth + 1 : null;
});

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
