// Проверка ключа персонажа: игрок диктует ключ, Мастер добавляет его на своей
// странице и видит лист только для чтения, который обновляется сам. Заодно —
// короткий лист персонажа в левой панели стола.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'ключ' + process.pid, PASS = 'p' + process.pid;
const ROOM = 'Ключи ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
const итог = async (code) => { R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(code); };
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; итог(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch();

/* ── Кабинет игрока заводим прямо в базе: его выдаёт Мастер из админки ── */
const path = userPath(LOGIN, PASS);
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`,
  { method: 'PUT', body: JSON.stringify({ login: LOGIN, name: 'Лютик', at: Date.now() }) });

const pl = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); watch(pl, 'PL');
await pl.goto(page('cabinet.html'));
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });

/* ── Новый персонаж получает ключ сам ── */
await pl.click('#btn-new-char');
await pl.waitForSelector('.char-card.is-active', { timeout: 10000 });
await pl.waitForTimeout(600);
await pl.fill('.char-card.is-active .char-name', 'Лютик Бард');
const ключ = await pl.$eval('#sheet .key-val', (e) => e.textContent);
R.ключ = { значение: ключ, вид: /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ключ) };

/* заполняем то, что Мастеру и интересно: сопротивления и способность */
const текст = async (заголовок, значение) => {
  const ok = await pl.evaluate(([t, v]) => {
    const b = [...document.querySelectorAll('#sheet .blk')].find((x) => x.querySelector('.blk-h')?.textContent === t);
    if (!b) return false;
    const a = b.querySelector('textarea');
    a.value = v; a.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, [заголовок, значение]);
  if (!ok) throw new Error('нет блока ' + заголовок);
};
await текст('Сопротивления', 'Огонь, яд');
await текст('Слабости', 'Боится высоты');
await текст('Снаряжение', 'Лютня, кинжал');
await pl.evaluate(() => {
  [...document.querySelectorAll('#sheet .btn')].find((b) => b.textContent.includes('Способность')).click();
});
await pl.waitForTimeout(400);
await pl.evaluate(() => {
  const i = document.querySelector('#sheet .feat-name-input');
  i.value = 'Вдохновение барда'; i.dispatchEvent(new Event('input', { bubbles: true }));
  const t = document.querySelector('#sheet .feat-body textarea');
  t.value = 'Даёт кость к броску союзника'; t.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(2000);

/* ── Мастер добавляет персонажа по ключу ── */
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); watch(dm, 'DM');
dm.on('dialog', (d) => d.accept());
await dm.goto(page('master.html'));
R.мастерБезКлючей = await dm.$eval('#empty', (e) => !e.hidden);
await dm.fill('#add-key', 'не ключ');
await dm.click('#add-form button[type=submit]');
await dm.waitForTimeout(300);
R.кривойКлюч = await dm.$eval('#add-err', (e) => (e.hidden ? '' : e.textContent));

await dm.fill('#add-key', ключ.toLowerCase());        // регистр не должен мешать
await dm.click('#add-form button[type=submit]');
await dm.waitForFunction(() => document.querySelector('.dm-card-name')?.textContent === 'Лютик Бард', null, { timeout: 20000 });
R.карточка = await dm.evaluate(() => ({
  имя: document.querySelector('.dm-card-name').textContent,
  ключ: document.querySelector('.dm-card-key').textContent,
}));

await dm.click('.dm-card');
await dm.waitForSelector('#sheet .abil', { timeout: 10000 });
R.листУМастера = await dm.evaluate(() => {
  const blk = (t) => [...document.querySelectorAll('#sheet .blk')]
    .find((b) => b.querySelector('.blk-h')?.textContent === t)?.querySelector('textarea')?.value;
  const поля = [...document.querySelectorAll('#sheet input, #sheet textarea')];
  return {
    имя: document.querySelector('#open-name').textContent,
    сопротивления: blk('Сопротивления'),
    слабости: blk('Слабости'),
    снаряжение: blk('Снаряжение'),
    способность: document.querySelector('#sheet .feat-name')?.textContent,
    всеПоляТолькоЧтение: поля.length > 0 && поля.every((n) => n.readOnly),
    кнопокПравки: [...document.querySelectorAll('#sheet .btn, #sheet .row-del')]
      .filter((b) => !b.classList.contains('btn-soft') || /Строка|Способность|Картинка|Убрать/.test(b.textContent)).length,
  };
});

/* описание способности читается, но не правится */
await dm.click('#sheet .feat-tab');
await dm.waitForTimeout(300);
R.способностьУМастера = await dm.evaluate(() => ({
  текст: document.querySelector('#sheet .feat-text')?.textContent,
  поляВнутри: document.querySelectorAll('#sheet .feat-body textarea, #sheet .feat-name-input').length,
}));

/* ── Игрок правит лист — у Мастера он обновляется сам ── */
await текст('Сопротивления', 'Огонь, яд, холод');
await pl.waitForTimeout(2000);
await dm.waitForFunction(() => [...document.querySelectorAll('#sheet .blk')]
  .find((b) => b.querySelector('.blk-h')?.textContent === 'Сопротивления')?.querySelector('textarea')?.value === 'Огонь, яд, холод',
null, { timeout: 20000 });
R.живоеОбновление = 'дошло';

/* ── Тот же лист в левой панели за столом ── */
const мастерСтола = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(мастерСтола, 'TABLE');
await мастерСтола.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await мастерСтола.fill('#join-form [name=name]', 'Мастер');
await мастерСтола.click('#join-form button[type=submit]');
await мастерСтола.waitForSelector('#app:not([hidden])', { timeout: 20000 });
R.уМастераЗаСтолом = await мастерСтола.evaluate(() => ({
  вкладкаПерсонажа: !!document.querySelector('[data-ltab=hero]'),
  вкладкаЛокаций: !!document.querySelector('[data-ltab=locations]'),
  ссылкаНаЛисты: !!document.querySelector('a[href="master.html"]'),
}));

await pl.click('#btn-pick');
await pl.waitForTimeout(400);
await pl.click('#btn-go');
await pl.waitForSelector('#wait:not([hidden])', { timeout: 10000 });
await мастерСтола.click('[data-ltab=room]');
await мастерСтола.click('#btn-room-code');
await мастерСтола.waitForTimeout(300);
const код = await мастерСтола.$eval('#code-out, #link-out', (i) => i.value);
await pl.fill('#wait-form [name=code]', код);
await pl.click('#wait-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);

R.листВПанели = await pl.evaluate(() => {
  const blk = (t) => [...document.querySelectorAll('#lite-sheet .blk')]
    .find((b) => b.querySelector('.blk-h')?.textContent === t);
  return {
    вкладкаОдна: document.querySelectorAll('[data-ltab]').length,
    панельОткрыта: !document.querySelector('[data-lpanel=hero]').hidden,
    имя: document.querySelector('#lite-sheet .lite-name')?.textContent,
    характеристик: document.querySelectorAll('#lite-sheet .abil').length,
    поля: ['Характеристики', 'Защита и хиты', 'Способности', 'Инвентарь', 'Слабости', 'Сопротивления'].filter((t) => blk(t)),
    инвентарь: blk('Инвентарь')?.querySelector('textarea').value,
    сопротивления: blk('Сопротивления')?.querySelector('textarea').value,
    способность: document.querySelector('#lite-sheet .feat-name')?.textContent,
  };
});

/* правка из-за стола доходит до Мастера */
await pl.evaluate(() => {
  const b = [...document.querySelectorAll('#lite-sheet .blk')]
    .find((x) => x.querySelector('.blk-h')?.textContent === 'Инвентарь');
  const a = b.querySelector('textarea');
  a.value = 'Лютня, кинжал, зелье'; a.dispatchEvent(new Event('input', { bubbles: true }));
  const ac = [...document.querySelectorAll('#lite-sheet .fld')]
    .find((x) => x.querySelector('.fld-l').textContent === 'КД').querySelector('input');
  ac.value = 15; ac.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(2500);
R.правкаИзЗаСтола = { метка: await pl.$eval('#lite-hint', (e) => e.textContent) };
await dm.waitForFunction(() => [...document.querySelectorAll('#sheet .blk')]
  .find((b) => b.querySelector('.blk-h')?.textContent === 'Снаряжение')?.querySelector('textarea')?.value === 'Лютня, кинжал, зелье',
null, { timeout: 20000 });
R.правкаИзЗаСтола.дошлаДоМастера = true;
R.правкаИзЗаСтола.кд = await dm.evaluate(() => [...document.querySelectorAll('#sheet .fld')]
  .find((x) => x.querySelector('.fld-l').textContent === 'КД')?.querySelector('input').value);

/* ключи Мастера переживают перезагрузку страницы */
await dm.reload();
await dm.waitForFunction(() => document.querySelector('.dm-card-name')?.textContent === 'Лютик Бард', null, { timeout: 20000 });
R.списокПомнится = true;

/* ── Убираем за собой: тестовый кабинет и витрина ── */
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}.json`, { method: 'DELETE' });
await fetch(`${FIREBASE.databaseURL}/rooms/pub-${ключ}.json`, { method: 'DELETE' });

await browser.close();
итог(errors.length ? 1 : 0);
