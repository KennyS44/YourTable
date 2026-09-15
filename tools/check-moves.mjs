// Проверка окна «Атаки и заклинания»: один список на две вкладки, все поля
// правятся и в кабинете, и за столом, и КД врага задаёт Мастер.
//
// Профиль и стол тут постоянные: плодить новые кабинеты на каждый прогон не
// надо, скрипт умеет начинать с уже заведённых.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'probnik', PASS = 'proba-proba';
const ROOM = 'Пробный стол', KEY = 'probakey', DMKEY = 'probamaster';
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });

/* ── Мастер за постоянным столом ── */
const dm = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); watch(dm, 'DM');
const ответы = [];
dm.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });
await dm.goto(`${page('index.html')}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
await dm.fill('#join-form [name=name]', 'Мастер');
await dm.click('#join-form button[type=submit]');
await dm.waitForSelector('#app:not([hidden])', { timeout: 20000 });
await dm.waitForTimeout(1500);
// локацию заводим, только если стол пустой
if (!await dm.$('#locations-list .item')) {
  ответы.push('Пробная локация');
  await dm.click('#btn-add-location');
  await dm.waitForTimeout(1200);
}
// стол постоянный: убираем фигурки прошлых прогонов, иначе их набежит гора
await dm.evaluate(() => {
  const s = window.__state();
  Object.keys(s.tokens).forEach((id) => window.__dispatch({ t: 'token.remove', id }));
});
await dm.waitForTimeout(600);
await dm.click('[data-ltab=room]');
await dm.click('#btn-room-code');
await dm.waitForTimeout(300);
const код = await dm.$eval('#code-out, #link-out', (i) => i.value);

/* ── Кабинет: заводим, если его ещё нет ── */
const path = userPath(LOGIN, PASS);
const есть = await (await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`)).json();
if (!есть) {
  await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`,
    { method: 'PUT', body: JSON.stringify({ login: LOGIN, name: 'Пробник', at: Date.now() }) });
}

/* ── Старый лист со строками атак кладём прямо в базу: проверяем переезд ── */
const charId = 'ch_proba';
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/chars/${charId}.json`, {
  method: 'PUT',
  body: JSON.stringify({
    id: charId, key: 'probachar', name: 'Пробник Старый',
    sheet: {
      str: 16, dex: 14, ac: 17, hpCur: 20, hpMax: 20,
      attacks: [
        { name: 'Огненный шар', bonus: '', dmg: '8d6 огонь' },
        { name: 'Секира', bonus: '+5', dmg: '1d8+3 рубящий' },
        { name: '', bonus: '', dmg: '' },
      ],
      feats: [{ id: 'ft_fire', name: 'Огненный шар', img: '', text: 'Взрыв на 150 футов' }],
    },
  }),
});

const pl = await (await browser.newContext({ viewport: { width: 1500, height: 980 } })).newPage(); watch(pl, 'PL');
await pl.goto(page('cabinet.html'));
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(800);
// строго свою карточку: в постоянном кабинете живут и персонажи других проверок,
// а имя лежит в значении поля, по атрибуту его не выбрать
await pl.evaluate((имя) => {
  const card = [...document.querySelectorAll('.char-card')]
    .find((c) => c.querySelector('.char-name') && c.querySelector('.char-name').value === имя);
  if (!card) throw new Error('нет карточки ' + имя);
  card.click();
}, 'Пробник Старый');
await pl.waitForTimeout(800);

const приём = (сел) => pl.$$eval(сел, (n) => n.map((c) => ({
  имя: c.querySelector('.feat-name').textContent,
  значок: c.querySelector('.feat-pic').textContent,
})));

/* 1. Старые строки атак переехали: способность слилась, оружие завелось */
R.переезд = {
  вАтаках: await приём('#sheet .moves .move'),
  вСпособностях: await приём('#sheet .feats .feat'),
};

/* 2. Разворот: свёрнуто только название, развёрнуто — все поля */
R.свёрнуто = await pl.$$eval('#sheet .moves .move-body', (n) => n.length);
await pl.click('#sheet .moves .move:nth-child(2) .feat-tab');
await pl.waitForTimeout(400);
R.развёрнуто = await pl.evaluate(() => {
  const b = document.querySelector('#sheet .moves .move.is-open .move-body');
  return {
    полей: [...b.querySelectorAll('.fld-l')].map((l) => l.textContent),
    кусковУрона: b.querySelectorAll('.move-dice .move-line').length,
  };
});

/* 3. Разобранные числа встали в поля: 1д8 рубящий и свой бонус +5 */
R.разобрано = await pl.evaluate(() => {
  const b = document.querySelector('#sheet .moves .move.is-open .move-body');
  const s = [...b.querySelectorAll('select')].map((x) => x.value);
  const n = [...b.querySelectorAll('input[type=number]')].map((x) => x.value);
  return { выборы: s, числа: n };
});
// раскрытый приём должен помещаться целиком, без прокрутки внутри блока
R.режетсяЛиОкно = await pl.$eval('#sheet .moves', (n) => n.scrollHeight > n.clientHeight + 1);
await pl.locator('#sheet .moves').screenshot({ path: 'tools/shot-moves.png' });

/* 4. Размер области появляется только у области и конуса */
const видноРазмер = () => pl.$eval('#sheet .moves .move.is-open .move-size', (n) => !n.hidden);
R.размер = { уЦели: await видноРазмер() };
await pl.selectOption('#sheet .moves .move.is-open .move-fld:nth-of-type(1) select', 'area');
await pl.waitForTimeout(300);
R.размер.уОбласти = await видноРазмер();

/* 5. Спасбросок раскрывает характеристику и «при успехе» */
const видноСпас = () => pl.$eval('#sheet .moves .move.is-open .move-save', (n) => !n.hidden);
R.спасбросок = { поКД: await видноСпас() };
await pl.evaluate(() => {
  const sels = [...document.querySelectorAll('#sheet .moves .move.is-open select')];
  const guard = sels.find((s) => [...s.options].some((o) => o.value === 'save'));
  guard.value = 'save'; guard.dispatchEvent(new Event('change', { bubbles: true }));
});
await pl.waitForTimeout(300);
R.спасбросок.поСпасу = await видноСпас();
// сложность спасброска стоит рядом с характеристикой и правится
R.спасбросок.сложность = await pl.evaluate(() => {
  const s = document.querySelector('#sheet .moves .move.is-open .move-save');
  const dc = s.querySelector('.num-sm');
  const было = dc.value;
  dc.value = '15'; dc.dispatchEvent(new Event('input', { bubbles: true }));
  return { поУмолчанию: было, подписи: [...s.querySelectorAll('.move-unit')].map((u) => u.textContent) };
});

/* 5б. Концентрация: галочка есть и запоминается */
R.концентрация = await pl.evaluate(() => {
  const c = document.querySelector('#sheet .moves .move.is-open .move-conc');
  if (!c) return 'галочки нет';
  const i = c.querySelector('input');
  const было = i.checked;
  i.click();
  return { подпись: c.textContent.trim(), было, стало: i.checked };
});
await pl.waitForTimeout(400);

/* 6. Переключение вида: способность уходит из вкладки описаний и обратно */
await pl.click('#sheet .moves .move:nth-child(1) .feat-tab');
await pl.waitForTimeout(300);
await pl.evaluate(() => {
  [...document.querySelectorAll('#sheet .moves .move.is-open .btn')].find((b) => b.textContent === 'Это оружие').click();
});
await pl.waitForTimeout(400);
R.сменаВида = { послеОружия: (await приём('#sheet .feats .feat')).length };
// карточка после смены вида осталась раскрытой — второй раз по вкладке не бьём
await pl.evaluate(() => {
  [...document.querySelectorAll('#sheet .moves .move.is-open .btn')].find((b) => b.textContent === 'Это способность').click();
});
await pl.waitForTimeout(400);
R.сменаВида.обратно = (await приём('#sheet .feats .feat')).length;

/* 7. Переименование в способностях видно в атаках — запись-то одна */
await pl.click('#sheet .feats .feat:nth-child(1) .feat-tab');
await pl.waitForTimeout(300);
await pl.evaluate(() => {
  const i = document.querySelector('#sheet .feats .feat.is-open .feat-name-input');
  i.value = 'Огненный шар II'; i.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(500);
R.одноИмя = (await приём('#sheet .moves .move')).map((m) => m.имя);

/* ── Игрок уходит за стол: то же окно должно быть в панели ── */
await pl.waitForTimeout(1600);
await pl.click('#btn-pick');
await pl.waitForTimeout(500);
await pl.click('#btn-go');
await pl.waitForSelector('#wait:not([hidden])', { timeout: 10000 });
await pl.fill('#wait-form [name=code]', код);
await pl.click('#wait-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);
await pl.click('[data-ltab=hero]');
await pl.waitForSelector('#lite-sheet .moves', { timeout: 10000 });

/* 8. За столом список тот же и правится прямо в бою */
R.заСтолом = {
  приёмов: (await приём('#lite-sheet .moves .move')).map((m) => m.имя),
  способностей: (await приём('#lite-sheet .feats .feat')).map((m) => m.имя),
};
await pl.click('#lite-sheet .moves .move:nth-child(2) .feat-tab');
await pl.waitForTimeout(400);
await pl.evaluate(() => {
  const b = document.querySelector('#lite-sheet .moves .move.is-open .move-body');
  const n = b.querySelector('.move-dice input[type=number]');
  n.value = '4'; n.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(2500);
R.режетсяЛиЗаСтолом = await pl.$eval('#lite-sheet .moves', (n) => n.scrollHeight > n.clientHeight + 1);
await pl.locator('#lite-sheet .moves').screenshot({ path: 'tools/shot-moves-table.png' });

/* правка доехала до кабинета */
const сохранено = await (await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/chars/${charId}.json`)).json();
const секира = (сохранено.sheet.feats || []).find((f) => f.name === 'Секира');
R.правкаВБою = { костей: секира && секира.dice[0].n, вид: секира && секира.dice[0].type };
// сложность и концентрация доехали до базы вместе с остальным
R.новыеПоляСохранились = секира && { сложность: секира.dc, концентрация: секира.conc };
R.старыеСтрокиУбраны = сохранено.sheet.attacks === undefined;

/* 9. КД фигурки задаёт Мастер, игрок его не видит */
await dm.click('[data-ltab=library]');
await dm.waitForTimeout(800);
await dm.click('#lib-grid .lib-item .edit');
await dm.waitForSelector('#token-card:not([hidden])', { timeout: 5000 });
R.кдВБазе = await dm.evaluate(() => {
  const f = [...document.querySelectorAll('#token-card .field')].find((x) => x.querySelector('.fld-l, span').textContent === 'КД');
  return f ? f.querySelector('input').value : null;
});
await dm.evaluate(() => {
  const f = [...document.querySelectorAll('#token-card .field')].find((x) => x.querySelector('.fld-l, span').textContent === 'КД');
  const i = f.querySelector('input');
  i.value = '19'; i.dispatchEvent(new Event('change', { bubbles: true }));
});
await dm.waitForTimeout(800);
R.кдСохранился = await dm.evaluate(() => {
  const s = window.__state ? window.__state() : null;
  return s ? Object.values(s.library).map((it) => it.stats.ac) : null;
});

/* 10. КД фигурки на поле правит Мастер, игроку его не показывают */
await dm.click('#token-card .close');
await dm.dblclick('#lib-grid .lib-item');
await dm.waitForTimeout(1200);
await dm.evaluate(() => {
  const s = window.__state();
  const t = Object.values(s.tokens)[0];
  window.__board().focusToken(t.id);
});
await dm.waitForTimeout(600);
const кдПоля = (p) => p.evaluate(() => {
  const c = document.querySelector('#token-card');
  if (!c || c.hidden) return 'карточки нет';
  const f = [...c.querySelectorAll('.field')].find((x) => x.querySelector('span').textContent === 'КД');
  return f ? f.querySelector('input').value : 'поля нет';
});
await dm.evaluate(() => {
  const s = window.__state();
  const t = Object.values(s.tokens)[0];
  window.__openToken(t.id);
});
await dm.waitForTimeout(500);
R.кдФигурки = { уМастера: await кдПоля(dm) };
await pl.waitForTimeout(2500);
await pl.evaluate(() => {
  const s = window.__state();
  const t = Object.values(s.tokens)[0];
  window.__openToken(t.id);
});
await pl.waitForTimeout(500);
R.кдФигурки.уИгрока = await кдПоля(pl);

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
