// Панель приёмов Мастера: Ctrl + щелчок по НПС или врагу.
//
// Внизу поля встаёт ряд квадратиков с приёмами существа, как в MOBA-играх.
// Щелчок по квадратику применяет приём от имени существа — той же наводкой
// и тем же счётом, что у игроков. Маленький ✎ открывает редактор приёма,
// «+» заводит новый. Правки сразу ложатся в фигурку.

import { app, upd, tokenName } from './app-state.js';
import { $, el, toast } from './ui.js';
import { moveList, fixMove } from './sheet.js';
import { useMove } from './moves-use.js';

let forId = null;      // чьи приёмы открыты
let editId = null;     // какой приём сейчас правят
let shownKey = '';     // что уже нарисовано: не пересобираем ряд на каждый чих

const live = () => (forId ? app.store.get().tokens[forId] : null);
const movesOf = (t) => (t.moves || []).map(fixMove);

export function openAbilityBar(t) {
  if (!t) return closeAbilityBar();
  if (t.kind === 'pc') return toast('Приёмы героя — в его листе');
  forId = t.id;
  shownKey = '';
  closeEditor();
  renderAbilityBar(app.store.get());
}

export function closeAbilityBar() {
  forId = null;
  shownKey = '';
  closeEditor();
  const bar = $('#ability-bar');
  if (bar) { bar.hidden = true; $('#ab-panel').innerHTML = ''; }
}

export function renderAbilityBar(s) {
  const bar = $('#ability-bar');
  if (!bar || !forId) return;
  const t = s.tokens[forId];
  if (!t || t.locId !== s.activeLoc) return closeAbilityBar();
  const moves = movesOf(t);
  const key = JSON.stringify([t.name, moves.map((m) => [m.id, m.name, m.img, m.kind])]);
  if (key === shownKey) return;
  shownKey = key;
  bar.hidden = false;

  const panel = $('#ab-panel');
  panel.innerHTML = '';
  const head = el('div', 'ab-head');
  const close = el('button', 'icon-btn', '×');
  close.title = 'Закрыть (Esc)';
  close.addEventListener('click', closeAbilityBar);
  head.append(el('span', 'ab-who', tokenName(t)), el('span', 'ab-hint', 'Щелчок — применить, ✎ — править'), close);

  const tiles = el('div', 'ab-tiles');
  moves.forEach((m) => {
    const cell = el('div', 'ab-cell');
    const tile = el('button', 'ab-tile');
    tile.type = 'button';
    tile.title = `Применить «${m.name || 'Без названия'}»`;
    const pic = el('span', 'ab-pic');
    if (m.img) pic.style.backgroundImage = `url("${m.img}")`;
    else pic.textContent = m.kind === 'weapon' ? '⚔' : '✦';
    tile.append(pic, el('span', 'ab-name', m.name || 'Без названия'));
    tile.addEventListener('click', () => {
      const cur = live();
      const fresh = cur && movesOf(cur).find((x) => x.id === m.id);
      if (fresh) useMove(fresh, null, tile, cur);
    });
    const edit = el('button', 'ab-edit', '✎');
    edit.type = 'button';
    edit.title = 'Править приём';
    edit.addEventListener('click', () => (editId === m.id ? closeEditor() : openEditor(m.id)));
    cell.append(tile, edit);
    tiles.append(cell);
  });
  const add = el('button', 'ab-tile ab-add');
  add.type = 'button';
  add.title = 'Новый приём';
  add.append(el('span', 'ab-pic', '+'), el('span', 'ab-name', 'Новый'));
  add.addEventListener('click', () => {
    const cur = live(); if (!cur) return;
    const m = fixMove({ kind: 'feat', name: 'Новая способность' });
    upd(cur.id, { moves: [...movesOf(cur), m] });
    openEditor(m.id);
  });
  tiles.append(add);
  panel.append(head, tiles);
}

/** Редактор одного приёма — тот же, что в листе и в карточке фигурки. */
function openEditor(id) {
  const t = live(); if (!t) return;
  const m = movesOf(t).find((x) => x.id === id);
  if (!m) return;
  editId = id;
  const box = $('#ab-editor');
  box.innerHTML = '';
  box.hidden = false;
  const wrap = { feats: [m] };
  const list = moveList(wrap, () => {
    const cur = live(); if (!cur) return;
    const one = wrap.feats[0];
    const all = movesOf(cur);
    // «Убрать» в редакторе опустошает обёртку — значит приём удалён
    upd(cur.id, { moves: one ? all.map((x) => (x.id === id ? { ...one } : x)) : all.filter((x) => x.id !== id) });
    if (!one) closeEditor();
  }, { openId: id });
  box.append(list.host);
}

function closeEditor() {
  editId = null;
  const box = $('#ab-editor');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

export function wireAbilityBar() {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !forId) return;
    if (app.board.aimingNow()) return app.board.cancelAim();   // Esc сперва снимает наводку
    if (editId) closeEditor(); else closeAbilityBar();
  });
}
