// Инвентарь персонажа: предметы с жетоном «кто вписал» и четыре кошелька.
//
// Живёт в листе персонажа (sheet.inv) — то есть в личном кабинете и ходит
// с героем за любой стол. Жетон М — предмет выдал Мастер, И — вписал сам
// игрок. Игрок не может ни выдать себе предмет с жетоном М, ни прибавить
// такому предмету штук: «рояль в кустах» из ниоткуда больше не появится.
//
// Любая правка — это маленькая операция (op). Игрок применяет её к своему
// листу сразу, правки Мастера идут через стол и ложатся в лист, как только
// игрок за столом (см. js/main.js, «Инвентарь»).
//
//   op = {id, ts, k:'add', item}            — новый предмет (или +штук к такому же)
//        {id, ts, k:'qty', itemId, d}       — штук больше/меньше; ноль — предмет уходит
//        {id, ts, k:'del', itemId}          — убрать предмет
//        {id, ts, k:'coin', c, d}           — монеты: c = pp | gp | sp | cp

export const COINS = [
  { id: 'pp', short: 'пм', name: 'Платина' },
  { id: 'gp', short: 'зм', name: 'Золото' },
  { id: 'sp', short: 'см', name: 'Серебро' },
  { id: 'cp', short: 'мм', name: 'Медь' },
];

const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const nameKey = (s) => String(s || '').trim().toLowerCase();
const emptyCoins = () => ({ pp: 0, gp: 0, sp: 0, cp: 0 });

export const newOp = (k, fields) => ({ id: uid('op'), ts: Date.now(), k, ...fields });

function fixItem(x) {
  return { id: x.id || uid('it'), name: String(x.name || 'Предмет'), qty: Math.max(1, Number(x.qty) || 1), by: x.by === 'm' ? 'm' : 'p' };
}
function fixCoins(c) {
  const out = emptyCoins();
  COINS.forEach(({ id }) => { out[id] = Math.max(0, Math.floor(Number((c || {})[id]) || 0)); });
  return out;
}

/**
 * Инвентарь в полной форме. У листа, заведённого до списка, переносим
 * каждую строку прежнего текстового инвентаря в предмет с жетоном И.
 * Сам текст (sheet.gear) остаётся в листе нетронутым — на всякий случай.
 */
export function fixInv(raw, gearText) {
  if (raw && raw.v) {
    return { v: 1, items: (raw.items || []).filter(Boolean).map(fixItem), coins: fixCoins(raw.coins) };
  }
  const items = String(gearText || '').split('\n')
    .map((line) => line.replace(/^\s*[-•*–—]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      // «Факел ×3», «Стрелы x20» — число в конце становится количеством
      const m = line.match(/^(.*\S)\s*[×xх]\s*(\d{1,4})$/i);
      return fixItem(m ? { name: m[1], qty: Number(m[2]), by: 'p' } : { name: line, by: 'p' });
    });
  return { v: 1, items, coins: emptyCoins() };
}

/** Чистое применение операций: исходный инвентарь не трогаем. */
export function applyOps(inv, ops) {
  const out = { v: 1, items: inv.items.map((x) => ({ ...x })), coins: { ...inv.coins } };
  const drop = (id) => { out.items = out.items.filter((x) => x.id !== id); };
  [...ops].sort((a, b) => a.ts - b.ts).forEach((op) => {
    if (op.k === 'add' && op.item) {
      const it = fixItem(op.item);
      // такой же предмет от того же «автора» — просто штук больше
      const same = out.items.find((x) => x.by === it.by && nameKey(x.name) === nameKey(it.name));
      if (same) same.qty += it.qty; else out.items.push(it);
    } else if (op.k === 'qty') {
      const it = out.items.find((x) => x.id === op.itemId);
      if (!it) return;
      it.qty = Math.max(0, it.qty + (Number(op.d) || 0));
      if (!it.qty) drop(it.id);
    } else if (op.k === 'del') {
      drop(op.itemId);
    } else if (op.k === 'coin' && COINS.some((c) => c.id === op.c)) {
      out.coins[op.c] = Math.max(0, (out.coins[op.c] || 0) + (Number(op.d) || 0));
    }
  });
  return out;
}

/** Как правку описать в общей ленте. null — молчим (игрок вписал своё). */
export function describeOp(inv, op, who, byMaster) {
  const it = op.itemId && inv.items.find((x) => x.id === op.itemId);
  const coin = COINS.find((c) => c.id === op.c);
  if (op.k === 'add') return byMaster ? `${who} получает: ${op.item.name} ×${op.item.qty}` : null;
  if (op.k === 'coin') {
    const was = inv.coins[op.c] || 0, now = Math.max(0, was + op.d);
    return byMaster
      ? `${who}: ${op.d > 0 ? '+' : '−'}${Math.abs(op.d)} ${coin.short} (теперь ${now})`
      : `${who} меняет ${coin.name.toLowerCase()}: ${was} → ${now}`;
  }
  if (!it) return null;
  // свои предметы игрок тратит молча; выданное Мастером — на виду у всех
  if (!byMaster && it.by !== 'm') return null;
  if (op.k === 'del') return byMaster ? `${who} теряет: ${it.name}` : `${who} убирает из инвентаря: ${it.name}`;
  if (op.k === 'qty') {
    const left = Math.max(0, it.qty + op.d);
    if (op.d > 0) return `${who} получает: ${it.name} +${op.d} (теперь ${left})`;
    return byMaster ? `${who} теряет: ${it.name} (осталось ${left})` : `${who} использует: ${it.name} (осталось ${left})`;
  }
  return null;
}

/* ───────────────────────── Вид ───────────────────────── */

/** Жетон «кто вписал» — маленькая монета, как гербы классов. */
function badge(by) {
  const b = el('span', 'inv-tok inv-tok-' + by, by === 'm' ? 'М' : 'И');
  b.title = by === 'm' ? 'Выдал Мастер' : 'Вписал игрок';
  return b;
}

/**
 * Виджет инвентаря.
 *   role: 'p' — игрок, 'dm' — Мастер, 'ro' — только смотреть
 *   onOp(op) — правка; применяет и сохраняет её вызывающий, потом зовёт redraw()
 */
export function invWidget(getInv, { role, onOp }) {
  const ro = role === 'ro';
  const node = el('div', 'inv');
  const coins = el('div', 'inv-coins');
  const list = el('div', 'inv-list');
  node.append(coins, list);

  const coinInputs = {};
  COINS.forEach((c) => {
    const cell = el('label', 'inv-coin');
    cell.title = c.name;
    const i = el('input');
    i.type = 'number'; i.min = 0; i.step = 1; i.inputMode = 'numeric';
    i.setAttribute('aria-label', c.name);
    i.readOnly = ro;
    // правка уходит, когда число дописано (Enter или ушёл с поля), а не на каждую цифру
    i.addEventListener('change', () => {
      const was = getInv().coins[c.id] || 0;
      const now = Math.max(0, Math.floor(Number(i.value) || 0));
      if (now !== was) onOp(newOp('coin', { c: c.id, d: now - was }));
      else i.value = was;
    });
    cell.append(el('span', 'inv-coin-tok inv-coin-' + c.id), i, el('span', 'inv-coin-l', c.short));
    coins.append(cell);
    coinInputs[c.id] = i;
  });

  if (!ro) {
    const form = el('form', 'inv-add');
    const name = el('input', 'inv-add-name');
    name.placeholder = role === 'dm' ? 'Выдать предмет…' : 'Вписать предмет…';
    name.maxLength = 120;
    name.setAttribute('aria-label', 'Название предмета');
    const qty = el('input', 'inv-add-qty');
    qty.type = 'number'; qty.min = 1; qty.value = 1;
    qty.setAttribute('aria-label', 'Сколько штук');
    const go = el('button', 'btn btn-soft inv-add-go', '+');
    go.type = 'submit';
    go.title = role === 'dm' ? 'Выдать' : 'Вписать';
    form.append(name, qty, go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) { name.focus(); return; }
      onOp(newOp('add', { item: { id: uid('it'), name: n, qty: Math.max(1, Number(qty.value) || 1), by: role === 'dm' ? 'm' : 'p' } }));
      name.value = ''; qty.value = 1;
      name.focus();
    });
    node.append(form);
  }

  const step = (label, title, fn) => {
    const b = el('button', 'inv-step', label);
    b.type = 'button'; b.title = title;
    b.addEventListener('click', fn);
    return b;
  };

  function redraw() {
    const inv = getInv();
    COINS.forEach(({ id }) => {
      const i = coinInputs[id];
      if (document.activeElement !== i) i.value = inv.coins[id] || 0;
    });
    list.innerHTML = '';
    if (!inv.items.length) list.append(el('p', 'hint inv-empty', 'Пусто.'));
    inv.items.forEach((it) => {
      const row = el('div', 'inv-row');
      row.append(badge(it.by), el('span', 'inv-name', it.name));
      const q = el('div', 'inv-qty');
      if (!ro) q.append(step('−', 'Меньше на одну', () => onOp(newOp('qty', { itemId: it.id, d: -1 }))));
      q.append(el('span', 'inv-n', it.qty + ' шт.'));
      // выданному Мастером игрок штук не прибавляет — только тратит
      if (!ro && (role === 'dm' || it.by !== 'm')) q.append(step('+', 'Больше на одну', () => onOp(newOp('qty', { itemId: it.id, d: 1 }))));
      row.append(q);
      if (!ro) {
        row.append(step('×', 'Убрать из инвентаря', () => {
          if (confirm(`Убрать «${it.name}» из инвентаря?`)) onOp(newOp('del', { itemId: it.id }));
        }));
      }
      list.append(row);
    });
  }
  redraw();
  return { node, redraw };
}
