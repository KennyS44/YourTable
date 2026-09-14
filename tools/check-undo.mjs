// Проверка отмены (Ctrl+Z): шаг назад возвращает прежний вид и доезжает до
// всех за столом. Проверяем по одному действию каждого рода.
import { chromium } from 'playwright-chromium';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:20300/index.html';
const ROOM = 'Отмена ' + process.pid, KEY = 'k' + process.pid, DMKEY = 'm' + process.pid;
const q = (o) => new URLSearchParams(o).toString();
const R = {}; const errors = [];
process.on('uncaughtException', (e) => { R.упало = e.message.split('\n')[0]; R.ошибки = errors; console.log(JSON.stringify(R, null, 2)); process.exit(1); });
const watch = (p, t) => {
  p.on('console', (m) => m.type() === 'error' && errors.push(t + ': ' + m.text()));
  p.on('pageerror', (e) => errors.push(t + ': ' + e.message));
};

const browser = await chromium.launch();
const открыть = async (имя, метка) => {
  const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  watch(p, метка);
  p.on('dialog', async (d) => { await d.accept(ответы.shift() ?? ''); });
  await p.goto(`${BASE}?${q({ r: ROOM, k: KEY, m: DMKEY })}`);
  await p.fill('#join-form [name=name]', имя);
  await p.click('#join-form button[type=submit]');
  await p.waitForSelector('#app:not([hidden])', { timeout: 20000 });
  return p;
};
const ответы = [];
const dm = await открыть('Мастер', 'DM');
const дм2 = await открыть('Второй Мастер', 'DM2');   // сосед по столу: видит ли он отмену

ответы.push('Подвал');
await dm.click('#btn-add-location');
await dm.waitForTimeout(1200);
const локация = await dm.evaluate(() => window.__state().order[0]);

const снимок = (p) => p.evaluate((id) => {
  const s = window.__state();
  const l = s.locations[id] || {};
  return {
    локаций: s.order.length,
    линий: (l.drawings || []).length,
    стен: (l.walls || []).length,
    туман: Object.keys(l.fog || {}).length,
    фигурок: Object.keys(s.tokens).length,
    место: Object.values(s.tokens).map((t) => `${t.x},${t.y}`),
    уровень: (s.levels || {}).роман || 1,
    реплик: s.chat.length,
  };
}, локация);
const шаг = (a) => dm.evaluate((x) => window.__dispatch(x), a);
const отменить = async () => {
  await dm.click('#btn-undo');
  await dm.waitForTimeout(700);
};
const кнопка = () => dm.$eval('#btn-undo', (b) => ({ выключена: b.disabled, подсказка: b.title }));

R.вначале = { кнопка: await кнопка() };

/* 1. Линия: нарисовали — отменили */
await шаг({ t: 'draw.add', locId: локация, stroke: { id: 'd1', by: 'x', kind: 'pen', color: '#fff', width: 3, pts: [10, 10, 60, 60] } });
await dm.waitForTimeout(400);
const послеЛинии = await снимок(dm);
R.линия = { кнопка: await кнопка(), послеРисования: послеЛинии.линий };
await отменить();
R.линия.послеОтмены = (await снимок(dm)).линий;
R.линия.уСоседа = (await снимок(дм2)).линий;

/* 2. Стена */
await шаг({ t: 'wall.add', locId: локация, wall: { id: 'w1', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 } });
await dm.waitForTimeout(400);
R.стена = { поставили: (await снимок(dm)).стен };
await отменить();
R.стена.послеОтмены = (await снимок(dm)).стен;

/* 3. Туман: красим кистью поверх уже закрытых клеток и отменяем */
await шаг({ t: 'fog.paint', locId: локация, cells: ['1,1', '1,2', '2,1'], on: true });
await dm.waitForTimeout(400);
R.туман = { закрасили: (await снимок(dm)).туман };
await шаг({ t: 'fog.paint', locId: локация, cells: ['1,1', '3,3'], on: true });   // одна клетка уже закрыта
await dm.waitForTimeout(400);
R.туман.второйМазок = (await снимок(dm)).туман;
await отменить();
R.туман.послеОтмены = (await снимок(dm)).туман;      // должно вернуться к 3, а не к 1

/* 4. Фигурка: поставили, подвинули, отменили ход и саму фигурку */
await шаг({ t: 'token.add', token: { id: 't1', locId: локация, name: 'Гоблин', x: 100, y: 100, cells: 1, kind: 'enemy' } });
await dm.waitForTimeout(400);
await шаг({ t: 'token.update', id: 't1', patch: { x: 500, y: 400 } });
await dm.waitForTimeout(400);
R.фигурка = { послеХода: (await снимок(dm)).место };
await отменить();
R.фигурка.ходОтменён = (await снимок(dm)).место;
await отменить();
R.фигурка.самаОтменена = (await снимок(dm)).фигурок;

/* 5. Уровень игрока */
await шаг({ t: 'level.set', key: 'роман', value: 5 });
await dm.waitForTimeout(400);
R.уровень = { стало: (await снимок(dm)).уровень };
await отменить();
R.уровень.послеОтмены = (await снимок(dm)).уровень;

/* 6. Разговор не отменяется: после реплики кнопка гаснет */
await шаг({ t: 'chat.add', msg: { id: 'c1', ts: 1, by: 'x', name: 'Мастер', kind: 'chat', text: 'привет' } });
await dm.waitForTimeout(400);
R.чат = { реплик: (await снимок(dm)).реплик, кнопка: await кнопка() };

/* 7. Удалённая локация возвращается вместе со своими фигурками */
await шаг({ t: 'token.add', token: { id: 't2', locId: локация, name: 'Крыса', x: 60, y: 60, cells: 1, kind: 'enemy' } });
await dm.waitForTimeout(400);
await шаг({ t: 'loc.remove', id: локация });
await dm.waitForTimeout(600);
R.локация = { послеУдаления: await снимок(dm) };
await отменить();
await dm.waitForTimeout(600);
R.локация.послеОтмены = await снимок(dm);
R.локация.уСоседа = await снимок(дм2);

/* 8. Ctrl+Z с клавиатуры делает то же самое */
await шаг({ t: 'draw.add', locId: локация, stroke: { id: 'd9', by: 'x', kind: 'pen', color: '#fff', width: 3, pts: [5, 5, 9, 9] } });
await dm.waitForTimeout(400);
const доКлавиши = (await снимок(dm)).линий;
await dm.keyboard.press('Control+z');
await dm.waitForTimeout(700);
R.клавиша = { было: доКлавиши, стало: (await снимок(dm)).линий, всплывашка: await dm.$eval('#toast', (t) => (t.hidden ? '' : t.textContent)) };

/* 9. Отменять больше нечего — кнопка выключена */
for (let i = 0; i < 12; i++) {
  if (await dm.$eval('#btn-undo', (b) => b.disabled)) break;
  await отменить();
}
R.вконце = { кнопка: await кнопка(), снимок: await снимок(dm) };

await dm.screenshot({ path: 'tools/shot-undo.png', clip: { x: 300, y: 0, width: 640, height: 80 } });

R.ошибки = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
