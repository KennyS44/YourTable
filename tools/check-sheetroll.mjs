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
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
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
await dm.click('#btn-room-code');
await dm.waitForTimeout(300);
const код = await dm.$eval('#code-out, #link-out', (i) => i.value);

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
await pl.click('[data-ltab=hero]');
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
const лента = (p) => p.$$eval('#rolls-feed .msg', (n) => n.map((m) => m.textContent.replace(/\s+/g, ' ').trim()));

/* 3. Обычный бросок Ловкости: d20+3, и он уехал в ленту обоим */
await pl.click('[data-rtab=rolls]');
await dm.click('[data-rtab=rolls]');
const ловкостьБтн = pl.locator('#lite-sheet .abil').nth(1).locator('.abil-roll');
R.модификаторЛовкости = await ловкостьБтн.textContent();
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
R.пунктыМеню = await pl.$$eval('.rollmenu-b', (n) => n.map((b) => b.textContent));
await pl.locator('.rollmenu-b', { hasText: 'Обычный' }).click();
await pl.waitForTimeout(600);
R.менюЗакрылось = await pl.$$eval('.rollmenu', (n) => n.length === 0);
R.броскиИгрока = await лента(pl);
await pl.waitForTimeout(400);
await pl.locator('#lite-sheet').screenshot({ path: 'tools/shot-sheetroll.png' });
await ждатьБросок(pl);
await dm.waitForTimeout(2500);
R.броскиМастера = await лента(dm);

/* 4. Преимущество: кидается два d20, берётся больший */
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
await pl.locator('.rollmenu-b', { hasText: 'Преимущество' }).click();
await pl.waitForTimeout(600);
R.сПреимуществом = (await лента(pl)).at(-1);
await ждатьБросок(pl);

/* 5. Помеха */
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
await pl.locator('.rollmenu-b', { hasText: 'Помеха' }).click();
await pl.waitForTimeout(600);
R.сПомехой = (await лента(pl)).at(-1);
await ждатьБросок(pl);

/* 6. Меню закрывается щелчком мимо и клавишей Esc */
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
await pl.mouse.click(900, 500);
await pl.waitForTimeout(300);
R.закрылосьМимо = await pl.$$eval('.rollmenu', (n) => n.length === 0);
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
await pl.keyboard.press('Escape');
await pl.waitForTimeout(300);
R.закрылосьEsc = await pl.$$eval('.rollmenu', (n) => n.length === 0);
R.лишнихБросковНет = (await лента(pl)).length === 3;

/* 7. У игрока в меню нет «Только мне» — это право Мастера */
await ловкостьБтн.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
R.тайноТолькоМастеру = await pl.$$eval('.rollmenu-secret', (n) => n.length === 0);
await pl.keyboard.press('Escape');

/* 8. Панель кубиков осталась на месте и работает как прежде */
await pl.click('#btn-dice');
await pl.waitForTimeout(300);
await pl.click('#dice-buttons button:nth-child(6)');
await pl.waitForTimeout(800);
R.панельКубиковЖива = (await лента(pl)).at(-1);
await ждатьБросок(pl);

/* 9. Телефон: меню не вылезает за экран */
await pl.click('#dice-close');
await pl.setViewportSize({ width: 390, height: 780 });
await pl.waitForTimeout(600);
// на телефоне панели выезжают снизу по кнопке «Панели»
await pl.click('#btn-panel');
await pl.waitForSelector('#panel-left.is-open', { timeout: 5000 });
await pl.waitForTimeout(500);
const узкая = pl.locator('#lite-sheet .abil').nth(1).locator('.abil-roll');
await узкая.scrollIntoViewIfNeeded();
await узкая.click();
await pl.waitForSelector('.rollmenu.is-on', { timeout: 5000 });
R.наТелефоне = await pl.$eval('.rollmenu', (m) => {
  const r = m.getBoundingClientRect();
  return { влезло: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, ширина: Math.round(r.width) };
});
await pl.screenshot({ path: 'tools/shot-sheetroll-mobile.png' });
await pl.keyboard.press('Escape');

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
