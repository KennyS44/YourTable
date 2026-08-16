// Административная комната: аккаунты игроков и столы сайта.
//
// Вход — как везде в проекте: пара логин-пароль превращается в адрес ветки
// базы, и если ветка есть, значит пара верна. Для админки адрес считается по
// SHA-256, подобрать его перебором нельзя.

import {
  adminPath, dbDel, dbGet, dbPut, forgetAccount, forgetRoom,
  listAccounts, listRooms, noteAccount,
} from './registry.js';
import { userPath, slug } from './cabinet-store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
/** Коробка с кнопками: el() принимает текстом только строку, детей вешаем сами. */
const acts = (...kids) => {
  const n = el('div', 'adm-acts');
  n.append(...kids);
  return n;
};
const when = (ts) => (ts ? new Date(ts).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

/* ───────────────────────── Вход ───────────────────────── */

$('#admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#admin-err');
  err.hidden = true;
  const b = e.target.querySelector('button');
  b.disabled = true;
  try {
    const path = await adminPath(f.get('login'), f.get('pass'));
    const node = await dbGet(path);
    if (!node || !node.ok) { err.textContent = 'Неверная пара логин-пароль'; err.hidden = false; return; }
    sessionStorage.setItem('dnd.adm', path);
    open();
  } catch (ex) {
    err.textContent = 'Не удалось войти: ' + ex.message;
    err.hidden = false;
  } finally { b.disabled = false; }
});

(async function auto() {
  const path = sessionStorage.getItem('dnd.adm');
  if (!path) return;
  const node = await dbGet(path).catch(() => null);
  if (node && node.ok) open();
}());

function open() {
  $('#gate').hidden = true;
  $('#adm').hidden = false;
  loadAccounts();
  loadRooms();
}

$$('[data-atab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-atab]').forEach((x) => x.classList.toggle('is-active', x === b));
  $$('[data-apanel]').forEach((p) => { p.hidden = p.dataset.apanel !== b.dataset.atab; });
}));
$('#adm-logout').addEventListener('click', () => {
  sessionStorage.removeItem('dnd.adm');
  location.reload();
});

function mark(text, bad) {
  const m = $('#adm-mark');
  m.textContent = text;
  m.classList.toggle('is-bad', !!bad);
  if (!bad) setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 2500);
}

/* ───────────────────────── Аккаунты ───────────────────────── */

async function loadAccounts() {
  const box = $('#acc-list');
  box.innerHTML = '';
  const list = (await listAccounts()).sort((a, b) => (a.login > b.login ? 1 : -1));
  $('#acc-count').textContent = list.length ? `всего: ${list.length}` : 'пока пусто';
  list.forEach((a) => {
    const row = el('div', 'adm-row');
    const info = el('div', 'adm-info');
    info.append(el('span', 'adm-name', a.name || a.login), el('span', 'adm-sub', `логин: ${a.login} · заведён ${when(a.at)}`));

    const pass = el('button', 'btn btn-soft btn-sm', 'Сменить пароль');
    pass.addEventListener('click', () => changePass(a, pass));
    const del = el('button', 'btn btn-danger btn-sm', 'Удалить');
    del.addEventListener('click', () => removeAccount(a));

    row.append(info, acts(pass, del));
    box.append(row);
  });
}

/**
 * Пароль входит в адрес кабинета, поэтому смена пароля — это переезд:
 * переносим содержимое на новый адрес и убираем старое.
 */
async function changePass(a, btn) {
  const next = prompt(`Новый пароль для «${a.login}» (не короче 3 знаков):`);
  if (next === null) return;
  if (next.trim().length < 3) return alert('Слишком короткий пароль.');
  btn.disabled = true;
  try {
    const from = 'cab-' + a.path;
    const to = 'cab-' + userPath(a.login, next);
    if (from === to) return alert('Это тот же самый пароль.');
    const data = await dbGet(from);
    if (!data) return alert('Кабинет не найден в базе — возможно, его уже удалили.');
    await dbPut(to, data);
    await dbDel(from);
    await noteAccount(userPath(a.login, next), a.login, a.name || '');
    mark('Пароль изменён');
    alert(`Пароль для «${a.login}» изменён.\nПередайте игроку: логин ${a.login}, пароль ${next}`);
    loadAccounts();
  } catch (ex) {
    mark('Не вышло: ' + ex.message, true);
  } finally { btn.disabled = false; }
}

async function removeAccount(a) {
  if (!confirm(`Удалить аккаунт «${a.login}»? Его персонажи и листы пропадут.`)) return;
  try {
    await dbDel('cab-' + a.path);
    await forgetAccount(a.login);
    mark('Аккаунт удалён');
    loadAccounts();
  } catch (ex) {
    mark('Не вышло: ' + ex.message, true);
  }
}

$('#acc-new').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#acc-err');
  err.hidden = true;
  const login = f.get('login').trim();
  const pass = f.get('pass');
  if (!slug(login)) { err.textContent = 'Такой логин не подходит'; err.hidden = false; return; }
  const b = e.target.querySelector('button');
  b.disabled = true;
  try {
    const path = userPath(login, pass);
    if (await dbGet('cab-' + path)) { err.textContent = 'Кабинет с такой парой уже есть'; err.hidden = false; return; }
    await dbPut('cab-' + path + '/profile', { login, name: f.get('name').trim(), at: Date.now() });
    await noteAccount(path, login, f.get('name').trim());
    e.target.reset();
    mark('Аккаунт создан');
    alert(`Готово. Передайте игроку:\nстраница: ${location.origin + location.pathname.replace(/[^/]*$/, '')}cabinet.html\nлогин: ${login}\nпароль: ${pass}`);
    loadAccounts();
  } catch (ex) {
    err.textContent = 'Не удалось создать: ' + ex.message;
    err.hidden = false;
  } finally { b.disabled = false; }
});

/* ───────────────────────── Столы ───────────────────────── */

async function loadRooms() {
  const box = $('#room-list');
  box.innerHTML = '';
  const list = (await listRooms()).sort((a, b) => (b.at || 0) - (a.at || 0));
  $('#room-count').textContent = list.length ? `всего: ${list.length}` : 'пока пусто';
  list.forEach((r) => {
    const row = el('div', 'adm-row');
    const info = el('div', 'adm-info');
    info.append(el('span', 'adm-name', r.name || '(без названия)'), el('span', 'adm-sub', `последний вход ${when(r.at)}`));

    const enter = el('a', 'btn btn-soft btn-sm', 'Войти скрытно');
    const p = new URLSearchParams({ r: r.name || '', k: r.playerKey || '', ghost: '1' });
    if (r.dmKey) p.set('m', r.dmKey);
    enter.href = 'index.html?' + p.toString();
    enter.target = '_blank';
    enter.rel = 'noopener';

    const del = el('button', 'btn btn-danger btn-sm', 'Удалить');
    del.addEventListener('click', () => removeRoom(r));

    row.append(info, acts(enter, del));
    box.append(row);
  });
}

async function removeRoom(r) {
  if (!confirm(`Удалить стол «${r.name}» вместе с картами, фигурками и журналом?`)) return;
  try {
    await dbDel(r.path);
    await forgetRoom(r.path);
    mark('Стол удалён');
    loadRooms();
  } catch (ex) {
    mark('Не вышло: ' + ex.message, true);
  }
}
