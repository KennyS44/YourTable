// Сборка приложения: вход в комнату, панели, поле, кубики, чат.

import { createSync } from './sync.js';
import { FIREBASE, useFirebase } from './firebase-config.js';
import { createStore, defaultStats, emptyState, newLocation, newToken, normalize, uid, STATUSES, STATUS_FX } from './store.js';
import { createBoard } from './board.js';
import { DICE, roll } from './dice.js';
import { showRoll } from './dice3d.js';
import { packRoom } from './roomcode.js';
import {
  fixSheet, renderSheetLite, ABILITIES, DMG_TYPES,
  savesFromSheet, moveList, fixMove, mod as sheetMod,
} from './sheet.js';
import { publishChar } from './charlink.js';
import { dbPut, noteRoom } from './registry.js';
import { fileName } from './translit.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const COLORS = ['#c9a45a', '#ece6d9', '#b8604a', '#83a05f', '#7fa8c9', '#a678b8', '#e0a05a', '#6f6a5e'];
const SHAPES = [
  { id: 'pen', label: 'Перо' }, { id: 'marker', label: 'Маркер' }, { id: 'line', label: 'Линия' },
  { id: 'arrow', label: 'Стрелка' }, { id: 'rect', label: 'Прямоуг.' }, { id: 'circle', label: 'Круг' },
  { id: 'cone', label: 'Конус' }, { id: 'eraser', label: 'Ластик' },
];

const app = {};   // me, sync, store, board, isDM

/* ───────────────────────── Вход ───────────────────────── */

// Идентификатор — свой у каждой вкладки: иначе два окна одного браузера
// считают действия друг друга своими и молча их выбрасывают.
function myId() {
  let id = sessionStorage.getItem('dnd.me');
  if (!id) { id = uid('u'); sessionStorage.setItem('dnd.me', id); }
  return id;
}
/** Человек за столом узнаётся по имени — оно переживает перезаход и смену устройства. */
export const nameKey = (n) => String(n || '').trim().toLowerCase();
const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\wа-яё-]/gi, '').slice(0, 40);

/* Вход по ссылке-приглашению: ?r=комната&k=ключ (игрок) + &m=ключ (Мастер). */
const P = new URLSearchParams(location.search);
const invite = P.get('r') && P.get('k')
  ? { room: P.get('r'), key: P.get('k'), dm: P.get('m') || '' } : null;

if (invite) {
  const jf = $('#join-form');
  $('.tabs[role=tablist]').hidden = true;
  $('#create-form').hidden = true;
  jf.hidden = false;
  jf.room.value = invite.room;
  jf.key.value = invite.key;
  jf.dmkey.value = invite.dm;
  $$('.field', jf).forEach((f, i) => { if (i > 0) f.hidden = true; });
  $('.gate-sub').innerHTML = `Комната «${esc(invite.room)}»<br>вы входите как <b>${invite.dm ? 'Мастер' : 'игрок'}</b>`;
  const saved = localStorage.getItem('dnd.name');
  if (saved) jf.name.value = saved;   // имя подставлено, вход — по кнопке
  // из кабинета приходят с готовым персонажем и именем — входим сразу
  if (saved && sessionStorage.getItem('dnd.char')) setTimeout(() => jf.requestSubmit(), 0);
}

/* Стол удалили, пока мы за ним сидели — объясняем это на входе. */
const killed = sessionStorage.getItem('dnd.killed');
if (killed !== null) {
  const self = sessionStorage.getItem('dnd.killedSelf') === '1';
  sessionStorage.removeItem('dnd.killed');
  sessionStorage.removeItem('dnd.killedSelf');
  const err = $('#join-err');
  err.textContent = `Стол ${killed ? `«${killed}» ` : ''}удалён${self ? '' : ' Мастером'}.`;
  err.hidden = false;
}

$('.gate-note').textContent = sessionStorage.getItem('dnd.char')
  ? 'Персонаж выбран — можно за стол.'
  : 'Игрок входит за стол с персонажем из личного кабинета. Мастеру нужен только его ключ.';

$$('[data-gate-tab]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-gate-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
  $$('[data-gate-panel]').forEach((p) => { p.hidden = p.dataset.gatePanel !== b.dataset.gateTab; });
}));

/** Путь комнаты: в облаке он содержит отпечаток ключа, локально — просто название. */
async function roomPath(name, key) {
  const id = slug(name);
  if (!useFirebase) return id;
  const { roomFingerprint } = await import('./sync-firebase.js');
  return id + '-' + roomFingerprint(id, key);
}

/* Скрытый вход из административной комнаты: ?ghost=1 — стол о госте не узнает. */
const ghostMode = P.get('ghost') === '1';

async function makeSync(path, me) {
  if (!useFirebase) return createSync(path, me, { ghost: ghostMode });
  const { createFirebaseSync } = await import('./sync-firebase.js');
  return createFirebaseSync(path, me, FIREBASE, { ghost: ghostMode });
}

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#create-err');
  const name = f.get('room').trim();
  if (!slug(name)) return fail(err, 'Название комнаты не подходит');
  busy(e.target, true);
  try {
    const me = { id: myId(), name: f.get('name').trim(), role: 'dm' };
    localStorage.setItem('dnd.name', me.name);
    app.roomPath = await roomPath(name, f.get('key'));
    const sync = await makeSync(app.roomPath, me);
    if (await sync.loadState()) return fail(err, 'Комната с таким названием и ключом уже есть — войдите в неё');
    const st = emptyState({ name, playerKey: f.get('key'), dmKey: f.get('dmkey') });
    sync.saveState(st, { name });
    start(sync, st, me);
  } catch (ex) {
    fail(err, 'Не удалось открыть комнату: ' + ex.message);
  } finally { busy(e.target, false); }
});

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $('#join-err');
  const key = f.get('key');
  const dmkey = (f.get('dmkey') || '').trim();
  // за стол выходят с персонажем: игрок приводит его из личного кабинета,
  // без ключа Мастера пустой вход не пускаем
  if (!dmkey && !sessionStorage.getItem('dnd.char')) {
    return fail(err, 'Сначала выберите персонажа в личном кабинете — без него за стол не пускают');
  }
  busy(e.target, true);
  try {
    const me = { id: myId(), name: f.get('name').trim(), role: 'player' };
    localStorage.setItem('dnd.name', me.name);
    app.roomPath = await roomPath(f.get('room'), key);
    const sync = await makeSync(app.roomPath, me);
    const st = await sync.loadState();
    if (!st) {
      // по ссылке Мастера комната создаётся сама при первом входе
      if (!(invite && dmkey)) return fail(err, 'Комната не найдена — проверьте название и ключ');
      const fresh = emptyState({ name: f.get('room').trim(), playerKey: key, dmKey: dmkey });
      me.role = 'dm';
      sync.saveState(fresh, { name: fresh.room.name });
      return start(sync, fresh, me);
    }
    if (!useFirebase && key !== st.room.playerKey) return fail(err, 'Неверный ключ комнаты');
    if (dmkey) {
      if (dmkey !== st.room.dmKey) return fail(err, 'Неверный ключ Мастера');
      me.role = 'dm';
    }
    start(sync, st, me);
  } catch (ex) {
    fail(err, 'Не удалось войти: ' + ex.message);
  } finally { busy(e.target, false); }
});

function fail(el, msg) { el.textContent = msg; el.hidden = false; }
function busy(form, on) {
  const b = form.querySelector('button[type=submit]');
  if (!b.dataset.label) b.dataset.label = b.textContent;
  b.disabled = on;
  b.textContent = on ? 'Подключаемся…' : b.dataset.label;
}

/* ───────────────────────── Запуск стола ───────────────────────── */

function start(sync, state, me) {
  app.me = me;
  app.isDM = me.role === 'dm';
  app.ghost = ghostMode;              // скрытый вход: за столом нас как бы нет
  app.sync = sync;
  app.peers = [];
  app.store = createStore(normalize(state), sync, onRemoteAction, canPersist);

  $('#gate').hidden = true;
  $('#app').hidden = false;
  document.body.classList.toggle('is-dm', app.isDM);
  if (app.isDM) $$('.player-only').forEach((el) => el.remove());
  else $$('.dm-only').forEach((el) => el.remove());

  $('#room-name').textContent = app.store.get().room.name;
  $('#role-badge').textContent = app.ghost ? 'Скрытый вход' : app.isDM ? 'Мастер' : 'Игрок';

  app.board = createBoard({
    canvas: $('#board'), store: app.store, sync: app.sync,
    me, isDM: app.isDM,
    onTokenOpen: openTokenCard,
    onZoneOpen: openZoneCard,
    onPortalEnter: enterPortal,
    onViewChange: (v) => { $('#zoom-val').textContent = Math.round(v.scale * 100) + '%'; },
  });

  // роль выяснилась только сейчас — поправим запись о себе в списке присутствия
  if (app.sync.updateMe) app.sync.updateMe({ role: me.role, name: me.name });

  // Скрытый гость не попадает ни в список за столом, ни в чат: ни следа.
  const firstTime = !app.ghost && !app.store.get().roster[nameKey(me.name)];
  if (!app.ghost) {
    app.store.dispatch({
      t: 'roster.seen',
      member: { key: nameKey(me.name), id: me.id, name: me.name, role: me.role },
    });
  }
  app.store.subscribe(renderAll);
  app.sync.on('event', onRemoteEvent);
  app.sync.on('presence', (list) => { app.peers = list; renderMembers(); });

  // окна в состояние для проверок
  window.__state = () => app.store.get();
  window.__dispatch = (a) => app.store.dispatch(a);
  window.__board = () => app.board;
  window.__peers = () => app.sync.peers();
  window.__me = () => app.me;
  window.__ruler = () => app.board.ruler();
  window.__stats = () => (app.sync.stats ? app.sync.stats() : null);
  window.__openToken = (id) => openTokenCard(app.store.get().tokens[id], { x: 200, y: 200 });
  // приём мимо наводки: проверке незачем целиться мышью по холсту
  window.__resolveMove = (m, ids, adv) => resolveMove(m, null, ids.map((id) => app.store.get().tokens[id]), adv);
  wireUI();
  renderAll(app.store.get());
  app.board.fit();
  // отмечаем стол в реестре: перечислить комнаты в базе иначе нельзя
  if (!app.ghost && app.roomPath) {
    const r = app.store.get().room;
    noteRoom(app.roomPath, r.name, r.playerKey || '', r.dmKey || '');
  }
  if (firstTime) say(`${me.name} за столом (${app.isDM ? 'Мастер' : 'игрок'})`, 'system');
  bringCharacter();
}

/**
 * Игрок пришёл из личного кабинета: кладём его персонажа в базу иконок Мастера.
 * Сам на поле никто не встаёт — фигурку ставит Мастер. Карточка с тем же именем
 * не плодится, а обновляется. Чего в листе нет — берём по умолчанию (10 хитов,
 * обзор 30 футов).
 */
async function bringCharacter() {
  if (app.isDM || app.ghost) return;
  const ch = JSON.parse(sessionStorage.getItem('dnd.char') || 'null');
  if (!ch) return;
  const s = app.store.get();

  let assetId = null;
  if (ch.avatar) {
    assetId = uid('a');
    await app.sync.putAsset(assetId, ch.avatar);
  }
  const stats = {
    hp: { cur: ch.hp && ch.hp.cur > 0 ? ch.hp.cur : 10, max: ch.hp && ch.hp.max > 0 ? ch.hp.max : 10 },
    ac: ch.ac > 0 ? ch.ac : 10,
    vision: ch.vision > 0 ? ch.vision : 30,
    cells: 1, hpPublic: true, namePublic: true,
  };
  // персонаж принадлежит тому, кто его привёл: и карточка, и будущие фигурки
  const owner = { id: app.me.id, name: app.me.name };
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const old = Object.values(s.library).find((it) => same(it.name, ch.name));
  if (old) {
    app.store.dispatch({ t: 'lib.update', id: old.id, patch: { kind: 'pc', assetId: assetId || old.assetId, stats, owner } });
    say(`Карточка «${ch.name}» обновлена из личного кабинета`, 'system');
  } else {
    app.store.dispatch({ t: 'lib.add', item: { id: uid('lib'), name: ch.name, kind: 'pc', assetId, stats, owner } });
    say(`«${ch.name}» добавлен в «Иконки» — Мастер, поставьте фигурку на поле`, 'system');
  }
  // уже стоящие на поле фигурки не трогаем: ничейная фигурка так и остаётся ничьей,
  // владельца получают только те, кого Мастер поставит из этой иконки
}

function onRemoteEvent(ev) {
  if (ev.type === 'room-deleted') { roomIsGone(ev.room); return; }
  if (ev.type === 'asset') {
    ASSETS.delete(ev.id);
    app.board.invalidateAsset(ev.id);
    renderAll(app.store.get());
  }
}

/** Картинки тянем из базы один раз за сессию — иначе панели грузят их на каждой перерисовке. */
const ASSETS = new Map();
function assetUrl(id) {
  if (!id) return Promise.resolve(null);
  if (!ASSETS.has(id)) ASSETS.set(id, app.sync.getAsset(id));
  return ASSETS.get(id);
}

/* ─────────────────────── Удаление стола ─────────────────────── */

/**
 * Стол удалили — свой уход со страницы делаем сразу: любая запись отсюда
 * (снимок, отметка присутствия) воскресила бы комнату в базе.
 */
function roomIsGone(name, self) {
  if (app.gone) return;
  app.gone = true;
  app.dead = true;
  sessionStorage.setItem('dnd.killed', name || app.store.get().room.name || '');
  sessionStorage.setItem('dnd.killedSelf', self ? '1' : '');
  location.href = location.origin + location.pathname;   // без ссылки-приглашения
}

/** Мастер удаляет стол: подтверждение названием, потом чистим базу у всех. */
async function deleteRoom() {
  const name = app.store.get().room.name || '';
  const typed = prompt(
    `Удалить стол «${name}» насовсем?\n\n`
    + 'Пропадут локации, фигурки, иконки, картинки и журнал — у всех, кто за столом. Вернуть нельзя.\n'
    + 'Если кампания нужна, сначала закройте это окно и нажмите «Экспорт».\n\n'
    + 'Для подтверждения введите название стола:');
  if (typed === null) return;
  if (typed.trim().toLowerCase() !== name.trim().toLowerCase()) {
    alert('Название не совпало — стол на месте.');
    return;
  }
  const btn = $('#btn-delete-room');
  btn.disabled = true;
  btn.textContent = 'Удаляем…';
  app.dead = true;                                  // снимок больше не пишем
  app.sync.emit({ type: 'room-deleted', room: name, by: app.me.name });
  await new Promise((res) => setTimeout(res, 700)); // пусть весть дойдёт до остальных
  try {
    await app.sync.deleteRoom();
  } catch (ex) {
    app.dead = false;
    btn.disabled = false;
    btn.textContent = 'Удалить стол насовсем';
    alert('Не удалось удалить стол: ' + ex.message);
    return;
  }
  roomIsGone(name, true);
}

/** Снимок комнаты в базу пишет Мастер; если его нет — самый «старший» из игроков. */
function canPersist() {
  if (app.dead || app.ghost) return false;   // скрытый гость не трогает снимок комнаты
  if (app.isDM) return true;
  const peers = app.peers || [];
  if (peers.some((p) => p.role === 'dm')) return false;
  const ids = [...peers.map((p) => p.id), app.me.id].sort();
  return ids[0] === app.me.id;
}

/** Чужой бросок прилетает тем же каналом, что и всё остальное, — анимацию видят все. */
function onRemoteAction(a) {
  if (a.t !== 'chat.add' || a.msg.secret) return;
  if (a.msg.kind === 'roll') {
    showRoll($('#dice-stage'), a.msg.roll, rollCaption(a.msg.name, a.msg.roll, false));
    return;
  }
  // применённый приём: показываем тот же бросок, что видел его хозяин
  if (a.msg.kind === 'use') {
    const u = a.msg.use;
    const r = u.attack
      ? { sides: 20, mod: 0, dice: u.attack.dice, total: u.attack.total, formula: u.attack.formula }
      : (u.dmg && { sides: u.dmg.parts[0].d, mod: 0, dice: u.dmg.parts.flatMap((p) => p.dice), total: u.dmg.total, formula: '' });
    if (r) showRoll($('#dice-stage'), r, `${a.msg.name}: ${u.name}`);
  }
}

/* ───────────────────────── Работа с картинками ───────────────────────── */

async function fileToAsset(file, maxSide) {
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file);
  });
  const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = dataUrl; });
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (k === 1 && dataUrl.length < 1.5e6) return { id: uid('a'), url: dataUrl };
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { id: uid('a'), url: c.toDataURL('image/webp', .85) };
}

async function storeFiles(files, maxSide) {
  const out = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const a = await fileToAsset(f, maxSide);
    await app.sync.putAsset(a.id, a.url);
    out.push({ ...a, name: f.name.replace(/\.[^.]+$/, '').slice(0, 24) });
  }
  return out;
}

/* ───────────────────────── Отрисовка панелей ───────────────────────── */

/**
 * Перерисовка. Во время перетаскивания фигурки прилетает по десятку действий
 * в секунду — трогать ради них все панели и заново тянуть картинки нельзя,
 * иначе страница начинает лагать. Такие действия обновляют только поле.
 */
function renderAll(s, action) {
  updateUndo();
  if (action && BOARD_ONLY.has(action.t) && !touchesPanels(action)) {
    app.board.render();
    return;
  }
  renderLocations(s);
  renderLibrary(s);
  renderChat(s);
  renderInit(s);
  renderPics(s);
  renderMembers();
  renderHeroes(s);
  renderStatusFx(s);
  renderEditCounts(s);
  const loc = s.activeLoc ? s.locations[s.activeLoc] : null;
  $('#loc-title').textContent = loc ? loc.name : '';
  $('#empty-hint').hidden = !!loc;
  if (app.isDM && loc) {
    setVal('#grid-size', loc.grid.size); setVal('#grid-ox', loc.grid.ox);
    setVal('#grid-oy', loc.grid.oy); setVal('#grid-feet', loc.grid.feet);
    $('#grid-show').checked = loc.grid.show;
    $('#btn-fog-on').classList.toggle('is-active', !!loc.fogOn);
  }
  app.board.render();
  updateShowcase(s);
}
function setVal(sel, v) { const el = $(sel); if (el && document.activeElement !== el) el.value = v; }

// zone.update — это перетаскивание зоны или фонаря: панели от него не меняются
const BOARD_ONLY = new Set(['token.update', 'fog.paint', 'draw.add', 'draw.clear', 'draw.erase', 'wall.add', 'wall.update', 'wall.remove', 'zone.update']);
/** Правки, которые видны и в панелях (хиты, имя, владелец) — там нужна полная перерисовка. */
function touchesPanels(a) {
  if (a.t !== 'token.update') return false;
  return Object.keys(a.patch || {}).some((k) => !['x', 'y', 'mt'].includes(k));
}

function renderLocations(s) {
  const list = $('#locations-list'); if (!list) return;
  list.innerHTML = '';
  s.order.forEach((id) => {
    const l = s.locations[id];
    const row = el('div', 'list-item' + (id === s.activeLoc ? ' is-active' : ''));
    const thumb = el('img', 'thumb'); thumb.alt = '';
    if (l.assetId) assetUrl(l.assetId).then((u) => { if (u) thumb.src = u; });
    const name = el('span', 'name', l.name);
    row.append(thumb, name);
    row.addEventListener('click', () => { app.store.dispatch({ t: 'loc.active', id }); setTimeout(() => app.board.fit(), 30); });

    const up = el('label', 'mini file-btn', '🗺');
    up.title = 'Загрузить карту';
    const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('change', async () => {
      const [a] = await storeFiles(inp.files, 2560);
      if (a) { app.store.dispatch({ t: 'loc.update', id, patch: { assetId: a.id } }); setTimeout(() => app.board.fit(), 60); }
    });
    up.append(inp);
    up.addEventListener('click', (e) => e.stopPropagation());

    const ren = el('button', 'mini', '✎');
    ren.title = 'Переименовать';
    ren.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = prompt('Название локации', l.name);
      if (v) app.store.dispatch({ t: 'loc.update', id, patch: { name: v.slice(0, 40) } });
    });
    const del = el('button', 'mini', '×');
    del.title = 'Удалить';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Удалить локацию «${l.name}» вместе с её токенами?`)) app.store.dispatch({ t: 'loc.remove', id });
    });
    row.append(up, ren, del);
    list.append(row);
  });

  // куда переводить существ разом — все локации, кроме текущей
  const sel = $('#move-all-to');
  if (sel) {
    const keep = sel.value;
    sel.innerHTML = '';
    s.order.filter((id) => id !== s.activeLoc)
      .forEach((id) => sel.append(new Option(s.locations[id].name, id)));
    if (keep && s.locations[keep] && keep !== s.activeLoc) sel.value = keep;
    $('#btn-move-all').disabled = !sel.options.length;
  }
}

let libFilter = 'all';
function renderLibrary(s) {
  const grid = $('#lib-grid'); if (!grid) return;
  grid.innerHTML = '';
  Object.values(s.library)
    .filter((it) => libFilter === 'all' || it.kind === libFilter)
    .forEach((it) => {
      const card = el('div', 'lib-item');
      card.draggable = true;
      const img = el('img'); img.alt = it.name;
      assetUrl(it.assetId).then((u) => { if (u) img.src = u; });
      const cap = el('div', 'cap', it.name);
      const edit = el('button', 'edit', '✎');
      edit.title = 'Карточка существа: имя, хиты, КД, обзор';
      edit.addEventListener('click', (e) => { e.stopPropagation(); openLibCard(it, e); });
      const del = el('button', 'del', '×');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Убрать «${it.name}» из базы? Фигурки на поле останутся.`)) app.store.dispatch({ t: 'lib.remove', id: it.id });
      });
      card.append(img, cap, edit, del);
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/lib', it.id));
      card.addEventListener('dblclick', () => dropToken(it.id, null));
      grid.append(card);
    });
}

// Что сейчас лежит в ленте, по порядку. Кроме renderChat в ленту никто не пишет.
let chatIds = [];

/**
 * Разговор, служебные строки и броски идут одной лентой; фильтр прячет лишнее.
 *
 * Лента дописывается, а не пересобирается заново. Перерисовка панелей идёт на
 * каждое действие за столом, и полная сборка трёхсот сообщений стоила 53 мс —
 * даже когда действие чата не касалось вовсе. Теперь общее начало остаётся на
 * месте, а трогаются только ушедшие сверху и пришедшие снизу.
 */
function renderChat(s) {
  const feed = $('#chat-feed');
  const нужны = s.chat.filter((m) => !m.secret || app.isDM);
  const ids = нужны.map((m) => m.id);

  // у чата есть потолок: самые старые сообщения уходят с начала
  const место = ids.length && chatIds.length ? chatIds.indexOf(ids[0]) : 0;
  const срез = место > 0 ? место : 0;
  const хвост = chatIds.slice(срез);
  const продолжение = хвост.length <= ids.length && хвост.every((id, i) => id === ids[i]);

  // мерим до правки: если игрок отлистал ленту назад, не дёргаем его вниз
  const уНиза = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

  if (!продолжение) {
    feed.innerHTML = '';
    нужны.forEach((m) => feed.append(msgNode(m)));
  } else {
    for (let i = 0; i < срез && feed.firstChild; i++) feed.firstChild.remove();
    for (let i = хвост.length; i < нужны.length; i++) feed.append(msgNode(нужны[i]));
  }
  const добавили = !продолжение || нужны.length > хвост.length;
  chatIds = ids;
  if (добавили && уНиза) feed.scrollTop = feed.scrollHeight;
}

function msgNode(m) {
  const d = el('div', `msg ${m.kind}${m.secret ? ' secret' : ''}`);
  const time = new Date(m.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (m.kind === 'roll') {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span>
      <div class="body">${m.secret ? '🤫 ' : ''}${m.roll.label ? `<span class="roll-what">${esc(m.roll.label)}</span> ` : ''}${esc(m.roll.formula)} → <span class="total">${m.roll.total}</span>
      <span style="color:var(--muted);font-size:14px"> [${m.roll.dice.join(', ')}]${m.roll.mod ? ` ${m.roll.mod > 0 ? '+' : ''}${m.roll.mod}` : ''}</span></div>`;
  } else if (m.kind === 'use') {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span>`
      + `<div class="body">${useBody(m.use)}</div>`;
  } else if (m.kind === 'system') {
    d.innerHTML = `<div class="body">${esc(m.text)}</div>`;
  } else {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span><div class="body">${esc(m.text)}</div>`;
  }
  return d;
}

/**
 * Применённый приём в ленте. КД цели — число Мастера: столу показываем только
 * «пробил броню» или «не пробил», а само КД видит лишь Мастер.
 */
function useBody(u) {
  if (!u) return '';
  const кто = u.by ? `${esc(u.by)} — ` : '';
  const строки = [`${кто}<b class="roll-what">${esc(u.name)}</b> → ${esc(u.targets.join(', '))}`];
  if (u.attack) {
    const a = u.attack;
    // при двух костях видно, какая пошла в счёт: [17, 4] → взяли 17
    const кости = a.adv ? `[${a.dice.join(', ')}] → взяли ${a.kept}` : `[${a.dice.join(', ')}]`;
    строки.push(`атака ${esc(a.formula)} → <span class="total">${a.total}</span>`
      + `<span class="use-dim"> ${кости}</span>`
      + (app.isDM ? `<span class="use-dim"> против КД ${a.vs}</span>` : ''));
    строки.push(a.crit ? '<span class="use-crit">двадцатка — критический удар, урон вдвое</span>'
      : a.hit ? '<span class="use-hit">пробил броню</span>' : '<span class="use-miss">не пробил</span>');
  }
  if (u.save) {
    строки.push(`спасбросок ${esc(u.save.abil)}${app.isDM ? `, сложность ${u.save.dc}` : ''}`
      + `<span class="use-dim"> при успехе ${u.save.onSave === 'half' ? 'половина' : 'ничего'}</span>`);
    (u.saves || []).forEach((sv) => {
      const прибавка = sv.mod ? ` ${sv.mod > 0 ? '+' : '−'}${Math.abs(sv.mod)}` : '';
      строки.push(`<span class="use-dim">${esc(sv.name)}: [${sv.dice.join(', ')}]${прибавка} → ${sv.total} — </span>`
        + (sv.ok ? '<span class="use-hit">отбился</span>' : '<span class="use-miss">не отбился</span>'));
    });
  }
  if (u.dmg) {
    const куски = u.dmg.parts
      .map((p) => `${p.n}д${p.d}${p.type ? ' ' + esc(p.type) : ''}<span class="use-dim"> [${p.dice.join(', ')}]</span>`)
      .join(' + ');
    строки.push(`${куски} → <span class="total">${u.dmg.total}</span>`
      + (u.dmg.crit ? '<span class="use-dim"> (уже вдвое)</span>' : ''));
  }
  // хиты уже сняты: строка говорит, чем дело кончилось. Полоску чужих хитов
  // игрокам показывать нельзя, поэтому остаток видит только Мастер и хозяин
  if (u.landed) {
    u.landed.forEach((l) => {
      const знак = l.delta > 0 ? '+' : '−';
      const остаток = (app.isDM || l.pub) ? `, осталось ${l.left} из ${l.max}` : '';
      // ноль бывает у неуязвимого: «−0» читается как опечатка, пишем словами
      const число = l.delta === 0 ? 'урон не прошёл' : `${знак}${Math.abs(l.delta)}`;
      строки.push(`<span class="${l.delta > 0 ? 'use-hit' : 'use-miss'}">${esc(l.name)}: ${число}</span>`
        + (l.why ? `<span class="use-dim"> (${esc(l.why)})</span>` : '')
        + `<span class="use-dim">${остаток}</span>`
        + (l.down ? '<span class="use-miss"> — свалился</span>' : ''));
    });
  }
  if (u.conc) строки.push('<span class="use-dim">требует концентрации</span>');
  return строки.map((s) => `<div class="use-line">${s}</div>`).join('');
}

/** Показать фигурку: если она в другой локации, сначала переходим туда. */
function goToToken(t) {
  if (!t) return;
  if (t.locId !== app.store.get().activeLoc) {
    if (!app.isDM) return;                       // локацию для стола меняет только Мастер
    app.store.dispatch({ t: 'loc.active', id: t.locId });
  }
  setTimeout(() => app.board.focusToken(t.id), 40);
}

/** Имя существа глазами читателя: скрытые имена НПС и врагов игрок не видит. */
function tokenName(t) {
  return (app.isDM || t.namePublic !== false) ? t.name : 'Неизвестное существо';
}

function renderInit(s) {
  const list = $('#init-list');
  list.innerHTML = '';
  $('#round-line').textContent = s.init.order.length ? `Раунд ${s.init.round}` : 'Порядок не выставлен';
  const endBtn = $('#init-end');
  if (endBtn) endBtn.hidden = !s.init.order.length;
  s.init.order.forEach((entry, i) => {
    const t = s.tokens[entry.id];
    if (!t) return;
    const row = el('div', 'init-item' + (i === s.init.idx ? ' is-turn' : ''));
    const head = el('div', 'init-head');
    const img = el('img'); img.alt = '';
    if (t.assetId) assetUrl(t.assetId).then((u) => { if (u) img.src = u; });
    const go = el('button', 'mini', '⌖');
    go.title = 'Перейти к фигурке';
    go.addEventListener('click', () => goToToken(t));
    head.append(img, el('span', 'nm', tokenName(t)), go, el('span', 'iv', String(entry.v)));
    row.append(head);

    if (t.hp && t.hp.max > 0 && (app.isDM || t.hpPublic !== false)) {
      const bar = el('div', 'hp-bar');
      const fill = el('div', 'hp-fill');
      fill.style.width = Math.max(0, Math.min(100, (t.hp.cur / t.hp.max) * 100)) + '%';
      bar.append(fill); row.append(bar);
      if (app.isDM) {
        const hp = el('div', 'hp-row');
        const cur = numInput(t.hp.cur, (v) => app.store.dispatch({ t: 'token.update', id: t.id, patch: { hp: { cur: v } } }));
        const max = numInput(t.hp.max, (v) => app.store.dispatch({ t: 'token.update', id: t.id, patch: { hp: { max: v } } }));
        hp.append(cur, el('span', '', '/'), max, el('span', '', 'хиты'));
        row.append(hp);
      }
    }
    if (app.isDM) {
      const st = el('div', 'status-row');
      STATUSES.forEach((name) => {
        const on = (t.statuses || []).includes(name);
        const b = el('button', 'status' + (on ? ' on' : ''), name);
        b.addEventListener('click', () => {
          const next = on ? t.statuses.filter((x) => x !== name) : [...(t.statuses || []), name];
          app.store.dispatch({ t: 'token.status', id: t.id, statuses: next });
        });
        st.append(b);
      });
      row.append(st);
    } else if ((t.statuses || []).length) {
      const st = el('div', 'status-row');
      t.statuses.forEach((n) => st.append(el('span', 'status on', n)));
      row.append(st);
    }
    list.append(row);
  });
}

function numInput(value, onChange) {
  const i = el('input'); i.type = 'number'; i.value = value;
  i.addEventListener('change', () => onChange(Number(i.value) || 0));
  return i;
}

function renderPics(s) {
  const grid = $('#pics-grid'); if (!grid) return;
  grid.innerHTML = '';
  s.pics.assets.forEach((id) => {
    const card = el('div', 'lib-item' + (s.pics.shown === id ? ' is-shown' : ''));
    const img = el('img'); img.alt = '';
    assetUrl(id).then((u) => { if (u) img.src = u; });
    const del = el('button', 'del', '×');
    del.addEventListener('click', (e) => { e.stopPropagation(); app.store.dispatch({ t: 'pics.remove', assetId: id }); });
    card.append(img, del);
    card.addEventListener('click', () => app.store.dispatch({ t: 'pics.show', assetId: s.pics.shown === id ? null : id }));
    grid.append(card);
  });
}

let showcaseHiddenFor = null;
function updateShowcase(s) {
  const box = $('#showcase'), img = $('#showcase-img'), chip = $('#showcase-chip');
  const id = s.pics.shown;
  if (!id) { box.hidden = true; chip.hidden = true; showcaseHiddenFor = null; return; }
  $('#showcase-label').textContent = app.isDM
    ? 'Эту картинку сейчас видят игроки' : 'Картинка от Мастера';
  if (showcaseHiddenFor === id) { box.hidden = true; chip.hidden = false; return; }
  chip.hidden = true;
  assetUrl(id).then((u) => { if (u) { img.src = u; box.hidden = false; } });
}

/* ─────────────────────── Шаг назад ─────────────────────── */

let toastTimer = null;
/** Короткое слово о случившемся: всплыло над полем и само растаяло. */
function toast(text) {
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

/** Отмена своего последнего действия: обратное уходит всем за столом. */
function doUndo() {
  const label = app.store.undo();
  toast(label ? `Отменено: ${label}` : 'Отменять нечего');
  updateUndo();
}

function updateUndo() {
  const b = $('#btn-undo');
  if (!b) return;
  const label = app.store.lastUndo();
  b.disabled = !label;
  b.title = label ? `Отменить: ${label} (Ctrl+Z)` : 'Отменять нечего';
}

/* ─────────────────── Вдохновение и уровень ─────────────────── */

const inspOf = (s, key) => (s.inspiration && s.inspiration[key]) || 0;
const levelOf = (s, key) => (s.levels && s.levels[key]) || 1;
let gemShown = null;

/**
 * Персонаж игрока: карточка, которую он привёл из кабинета. Если карточки уже
 * нет, спрашиваем поле — фигурка помнит владельца по имени.
 */
function heroOf(s, key) {
  const lib = Object.values(s.library).find((it) => it.owner && nameKey(it.owner.name) === key);
  if (lib) return { name: lib.name, assetId: lib.assetId };
  const t = Object.values(s.tokens).find((x) => nameKey(x.ownerName) === key);
  return t ? { name: t.name, assetId: t.assetId } : null;
}

/** Имя человека, под ним — имя персонажа, слева — его иконка. */
function whoBox(s, m) {
  const box = el('div', 'hero-who');
  const hero = heroOf(s, m.key);
  if (hero) {
    const pic = el('span', 'hero-pic', hero.name.slice(0, 1).toUpperCase());
    if (hero.assetId) assetUrl(hero.assetId).then((u) => {
      if (!u) return;
      const img = el('img'); img.alt = '';
      img.src = u;
      pic.textContent = '';
      pic.append(img);
    });
    box.append(pic);
  }
  const names = el('div', 'hero-names');
  names.append(el('span', 'who', m.name));
  names.append(el('span', 'ch', hero ? hero.name : 'персонажа за столом нет'));
  box.append(names);
  return box;
}

/** Список героев со счётчиком вдохновения: ± только у Мастера. */
function renderHeroes(s) {
  const box = $('#heroes-list');
  if (!box) return;
  box.innerHTML = '';
  const people = participants().filter((m) => m.role !== 'dm');
  if (!people.length) {
    box.append(el('p', 'hint', 'Игроки ещё не заходили за стол.'));
  }
  people.forEach((m) => {
    const n = inspOf(s, m.key);
    const row = el('div', 'hero-row' + (m.key === nameKey(app.me.name) ? ' is-me' : ''));
    row.append(whoBox(s, m));
    if (!m.online) row.append(el('span', 'off', 'не в сети'));

    const lv = levelOf(s, m.key);
    const lvl = el('div', 'hero-lvl');
    lvl.title = 'Уровень персонажа';
    if (app.isDM) lvl.append(stepBtn('−', () => setLevel(m.key, lv - 1)));
    lvl.append(el('span', 'lvl-tag', 'ур.'), el('span', 'n', String(lv)));
    if (app.isDM) lvl.append(stepBtn('+', () => setLevel(m.key, lv + 1)));

    const gems = el('div', 'hero-gems');
    if (app.isDM) gems.append(stepBtn('−', () => setInsp(m.key, n - 1)));
    gems.append(gemNode(n === 0), el('span', 'n', String(n)));
    if (app.isDM) gems.append(stepBtn('+', () => setInsp(m.key, n + 1)));
    // счётчики уходят под имя: в узкой панели имя персонажа иначе не помещается
    const nums = el('div', 'hero-nums');
    nums.append(lvl, gems);
    row.append(nums);
    box.append(row);
  });

  // свой самоцвет — всегда на виду, у Мастера его нет
  const badge = $('#gem-badge');
  const mine = inspOf(s, nameKey(app.me.name));
  badge.hidden = app.isDM;
  if (!app.isDM) {
    $('#gem-count').textContent = mine;
    badge.classList.toggle('is-empty', mine === 0);
    badge.title = mine ? `Вдохновение: ${mine}` : 'Вдохновения пока нет';
    if (gemShown !== null && gemShown !== mine) {
      badge.classList.remove('is-changed');
      void badge.offsetWidth;                 // перезапуск анимации
      badge.classList.add('is-changed');
      setTimeout(() => badge.classList.remove('is-changed'), 900);
    }
    gemShown = mine;
    sendInspToCabinet(mine);
  }
}

/**
 * Счётчик вдохновения виден и в личном кабинете, но правит его только Мастер.
 * Поэтому стол сам кладёт число в кабинет игрока — если тот вошёл через него.
 */
let inspSent = null;
function sendInspToCabinet(n) {
  if (inspSent === n) return;
  inspSent = n;
  const cab = JSON.parse(sessionStorage.getItem('dnd.cab') || 'null');
  if (cab && cab.path) dbPut(`cab-${cab.path}/profile/insp`, n);
}
/** Тот же гранёный камень, что и в верхней панели. */
function gemNode(dim) {
  const g = el('span', 'gem' + (dim ? ' is-dim' : ''));
  g.innerHTML = '<svg class="gem-svg" viewBox="0 0 40 44"><use href="#gem-shape"/></svg>';
  return g;
}
function stepBtn(label, onClick) {
  const b = el('button', 'hero-btn', label);
  b.addEventListener('click', onClick);
  return b;
}
function setInsp(key, value) {
  app.store.dispatch({ t: 'insp.set', key, value: Math.max(0, Math.min(99, value)) });
}
function setLevel(key, value) {
  app.store.dispatch({ t: 'level.set', key, value: Math.max(1, Math.min(20, value)) });
}

/* ───────────────── Эффекты состояний на игровом поле ───────────────── */

let fxNow = '';
function renderStatusFx(s) {
  const layer = $('#fx-layer');
  if (!layer) return;
  // берём состояния своих персонажей: Мастеру поле не застилаем
  const mine = app.isDM ? [] : Object.values(s.tokens)
    .filter((t) => nameKey(t.ownerName) === nameKey(app.me.name))
    .flatMap((t) => t.statuses || []);
  const list = [...new Set(mine)].filter((n) => STATUS_FX[n]);
  const key = list.join('|');
  if (key === fxNow) return;
  fxNow = key;

  layer.innerHTML = '';
  if (!list.length) return;
  list.forEach((name) => {
    const d = el('div', 'fx fx-' + STATUS_FX[name]);
    layer.append(d);
  });
  const label = el('div', 'fx-label');
  list.forEach((name) => label.append(el('span', '', name)));
  layer.append(label);
}

/** Все, кого знает стол: кто сейчас в сети + кто заходил раньше, без дублей по имени. */
function participants() {
  const out = new Map();
  Object.values(app.store.get().roster).forEach((m) => {
    out.set(nameKey(m.name), { ...m, key: nameKey(m.name), online: false });
  });
  // «в сети» — только свежие отметки: браузер мог закрыться без прощания
  const fresh = Date.now() - 60000;
  (app.peers || []).filter((p) => !p.at || p.at > fresh).forEach((p) => {
    const k = nameKey(p.name);
    out.set(k, { ...(out.get(k) || {}), key: k, id: p.id, name: p.name, role: p.role, online: true });
  });
  return [...out.values()].sort((a, b) => (b.role === 'dm') - (a.role === 'dm'));
}

function renderMembers() {
  const all = participants();
  // Значки сверху — только те, кто сейчас за столом: вышел, значок пропал.
  const box = $('#members');
  box.innerHTML = '';
  all.filter((p) => p.online).forEach((p) => {
    const d = el('span', 'dot', (p.name || '?').slice(0, 1).toUpperCase());
    d.style.background = p.role === 'dm' ? 'var(--gold)' : '#7fa8c9';
    d.title = p.name + (p.role === 'dm' ? ' — Мастер' : '');
    box.append(d);
  });

  const ml = $('#members-list');
  if (ml) {
    ml.innerHTML = '';
    all.forEach((m) => {
      const row = el('div', 'list-item');
      row.append(el('span', 'name', m.name + (m.role === 'dm' ? ' — Мастер' : '')));
      row.append(el('span', 'badge', m.online ? 'в сети' : 'нет'));
      if (!m.online) {
        const del = el('button', 'mini', '×');
        del.title = 'Забыть этого участника';
        del.addEventListener('click', () => app.store.dispatch({ t: 'roster.forget', keys: [m.key] }));
        row.append(del);
      }
      ml.append(row);
    });
    const offline = all.filter((m) => !m.online);
    $('#btn-forget-offline').hidden = !offline.length;
  }
}

/* ─────────────────── База существ: карточка из «Иконок» ─────────────────── */

const libUpd = (id, patch) => app.store.dispatch({ t: 'lib.update', id, patch });

/**
 * Карточка существа в базе. Хиты, обзор и видимость имени живут здесь, а не
 * только на фигурке: удалили фигурку — настройки никуда не делись.
 */
/**
 * Поля существа в базе: одни и те же в карточке у поля и на странице
 * подготовки. redraw зовём, когда сменился вид: у героя нет ни стойкости,
 * ни спасбросков, ни своих приёмов, и лишние поля должны уйти сразу.
 */
function libFields(host, it, redraw, kinds = null) {
  host.append(field('Имя', textInput(it.name, (v) => libUpd(it.id, { name: v }))));

  const kindSel = el('select', 'sel');
  // на странице подготовки героя выбрать нельзя: карточка просто исчезла бы
  (kinds || [['pc', 'Персонаж'], ['npc', 'НПС'], ['enemy', 'Враг']]).forEach(([v, label]) => {
    const o = new Option(label, v);
    if (it.kind === v) o.selected = true;
    kindSel.append(o);
  });
  kindSel.addEventListener('change', () => { libUpd(it.id, { kind: kindSel.value }); redraw(); });
  host.append(field('Вид', kindSel));

  const st = { ...defaultStats(it.kind), ...(it.stats || {}) };
  host.append(field('Хиты (тек./макс.)', pair(
    numInput(st.hp.cur, (v) => libUpd(it.id, { stats: { hp: { cur: v } } })),
    numInput(st.hp.max, (v) => libUpd(it.id, { stats: { hp: { max: v } } })))));
  // числа идут парами: столбиком карточка растягивалась на две высоты экрана
  host.append(pair(
    field('КД', numInput(st.ac, (v) => libUpd(it.id, { stats: { ac: Math.max(0, v) } }))),
    field('Размер, клеток',
      numInput(st.cells, (v) => libUpd(it.id, { stats: { cells: Math.max(1, Math.min(6, v)) } })))));
  host.append(field('Обзор, футов (0 — без обзора)',
    numInput(st.vision, (v) => libUpd(it.id, { stats: { vision: Math.max(0, v) } }))));
  // Герой приносит своё: стойкость к урону и спасброски у него в листе, а не
  // в базе иконок. Поэтому эти поля — только у НПС и врагов.
  if (it.kind !== 'pc') {
    const статы = () => ({ ...defaultStats(it.kind), ...((app.store.get().library[it.id] || it).stats || {}) });
    host.append(guardField(статы, (patch) => libUpd(it.id, { stats: patch })));
    host.append(savesField(статы, (patch) => libUpd(it.id, { stats: patch })));
    host.append(movesField(статы, (patch) => libUpd(it.id, { stats: patch }), null));
  }
  host.append(checkRow('Имя видно игрокам', st.namePublic !== false,
    (on) => libUpd(it.id, { stats: { namePublic: on } })));
  host.append(checkRow('Полоска хитов видна игрокам', st.hpPublic !== false,
    (on) => libUpd(it.id, { stats: { hpPublic: on } })));
}

/* ── Подготовка существ ───────────────────────────────────────────────
   Все существа комнаты на одной странице: карточки в колонки, у каждой те же
   поля, что и в маленькой карточке у поля. Чинить гоблину урон посреди боя
   удобно в карточке, а расписать десяток врагов — здесь. */

let prepFilter = 'all';

function renderPrep() {
  const grid = $('#prep-grid');
  if (!grid || $('#prep').hidden) return;
  const s = app.store.get();
  // героев здесь нет: их приносят из кабинета, когда садятся за стол, и всё
  // своё — хиты, стойкость, приёмы — они несут в листе
  const список = Object.values(s.library)
    .filter((it) => it.kind !== 'pc')
    .filter((it) => prepFilter === 'all' || it.kind === prepFilter);
  grid.innerHTML = '';
  $('#prep-empty').hidden = !!список.length;
  список.forEach((it) => {
    const card = el('div', 'prep-card');
    const head = el('div', 'prep-card-head');
    const pic = el('span', 'feat-pic');
    assetUrl(it.assetId).then((u) => { if (u) pic.style.backgroundImage = `url("${u}")`; });
    const кого = { pc: 'Персонаж', npc: 'НПС', enemy: 'Враг' }[it.kind] || 'Существо';
    head.append(pic, el('span', 'prep-name', it.name || 'Без имени'), el('span', 'use-dim', кого));
    card.append(head);
    // перерисовываем страницу целиком: сменился вид — поменялся и состав полей
    libFields(card, it, renderPrep, [['npc', 'НПС'], ['enemy', 'Враг']]);
    grid.append(card);
  });
}

function openPrep() {
  $('#prep').hidden = false;
  renderPrep();
}

function openLibCard(it, ev) {
  const card = $('#token-card');
  card.innerHTML = '';
  card.hidden = false;

  const close = el('button', 'icon-btn close', '×');
  close.addEventListener('click', () => { card.hidden = true; });
  card.append(close, el('h4', '', 'Карточка в базе'));

  libFields(card, it, () => openLibCard(app.store.get().library[it.id] || it, ev));
  card.append(el('p', 'hint', it.owner
    ? `Персонаж игрока ${it.owner.name}: его фигурки сразу достаются ему.`
    : 'Эти настройки получит каждая новая фигурка с этой иконкой.'));

  // Отсюда переход и нужен: в списке иконок не видно, где на поле стоит это существо
  const bGo = el('button', 'btn btn-soft btn-sm w-full', '⌖ Перейти к фигурке');
  const note = el('p', 'hint', '');
  let i = 0;
  const refresh = () => {
    const list = tokensOfLib(app.store.get(), it);
    bGo.disabled = !list.length;
    bGo.textContent = list.length > 1 ? `⌖ Перейти к фигурке (${(i % list.length) + 1} из ${list.length})` : '⌖ Перейти к фигурке';
    note.textContent = list.length ? '' : 'На поле пока нет фигурок с этой иконкой.';
  };
  bGo.addEventListener('click', () => {
    const list = tokensOfLib(app.store.get(), it);
    if (!list.length) return;
    const t = list[i % list.length];
    i = (i + 1) % list.length;
    goToToken(t);
    refresh();
  });
  refresh();
  card.append(bGo, note);
  // держим карточку у края поля, ближе к списку иконок: середина нужна свободной,
  // чтобы увидеть фигурку, к которой перешли
  const board = $('#board').getBoundingClientRect();
  placeCard(card, ev
    ? { x: ev.clientX - board.left, y: ev.clientY - board.top }
    : { x: 0, y: board.height / 2 });
}

/**
 * Фигурки этой карточки: у поставленных раньше libId ещё нет, поэтому
 * подхватываем их по общей иконке.
 */
function tokensOfLib(s, it) {
  // порядок не трогаем: он должен быть одинаковым от клика к клику, иначе перебор
  // копий начнёт возвращаться к той же фигурке
  return Object.values(s.tokens)
    .filter((t) => (t.libId ? t.libId === it.id : it.assetId && t.assetId === it.assetId));
}

/* ───────────────────────── Карточка токена ───────────────────────── */

function openTokenCard(t, screenPos) {
  const card = $('#token-card');
  card.innerHTML = '';
  card.hidden = false;

  const close = el('button', 'icon-btn close', '×');
  close.addEventListener('click', () => { card.hidden = true; });
  card.append(close, el('h4', '', tokenName(t)));

  if (!app.isDM) {
    const hpVisible = t.hp && t.hp.max > 0 && t.hpPublic !== false;
    const info = el('div', 'hint',
      `${hpVisible ? `Хиты: ${t.hp.cur}/${t.hp.max}. ` : ''}${(t.statuses || []).join(', ') || 'Состояний нет'}`);
    card.append(info);
    placeCard(card, screenPos);
    return;
  }

  card.append(field('Имя', textInput(t.name, (v) => upd(t.id, { name: v }))));
  // хиты сначала видно, а потом правится: полоска тянется вслед за числами
  const bar = el('div', 'hp-bar');
  const fill = el('i', 'hp-fill');
  bar.append(fill);
  const paintBar = () => {
    const cur = app.store.get().tokens[t.id] || t;
    const max = Math.max(1, cur.hp.max || 1);
    const доля = Math.max(0, Math.min(1, (cur.hp.cur || 0) / max));
    fill.style.width = (доля * 100) + '%';
    bar.dataset.level = доля > 0.5 ? 'ok' : доля > 0.2 ? 'low' : 'bad';
  };
  const hpRow = pair(
    numInput(t.hp.cur, (v) => { upd(t.id, { hp: { cur: v } }); paintBar(); }),
    numInput(t.hp.max, (v) => { upd(t.id, { hp: { max: v } }); paintBar(); }));
  const hp = el('div', 'field');
  hp.append(el('span', '', 'Хиты (тек./макс.)'), bar, hpRow);
  card.append(hp);
  paintBar();
  // КД видит только Мастер: игроку незачем знать, во что он целится
  card.append(pair(
    field('КД', numInput(t.ac, (v) => upd(t.id, { ac: Math.max(0, v) }))),
    field('Размер, клеток', numInput(t.cells, (v) => upd(t.id, { cells: Math.max(1, Math.min(6, v)) })))));
  card.append(field('Дальность зрения, футов (0 — без обзора)',
    numInput(t.vision, (v) => upd(t.id, { vision: Math.max(0, v) }))));
  // то же и у фигурки: у героя стойкость и спасброски берутся из его листа
  if (t.kind !== 'pc') {
    const живой = () => app.store.get().tokens[t.id] || t;
    card.append(guardField(живой, (patch) => upd(t.id, patch)));
    card.append(savesField(живой, (patch) => upd(t.id, patch)));
    card.append(movesField(живой, (patch) => upd(t.id, patch), t));
  }
  card.append(checkRow('Имя видно игрокам', t.namePublic !== false,
    (on) => upd(t.id, { namePublic: on })));
  card.append(checkRow('Полоска хитов видна игрокам', t.hpPublic !== false,
    (on) => upd(t.id, { hpPublic: on })));

  const sel = el('select', 'sel');
  sel.append(new Option('— ничей —', ''));
  // только те, кто сейчас за столом; вышедший остаётся, если фигурка уже его
  const people = participants().filter((m) => m.online || nameKey(t.ownerName) === m.key);
  people.forEach((m) => {
    const o = new Option(m.name + (m.role === 'dm' ? ' (Мастер)' : '') + (m.online ? '' : ' — не в сети'), m.key);
    if (nameKey(t.ownerName) === m.key) o.selected = true;
    sel.append(o);
  });
  sel.addEventListener('change', () => {
    const p = people.find((m) => m.key === sel.value);
    upd(t.id, { ownerName: p ? p.name : null, ownerId: p ? p.id : null });
  });
  card.append(field('Кому принадлежит', sel));

  const s = app.store.get();
  if (s.order.length > 1) {
    const locSel = el('select', 'sel');
    s.order.forEach((id) => {
      const o = new Option(s.locations[id].name, id);
      if (id === t.locId) o.selected = true;
      locSel.append(o);
    });
    locSel.addEventListener('change', () => moveTokenToLocation(t, locSel.value));
    card.append(field('Локация', locSel));
  }
  if (people.length < 2) {
    card.append(el('p', 'hint', 'За столом пока только вы. Как игроки войдут по ссылке — появятся здесь.'));
  }

  const inInit = app.store.get().init.order.some((o) => o.id === t.id);
  const row = el('div', 'card-acts');
  const bInit = el('button', 'btn btn-soft btn-sm', inInit ? 'Убрать из боя' : 'Бросить инициативу');
  bInit.addEventListener('click', () => { toggleInit(t.id); card.hidden = true; });
  const bDel = el('button', 'btn btn-quiet btn-sm', 'Удалить');
  bDel.addEventListener('click', () => { app.store.dispatch({ t: 'token.remove', id: t.id }); card.hidden = true; });
  row.append(bInit, bDel);
  card.append(el('div', 'divider'), row);

  const lib = s.library[t.libId];
  if (lib) {
    const bSave = el('button', 'btn btn-soft btn-sm w-full', 'Сохранить в лист существа');
    bSave.title = `Записать всё — имя, хиты, КД, обзор, получаемый урон, спасброски и приёмы — в лист «${lib.name}». Новые фигурки будут появляться такими же.`;
    bSave.addEventListener('click', () => {
      const cur = app.store.get().tokens[t.id];
      if (!cur) return;
      libUpd(lib.id, {
        name: cur.name,
        stats: {
          hp: { ...cur.hp }, ac: cur.ac, vision: cur.vision, cells: cur.cells,
          hpPublic: cur.hpPublic !== false, namePublic: cur.namePublic !== false,
          resist: [...(cur.resist || [])], vuln: [...(cur.vuln || [])], immune: [...(cur.immune || [])],
          saves: { ...(cur.saves || {}) }, moves: (cur.moves || []).map((m) => ({ ...m })),
        },
      });
      bSave.textContent = 'Сохранено ✓';
    });
    card.append(bSave);
  }
  placeCard(card, screenPos);
}

/**
 * Ставим карточку рядом с фигуркой, но целиком внутри поля: меряем её
 * настоящий размер и, если места справа/снизу нет, разворачиваем в другую сторону.
 */
function placeCard(card, at) {
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

const upd = (id, patch) => app.store.dispatch({ t: 'token.update', id, patch });

/* ─────────── Переходы между локациями и точки входа ─────────── */

const cellKeyOf = (g, x, y) => Math.floor((x - g.ox) / g.size) + ',' + Math.floor((y - g.oy) / g.size);
const cellCenterOf = (g, cx, cy) => ({ x: g.ox + (cx + 0.5) * g.size, y: g.oy + (cy + 0.5) * g.size });

/**
 * Куда встанет пришедший: точка входа, назначенная для этой прежней локации,
 * иначе основная, иначе любая. Занятую клетку не занимаем второй раз —
 * ищем ближайшую свободную рядом.
 */
function spawnSpot(to, fromLocId) {
  const g = to.grid;
  const spawns = to.spawns || [];
  const byFrom = spawns.filter((z) => z.fromLocId === fromLocId);
  const main = spawns.filter((z) => z.main);
  const cands = byFrom.length ? byFrom : (main.length ? main : spawns);
  if (!cands.length) return null;

  const taken = new Set(Object.values(app.store.get().tokens)
    .filter((t) => t.locId === to.id)
    .map((t) => cellKeyOf(g, t.x, t.y)));
  // зона занимает прямоугольник клеток — идём по ним, поэтому пришедшие не слипаются
  for (const z of cands) {
    const [zx, zy] = cellKeyOf(g, z.x, z.y).split(',').map(Number);
    for (let dy = 0; dy < Math.max(1, z.ch || 1); dy++) {
      for (let dx = 0; dx < Math.max(1, z.cw || 1); dx++) {
        if (!taken.has((zx + dx) + ',' + (zy + dy))) return cellCenterOf(g, zx + dx, zy + dy);
      }
    }
  }

  // все точки заняты — становимся в ближайшую свободную клетку, сбоку раньше, чем наискось
  const [cx, cy] = cellKeyOf(g, cands[0].x, cands[0].y).split(',').map(Number);
  for (let r = 1; r <= 8; r++) {
    const ring = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!taken.has((cx + dx) + ',' + (cy + dy))) ring.push([dx, dy]);
      }
    }
    ring.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    if (ring.length) return cellCenterOf(g, cx + ring[0][0], cy + ring[0][1]);
  }
  return { x: cands[0].x, y: cands[0].y };
}

/** Телепорт фигурки: на точку входа новой локации, а если её нет — на ту же клетку. */
function moveTokenToLocation(t, toId, quiet) {
  const s = app.store.get();
  const from = s.locations[t.locId], to = s.locations[toId];
  if (!from || !to || from.id === to.id) return;
  const spot = spawnSpot(to, from.id) || (() => {
    const cx = Math.floor((t.x - from.grid.ox) / from.grid.size);
    const cy = Math.floor((t.y - from.grid.oy) / from.grid.size);
    return cellCenterOf(to.grid, cx, cy);
  })();
  upd(t.id, { locId: toId, x: spot.x, y: spot.y });
  if (quiet) return;
  say(`${t.name} перемещён в «${to.name}»`, 'system');
  $('#token-card').hidden = true;
}

/** Фигурка встала на зелёную стрелку — уводим её в назначенную локацию. */
function enterPortal(t, portal) {
  const s = app.store.get();
  const to = s.locations[portal.toLocId];
  if (!t || !to || to.id === t.locId) return;
  moveTokenToLocation(t, to.id, true);
  say(`${t.name} перешёл в локацию «${to.name}»`, 'system');
}

const ZONE_TITLE = { portals: 'Переход в другую локацию', spawns: 'Точка входа', lights: 'Фонарь', walls: 'Стена или дверь' };

/** Что вообще стоит в этой локации — чтобы в правке было видно, чего искать. */
function renderEditCounts(s) {
  const box = $('#edit-counts');
  if (!box || $('#edit-bar').hidden) return;
  const l = s.locations[s.activeLoc];
  if (!l) { box.textContent = 'Локация не выбрана'; return; }
  const walls = (l.walls || []).filter((w) => w.type !== 'door').length;
  const doors = (l.walls || []).length - walls;
  const parts = [
    ['стен', walls], ['дверей', doors], ['фонарей', (l.lights || []).length],
    ['переходов', (l.portals || []).length], ['входов', (l.spawns || []).length],
  ];
  const some = parts.filter(([, n]) => n);
  box.textContent = some.length ? some.map(([n, v]) => `${n}: ${v}`).join(' · ') : 'В локации пока ничего не поставлено';
}

/** Настройки поставленного объекта: зоны, фонари и стены правит только Мастер. */
function openZoneCard(kind, zone, pos) {
  if (!app.isDM) return;
  const card = $('#token-card');
  card.innerHTML = '';
  card.hidden = false;
  const s = app.store.get();
  const locId = s.activeLoc;
  const zUpd = (patch) => app.store.dispatch({ t: 'zone.update', locId, kind, id: zone.id, patch });
  const drop = (t, extra) => app.store.dispatch({ t, locId, id: zone.id, ...extra });

  const close = el('button', 'icon-btn close', '×');
  close.addEventListener('click', () => { card.hidden = true; });
  card.append(close, el('h4', '', ZONE_TITLE[kind] || 'Объект'));

  if (kind === 'lights') {
    card.append(field('Дальность света, футов',
      numInput(zone.feet || 20, (v) => zUpd({ feet: Math.max(1, Math.min(500, v)) }))));
    card.append(el('p', 'hint', 'Свет обрывается о стены и закрытые двери и виден всем за столом. Сам фонарь видит только Мастер — его можно двигать по полю.'));
    const bDel = el('button', 'btn btn-soft btn-sm w-full', 'Убрать фонарь');
    bDel.addEventListener('click', () => { drop('light.remove'); card.hidden = true; });
    card.append(bDel);
    placeCard(card, pos);
    return;
  }

  if (kind === 'walls') {
    const kindSel = el('select', 'sel');
    [['wall', 'Стена'], ['door', 'Дверь']].forEach(([v, label]) => {
      const o = new Option(label, v);
      if ((zone.type || 'wall') === v) o.selected = true;
      kindSel.append(o);
    });
    kindSel.addEventListener('change', () => zUpd({ type: kindSel.value }));
    card.append(field('Что это', kindSel));
    card.append(checkRow('Открыта (для двери)', !!zone.open, (on) => zUpd({ open: on })));
    card.append(el('p', 'hint', 'Стена и закрытая дверь обрывают обзор. Тяните за концы, чтобы поправить длину.'));
    const bDel = el('button', 'btn btn-soft btn-sm w-full', 'Убрать');
    bDel.addEventListener('click', () => { drop('wall.remove'); card.hidden = true; });
    card.append(bDel);
    placeCard(card, pos);
    return;
  }

  const sel = el('select', 'sel');
  const others = s.order.filter((id) => id !== locId);
  if (kind === 'portals') {
    sel.append(new Option('— локация не выбрана —', ''));
    others.forEach((id) => {
      const o = new Option(s.locations[id].name, id);
      if (zone.toLocId === id) o.selected = true;
      sel.append(o);
    });
    sel.addEventListener('change', () => zUpd({ toLocId: sel.value || null }));
    card.append(field('Куда ведёт', sel));
    card.append(el('p', 'hint', 'Фигурка, вставшая на эту клетку, окажется в выбранной локации — на её точке входа.'));
  } else {
    sel.append(new Option('— из любой локации —', ''));
    others.forEach((id) => {
      const o = new Option('из «' + s.locations[id].name + '»', id);
      if (zone.fromLocId === id) o.selected = true;
      sel.append(o);
    });
    sel.addEventListener('change', () => zUpd({ fromLocId: sel.value || null }));
    card.append(field('Откуда приходят', sel));
    card.append(checkRow('Основная точка входа', !!zone.main, (on) => zUpd({ main: on })));
    card.append(el('p', 'hint', 'Сюда встают пришедшие из выбранной локации. Основная принимает всех остальных. Занятые клетки не занимаются дважды — следующий встанет на свободную.'));
  }
  card.append(field('Размер, клеток (ширина × высота)', pair(
    numInput(zone.cw || 1, (v) => zUpd({ cw: Math.max(1, Math.min(20, v)) })),
    numInput(zone.ch || 1, (v) => zUpd({ ch: Math.max(1, Math.min(20, v)) })))));
  card.append(el('p', 'hint', 'Растянуть можно и мышью — за уголок ◢ в правом нижнем углу зоны.'));
  if (!others.length) card.append(el('p', 'hint', 'Пока есть только одна локация — создайте вторую в панели слева.'));

  const bDel = el('button', 'btn btn-soft btn-sm w-full', 'Убрать зону');
  bDel.addEventListener('click', () => {
    app.store.dispatch({ t: 'zone.remove', locId, kind, id: zone.id });
    card.hidden = true;
  });
  card.append(bDel);
  placeCard(card, pos);
}
function field(label, input) {
  const f = el('label', 'field');
  f.append(el('span', '', label), input);
  return f;
}
function pair(a, b) { const d = el('div', 'row-2'); d.append(a, b); return d; }
/**
 * Получаемый урон в карточке существа: выбрали вид урона и нажали множитель.
 * Подписи именно множителями — «½» под заголовком про стойкость читалось
 * наоборот. Выбранное живёт фишками: щёлкнул по фишке, и она ушла.
 * Три списка вместо одного словаря: массив в правке заменяется целиком, и
 * убрать вид урона получается без возни с удалением ключей.
 */
const GUARD_KINDS = [
  ['resist', '×½', 'получает половину урона'],
  ['vuln', '×2', 'получает двойной урон'],
  ['immune', '×0', 'не получает урона вовсе'],
];

function guardField(get, set) {
  const box = el('div', 'field');
  box.append(el('span', 'fld-l', 'Получаемый урон'));

  const чипы = el('div', 'guard-chips');
  const draw = () => {
    чипы.innerHTML = '';
    GUARD_KINDS.forEach(([key, знак, подпись]) => {
      (get()[key] || []).forEach((тип) => {
        const c = el('button', 'guard-chip guard-' + key, `${тип} ${знак}`);
        c.dataset.kind = key;
        c.type = 'button';
        c.title = `${подпись} — щёлкните, чтобы убрать`;
        // перерисовка отрывает кнопку от документа, и общий обработчик снаружи
        // считает клик «мимо карточки» и закрывает её — до него не доводим
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          set({ [key]: (get()[key] || []).filter((x) => x !== тип) });
          draw();
        });
        чипы.append(c);
      });
    });
    if (!чипы.children.length) чипы.append(el('span', 'hint', 'Весь урон проходит как есть.'));
  };

  const row = el('div', 'guard-add');
  const sel = el('select', 'sel sel-sm');
  DMG_TYPES.forEach((t) => sel.append(new Option(t, t)));
  row.append(sel);
  GUARD_KINDS.forEach(([key, знак, подпись]) => {
    const b = el('button', 'btn btn-soft btn-sm', знак);
    b.type = 'button';
    b.title = подпись;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const тип = sel.value;
      const cur = get();
      // вид урона берут одним способом: назначили новый — старый снимаем
      const patch = {};
      GUARD_KINDS.forEach(([k]) => { patch[k] = (cur[k] || []).filter((x) => x !== тип); });
      patch[key] = [...patch[key], тип];
      set(patch);
      draw();
    });
    row.append(b);
  });

  draw();
  box.append(чипы, row);
  return box;
}

/**
 * Прибавки к спасброскам: шесть маленьких окошек в два ряда. Пишутся со знаком,
 * потому что бывают и отрицательными — у неуклюжего существа своя ловкость.
 */
function savesField(get, set) {
  const box = el('div', 'field');
  box.append(el('span', 'fld-l', 'Спасброски (прибавка к д20)'));
  const grid = el('div', 'saves-grid');
  const cur = get().saves || {};
  ABILITIES.forEach((a) => {
    const cell = el('label', 'saves-cell');
    const i = el('input', 'num-sm');
    i.type = 'number'; i.min = -20; i.max = 20;
    i.value = Number(cur[a.id]) || 0;
    i.addEventListener('input', () => {
      const v = Math.max(-20, Math.min(20, Number(i.value) || 0));
      set({ saves: { ...(get().saves || {}), [a.id]: v } });
    });
    cell.append(el('span', 'fld-l', a.label.slice(0, 3)), i);
    grid.append(cell);
  });
  box.append(grid);
  return box;
}

/**
 * Приёмы существа — тот же список, что в листе героя. Правятся в карточке, а
 * «Применить» бьёт от имени этой фигурки: конус пускается от неё, и в ленте
 * стоит её имя, а не имя Мастера.
 *
 * from — фигурка на поле; в базе существ её нет, там приём только настраивают.
 */
function movesField(get, set, from) {
  const box = el('div', 'field');
  box.append(el('span', 'fld-l', from ? 'Приёмы' : 'Приёмы (достанутся каждой фигурке)'));
  const обёртка = { feats: (get().moves || []).map(fixMove) };
  const сохранить = () => set({ moves: обёртка.feats });
  const список = moveList(обёртка, сохранить, {
    onUse: from ? (m, anchor) => useMove(m, null, anchor, from) : null,
  });
  box.append(список.host, список.addBtn);
  return box;
}

function checkRow(label, checked, onChange) {
  const l = el('label', 'check');
  const i = el('input'); i.type = 'checkbox'; i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked));
  l.append(i, el('span', '', label));
  return l;
}
function textInput(value, onChange) {
  const i = el('input'); i.value = value;
  i.addEventListener('change', () => onChange(i.value.slice(0, 32)));
  return i;
}

function toggleInit(tokenId) {
  const s = app.store.get();
  const has = s.init.order.some((o) => o.id === tokenId);
  const order = has ? s.init.order.filter((o) => o.id !== tokenId)
    : [...s.init.order, { id: tokenId, v: roll(20).total }].sort((a, b) => b.v - a.v);
  app.store.dispatch({ t: 'init.set', order });
}

/* ───────────────────────── Токены на поле ───────────────────────── */

function dropToken(libId, worldPos) {
  const s = app.store.get();
  const it = s.library[libId];
  if (!it || !s.activeLoc) return;
  const p = worldPos || app.board.screenToWorld($('#board').clientWidth / 2, $('#board').clientHeight / 2);
  const c = app.board.cellCenter(p.x, p.y);
  // настройки берём из базы существ: удалили фигурку — заново ничего вбивать не нужно
  const st = { ...defaultStats(it.kind), ...(it.stats || {}) };
  const token = newToken({
    locId: s.activeLoc, x: c.x, y: c.y, assetId: it.assetId, libId: it.id, name: it.name, kind: it.kind,
    cells: st.cells, vision: st.vision, hp: { ...st.hp }, ac: st.ac,
    hpPublic: st.hpPublic, namePublic: st.namePublic,
    resist: [...(st.resist || [])], vuln: [...(st.vuln || [])], immune: [...(st.immune || [])],
    saves: { ...(st.saves || {}) }, moves: (st.moves || []).map(fixMove),
    // персонаж из кабинета принадлежит своему игроку — привязываем сразу
    ownerId: it.owner ? it.owner.id : null,
    ownerName: it.owner ? it.owner.name : null,
  });
  app.store.dispatch({ t: 'token.add', token });
  if (it.owner) say(`${it.name} на поле — фигуркой управляет ${it.owner.name}`, 'system');
}

/* ───────────────────────── Чат и броски ───────────────────────── */

function say(text, kind = 'chat', extra = {}) {
  app.store.dispatch({
    t: 'chat.add',
    msg: { id: uid('m'), ts: Date.now(), by: app.me.id, name: app.me.name, kind, text, ...extra },
  });
}

/** Подпись под кубиками: у броска из листа впереди стоит название характеристики. */
function rollCaption(name, r, secret) {
  return `${name}: ${r.label ? r.label + ' · ' : ''}${r.formula}${secret ? ' · тайно' : ''}`;
}

let diceMode = 'open';
function doRoll(sides) {
  const count = Math.max(1, Math.min(20, Number($('#dice-count').value) || 1));
  const mod = Number($('#dice-mod').value) || 0;
  const r = roll(sides, count, mod);
  const secret = diceMode === 'secret' && app.isDM;
  say('', 'roll', { roll: r, secret });
  showRoll($('#dice-stage'), r, rollCaption(app.me.name, r, secret));
}

/* ── Броски прямо из листа ──────────────────────────────────────────
   Панель кубиков остаётся как была: лист дёргает те же roll/say/showRoll,
   только модификатор берёт из характеристики.

   Меню выбора здесь стояло ради преимущества и помехи. Их убрали — выбирать
   стало нечего, и нажатие сразу кидает. */

/* ── Применение приёма ──────────────────────────────────────────────
   Игрок выбирает способность, потом наводит её на поле: в фигурку, кругом
   от точки или конусом от себя. Дальше считаем сами — кроме спасбросков,
   их катает Мастер. Числа Мастера столу не показываем. */

const AIM_HINT = {
  one: 'Укажите цель. Правая кнопка — отмена.',
  area: 'Укажите центр области. Правая кнопка — отмена.',
  cone: 'Укажите направление конуса. Правая кнопка — отмена.',
};

/** Бонус приёма: от характеристики листа, свой или никакой. */
function moveBonus(m, ch) {
  const b = m.bonus || {};
  if (b.from === 'custom') return Number(b.value) || 0;
  if (b.from && b.from !== 'none' && ch) return sheetMod(ch.sheet[b.from]);
  return 0;
}

/** Кости приёма: два куска, у каждого свой вид урона. */
function rollMoveDice(m) {
  const parts = (m.dice || []).filter((d) => d.n > 0).map((d) => {
    const r = roll(d.d, d.n);
    return { n: d.n, d: d.d, type: d.type, dice: r.dice, sum: r.total };
  });
  if (!parts.length) return null;
  return { parts, total: parts.reduce((a, p) => a + p.sum, 0) };
}

/**
 * Меню у кнопки: как кидать этот приём. Спрашиваем только там, где есть свой
 * бросок д20 — у приёмов со спасброском кидает цель, и выбирать нечего.
 */
const ADV_WAYS = [
  [null, 'Обычный бросок'],
  ['adv', 'С преимуществом'],
  ['dis', 'С помехой'],
];

function askAdv(anchor, onPick) {
  const menu = el('div', 'rollmenu');
  ADV_WAYS.forEach(([v, label]) => {
    const b = el('button', 'rollmenu-b', label);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); close(); onPick(v); });
    menu.append(b);
  });
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - 216) + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  requestAnimationFrame(() => menu.classList.add('is-on'));
  function close() { menu.remove(); document.removeEventListener('click', away, true); }
  function away(e) { if (!menu.contains(e.target)) close(); }
  setTimeout(() => document.addEventListener('click', away, true), 0);
}

function useMove(m, ch, anchor, from = null) {
  const дальше = (adv) => aimMove(m, ch, adv, from);
  if (m.guard === 'ac' && anchor) askAdv(anchor, дальше);
  else дальше(null);
}

function aimMove(m, ch, adv, from = null) {
  const s = app.store.get();
  // от кого летит: у героя это его фигурка, у врага — та, из чьей карточки жмут
  const mine = from || Object.values(s.tokens)
    .find((t) => t.locId === s.activeLoc && nameKey(t.ownerName) === nameKey(app.me.name));
  if (m.aim === 'cone' && !mine) return toast('Конус пускают от своей фигурки, а её нет на поле');
  if (m.aim !== 'one' && !(m.size > 0)) return toast('У приёма не задан размер в футах');
  toast(AIM_HINT[m.aim] || AIM_HINT.one);
  app.board.startAim({
    kind: m.aim,
    feet: m.size,
    from: mine ? { x: mine.x, y: mine.y } : { x: 0, y: 0 },
    onPick: ({ targets }) => resolveMove(m, ch, targets, adv, mine && from ? tokenName(from) : null),
  });
}

function resolveMove(m, ch, targets, adv = null, byName = null) {
  if (!targets.length) return toast('Никого не задело');
  const use = {
    name: m.name || 'Приём',
    by: byName,                               // бьёт существо, а не сам Мастер
    conc: !!m.conc,
    targets: targets.map((t) => tokenName(t)),
  };
  let headline = null;

  let задетые = targets;
  let спасброски = null;
  if (m.guard === 'ac') {
    const t = targets[0];
    const r = roll(20, 1, moveBonus(m, ch), adv);
    // натуральная двадцатка бьёт всегда и бьёт вдвое — броня её не держит.
    // При двух костях смотрим на ту, что пошла в счёт
    const crit = r.kept === 20;
    // равно КД — это попадание
    const hit = crit || r.total >= (Number(t.ac) || 10);
    use.attack = {
      formula: r.formula, dice: r.dice, kept: r.kept, adv: r.adv,
      total: r.total, vs: Number(t.ac) || 10, hit, crit, target: tokenName(t),
    };
    use.targets = [tokenName(t)];
    задетые = hit ? [t] : [];
    if (hit) use.dmg = critDouble(rollMoveDice(m), crit);
    headline = r;
  } else if (m.guard === 'save') {
    use.save = { abil: abilLabel(m.guardAbil), dc: m.dc, onSave: m.onSave };
    use.dmg = rollMoveDice(m);
    // за каждую цель кидаем сами: прибавка к спасброску записана у существа
    спасброски = targets.map((t) => {
      const прибавка = Number((t.saves || {})[m.guardAbil]) || 0;
      const r = roll(20, 1, прибавка);
      const ok = r.total >= (Number(m.dc) || 10);
      return { id: t.id, name: tokenName(t), total: r.total, dice: r.dice, mod: прибавка, ok };
    });
    use.saves = спасброски;
  } else {
    use.dmg = rollMoveDice(m);
    headline = use.dmg && { sides: use.dmg.parts[0].d, mod: 0, dice: use.dmg.parts.flatMap((p) => p.dice), total: use.dmg.total, formula: dmgFormula(use.dmg) };
  }

  if (use.dmg) use.landed = applyToHp(задетые, use.dmg, m.effect, спасброски, m.onSave);
  say('', 'use', { use });
  if (headline) showRoll($('#dice-stage'), headline, `${byName || app.me.name}: ${use.name}`);
}

/**
 * Критический удар: выпала двадцатка — урон удваивается целиком. Удваиваем
 * каждый кусок, а не только итог: стойкость к виду урона считается по кускам,
 * и иначе она делила бы уже не то число.
 */
function critDouble(dmg, crit) {
  if (!dmg || !crit) return dmg;
  return {
    crit: true,
    parts: dmg.parts.map((p) => ({ ...p, sum: p.sum * 2 })),
    total: dmg.total * 2,
  };
}

/**
 * Стойкость существа к виду урона: половина, вдвое или не берёт вовсе.
 * Считаем по каждому куску отдельно — «1д8 рубящий + 2д6 огонь» по существу,
 * которое боится огня, но держит сталь, даёт разные числа с разных костей.
 * Половину округляем вниз, как в правилах.
 */
function hitAfterGuard(t, parts) {
  let total = 0;
  const пометки = new Set();
  parts.forEach((p) => {
    const тип = p.type || '';
    if (тип && (t.immune || []).includes(тип)) { пометки.add(`${тип} ×0`); return; }
    if (тип && (t.vuln || []).includes(тип)) { total += p.sum * 2; пометки.add(`${тип} ×2`); return; }
    if (тип && (t.resist || []).includes(тип)) { total += Math.floor(p.sum / 2); пометки.add(`${тип} ×½`); return; }
    total += p.sum;
  });
  return { total, why: [...пометки].join(', ') };
}

/**
 * Урон и лечение садятся сами: посчитали — сразу сняли или вернули хиты.
 * Правит тот, кто применил приём: действие уходит в общий поток, и остальные
 * увидят уже готовый результат, а не посчитают его заново.
 */
function applyToHp(targets, dmg, effect, saves, onSave) {
  if (!dmg || !(dmg.total > 0) || effect === 'buff' || effect === 'debuff') return null;
  const s = app.store.get();
  const лечим = effect === 'heal';
  const out = [];
  targets.forEach((t0) => {
    const t = s.tokens[t0.id];
    if (!t || !(t.hp && t.hp.max > 0)) return;      // без максимума хитов считать нечего
    // спасбросок режет урон до стойкости: сперва цель уворачивается, а уже
    // потом её шкура делит то, что долетело
    const спас = saves && saves.find((x) => x.id === t.id);
    if (спас && спас.ok && onSave !== 'half') return;        // отбилась начисто
    const куски = спас && спас.ok
      ? dmg.parts.map((p) => ({ ...p, sum: Math.floor(p.sum / 2) }))
      : dmg.parts;
    // лечение стойкостью не режут: она про урон
    const { total, why } = лечим ? { total: dmg.total, why: '' } : hitAfterGuard(t, куски);
    const было = Number(t.hp.cur) || 0;
    const стало = Math.max(0, Math.min(t.hp.max, было + (лечим ? total : -total)));
    if (стало === было && !why) return;
    app.store.dispatch({ t: 'token.update', id: t.id, patch: { hp: { cur: стало } } });
    out.push({
      name: tokenName(t), delta: стало - было, left: стало, max: t.hp.max, why,
      down: стало === 0 && !лечим, pub: t.hpPublic !== false,   // чужой остаток виден не всем
    });
  });
  return out.length ? out : null;
}

const abilLabel = (id) => (ABILITIES.find((a) => a.id === id) || { label: '—' }).label;
const dmgFormula = (d) => d.parts.map((p) => `${p.n}д${p.d}${p.type ? ' ' + p.type : ''}`).join(' + ');

function rollAbility(label, mod) {
  const r = roll(20, 1, mod);
  r.label = label;
  say('', 'roll', { roll: r });
  showRoll($('#dice-stage'), r, rollCaption(app.me.name, r, false));
}

/* ───────────────────────── Провода интерфейса ───────────────────────── */

function wireUI() {
  // инструменты; кнопка отмены стоит в том же ряду, но режимом не является
  $$('#toolbar .tool[data-tool]').forEach((b) => b.addEventListener('click', () => {
    $$('#toolbar .tool[data-tool]').forEach((x) => x.classList.toggle('is-active', x === b));
    app.board.setTool(b.dataset.tool);
    $('#draw-bar').hidden = b.dataset.tool !== 'draw';
    const fb = $('#fog-bar');
    if (fb) fb.hidden = b.dataset.tool !== 'fog';
    const wb = $('#wall-bar');
    if (wb) wb.hidden = b.dataset.tool !== 'wall';
    const eb = $('#edit-bar');
    if (eb) {
      eb.hidden = b.dataset.tool !== 'edit';
      if (!eb.hidden) renderEditCounts(app.store.get());
    }
    $('#token-card').hidden = true;
  }));

  // панель рисования
  const colorBox = $('#draw-colors');
  COLORS.forEach((c, i) => {
    const s = el('button', 'swatch' + (i === 0 ? ' is-active' : ''));
    s.style.background = c;
    s.addEventListener('click', () => {
      $$('.swatch').forEach((x) => x.classList.remove('is-active'));
      s.classList.add('is-active');
      app.board.setDraw({ color: c });
    });
    colorBox.append(s);
  });
  const shapeBox = $('#draw-shapes');
  SHAPES.forEach((sh, i) => {
    const b = el('button', 'shape' + (i === 0 ? ' is-active' : ''), sh.label);
    b.addEventListener('click', () => {
      $$('#draw-shapes .shape').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      app.board.setDraw({ shape: sh.id });
      // у ластика свой размер — он заметно крупнее кисти
      $('#draw-width-row').hidden = sh.id === 'eraser';
      $('#erase-size-row').hidden = sh.id !== 'eraser';
    });
    shapeBox.append(b);
  });
  $('#draw-width').addEventListener('input', (e) => app.board.setDraw({ width: Number(e.target.value) }));
  $('#erase-size').addEventListener('input', (e) => app.board.setEraseSize(Number(e.target.value)));
  $('#draw-clear').addEventListener('click', () => {
    const s = app.store.get();
    if (s.activeLoc) app.store.dispatch({ t: 'draw.clear', locId: s.activeLoc, by: app.isDM ? null : app.me.id });
  });

  // шаг назад
  $('#btn-undo').addEventListener('click', doUndo);
  window.addEventListener('keydown', (e) => {
    // код клавиши — на случай русской раскладки: там на этом месте «я»
    if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== 'z' && e.code !== 'KeyZ')) return;
    const t = document.activeElement;
    // в поле ввода Ctrl+Z — дело самого поля, туда не лезем
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    doUndo();
  });

  // зум
  $('#zoom-in').addEventListener('click', () => app.board.zoomBy(1.2));
  $('#zoom-out').addEventListener('click', () => app.board.zoomBy(1 / 1.2));
  $('#zoom-fit').addEventListener('click', () => app.board.fit());

  // вкладки правой панели
  $$('[data-rtab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-rtab]').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('[data-rpanel]').forEach((p) => { p.hidden = p.dataset.rpanel !== b.dataset.rtab; });
  }));

  // фильтр ленты: прячем CSS-ом, чтобы не пересобирать её на каждое нажатие
  $$('[data-feed]').forEach((b) => {
    if (b.tagName !== 'BUTTON') return;
    b.addEventListener('click', () => {
      $$('.feed-filter .tab').forEach((x) => x.classList.toggle('is-active', x === b));
      $('#chat-feed').dataset.feed = b.dataset.feed;
      $('#chat-feed').scrollTop = $('#chat-feed').scrollHeight;
    });
  });

  // чат
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chat-input').value.trim();
    if (!v) return;
    say(v);
    $('#chat-input').value = '';
  });

  // кубики
  const btns = $('#dice-buttons');
  DICE.forEach((d) => {
    const b = el('button', 'die-btn', 'd' + d);
    b.addEventListener('click', () => doRoll(d));
    btns.append(b);
  });
  $('#btn-dice').addEventListener('click', () => { $('#dice-tray').hidden = !$('#dice-tray').hidden; });
  $('#dice-close').addEventListener('click', () => { $('#dice-tray').hidden = true; });
  $$('[data-dicemode]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-dicemode]').forEach((x) => x.classList.toggle('is-active', x === b));
    diceMode = b.dataset.dicemode;
    $('#dice-hint').textContent = diceMode === 'secret' ? 'Результат увидит только Мастер.' : 'Бросок видят все за столом.';
  }));

  // картинки на общий экран
  $('#showcase-close').addEventListener('click', () => {
    showcaseHiddenFor = app.store.get().pics.shown;
    updateShowcase(app.store.get());
  });
  $('#showcase-chip').addEventListener('click', () => {
    showcaseHiddenFor = null;
    updateShowcase(app.store.get());
  });
  const off = $('#showcase-off');
  if (off) off.addEventListener('click', () => app.store.dispatch({ t: 'pics.show', assetId: null }));

  // складные блоки настроек помнят, открыты они или нет
  $$('.fold').forEach((f) => {
    const key = 'dnd.fold.' + f.dataset.fold;
    f.open = localStorage.getItem(key) === '1';
    f.addEventListener('toggle', () => localStorage.setItem(key, f.open ? '1' : '0'));
  });

  // мобильные панели
  // На телефоне панели лежат одна поверх другой, поэтому кнопка их перебирает:
  // нажатие — следующая панель, последнее нажатие закрывает всё.
  const btnPanel = $('#btn-panel');
  if (btnPanel) {
    const panels = $$('.panel');
    let open = -1;
    btnPanel.addEventListener('click', () => {
      open = open + 1 >= panels.length ? -1 : open + 1;
      panels.forEach((p, i) => p.classList.toggle('is-open', i === open));
    });
  }

  // вкладки левой панели: у Мастера их три, у игрока одна — его персонаж
  $$('[data-ltab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-ltab]').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('[data-lpanel]').forEach((p) => { p.hidden = p.dataset.lpanel !== b.dataset.ltab; });
  }));

  wireDM();
  wireHeroSheet();
  wireDrop();
}

/**
 * Лист персонажа игрока прямо за столом: характеристики, КД и хиты,
 * способности, инвентарь, слабости и сопротивления. Правки уходят в тот же
 * кабинет, откуда персонаж пришёл, — и сразу видны Мастеру по ключу.
 */
async function wireHeroSheet() {
  if (app.isDM || app.ghost) return;
  const panel = $('[data-lpanel="hero"]');
  if (!panel) return;
  panel.hidden = false;
  // вкладок у игрока не осталось — пустую полоску убираем, чтобы лист начинался
  // сразу с имени и уровня
  const tabs = $('#panel-left .tabs');
  if (tabs && !tabs.children.length) tabs.remove();

  // словом отзываемся только на беду: удачное сохранение молчит
  const hint = $('#lite-hint');
  const note = (text) => { hint.textContent = text || ''; hint.hidden = !text; };

  const cab = JSON.parse(sessionStorage.getItem('dnd.cab') || 'null');
  const brought = JSON.parse(sessionStorage.getItem('dnd.char') || 'null');
  if (!cab || !brought) {
    note('Лист открывается, если прийти за стол из личного кабинета: там живёт персонаж.');
    return;
  }

  let store;
  let ch;
  try {
    const { openStore } = await import('./cabinet-store.js');
    store = await openStore(cab.path);
    const data = await store.load();
    const raw = data && data.chars && data.chars[brought.id];
    if (!raw) throw new Error('персонаж не найден в кабинете');
    ch = { ...raw, sheet: fixSheet(raw.sheet) };
  } catch (ex) {
    note('Не удалось открыть лист: ' + ex.message);
    return;
  }

  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await store.saveChar(ch);
        await publishChar(ch);
        note('');
      } catch (ex) {
        note('Не сохранилось: ' + ex.message);
      }
    }, 900);
  };
  // Уровень держит Мастер: в лист он приходит со стола и оседает в кабинете,
  // чтобы его же увидели и лист в кабинете, и витрина по ключу персонажа.
  const myKey = nameKey(app.me.name);
  const showLevel = (s) => {
    const n = levelOf(s, myKey);
    const box = $('#lite-sheet .lvl-n');
    if (box) box.textContent = String(n);
    if (ch.sheet.level === n) return;
    ch.sheet.level = n;
    save();
  };
  // за столом персонажа видят впервые — берём уровень из его листа, дальше он
  // живёт в комнате и правится только Мастером
  const now = app.store.get();
  if (!(now.levels && now.levels[myKey]) && Number(ch.sheet.level) > 1) {
    setLevel(myKey, Number(ch.sheet.level));
  }
  /* ── Хиты листа и фигурки — одни и те же ──────────────────────────
     Главная здесь фигурка: по ней бьют, её лечат, и лист показывает то же
     число. Правка хитов в листе доходит до фигурки обратным ходом. */
  const myTokens = (s) => {
    const мои = Object.values(s.tokens).filter((t) => nameKey(t.ownerName) === myKey);
    const поИмени = мои.filter((t) => nameKey(t.name) === nameKey(ch.name));
    return поИмени.length ? поИмени : мои;
  };
  const setHpInputs = () => {
    [['.vit-cur', ch.sheet.hpCur], ['.vit-max', ch.sheet.hpMax]].forEach(([сел, v]) => {
      const i = $('#lite-sheet ' + сел);
      // поле под курсором не трогаем: иначе вырвем число из-под пальцев
      if (!i || document.activeElement === i || i.value === String(v)) return;
      i.value = v;
      // полоска перекрашивается в ответ на правку — говорим ей, что число новое
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const syncHpFromToken = (s) => {
    const t = myTokens(s)[0];
    if (!t || !t.hp || !(t.hp.max > 0)) return;
    if (ch.sheet.hpCur === t.hp.cur && ch.sheet.hpMax === t.hp.max) return;
    ch.sheet.hpCur = t.hp.cur;
    ch.sheet.hpMax = t.hp.max;
    setHpInputs();
    save();
  };
  const pushHpToToken = () => {
    myTokens(app.store.get()).forEach((t) => {
      if (t.hp && t.hp.cur === ch.sheet.hpCur && t.hp.max === ch.sheet.hpMax) return;
      app.store.dispatch({ t: 'token.update', id: t.id, patch: { hp: { cur: ch.sheet.hpCur, max: ch.sheet.hpMax } } });
    });
  };
  /* Стойкость и спасброски героя фигурка берёт из листа сама. Мастеру их в
     карточке не показываем: у героя они не вписываются руками, а считаются —
     спасбросок равен модификатору характеристики, а виды урона вычитываются
     из полей «Сопротивления» (×½) и «Слабости» (×2). */
  const traitsOf = () => ({
    saves: savesFromSheet(ch.sheet),
    resist: [...(ch.sheet.dmgResist || [])],
    vuln: [...(ch.sheet.dmgVuln || [])],
  });
  const pushTraitsToToken = () => {
    const { saves, resist, vuln } = traitsOf();
    myTokens(app.store.get()).forEach((t) => {
      const тоже = ABILITIES.every((a) => (Number((t.saves || {})[a.id]) || 0) === saves[a.id])
        && (t.resist || []).join() === resist.join()
        && (t.vuln || []).join() === vuln.join();
      if (тоже) return;
      app.store.dispatch({ t: 'token.update', id: t.id, patch: { saves, resist, vuln } });
    });
  };

  const onEdit = (key) => {
    if (key === 'hpCur' || key === 'hpMax') pushHpToToken();
    // характеристики двигают спасброски, поля стойкости — множители урона
    if (ABILITIES.some((a) => a.id === key) || key === 'dmgResist' || key === 'dmgVuln') pushTraitsToToken();
    save();
  };

  renderSheetLite($('#lite-sheet'), ch, onEdit, {
    level: levelOf(app.store.get(), myKey),
    onRoll: rollAbility,
    onUse: (m, anchor) => useMove(m, ch, anchor),
  });
  showLevel(app.store.get());
  /* ── Связь листа с фигуркой на поле ───────────────────────────────
     Игроку важно знать, что фигурка на доске — это он. Имя в листе горит,
     когда его фигурка стоит в этой же локации, и по двойному щелчку камера
     едет к ней. Фигурки нет — имя молчит и щелчок ничего не делает. */
  const myHere = (s) => myTokens(s).find((t) => t.locId === s.activeLoc);
  const name = $('#lite-sheet .lite-name');
  if (name) {
    name.addEventListener('dblclick', () => {
      const t = myHere(app.store.get());
      if (t) app.board.focusToken(t.id);
    });
  }
  const showLink = (s) => {
    const n = $('#lite-sheet .lite-name');
    if (!n) return;
    const тут = myHere(s);
    const где = myTokens(s).length;
    n.classList.toggle('is-onboard', !!тут);
    n.title = тут ? 'Фигурка на поле — двойной щелчок переносит к ней камеру'
      : где ? 'Фигурка стоит в другой локации' : 'Фигурки на поле пока нет';
  };

  syncHpFromToken(app.store.get());
  pushTraitsToToken();
  showLink(app.store.get());
  // фигурку ставит Мастер, и появиться она может позже: следим за столом и
  // дописываем в неё лист, как только она встала
  app.store.subscribe((s) => { showLevel(s); syncHpFromToken(s); pushTraitsToToken(); showLink(s); });
}

function wireDM() {
  if (!app.isDM) return;
  $$('[data-libfilter]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-libfilter]').forEach((x) => x.classList.toggle('is-active', x === b));
    libFilter = b.dataset.libfilter;
    renderLibrary(app.store.get());
  }));

  // страница подготовки: та же база существ, но во всю ширину и целиком
  $('#btn-prep').addEventListener('click', openPrep);
  $('#btn-prep-close').addEventListener('click', () => { $('#prep').hidden = true; });
  $$('[data-prepfilter]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-prepfilter]').forEach((x) => x.classList.toggle('is-active', x === b));
    prepFilter = b.dataset.prepfilter;
    renderPrep();
  }));

  $('#btn-add-location').addEventListener('click', () => {
    const name = prompt('Название локации', 'Новая локация');
    if (!name) return;
    app.store.dispatch({ t: 'loc.add', loc: newLocation(name.slice(0, 40)) });
  });

  const patchLoc = (patch) => {
    const id = app.store.get().activeLoc;
    if (id) app.store.dispatch({ t: 'loc.update', id, patch });
  };
  $('#grid-size').addEventListener('input', (e) => patchLoc({ grid: { size: Math.max(10, Number(e.target.value) || 70) } }));
  $('#grid-ox').addEventListener('input', (e) => patchLoc({ grid: { ox: Number(e.target.value) || 0 } }));
  $('#grid-oy').addEventListener('input', (e) => patchLoc({ grid: { oy: Number(e.target.value) || 0 } }));
  $('#grid-feet').addEventListener('input', (e) => patchLoc({ grid: { feet: Math.max(1, Number(e.target.value) || 5) } }));
  $('#grid-show').addEventListener('change', (e) => patchLoc({ grid: { show: e.target.checked } }));
  // кнопка в тулбаре только включает и выключает; настройки кисти — при самой кисти
  $('#btn-fog-on').addEventListener('click', () => {
    const s = app.store.get();
    const loc = s.locations[s.activeLoc];
    if (loc) patchLoc({ fogOn: !loc.fogOn });
  });
  $('#fog-brush').addEventListener('input', (e) => app.board.setFogBrush(Number(e.target.value) || 1));
  $$('[data-fogmode]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-fogmode]').forEach((x) => x.classList.toggle('is-active', x === b));
    app.board.setFogMode(b.dataset.fogmode);
  }));
  $('#fog-reveal-all').addEventListener('click', () => {
    const id = app.store.get().activeLoc;
    if (id) app.store.dispatch({ t: 'fog.all', locId: id, open: true });
  });
  $('#fog-hide-all').addEventListener('click', () => {
    const id = app.store.get().activeLoc;
    if (id) app.store.dispatch({ t: 'fog.all', locId: id, open: false });
  });

  const WALL_HINT = {
    wall: 'Ведите линию — стена. Клик по двери открывает её. Alt — без привязки к сетке.',
    door: 'Ведите линию поперёк прохода — получится дверь. Клик по ней открывает и закрывает.',
    lantern: 'Клик по полю — фонарь. Дальность света задаётся в его карточке, свет обрывается о стены.',
    portal: 'Клик по клетке — зелёная стрелка перехода. Кто на неё встанет, уйдёт в назначенную локацию. Игрокам стрелка не видна.',
    spawn: 'Клик по клетке — точка входа: сюда встают пришедшие из другой локации. Тяните уголок, чтобы растянуть её на несколько клеток.',
    erase: 'Ведите по стенам, дверям, огонькам и зонам — они пропадут.',
  };
  $$('[data-wallkind]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-wallkind]').forEach((x) => x.classList.toggle('is-active', x === b));
    app.board.setWallKind(b.dataset.wallkind);
    $('#wall-hint').textContent = WALL_HINT[b.dataset.wallkind] || '';
  }));
  $('#wall-snap').addEventListener('change', (e) => app.board.setWallSnap(e.target.checked));
  $('#walls-clear').addEventListener('click', () => {
    const s = app.store.get();
    const loc = s.locations[s.activeLoc];
    if (!loc) return;
    const walls = loc.walls || [], lights = loc.lights || [];
    if (!walls.length && !lights.length) return;
    if (!confirm(`Убрать все стены, двери и огни в локации «${loc.name}»?`)) return;
    walls.forEach((w) => app.store.dispatch({ t: 'wall.remove', locId: loc.id, id: w.id }));
    lights.forEach((x) => app.store.dispatch({ t: 'light.remove', locId: loc.id, id: x.id }));
  });

  $('#lib-upload').addEventListener('change', async (e) => {
    const kind = $('#lib-kind').value;
    const assets = await storeFiles(e.target.files, 256);
    assets.forEach((a) => app.store.dispatch({
      t: 'lib.add', item: { id: uid('lib'), name: a.name, kind, assetId: a.id },
    }));
    e.target.value = '';
  });

  $('#pics-upload').addEventListener('change', async (e) => {
    const assets = await storeFiles(e.target.files, 1800);
    app.store.dispatch({ t: 'pics.add', assets: assets.map((a) => a.id) });
    e.target.value = '';
  });
  $('#pics-hide').addEventListener('click', () => app.store.dispatch({ t: 'pics.show', assetId: null }));

  $('#btn-forget-offline').addEventListener('click', () => {
    const keys = participants().filter((m) => !m.online).map((m) => m.key);
    if (!keys.length) return;
    if (!confirm(`Забыть участников, которых нет в сети (${keys.length})? Их фигурки останутся на поле.`)) return;
    app.store.dispatch({ t: 'roster.forget', keys });
  });

  // чистим ровно то, что показывает фильтр
  $('#chat-clear').addEventListener('click', () => {
    const вид = $('#chat-feed').dataset.feed;
    const [kind, слово] = вид === 'roll' ? ['roll', 'журнал бросков']
      : вид === 'talk' ? ['chat', 'разговор']
        : ['all', 'всю ленту'];
    if (!confirm(`Очистить ${слово} у всех за столом?`)) return;
    app.store.dispatch({ t: 'chat.clear', kind });
    say(`Мастер очистил ${слово}`, 'system');
  });

  $('#init-roll-all').addEventListener('click', () => {
    const s = app.store.get();
    const order = Object.values(s.tokens)
      .filter((t) => t.locId === s.activeLoc)
      .map((t) => ({ id: t.id, v: roll(20).total }))
      .sort((a, b) => b.v - a.v);
    app.store.dispatch({ t: 'init.set', order });
    say('Инициатива брошена', 'system');
  });
  $('#init-next').addEventListener('click', () => app.store.dispatch({ t: 'init.next' }));
  // выход из боя разом: выводить каждого по одному больше не нужно
  $('#init-end').addEventListener('click', () => {
    if (!app.store.get().init.order.length) return;
    if (!confirm('Завершить бой у всех за столом? Порядок ходов очистится.')) return;
    app.store.dispatch({ t: 'init.clear' });
    say('Бой окончен', 'system');
  });

  $('#btn-move-all').addEventListener('click', () => {
    const s = app.store.get();
    const toId = $('#move-all-to').value;
    const to = s.locations[toId];
    if (!to || toId === s.activeLoc) return;
    const all = $('#move-all-kinds').checked;
    const list = Object.values(s.tokens).filter((t) => t.locId === s.activeLoc
      && (all || t.kind === 'pc' || t.ownerName));
    if (!list.length) return alert('В этой локации некого переводить.');
    if (!confirm(`Перевести существ (${list.length}) в «${to.name}»?`)) return;
    list.forEach((t) => moveTokenToLocation(t, toId, true));
    app.store.dispatch({ t: 'loc.active', id: toId });
    say(`Мастер перевёл существ (${list.length}) в «${to.name}»`, 'system');
  });

  const s0 = app.store.get();
  $('#key-player').value = s0.room.playerKey || '';
  $('#key-dm').value = s0.room.dmKey || '';
  // ключ игроков задан при создании комнаты: поле просто заперто, без подписи
  if (useFirebase) $('#key-player').disabled = true;
  $('#btn-save-keys').addEventListener('click', () => {
    app.store.dispatch({ t: 'room.keys', patch: { playerKey: $('#key-player').value, dmKey: $('#key-dm').value } });
    say('Ключи комнаты изменены', 'system');
  });

  const inviteLink = (withDM) => {
    const s = app.store.get();
    const p = new URLSearchParams({ r: s.room.name, k: s.room.playerKey || '' });
    if (withDM) p.set('m', s.room.dmKey || '');
    return location.origin + location.pathname + '?' + p.toString();
  };
  // ссылка уходит в буфер сама, на кнопке вспыхивает «Скопировано»;
  // не вышло с буфером — показываем поле, чтобы можно было забрать руками
  const ССЫЛКИ = {
    player: () => inviteLink(false),
    dm: () => inviteLink(true),
    code: () => { const s = app.store.get(); return packRoom(s.room.name, s.room.playerKey || ''); },
    cab: () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'cabinet.html',
  };
  const copyInvite = (btn, url) => {
    const было = btn.textContent;
    const ок = () => {
      btn.textContent = 'Скопировано ✓';
      btn.classList.add('is-copied');
      setTimeout(() => { btn.textContent = было; btn.classList.remove('is-copied'); }, 1400);
    };
    const мимо = () => { const out = $('#link-out'); out.hidden = false; out.value = url; out.select(); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(ок, мимо); else мимо();
  };
  $('#btn-invite').addEventListener('click', () => {
    const box = $('#invite-box');
    box.hidden = !box.hidden;
    $('#btn-invite').classList.toggle('is-open', !box.hidden);
  });
  $$('#invite-box [data-invite]').forEach((b) => {
    b.addEventListener('click', () => copyInvite(b, ССЫЛКИ[b.dataset.invite]()));
  });

  $('#btn-delete-room').addEventListener('click', deleteRoom);
  $('#btn-export').addEventListener('click', exportCampaign);
  $('#btn-import').addEventListener('change', importCampaign);
}

function wireDrop() {
  const wrap = $('#board-wrap');
  wrap.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/lib')) e.preventDefault(); });
  wrap.addEventListener('drop', (e) => {
    const libId = e.dataTransfer.getData('text/lib');
    if (!libId) return;
    e.preventDefault();
    const r = $('#board').getBoundingClientRect();
    dropToken(libId, app.board.screenToWorld(e.clientX - r.left, e.clientY - r.top));
  });
}

/* ───────────────────────── Сейв кампании ───────────────────────── */

async function exportCampaign() {
  const state = app.store.get();
  const used = new Set();
  Object.values(state.locations).forEach((l) => l.assetId && used.add(l.assetId));
  Object.values(state.library).forEach((i) => used.add(i.assetId));
  Object.values(state.tokens).forEach((t) => t.assetId && used.add(t.assetId));
  state.pics.assets.forEach((a) => used.add(a));
  const assets = {};
  for (const id of used) assets[id] = await app.sync.getAsset(id);
  const blob = new Blob([JSON.stringify({ v: 1, state, assets })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(state.room.name, 'campaign');
  document.body.append(a);          // ссылку вне страницы браузер скачивает без имени
  a.click();
  // адрес отпускаем позже: если отобрать его сразу, файл сохранится без названия
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function importCampaign(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Импорт заменит текущую комнату. Продолжить?')) { e.target.value = ''; return; }
  const data = JSON.parse(await file.text());
  for (const [id, url] of Object.entries(data.assets || {})) if (url) await app.sync.putAsset(id, url);
  app.store.dispatch({ t: 'state.replace', state: normalize(data.state) });
  e.target.value = '';
  setTimeout(() => app.board.fit(), 100);
}

/* ───────────────────────── Мелочи ───────────────────────── */

function el(tag, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('click', (e) => {
  const card = $('#token-card');
  if (!card.hidden && !card.contains(e.target) && e.target.id !== 'board') card.hidden = true;
});
