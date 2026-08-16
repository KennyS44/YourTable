// Проверка административной комнаты: вход по паре логин-пароль, список
// аккаунтов и столов, создание и удаление аккаунта, смена пароля,
// удаление стола и скрытый вход, которого за столом не видно.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { roomFingerprint } from '../js/sync-firebase.js';
import { userPath } from '../js/cabinet-store.js';

const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\wа-яё-]/gi, '').slice(0, 40);

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const ADM_LOGIN = process.env.ADM_LOGIN, ADM_PASS = process.env.ADM_PASS;
const ROOM = 'Админ ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const LOGIN = 'acc' + process.pid, PASS = 'p' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => { const x = m.text(); if (m.type() === 'error' && !x.includes('status of 404')) errors.push(t + ': ' + x); });
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};
const db = (p) => fetch(`${FIREBASE.databaseURL}/rooms/${p}.json`).then((r) => r.json());

const browser = await chromium.launch();

/* ── Мастер открывает стол: он должен попасть в реестр ── */
const dm = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); watch(dm, 'DM');
const ответы = [];
dm.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });
await dm.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
ответы.push('Подвал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(1500);

/* Кабинет заводит только Мастер из админки — здесь делаем это напрямую в базе */
const завестиКабинет = async (login, pass, name) => {
  const path = userPath(login, pass);
  await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`,
    { method: 'PUT', body: JSON.stringify({ login, name, at: Date.now() }) });
  return path;
};

/* ── Выданный кабинет: вход игрока отмечает аккаунт в реестре ── */
await завестиКабинет(LOGIN, PASS, 'Торин');
const pl = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage(); watch(pl, 'PL');
await pl.goto(page('cabinet.html'));
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(1500);

/* ── Админка ── */
const ad = await (await browser.newContext({ viewport: { width: 1200, height: 950 } })).newPage(); watch(ad, 'ADM');
const адмОтветы = []; let последнийAlert = '';
ad.on('dialog', async (d) => { последнийAlert = d.message(); await d.accept(адмОтветы.shift() ?? ''); });
await ad.goto(page('admin.html'));

await ad.fill('#admin-form [name=login]', ADM_LOGIN);
await ad.fill('#admin-form [name=pass]', 'нетакой');
await ad.click('#admin-form button[type=submit]');
await ad.waitForTimeout(2000);
R.чужойПароль = await ad.$eval('#admin-err', (e) => (e.hidden ? '' : e.textContent));

await ad.fill('#admin-form [name=pass]', ADM_PASS);
await ad.click('#admin-form button[type=submit]');
await ad.waitForSelector('#adm:not([hidden])', { timeout: 20000 });
await ad.waitForTimeout(2000);

const строки = (sel) => ad.$$eval(sel + ' .adm-row', (n) => n.map((r) => ({
  имя: r.querySelector('.adm-name').textContent,
  под: r.querySelector('.adm-sub').textContent,
})));
R.аккаунты = { всего: (await строки('#acc-list')).length, нашёлНового: (await строки('#acc-list')).some((r) => r.под.includes(LOGIN)) };
R.столы = { нашёлНаш: (await строки('#room-list')).some((r) => r.имя === ROOM) };

/* создание аккаунта из админки */
const NEW_LOGIN = 'made' + process.pid, NEW_PASS = 'q' + process.pid;
await ad.fill('#acc-new [name=name]', 'Двалин');
await ad.fill('#acc-new [name=login]', NEW_LOGIN);
await ad.fill('#acc-new [name=pass]', NEW_PASS);
await ad.click('#acc-new button[type=submit]');
await ad.waitForTimeout(2500);
R.созданиеАккаунта = { вСписке: (await строки('#acc-list')).some((r) => r.под.includes(NEW_LOGIN)) };

// созданным аккаунтом можно войти в кабинет
const pl2 = await (await browser.newContext()).newPage(); watch(pl2, 'PL2');
await pl2.goto(page('cabinet.html'));
await pl2.fill('#login-form [name=login]', NEW_LOGIN);
await pl2.fill('#login-form [name=pass]', NEW_PASS);
await pl2.click('#login-form button[type=submit]');
await pl2.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
R.созданиеАккаунта.входРаботает = true;
R.созданиеАккаунта.имя = await pl2.$eval('#pf-name', (i) => i.value);
await pl2.close();

/* смена пароля: старый перестаёт работать, новый работает */
const СМЕНА = 'z' + process.pid;
адмОтветы.push(СМЕНА);
const строкаНового = (await ad.$$('#acc-list .adm-row'))[(await строки('#acc-list')).findIndex((r) => r.под.includes(NEW_LOGIN))];
await строкаНового.$eval('.btn-soft', (b) => b.click());
await ad.waitForTimeout(3000);
const проверитьВход = async (login, pass) => {
  const p = await (await browser.newContext()).newPage();
  await p.goto(page('cabinet.html'));
  await p.fill('#login-form [name=login]', login);
  await p.fill('#login-form [name=pass]', pass);
  await p.click('#login-form button[type=submit]');
  await p.waitForTimeout(3000);
  const ok = await p.$eval('#cab', (e) => !e.hidden);
  await p.close();
  return ok;
};
R.сменаПароля = { старыйНеПускает: !(await проверитьВход(NEW_LOGIN, NEW_PASS)), новыйПускает: await проверитьВход(NEW_LOGIN, СМЕНА) };

/* ── Скрытый вход: за столом никого не прибавилось ── */
const доВхода = await dm.evaluate(() => ({
  участники: document.querySelectorAll('#members .dot').length,
  ростер: Object.keys(window.__state().roster).length,
  чат: window.__state().chat.length,
}));
const gh = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); watch(gh, 'GHOST');
await gh.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY, ghost: '1' })}`);
await gh.fill('#join-form [name=name]', 'Ревизор');
await gh.click('#join-form button[type=submit]');
await gh.waitForSelector('#app:not([hidden])', { timeout: 20000 });
await gh.waitForTimeout(4000);
const послеВхода = await dm.evaluate(() => ({
  участники: document.querySelectorAll('#members .dot').length,
  ростер: Object.keys(window.__state().roster).length,
  чат: window.__state().chat.length,
}));
const путьКомнаты = slug(ROOM) + '-' + roomFingerprint(slug(ROOM), KEY);
R.скрытыйВход = {
  доВхода, послеВхода,
  ничегоНеИзменилось: JSON.stringify(доВхода) === JSON.stringify(послеВхода),
  видитПоле: await gh.evaluate(() => !!window.__state().activeLoc),
  значок: await gh.$eval('#role-badge', (e) => e.textContent),
  вПрисутствииБазы: Object.values((await db(путьКомнаты + '/presence')) || {}).map((p) => p.name),
};

/* ── Удаление стола из админки ── */
const путьСтола = (await строки('#room-list')).length;
await ad.click('[data-atab=rooms]');
await ad.waitForTimeout(500);
const строкаСтола = (await ad.$$('#room-list .adm-row'))[(await строки('#room-list')).findIndex((r) => r.имя === ROOM)];
await строкаСтола.$eval('.btn-danger', (b) => b.click());
await ad.waitForTimeout(3000);
R.удалениеСтола = {
  былоСтолов: путьСтола,
  сталоСтолов: (await строки('#room-list')).length,
  веткаСтолаПуста: (await db(путьКомнаты)) === null,
};

/* удаление аккаунта */
await ad.click('[data-atab=accounts]');
await ad.waitForTimeout(500);
const строкаУдал = (await ad.$$('#acc-list .adm-row'))[(await строки('#acc-list')).findIndex((r) => r.под.includes(NEW_LOGIN))];
await строкаУдал.$eval('.btn-danger', (b) => b.click());
await ad.waitForTimeout(3000);
R.удалениеАккаунта = {
  вСпискеНет: !(await строки('#acc-list')).some((r) => r.под.includes(NEW_LOGIN)),
  войтиНельзя: !(await проверитьВход(NEW_LOGIN, СМЕНА)),
};

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
