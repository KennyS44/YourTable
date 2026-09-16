// Мелкий инструмент для разметки: поиск узлов, сборка элементов, поля форм
// и укладка всплывающих карточек.
//
// Всё здесь не знает ни про стол, ни про состояние — чистая работа с DOM.
// Поэтому файл читается сам по себе и одинаково годится любой странице.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Поля форм: подпись слева, значение справа ── */

export function field(label, input) {
  const f = el('label', 'field');
  f.append(el('span', '', label), input);
  return f;
}

export function pair(a, b) { const d = el('div', 'row-2'); d.append(a, b); return d; }

export function numInput(value, onChange) {
  const i = el('input'); i.type = 'number'; i.value = value;
  i.addEventListener('change', () => onChange(Number(i.value) || 0));
  return i;
}

export function textInput(value, onChange) {
  const i = el('input'); i.value = value;
  i.addEventListener('change', () => onChange(i.value.slice(0, 32)));
  return i;
}

export function checkRow(label, checked, onChange) {
  const l = el('label', 'check');
  const i = el('input'); i.type = 'checkbox'; i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked));
  l.append(i, el('span', '', label));
  return l;
}

/* ── Короткое слово о случившемся: всплыло над полем и само растаяло ── */

let toastTimer = null;
export function toast(text) {
  const box = $('#toast');
  if (!box) return;
  clearTimeout(toastTimer);
  box.textContent = text;
  box.hidden = false;
  box.classList.remove('is-going');
  toastTimer = setTimeout(() => {
    box.classList.add('is-going');
    toastTimer = setTimeout(() => { box.hidden = true; }, 350);
  }, 1800);
}

/**
 * Карточка у фигурки: ставим рядом с точкой, но внутри поля и выше нижней
 * полосы инструментов — иначе она закроет кнопки, которыми сейчас работают.
 */
export function placeCard(card, at) {
  const pad = 8, gap = 12;
  const board = $('#board').getBoundingClientRect();      // куда нельзя вылезать
  const host = (card.offsetParent || document.body).getBoundingClientRect();

  // нижняя панель инструментов должна остаться нажимаемой — карточку выше неё
  const bar = ['#draw-bar', '#fog-bar', '#wall-bar', '#edit-bar']
    .map((sel) => $(sel)).find((b) => b && !b.hidden);
  const bottom = Math.min(board.bottom - pad, bar ? bar.getBoundingClientRect().top - 8 : Infinity);

  card.style.maxHeight = (bottom - board.top - pad) + 'px';
  const w = card.offsetWidth, h = card.offsetHeight;
  const px = board.left + at.x, py = board.top + at.y;    // фигурка в координатах окна

  let left = px + gap;
  if (left + w > board.right - pad) left = px - gap - w;  // не влезло справа — станем слева
  left = Math.max(board.left + pad, Math.min(left, board.right - w - pad));

  let top = py + gap;
  if (top + h > bottom) top = py - gap - h;               // не влезло снизу — станем выше
  top = Math.max(board.top + pad, Math.min(top, bottom - h));

  card.style.left = Math.round(left - host.left) + 'px';
  card.style.top = Math.round(top - host.top) + 'px';
}
