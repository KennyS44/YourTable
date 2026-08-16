// Проверка удаления стола: подтверждение названием, игрока выкидывает на вход,
// комната пропадает из базы и не воскресает от чужих записей.
import { chromium } from 'playwright-chromium';
import { roomFingerprint } from '../js/sync-firebase.js';
import { FIREBASE } from '../js/firebase-config.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Снос ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};
const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\wа-яё-]/gi, '').slice(0, 40);
const path = slug(ROOM) + '-' + roomFingerprint(slug(ROOM), KEY);
const url = `${FIREBASE.databaseURL}/rooms/${path}.json`;
const вБазе = async () => {
  const r = await fetch(url);
  const v = await r.json();
  return v ? Object.keys(v) : null;
};

const browser = await chromium.launch();
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(dm, 'DM');
// окна диалогов идут чередой: отвечаем по очереди и запоминаем их тексты
const окна = []; const ответы = [];
dm.on('dialog', async (d) => { окна.push(d.message()); await d.accept(ответы.shift() ?? ''); });

await dm.goto(`${BASE}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
ответы.push('Подвал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(1500);

const pl = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(pl, 'PL');
await pl.goto(`${BASE}?${q({ r: ROOM, k: KEY })}`);
await pl.fill('#join-form [name=name]', 'Торин');
await pl.click('#join-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(2500);
R.доУдаления = { вБазе: (await вБазе())?.sort(), игрокЗаСтолом: await pl.$eval('#app', (a) => !a.hidden) };

/* кнопка есть только у Мастера */
await dm.click('[data-ltab=room]');
R.кнопка = {
  уМастера: await dm.$eval('#btn-delete-room', (b) => b.textContent.trim()),
  уИгрокаНет: await pl.$$eval('#btn-delete-room', (n) => n.length === 0),
};

/* неверное название — стол на месте */
окна.length = 0;
ответы.push('не то название');
await dm.click('#btn-delete-room');
await dm.waitForTimeout(1000);
R.неверноеНазвание = { второеОкно: окна[1], комнатаНаМесте: !!(await вБазе()) };

/* верное название — стол сносится */
ответы.push(ROOM);
await dm.click('#btn-delete-room');
await dm.waitForTimeout(4000);
R.послеУдаления = {
  вБазе: await вБазе(),
  мастерНаВходе: await dm.$eval('#gate', (g) => !g.hidden),
  надписьМастеру: await dm.$eval('#join-err', (e) => (e.hidden ? '' : e.textContent)),
  игрокНаВходе: await pl.$eval('#gate', (g) => !g.hidden),
  надписьИгроку: await pl.$eval('#join-err', (e) => (e.hidden ? '' : e.textContent)),
};

/* обе вкладки ещё живут — комната не должна воскреснуть */
await dm.waitForTimeout(3000);
R.черезПаузу = { вБазе: await вБазе() };

/* войти в удалённый стол больше нельзя */
await pl.fill('#join-form [name=name]', 'Торин');
await pl.fill('#join-form [name=room]', ROOM);
await pl.fill('#join-form [name=key]', KEY);
await pl.click('#join-form button[type=submit]');
await pl.waitForTimeout(3000);
R.повторныйВход = {
  ошибка: await pl.$eval('#join-err', (e) => e.textContent),
  остался: await pl.$eval('#gate', (g) => !g.hidden),
};

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
