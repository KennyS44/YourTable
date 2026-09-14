// Проверка объёмных костей: кость правда падает, а кверху ложится то число,
// которое выпало в броске. Снимаем момент покоя для глаз.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Кубики ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const dm = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
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
await dm.waitForTimeout(1000);

R.вебгл = await dm.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));

/**
 * Бросок с подсматриванием: перехватываем результат из dice.js и сравниваем
 * с тем, что реально оказалось наверху у каждой кости после падения.
 */
const бросить = async (sides, count) => {
  // ждём, пока предыдущий бросок уйдёт со стола: они идут по очереди
  await dm.waitForFunction(() => !document.querySelector('#dice-stage .die-throw'), null, { timeout: 30000 });
  await dm.evaluate(() => { window.__dice3dLast = null; });
  await dm.click('#btn-dice');
  await dm.fill('#dice-count', String(count));
  await dm.waitForTimeout(200);
  await dm.click(`#dice-buttons .die-btn >> text=d${sides}`);
  await dm.click('#dice-close');
  await dm.waitForFunction(() => window.__dice3dLast, null, { timeout: 30000 });
  await dm.waitForSelector('.dice3d .die-result.is-on', { timeout: 30000 });
  return dm.evaluate(() => {
    const s = window.__state();
    const последний = [...s.chat].reverse().find((m) => m.kind === 'roll');
    return {
      бросок: последний.roll.dice, итог: последний.roll.total,
      холст: !!document.querySelector('.dice3d canvas'),
      грани: window.__dice3dLast,
      всёСовпало: window.__dice3dLast.every((x) => x.надо === x.сверху),
    };
  });
};

/* d20 с преимуществом, d6 горстью и d100 двумя костями */
R.d20 = await бросить(20, 1);
await dm.screenshot({ path: 'tools/shot-dice-d20.png' });
R.d6 = await бросить(6, 5);
await dm.screenshot({ path: 'tools/shot-dice-d6.png' });
R.d100 = await бросить(100, 1);
await dm.screenshot({ path: 'tools/shot-dice-d100.png' });
R.d4 = await бросить(4, 2);

await dm.waitForFunction(() => !document.querySelector('#dice-stage .die-throw'), null, { timeout: 30000 });

/* На телефоне кости тоже помещаются в поле */
await dm.setViewportSize({ width: 390, height: 780 });
await dm.waitForTimeout(400);
R.телефон = await бросить(20, 3);
await dm.screenshot({ path: 'tools/shot-dice-mobile.png' });
await dm.waitForFunction(() => !document.querySelector('#dice-stage .die-throw'), null, { timeout: 30000 });
await dm.setViewportSize({ width: 1280, height: 860 });

/* Нет связи с CDN — бросок показывает прежняя плоская анимация */
const без = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
без.on('pageerror', (e) => errors.push('NOCDN: ' + e.message));
await без.route('**cdn.jsdelivr.net**', (r) => r.abort());
await без.goto(`${BASE}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await без.fill('#join-form [name=name]', 'Запасной');
await без.click('#join-form button[type=submit]');
await без.waitForSelector('#app:not([hidden])', { timeout: 20000 });
await без.click('#btn-dice');
await без.click('#dice-buttons .die-btn >> text=d20');
await без.waitForSelector('#dice-stage .die-throw', { timeout: 20000 });
await без.waitForTimeout(2500);
R.безCDN = await без.evaluate(() => ({
  плоскийБросок: !!document.querySelector('#dice-stage .die-throw:not(.dice3d) .die-svg'),
  трёхмерных: document.querySelectorAll('.dice3d').length,
}));
await без.close();

await dm.waitForFunction(() => !document.querySelector('#dice-stage .die-throw'), null, { timeout: 30000 });
R.следовНеОсталось = await dm.evaluate(() => document.querySelectorAll('#dice-stage .die-throw').length);
R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
