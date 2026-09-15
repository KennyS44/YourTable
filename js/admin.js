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

/**
 * Столы, которые админка не сносит ни поодиночке, ни пачкой. Сравниваем по
 * slug, поэтому «Армянская Дружина» и «армянская  дружина» — тот же стол.
 * Защита живёт в трёх местах сразу: строку нельзя отметить, её кнопка
 * «Удалить» погашена, и обе функции удаления всё равно ещё раз проверяют.
 */
const PROTECTED_ROOMS = new Set(['Армянская дружина'].map((n) => slug(n)));
const isProtectedRoom = (r) => PROTECTED_ROOMS.has(slug(r.name || ''));

/**
 * Общий выбор пачкой для списка: чекбоксы в строках, «выбрать все» и кнопка
 * удаления над списком. Панель прячется, пока ничего не отмечено.
 */
function makePicker(kind, { title, remove, reload }) {
  const bar = $(`[data-bulk="${kind}"]`);
  const allBox = $(`[data-all="${kind}"]`);
  const info = $(`[data-count="${kind}"]`);
  const delBtn = $(`[data-del="${kind}"]`);
  let items = [];                 // те, что вообще можно отметить
  const picked = new Set();

  const sync = () => {
    bar.hidden = !items.length;
    info.textContent = picked.size ? `отмечено: ${picked.size}` : 'ничего не отмечено';
    delBtn.disabled = !picked.size;
    allBox.checked = !!items.length && picked.size === items.length;
    allBox.indeterminate = picked.size > 0 && picked.size < items.length;
  };

  allBox.addEventListener('change', () => {
    picked.clear();
    if (allBox.checked) items.forEach((it) => picked.add(it));
    $$(`[data-pick="${kind}"]`).forEach((c) => { c.checked = allBox.checked; });
    sync();
  });

  delBtn.addEventListener('click', async () => {
    const list = [...picked].filter((it) => !(kind === 'room' && isProtectedRoom(it)));
    if (!list.length) return;
    const names = list.map((it) => `• ${title(it)}`).join('\n');
    if (!confirm(`Удалить безвозвратно (${list.length}):\n${names}`)) return;
    delBtn.disabled = true;
    let done = 0;
    const failed = [];
    for (const it of list) {
      try { await remove(it); done++; } catch (ex) { failed.push(`${title(it)}: ${ex.message}`); }
    }
    picked.clear();
    mark(failed.length ? `Удалено ${done}, не вышло ${failed.length}: ${failed[0]}` : `Удалено: ${done}`, !!failed.length);
    reload();
  });

  return {
    /** Список перерисован — забываем отмеченное и собираем его заново. */
    reset(all) {
      items = all;
      picked.clear();
      sync();
    },
    /** Чекбокс для строки; null, если строку трогать нельзя. */
    box(item) {
      const c = el('input');
      c.type = 'checkbox';
      c.dataset.pick = kind;
      c.addEventListener('change', () => {
        if (c.checked) picked.add(item); else picked.delete(item);
        sync();
      });
      const l = el('label', 'adm-check');
      l.append(c);
      return l;
    },
  };
}

const accPicker = makePicker('acc', {
  title: (a) => a.login,
  remove: async (a) => { await dbDel('cab-' + a.path); await forgetAccount(a.login); },
  reload: () => loadAccounts(),
});
const roomPicker = makePicker('room', {
  title: (r) => r.name || '(без названия)',
  remove: async (r) => {
    if (isProtectedRoom(r)) throw new Error('стол под защитой');
    await dbDel(r.path);
    await forgetRoom(r.path);
  },
  reload: () => loadRooms(),
});

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
  accPicker.reset(list);
  list.forEach((a) => {
    const row = el('div', 'adm-row');
    const info = el('div', 'adm-info');
    info.append(el('span', 'adm-name', a.name || a.login), el('span', 'adm-sub', `логин: ${a.login} · заведён ${when(a.at)}`));

    const pass = el('button', 'btn btn-soft btn-sm', 'Сменить пароль');
    pass.addEventListener('click', () => changePass(a, pass));
    const del = el('button', 'btn btn-danger btn-sm', 'Удалить');
    del.addEventListener('click', () => removeAccount(a));

    row.append(accPicker.box(a), info, acts(pass, del));
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
  roomPicker.reset(list.filter((r) => !isProtectedRoom(r)));
  list.forEach((r) => {
    const guarded = isProtectedRoom(r);
    const row = el('div', 'adm-row' + (guarded ? ' is-guarded' : ''));
    const info = el('div', 'adm-info');
    info.append(
      el('span', 'adm-name', r.name || '(без названия)'),
      el('span', 'adm-sub', guarded ? 'под защитой — удалить нельзя' : `последний вход ${when(r.at)}`),
    );

    const enter = el('a', 'btn btn-soft btn-sm', 'Войти скрытно');
    const p = new URLSearchParams({ r: r.name || '', k: r.playerKey || '', ghost: '1' });
    if (r.dmKey) p.set('m', r.dmKey);
    enter.href = 'index.html?' + p.toString();
    enter.target = '_blank';
    enter.rel = 'noopener';

    const del = el('button', 'btn btn-danger btn-sm', 'Удалить');
    del.disabled = guarded;
    del.addEventListener('click', () => removeRoom(r));

    // у защищённого стола нет чекбокса — отметить его нечем
    row.append(guarded ? el('span', 'adm-check adm-lock', '🛡') : roomPicker.box(r), info, acts(enter, del));
    box.append(row);
  });
}

async function removeRoom(r) {
  if (isProtectedRoom(r)) return mark(`Стол «${r.name}» под защитой — его не удалить`, true);
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
