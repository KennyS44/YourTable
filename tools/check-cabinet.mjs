// Проверка личного кабинета: заведение, персонажи, лист, сохранение между
// заходами и выход за стол по коду комнаты с переносом характеристик.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'torin' + process.pid, PASS = 'p' + process.pid;
const ROOM = 'Кабинет ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch();

/* ── Мастер открывает стол и берёт код комнаты ── */
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
R.кодКомнаты = { длина: код.length, естьПробелы: /\s/.test(код) };

/* Кабинет заводит только Мастер из админки — здесь делаем это напрямую в базе */
const завестиКабинет = async (login, pass, name) => {
  const path = userPath(login, pass);
  await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/profile.json`,
    { method: 'PUT', body: JSON.stringify({ login, name, at: Date.now() }) });
  return path;
};

/* ── Игрок входит в выданный ему кабинет ── */
await завестиКабинет(LOGIN, PASS, 'Торин');
const pl = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); watch(pl, 'PL');
await pl.goto(page('cabinet.html'));
R.самомуЗавестиНельзя = await pl.$$eval('#signup-form, [data-gate-tab]', (n) => n.length === 0);
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
R.кабинетОткрылся = { профиль: await pl.$eval('#pf-name', (i) => i.value), лента: await pl.$$eval('.char-card', (n) => n.length) };

/* ── Создаём персонажа и заполняем лист ── */
await pl.click('#btn-new-char');
await pl.waitForSelector('.char-card.is-active', { timeout: 10000 });
await pl.waitForTimeout(600);
await pl.fill('.char-card.is-active .char-name', 'Торин Дубощит');
await pl.waitForTimeout(300);

const поле = async (label, value) => {
  const ok = await pl.evaluate(([l, v]) => {
    const f = [...document.querySelectorAll('#sheet .fld')].find((x) => x.querySelector('.fld-l').textContent === l);
    if (!f) return false;
    const i = f.querySelector('input');
    i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, [label, value]);
  if (!ok) throw new Error('нет поля ' + label);
};
await поле('Максимум хитов', 34);
await поле('Хиты сейчас', 28);
await поле('Обзор, фт', 60);
await поле('Класс', 'Воин 4');
await pl.evaluate(() => {
  const a = [...document.querySelectorAll('#sheet .abil')].find((x) => x.querySelector('.abil-l').textContent === 'Сила');
  const i = a.querySelector('.abil-score');
  i.value = 16; i.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.evaluate(() => {
  const t = [...document.querySelectorAll('#sheet .blk')].find((b) => b.querySelector('.blk-h')?.textContent === 'Внешний вид').querySelector('textarea');
  t.value = 'Рыжая борода, кольчуга'; t.dispatchEvent(new Event('input', { bubbles: true }));
  const l = [...document.querySelectorAll('#sheet .blk')].find((b) => b.querySelector('.blk-h')?.textContent === 'Лор персонажа').querySelector('textarea');
  l.value = 'Изгнан из Одинокой горы'; l.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(1500);

R.лист = await pl.evaluate(() => {
  const blk = (t) => [...document.querySelectorAll('#sheet .blk')].some((b) => b.querySelector('.blk-h')?.textContent === t);
  const fld = (l) => [...document.querySelectorAll('#sheet .fld-l')].some((x) => x.textContent === l);
  return {
    модификаторСилы: [...document.querySelectorAll('#sheet .abil')]
      .find((a) => a.querySelector('.abil-l').textContent === 'Сила').querySelector('.abil-mod').textContent,
    есть: { внешнийВид: blk('Внешний вид'), лор: blk('Лор персонажа'), заметки: blk('Заметки'),
      атаки: blk('Атаки и заклинания'), способности: blk('Умения и способности'), класс: fld('Класс') },
    убрано: {
      классИУровень: fld('Класс и уровень'), предыстория: fld('Предыстория'), опыт: fld('Опыт'),
      инициатива: fld('Инициатива'), спасброски: blk('Спасброски'), бонусМастерства: fld('Бонус мастерства'),
      успехи: [...document.querySelectorAll('#sheet .fld-l, #sheet .blk-h')].some((x) => x.textContent === 'Успехи'),
    },
    вдохновениеТолькоЧтение: !!document.querySelector('#sheet .insp-n')
      && !document.querySelector('#sheet .insp-box input'),
  };
});

/* способность: добавляем, называем — имя должно попасть в подсказки атак */
await pl.evaluate(() => {
  [...document.querySelectorAll('#sheet .btn')].find((b) => b.textContent.includes('Способность')).click();
});
await pl.waitForTimeout(400);
await pl.evaluate(() => {
  const i = document.querySelector('#sheet .feat-name-input');
  i.value = 'Второе дыхание'; i.dispatchEvent(new Event('input', { bubbles: true }));
  const t = document.querySelector('#sheet .feat-body textarea');
  t.value = 'Бонусным действием лечит 1к10+уровень'; t.dispatchEvent(new Event('input', { bubbles: true }));
});
await pl.waitForTimeout(600);
R.способности = await pl.evaluate(() => ({
  вкладок: document.querySelectorAll('#sheet .feat').length,
  название: document.querySelector('#sheet .feat-name').textContent,
  подтянулосьВАтаки: [...document.querySelectorAll('#sheet datalist option')].map((o) => o.value),
}));

/* строки атак добавляются */
const строкАтак = () => pl.$$eval('#sheet .atk-row:not(.atk-head)', (n) => n.length);
const былоСтрок = await строкАтак();
await pl.evaluate(() => { [...document.querySelectorAll('#sheet .btn')].find((b) => b.textContent.includes('Строка')).click(); });
await pl.waitForTimeout(500);
R.атаки = { было: былоСтрок, стало: await строкАтак() };

/* ── Перезаход: всё сохранилось в облаке ── */
const pl2 = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); watch(pl2, 'PL2');
await pl2.goto(page('cabinet.html'));
await pl2.fill('#login-form [name=login]', LOGIN);
await pl2.fill('#login-form [name=pass]', PASS);
await pl2.click('#login-form button[type=submit]');
await pl2.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl2.waitForTimeout(800);
R.послеПерезахода = await pl2.evaluate(() => {
  const f = (l) => {
    const x = [...document.querySelectorAll('#sheet .fld')].find((n) => n.querySelector('.fld-l').textContent === l);
    return x ? x.querySelector('input').value : null;
  };
  return {
    имя: document.querySelector('.char-card.is-active .char-name').value,
    хиты: f('Максимум хитов'), обзор: f('Обзор, фт'), класс: f('Класс'),
    способность: document.querySelector('#sheet .feat-name')?.textContent,
  };
});
R.чужойПароль = await (async () => {
  const p3 = await (await browser.newContext()).newPage();
  await p3.goto(page('cabinet.html'));
  await p3.fill('#login-form [name=login]', LOGIN);
  await p3.fill('#login-form [name=pass]', PASS + 'x');
  await p3.click('#login-form button[type=submit]');
  await p3.waitForTimeout(2500);
  const t = await p3.$eval('#login-err', (e) => (e.hidden ? '' : e.textContent));
  await p3.close();
  return t;
})();

/* ── Выбираем персонажа и уходим за стол по коду ── */
await pl.click('#btn-pick');
await pl.waitForTimeout(600);
R.выборНеОткрываетВкладку = await pl.$eval('#wait', (e) => e.hidden);
await pl.click('#btn-go');
await pl.waitForSelector('#wait:not([hidden])', { timeout: 10000 });
R.ожидание = { подпись: await pl.$eval('#wait-sub', (e) => e.textContent) };
await pl.fill('#wait-form [name=code]', 'мусор');
await pl.click('#wait-form button[type=submit]');
await pl.waitForTimeout(500);
R.ожидание.кривойКод = await pl.$eval('#wait-err', (e) => (e.hidden ? '' : e.textContent));
await pl.fill('#wait-form [name=code]', код);
await pl.click('#wait-form button[type=submit]');
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);

R.заСтолом = await dm.evaluate(() => {
  const s = window.__state();
  const lib = Object.values(s.library).find((x) => x.name === 'Торин Дубощит');
  return {
    вБазеМастера: !!lib, видВБазе: lib && lib.kind,
    хиты: lib && lib.stats.hp, обзор: lib && lib.stats.vision,
    фигурокНаПоле: Object.keys(s.tokens).length,     // никого не ставим сами
  };
});

/* персонаж сразу принадлежит игроку: Мастер ставит фигурку — она уже его */
R.привязка = { карточка: await dm.evaluate(() => {
  const lib = Object.values(window.__state().library).find((x) => x.name === 'Торин Дубощит');
  return lib && lib.owner ? lib.owner.name : null;
}) };
await dm.click('[data-ltab=library]');
await dm.waitForTimeout(600);
await dm.dblclick('.lib-item');          // Мастер ставит фигурку из иконки
await dm.waitForTimeout(1200);
R.привязка.фигурка = await dm.evaluate(() => {
  const t = Object.values(window.__state().tokens).find((x) => x.name === 'Торин Дубощит');
  return t ? { владелец: t.ownerName, есть_id: !!t.ownerId } : null;
});
await pl.waitForTimeout(2000);
R.привязка.игрокМожетДвигать = await pl.evaluate(() => {
  const s = window.__state();
  const t = Object.values(s.tokens).find((x) => x.name === 'Торин Дубощит');
  const me = window.__me();
  const ключ = (n) => String(n || '').trim().toLowerCase();
  return !!t && (t.ownerId === me.id || ключ(t.ownerName) === ключ(me.name));
});

/* фигурка стояла ничьей (Мастер поставил её раньше) — приход игрока её забирает */
await dm.evaluate(() => {
  const t = Object.values(window.__state().tokens).find((x) => x.name === 'Торин Дубощит');
  window.__dispatch({ t: 'token.update', id: t.id, patch: { ownerId: null, ownerName: null } });
});
await dm.waitForTimeout(800);
await pl.reload();
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3000);
R.привязка.ничьюПодобрал = await dm.evaluate(() => {
  const t = Object.values(window.__state().tokens).find((x) => x.name === 'Торин Дубощит');
  return t ? t.ownerName : null;
});

/* вдохновение выдаёт Мастер — в кабинете оно только показывается */
await dm.evaluate(() => window.__dispatch({ t: 'insp.set', key: 'торин', value: 3 }));
await pl.waitForTimeout(3000);
const плКаб = await (await browser.newContext()).newPage(); watch(плКаб, 'CAB2');
await плКаб.goto(page('cabinet.html'));
await плКаб.fill('#login-form [name=login]', LOGIN);
await плКаб.fill('#login-form [name=pass]', PASS);
await плКаб.click('#login-form button[type=submit]');
await плКаб.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await плКаб.waitForTimeout(1200);
R.вдохновениеИзЗаСтола = await плКаб.$eval('#sheet .insp-n', (e) => e.textContent);
await плКаб.close();

/* тот же персонаж со стола не плодит вторую карточку, а обновляет прежнюю */
await pl.evaluate(() => {
  const ch = JSON.parse(sessionStorage.getItem('dnd.char'));
  ch.hp = { cur: 12, max: 40 };
  ch.vision = 90;
  sessionStorage.setItem('dnd.char', JSON.stringify(ch));
});
await pl.reload();
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3500);
R.повторныйПриход = await dm.evaluate(() => {
  const s = window.__state();
  const same = Object.values(s.library).filter((x) => x.name === 'Торин Дубощит');
  return { карточек: same.length, хиты: same[0] && same[0].stats.hp, обзор: same[0] && same[0].stats.vision };
});

/* пустой лист даёт базовые значения */
R.базовыеЗначения = await pl.evaluate(async () => {
  const s = window.__state();
  const ch = { id: 'пусто', name: 'Безымянный', hp: { cur: 0, max: 0 }, vision: 0, avatar: null };
  sessionStorage.setItem('dnd.char', JSON.stringify(ch));
  return true;
});
await pl.reload();
await pl.waitForSelector('#app:not([hidden])', { timeout: 25000 });
await pl.waitForTimeout(3500);
R.базовыеЗначения = await dm.evaluate(() => {
  const lib = Object.values(window.__state().library).find((x) => x.name === 'Безымянный');
  return lib ? { хиты: lib.stats.hp, обзор: lib.stats.vision } : null;
});

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
