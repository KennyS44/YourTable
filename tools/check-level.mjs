// Проверка уровня: правит его только Мастер во вкладке «Герои», игрок видит
// его за столом маленьким окошком, а в кабинете лист показывает то же число.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'lvl' + process.pid, PASS = 'p' + process.pid;
const ROOM = 'Уровень ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch();

/* ── Мастер открывает стол ── */
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(dm, 'DM');
const ответы = [];
dm.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });
await dm.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
ответы.push('Подвал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(1200);
await dm.click('[data-ltab=room]');
await dm.click('#btn-room-code');
await dm.waitForTimeout(300);
const код = await dm.$eval('#code-out, #link-out', (i) => i.value);

/* ── Кабинет игрока заводим прямо в базе, как это делает админка ── */
const path = userPath(LOGIN, PASS);
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`,
  { method: 'PUT', body: JSON.stringify({ login: LOGIN, name: 'Торин', at: Date.now() }) });

const pl = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); watch(pl, 'PL');
await pl.goto(page('cabinet.html'));
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl.click('#btn-new-char');
await pl.waitForSelector('.char-card.is-active', { timeout: 10000 });
await pl.waitForTimeout(600);
await pl.fill('.char-card.is-active .char-name', 'Торин');
await pl.waitForTimeout(400);

/* 1. В листе кабинета уровень — окошко, а не поле для правки */
R.вКабинете = await pl.evaluate(() => {
  const f = [...document.querySelectorAll('#sheet .fld')].find((x) => x.querySelector('.fld-l').textContent === 'Уровень');
  return f && {
    естьОкошко: !!f.querySelector('.lvl-n'), значение: f.querySelector('.lvl-n')?.textContent,
    правитсяРуками: !!f.querySelector('input'),
    ширина: Math.round(f.getBoundingClientRect().width),
  };
});

await pl.locator('#sheet .sheet-head').screenshot({ path: 'tools/shot-level-head.png' });

/* ── Игрок уходит за стол ── */
await pl.click('#btn-pick');
await pl.waitForTimeout(500);
await pl.click('#btn-go');
await pl.waitForSelector('#wait:not([hidden])', { timeout: 10000 });
await pl.fill('#wait-form [name=code]', код);
await pl.click('#wait-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);

const рядыГероев = (p) => p.evaluate(() => [...document.querySelectorAll('.hero-row')].map((r) => ({
  кто: r.querySelector('.who').textContent,
  уровень: r.querySelector('.hero-lvl .n')?.textContent,
  кнопок: r.querySelectorAll('.hero-lvl .hero-btn').length,
})));
await dm.click('[data-rtab=heroes]');
await pl.click('[data-rtab=heroes]');
await pl.waitForTimeout(500);
R.уМастера = await рядыГероев(dm);
R.уИгрока = await рядыГероев(pl);

/* 2. Мастер поднимает уровень кнопкой «+» трижды */
for (let i = 0; i < 3; i++) {
  await dm.click('.hero-row .hero-lvl .hero-btn:last-child');
  await dm.waitForTimeout(400);
}
await pl.waitForTimeout(3000);
R.послеПодъёма = {
  уМастера: (await рядыГероев(dm))[0],
  уИгрока: (await рядыГероев(pl))[0],
  вПанелиИгрока: await pl.$eval('#lite-sheet .lvl-n', (e) => e.textContent),
  окошкоНеПравится: await pl.$$eval('#lite-sheet .fld-lvl input', (n) => n.length === 0),
};

/* 3. Уровень доехал до кабинета и до витрины по ключу персонажа */
await pl.waitForTimeout(2500);
const каб = await (await browser.newContext()).newPage(); watch(каб, 'CAB2');
await каб.goto(page('cabinet.html'));
await каб.fill('#login-form [name=login]', LOGIN);
await каб.fill('#login-form [name=pass]', PASS);
await каб.click('#login-form button[type=submit]');
await каб.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await каб.waitForTimeout(1500);
R.вКабинетеПосле = await каб.$eval('#sheet .lvl-n', (e) => e.textContent);
await каб.close();

/* 4. Нижняя граница: ниже первого уровня не опускается */
for (let i = 0; i < 6; i++) {
  await dm.click('.hero-row .hero-lvl .hero-btn:first-child');
  await dm.waitForTimeout(300);
}
await pl.waitForTimeout(2500);
R.нижняяГраница = {
  уМастера: (await рядыГероев(dm))[0].уровень,
  вПанелиИгрока: await pl.$eval('#lite-sheet .lvl-n', (e) => e.textContent),
};

/* 5. На узком экране ряд героя не уезжает вбок */
await pl.setViewportSize({ width: 390, height: 800 });
await pl.waitForTimeout(600);
R.наТелефоне = await pl.evaluate(() => ({
  прокруткаВбок: document.documentElement.scrollWidth > window.innerWidth + 1,
}));

/* 6. Снимки: окошко в панели игрока и ряды героев у Мастера */
await pl.setViewportSize({ width: 1400, height: 950 });
await pl.waitForTimeout(500);
await pl.locator('#panel-left').screenshot({ path: 'tools/shot-level-panel.png' });
await dm.locator('#heroes-list').screenshot({ path: 'tools/shot-level-heroes.png' });

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
