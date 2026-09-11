// Страница Мастера: чужие листы персонажей, только смотреть.
//
// Мастер вводит ключ, который ему продиктовал игрок; ключ — это и есть адрес
// витрины листа в базе. Дальше страница держит подписку и перерисовывает лист
// сама, как только игрок что-то поправит у себя в кабинете.
//
// Список ключей лежит в этом браузере: это записная книжка Мастера, а не общие
// данные стола.

import { fixSheet, renderSheet } from './sheet.js';
import { isCharKey, normKey, watchChar } from './charlink.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const BOOK = 'dnd.dm.chars';
const readBook = () => {
  try { return (JSON.parse(localStorage.getItem(BOOK) || '[]') || []).filter(isCharKey).map(normKey); }
  catch { return []; }
};
const writeBook = (keys) => localStorage.setItem(BOOK, JSON.stringify(keys));

const cards = new Map();   // ключ -> {data, stop}
let openKey = null;

/* ───────────────────────── Добавление по ключу ───────────────────────── */

$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#add-err');
  err.hidden = true;
  const key = normKey($('#add-key').value);
  if (!isCharKey(key)) return fail(err, 'Ключ выглядит как ABCD-2345 — восемь знаков через дефис');
  if (cards.has(key)) return fail(err, 'Такой персонаж уже добавлен');

  writeBook([...readBook(), key]);
  follow(key);
  $('#add-key').value = '';
  mark('Ждём лист…');
});

function fail(node, msg) { node.textContent = msg; node.hidden = false; }

function mark(text) {
  const m = $('#save-mark');
  m.textContent = text;
  setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 2500);
}

function forget(key) {
  const card = cards.get(key);
  if (card) card.stop();
  cards.delete(key);
  writeBook(readBook().filter((k) => k !== key));
  if (openKey === key) closeSheet();
  renderGrid();
}

/* ───────────────────────── Подписка на лист ───────────────────────── */

function follow(key) {
  const entry = { data: null, stop: () => {} };
  cards.set(key, entry);
  renderGrid();
  entry.stop = watchChar(key, (data) => {
    entry.data = data;
    renderGrid();
    if (openKey === key) renderOpen();
  });
}

/* ───────────────────────── Витрина ───────────────────────── */

function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  const keys = [...cards.keys()];
  $('#empty').hidden = keys.length > 0;

  keys.forEach((key) => {
    const { data } = cards.get(key);
    const card = el('article', 'dm-card' + (openKey === key ? ' is-active' : ''));
    const bg = el('div', 'char-bg');
    if (data && data.bg) bg.style.backgroundImage = `url("${data.bg}")`;
    else bg.append(el('span', 'dm-card-sign', '✦'));   // картинки нет — хоть что-то живое

    const name = el('span', 'dm-card-name', data ? data.name : 'Ищем по ключу…');
    const sub = el('span', 'dm-card-key', key);

    const del = el('button', 'char-del', '×');
    del.title = 'Убрать из списка';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Убрать «${data ? data.name : key}» из списка? Лист игрока не пострадает.`)) forget(key);
    });

    card.append(bg, sub, name, del);
    card.addEventListener('click', () => {
      openKey = openKey === key ? null : key;
      if (openKey) renderOpen(); else closeSheet();
      renderGrid();
    });
    grid.append(card);
  });
}

function closeSheet() {
  openKey = null;
  $('#sheet-wrap').hidden = true;
  $('#sheet').innerHTML = '';
  renderGrid();
}

/** Перерисовка не должна дёргать страницу под рукой: держим прокрутку. */
function renderOpen() {
  const entry = cards.get(openKey);
  const wrap = $('#sheet-wrap');
  if (!entry || !entry.data) {
    wrap.hidden = false;
    $('#open-name').textContent = 'Лист по этому ключу не найден';
    $('#sheet').innerHTML = '<p class="hint">Игрок ещё не открывал кабинет с этим персонажем — или ключ записан с ошибкой.</p>';
    return;
  }
  const d = entry.data;
  const y = window.scrollY;
  wrap.hidden = false;
  $('#open-name').textContent = d.name || 'Персонаж';
  renderSheet($('#sheet'), { name: d.name, sheet: fixSheet(d.sheet) }, () => {}, {
    readOnly: true,
    charKey: openKey,
    insp: (d.sheet && d.sheet.insp) || 0,
  });
  window.scrollTo({ top: y });
}

$('#btn-close').addEventListener('click', closeSheet);

readBook().forEach(follow);
renderGrid();
