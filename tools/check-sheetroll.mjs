// Проверка бросков из листа: игрок жмёт модификатор характеристики, выбирает
// способ броска, результат уходит в общую ленту и его видит Мастер.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'rol' + process.pid, PASS = 'p' + process.pid;
const ROOM = 'Броски ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n').slice(0,4).join(' | '); R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });

/* ── Мастер открывает стол ── */
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(dm, 'DM');
const ответы = [];
dm.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });
await dm.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
ответы.push('Тронный зал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(1200);
await dm.click('[data-ltab=room]');
// код комнаты больше не лежит в поле: собираем его из состояния, как это
// делает кнопка «Пригласить»
const код = await dm.evaluate(() => {
  const s = window.__state();
  const json = JSON.stringify([String(s.room.name || ''), String(s.room.playerKey || '')]);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});

/* ── Игрок с персонажем ── */
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${userPath(LOGIN, PASS)}/profile.json`,
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
await pl.fill('.char-card.is-active .char-name', 'Торин Дубощит');
await pl.waitForTimeout(400);

/* 1. В кабинете модификатор не кнопка: бросок там девать некуда */
R.вКабинетеНеКнопка = await pl.$$eval('#sheet .abil-mod',
  (n) => n.length > 0 && n.every((x) => x.tagName !== 'BUTTON'));

// ловкость 16 → модификатор +3, чтобы бросок было с чем сверить
const ловкость = pl.locator('#sheet .abil').nth(1).locator('.abil-score');
await ловкость.fill('16');
await pl.waitForTimeout(1500);

/* ── За стол ── */
await pl.click('#btn-pick');
await pl.waitForTimeout(500);
await pl.click('#btn-go');
await pl.waitForSelector('#wait:not([hidden])', { timeout: 10000 });
await pl.fill('#wait-form [name=code]', код);
await pl.click('#wait-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);
// вкладки «Персонаж» больше нет: панель игрока показана сразу
await pl.waitForSelector('#lite-sheet .abil-roll', { timeout: 10000 });

/* 2. За столом каждый модификатор — кнопка, и палец до неё достаёт */
R.заСтолом = await pl.$$eval('#lite-sheet .abil-roll', (n) => ({
  кнопок: n.length,
  подписи: n.map((b) => b.textContent),
  низшаяВысота: Math.min(...n.map((b) => Math.round(b.getBoundingClientRect().height))),
}));

const ждатьБросок = async (p) => {
  await p.waitForFunction(() => !document.querySelector('.die-throw'), null, { timeout: 20000 });
};
// лента теперь одна: броски отбираем по классу, а не по отдельному списку
const лента = (p) => p.$$eval('#chat-feed .msg.roll', (n) => n.map((m) => m.textContent.replace(/\s+/g, ' ').trim()));

/* 3. Нажатие по модификатору сразу кидает d20+3 — выбирать больше нечего */
await pl.click('[data-feed=roll]');
await dm.click('[data-feed=roll]');
const ловкостьБтн = pl.locator('#lite-sheet .abil').nth(1).locator('.abil-roll');
R.модификаторЛовкости = await ловкостьБтн.textContent();
await ловкостьБтн.click();
await pl.waitForTimeout(700);
R.менюНеПоявилось = await pl.$$eval('.rollmenu', (n) => n.length === 0);
R.броскиИгрока = await лента(pl);
await ждатьБросок(pl);
await dm.waitForTimeout(2500);
R.броскиМастера = await лента(dm);

/* 4. Ни преимущества, ни помехи в формуле не осталось */
await ловкостьБтн.click();
await pl.waitForTimeout(700);
const записи = await лента(pl);
R.бросковПодряд = записи.length;
R.безПреимуществаИПомехи = записи.every((t) => !t.includes('преимущест') && !t.includes('помех'));
await ждатьБросок(pl);

/* 5. Панель кубиков жива, и переключателя «С преим.» в ней больше нет */
await pl.click('#btn-dice');
await pl.waitForTimeout(300);
R.переключателяПреимуществаНет = await pl.$$eval('#dice-adv', (n) => n.length === 0);
await pl.click('#dice-buttons button:nth-child(6)');
await pl.waitForTimeout(800);
R.панельКубиковЖива = (await лента(pl)).at(-1);
await ждатьБросок(pl);
await pl.click('#dice-close');

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
