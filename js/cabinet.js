// Личный кабинет игрока: профиль, лента персонажей, лист персонажа и
// комната ожидания, из которой выбранный персонаж уходит за стол.

import { openStore, slug, uid, userPath } from './cabinet-store.js';
import { emptySheet, fixSheet, renderSheet } from './sheet.js';
import { unpackRoom } from './roomcode.js';
import { noteAccount } from './registry.js';
import { fileName } from './translit.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const cab = {};   // store, profile, chars, currentId, pickedId

/* ───────────────────────── Вход ─────────────────────────
   Завести кабинет самому нельзя: логин и пароль выдаёт Мастер
   в административной комнате. */

function fail(el2, msg) { el2.textContent = msg; el2.hidden = false; }
function busy(form, on, label) {
  const b = form.querySelector('button[type=submit]');
  if (!b.dataset.label) b.dataset.label = b.textContent;
  b.disabled = on;
  b.textContent = on ? (label || 'Подключаемся…') : b.dataset.label;
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#login-err');
  err.hidden = true;
  const login = f.get('login').trim();
  if (!slug(login)) return fail(err, 'Такой логин не подходит');
  busy(e.target, true);
  try {
    const path = userPath(login, f.get('pass'));
    const store = await openStore(path);
    const data = await store.load();
    if (!data || !data.profile) return fail(err, 'Кабинет не найден — проверьте логин и пароль, их выдаёт Мастер');
    remember(path, login, f.get('pass'), data.profile.name);
    start(store, data);
  } catch (ex) {
    fail(err, 'Не удалось войти: ' + ex.message);
  } finally { busy(e.target, false); }
});

/**
 * Вход помним в этой вкладке: возврат из комнаты не должен требовать пароля.
 * Заодно отмечаем аккаунт в реестре — иначе админка о нём не узнает.
 */
function remember(path, login, pass, name) {
  sessionStorage.setItem('dnd.cab', JSON.stringify({ path, login, pass }));
  noteAccount(path, login, name || '');
}

(async function autoLogin() {
  const saved = JSON.parse(sessionStorage.getItem('dnd.cab') || 'null');
  if (!saved) return;
  try {
    const store = await openStore(saved.path);
    const data = await store.load();
    if (data && data.profile) start(store, data);
  } catch { /* просто покажем вход */ }
}());

/* ───────────────────────── Кабинет ───────────────────────── */

function start(store, data) {
  cab.store = store;
  cab.profile = data.profile;
  cab.chars = {};
  Object.values(data.chars || {}).forEach((c) => { cab.chars[c.id] = fixChar(c); });

  $('#gate').hidden = true;
  $('#cab').hidden = false;
  $('#pf-login').value = cab.profile.login;
  $('#pf-name').value = cab.profile.name || '';

  const ids = Object.keys(cab.chars);
  cab.currentId = ids[0] || null;
  renderRibbon();
  renderCurrent();
  wire();
}

function fixChar(c) {
  return {
    id: c.id, name: c.name || 'Безымянный', bg: c.bg || '', pageBg: c.pageBg || '',
    sheet: fixSheet(c.sheet), at: c.at || Date.now(),
  };
}

function newChar() {
  return { id: uid('ch'), name: 'Новый персонаж', bg: '', pageBg: '', sheet: emptySheet(), at: Date.now() };
}

/** Фон всей страницы — у каждого персонажа свой; нет своего, берём фон карточки. */
function applyPageBg() {
  const ch = cab.chars[cab.currentId];
  const src = ch && (ch.pageBg || ch.bg);
  $('#page-bg').style.backgroundImage = src ? `url("${src}")` : '';
  document.body.classList.toggle('has-page-bg', !!src);
}

/* Сохраняем не на каждую букву: копим правки и пишем раз в секунду. */
let saveTimer = null;
const dirty = new Set();
function save(ch) {
  dirty.add(ch.id);
  mark('Сохраняем…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ids = [...dirty];
    dirty.clear();
    try {
      for (const id of ids) if (cab.chars[id]) await cab.store.saveChar(cab.chars[id]);
      mark('Сохранено');
    } catch (ex) {
      mark('Не сохранилось: ' + ex.message, true);
    }
  }, 900);
}
function mark(text, bad) {
  const m = $('#save-mark');
  m.textContent = text;
  m.classList.toggle('is-bad', !!bad);
  if (!bad) setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 2500);
}

function renderRibbon() {
  const box = $('#ribbon');
  box.innerHTML = '';
  const list = Object.values(cab.chars).sort((a, b) => a.at - b.at);
  list.forEach((ch) => {
    const card = el('article', 'char-card' + (ch.id === cab.currentId ? ' is-active' : ''));
    const bg = el('div', 'char-bg');
    if (ch.bg) bg.style.backgroundImage = `url("${ch.bg}")`;
    const name = el('input', 'char-name');
    name.value = ch.name;
    name.maxLength = 32;
    name.addEventListener('click', (e) => e.stopPropagation());
    name.addEventListener('input', () => {
      ch.name = name.value;
      save(ch);
      syncSheetName(ch);
      if (ch.id === cab.pickedId) renderPick();
    });

    const up = el('label', 'char-bg-btn file-btn', '🖼 Фон');
    const inp = el('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      ch.bg = await shrink(f, 900);
      save(ch);
      renderRibbon();
    });
    up.append(inp);
    up.addEventListener('click', (e) => e.stopPropagation());

    const del = el('button', 'char-del', '×');
    del.title = 'Удалить персонажа';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Удалить персонажа «${ch.name}»? Лист и заметки пропадут.`)) return;
      delete cab.chars[ch.id];
      if (cab.currentId === ch.id) cab.currentId = Object.keys(cab.chars)[0] || null;
      if (cab.pickedId === ch.id) { cab.pickedId = null; renderPick(); }
      await cab.store.removeChar(ch.id);
      renderRibbon(); renderCurrent();
    });

    card.append(bg, name, up, del);
    card.addEventListener('click', () => { cab.currentId = ch.id; renderRibbon(); renderCurrent(); });
    box.append(card);
  });

  const add = el('button', 'char-card char-add', '+ Новый персонаж');
  add.addEventListener('click', addChar);
  box.append(add);
}

async function addChar() {
  const ch = newChar();
  cab.chars[ch.id] = ch;
  cab.currentId = ch.id;
  await cab.store.saveChar(ch);
  renderRibbon(); renderCurrent();
  const first = $('.char-card.is-active .char-name');
  if (first) { first.focus(); first.select(); }
}

function renderCurrent() {
  const ch = cab.chars[cab.currentId];
  $('#sheet-wrap').hidden = !ch;
  $('#sheet-empty').hidden = !!ch;
  $('#btn-page-bg').hidden = !ch;
  applyPageBg();
  $('#btn-pick').disabled = !ch;
  $('#btn-export').disabled = !ch;
  if (!ch) return;
  renderSheet($('#sheet'), ch, () => { save(ch); syncRibbonName(ch); }, {
    insp: cab.profile.insp || 0,
    pickImage: (file, side) => shrink(file, side),
  });
}

/** Имя правится и в ленте, и в шапке листа — держим оба поля в согласии. */
function syncRibbonName(ch) {
  const active = $('.char-card.is-active .char-name');
  if (active && active.value !== ch.name) active.value = ch.name;
  if (ch.id === cab.pickedId) renderPick();
}
function syncSheetName(ch) {
  if (ch.id !== cab.currentId) return;
  const i = $('#sheet .fld-name input');
  if (i && i.value !== ch.name) i.value = ch.name;
}

function renderPick() {
  const ch = cab.chars[cab.pickedId];
  $('#pick-name').textContent = ch ? ch.name : 'Персонаж не выбран';
  $('#pick-bg').style.backgroundImage = ch && ch.bg ? `url("${ch.bg}")` : '';
  $('#btn-go').disabled = !ch;
}

function wire() {
  $('#pf-name').addEventListener('input', () => {
    cab.profile.name = $('#pf-name').value;
    clearTimeout(cab.pfTimer);
    cab.pfTimer = setTimeout(() => cab.store.saveProfile(cab.profile), 700);
  });
  $('#btn-new-char').addEventListener('click', addChar);
  $('#btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('dnd.cab');
    location.reload();
  });
  // выбор только отмечает персонажа; за стол уводит отдельная кнопка
  $('#btn-pick').addEventListener('click', () => {
    const ch = cab.chars[cab.currentId];
    if (!ch) return;
    cab.pickedId = ch.id;
    renderPick();
    mark(`Выбран: ${ch.name}`);
  });
  $('#btn-go').addEventListener('click', () => {
    const ch = cab.chars[cab.pickedId];
    if (ch) openWaiting(ch);
  });

  $('#page-bg-file').addEventListener('change', async (e) => {
    const ch = cab.chars[cab.currentId];
    const f = e.target.files[0];
    if (!ch || !f) return;
    ch.pageBg = await shrink(f, 1600);
    save(ch);
    applyPageBg();
    e.target.value = '';
  });

  $('#btn-export').addEventListener('click', exportChar);
  $('#btn-import').addEventListener('change', importChar);

  $('#btn-back').addEventListener('click', () => { $('#wait').hidden = true; });
  $('#wait-form').addEventListener('submit', enterRoom);
}

/* ─────────────── Перенос персонажа между кабинетами ─────────────── */

/** Выгружаем персонажа целиком: лист, способности и обе картинки. */
function exportChar() {
  const ch = cab.chars[cab.currentId];
  if (!ch) return;
  const blob = new Blob([JSON.stringify({ v: 1, char: ch }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(ch.name, 'character');
  document.body.append(a);          // ссылку вне страницы браузер скачивает без имени
  a.click();
  // адрес отпускаем позже: если отобрать его сразу, файл сохранится без названия
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  mark('Персонаж выгружен');
}

/** Загружаем персонажа файлом: он становится новым, чужой не затирается. */
async function importChar(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();          // сначала читаем, потом отпускаем поле
    e.target.value = '';
    const data = JSON.parse(text);
    const raw = data && (data.char || (data.sheet ? data : null));
    if (!raw) { mark('Это не файл персонажа', true); return; }
    const ch = fixChar({ ...raw, id: uid('ch'), at: Date.now() });
    cab.chars[ch.id] = ch;
    cab.currentId = ch.id;
    await cab.store.saveChar(ch);
    renderRibbon();
    renderCurrent();
    mark(`Загружен: ${ch.name}`);
  } catch (ex) {
    mark('Не удалось прочитать файл: ' + ex.message, true);
  }
}

/* ───────────────────────── Комната ожидания ───────────────────────── */

function openWaiting(ch) {
  $('#wait').hidden = false;
  $('#wait-err').hidden = true;
  $('#wait-sub').textContent = `За стол пойдёт ${ch.name}. Спросите у Мастера код комнаты.`;
  $('#wait-name').textContent = ch.name;
  $('#wait-bg').style.backgroundImage = ch.bg ? `url("${ch.bg}")` : '';
  $('#wait-form').code.value = '';
  $('#wait-form').code.focus();
}

/**
 * Уходим за стол. Персонажа передаём через sessionStorage: комната откроется
 * в этой же вкладке и заберёт оттуда хиты, обзор и картинку.
 */
function enterRoom(e) {
  e.preventDefault();
  const err = $('#wait-err');
  err.hidden = true;
  const room = unpackRoom(new FormData(e.target).get('code'));
  if (!room) return fail(err, 'Код не распознан — попросите Мастера прислать его заново');
  const ch = cab.chars[cab.pickedId];
  if (!ch) return fail(err, 'Персонаж не выбран');

  const s = ch.sheet;
  sessionStorage.setItem('dnd.char', JSON.stringify({
    id: ch.id,
    name: ch.name || 'Персонаж',
    hp: { cur: num(s.hpCur, 10), max: num(s.hpMax, 10) },
    vision: num(s.vision, 30),
    avatar: ch.bg || null,
    player: cab.profile.name || cab.profile.login,
  }));
  localStorage.setItem('dnd.name', cab.profile.name || cab.profile.login);
  const p = new URLSearchParams({ r: room.name, k: room.key });
  location.href = 'index.html?' + p.toString();
}

/** Пустое поле не должно превращаться в ноль хитов. */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Картинку ужимаем: в базе ей лежать целиком незачем. */
async function shrink(file, maxSide) {
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = dataUrl; });
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (k === 1 && dataUrl.length < 4e5) return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', .82);
}
