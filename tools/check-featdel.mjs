// Проверка крестика в строке: приём и способность убираются, не раскрываясь.
// Профиль постоянный, тот же, что в check-moves.mjs.
import { chromium } from 'playwright-chromium';
import { FIREBASE } from '../js/firebase-config.js';
import { userPath } from '../js/cabinet-store.js';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/';
const page = (n) => BASE.replace(/[^/]*$/, '') + n;
const LOGIN = 'probnik', PASS = 'proba-proba';
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const path = userPath(LOGIN, PASS);
const charId = 'ch_probadel';
await fetch(`${FIREBASE.databaseURL}/rooms/cab-${path}/chars/${charId}.json`, {
  method: 'PUT',
  body: JSON.stringify({
    id: charId, key: 'PROB-2345', name: 'Пробник Крестик',
    sheet: {
      str: 12, dex: 12, ac: 12, hpCur: 10, hpMax: 10,
      feats: [
        { id: 'ft_a', name: 'Рапира', kind: 'weapon', text: '' },
        { id: 'ft_b', name: 'Вести', kind: 'feat', text: 'Слухи' },
        { id: 'ft_c', name: 'Звёздочка', kind: 'feat', text: 'Светит' },
      ],
    },
  }),
});

const pl = await (await browser.newContext({ viewport: { width: 1500, height: 980 } })).newPage();
pl.on('console', (m) => m.type() === 'error' && errors.push('PL: ' + m.text()));
pl.on('pageerror', (e) => errors.push('PL: ' + e.message));
pl.on('dialog', (d) => d.accept());
await pl.goto(page('cabinet.html'));
await pl.fill('#login-form [name=login]', LOGIN);
await pl.fill('#login-form [name=pass]', PASS);
await pl.click('#login-form button[type=submit]');
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(800);
// имя карточки лежит в свойстве поля, а не в атрибуте — селектором по value не берётся
const открыть = () => pl.evaluate(() => {
  const c = [...document.querySelectorAll('.char-card')]
    .find((x) => x.querySelector('.char-name')?.value === 'Пробник Крестик');
  c.click();
});
await открыть();
await pl.waitForTimeout(800);

const имена = (сел) => pl.$$eval(сел, (n) => n.map((c) => c.querySelector('.feat-name').textContent));
R.было = { атаки: await имена('#sheet .moves .move'), способности: await имена('#sheet .feats .feat') };
R.крестиков = {
  вАтаках: await pl.$$eval('#sheet .moves .feat-del', (n) => n.length),
  вСпособностях: await pl.$$eval('#sheet .feats .feat-del', (n) => n.length),
};
await pl.locator('#sheet .moves').screenshot({ path: 'tools/shot-featdel.png' });

/* 1. Крестик у оружия в «Атаках»: строка уходит, соседи не раскрываются */
await pl.locator('#sheet .moves .move', { has: pl.locator('.feat-name', { hasText: 'Рапира' }) })
  .locator('.feat-del').click();
await pl.waitForTimeout(500);
R.послеАтаки = {
  атаки: await имена('#sheet .moves .move'),
  раскрытых: await pl.$$eval('#sheet .moves .move-body', (n) => n.length),
};

/* 2. Крестик в «Умениях»: запись одна — исчезает и из атак тоже */
await pl.locator('#sheet .feats .feat', { has: pl.locator('.feat-name', { hasText: 'Вести' }) })
  .locator('.feat-del').click();
await pl.waitForTimeout(500);
R.послеСпособности = {
  атаки: await имена('#sheet .moves .move'),
  способности: await имена('#sheet .feats .feat'),
};

/* 3. Пережило перезагрузку — значит, сохранилось.
   Ждём: запись в кабинет уходит не мгновенно, перезагрузка её обгоняет. */
await pl.waitForTimeout(2500);
await pl.reload();
await pl.waitForSelector('#cab:not([hidden])', { timeout: 20000 });
await pl.waitForTimeout(1200);
await открыть();
await pl.waitForTimeout(900);
R.послеПерезагрузки = {
  атаки: await имена('#sheet .moves .move'),
  способности: await имена('#sheet .feats .feat'),
};

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
