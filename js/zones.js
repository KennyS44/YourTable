// Переходы между локациями и точки входа.
//
// Переход уводит фигурку в другую локацию, точка входа принимает пришедших.
// Кто куда встанет, решает spawnSpot: занятую клетку второй раз не занимаем.

import { app, upd } from './app-state.js';
import { say } from './chat.js';
import { $, el, field, pair, numInput, checkRow, placeCard } from './ui.js';

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
export function moveTokenToLocation(t, toId, quiet) {
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
export function enterPortal(t, portal) {
  const s = app.store.get();
  const to = s.locations[portal.toLocId];
  if (!t || !to || to.id === t.locId) return;
  moveTokenToLocation(t, to.id, true);
  say(`${t.name} перешёл в локацию «${to.name}»`, 'system');
}

const ZONE_TITLE = { portals: 'Переход в другую локацию', spawns: 'Точка входа', lights: 'Фонарь', walls: 'Стена или дверь' };

/** Что вообще стоит в этой локации — чтобы в правке было видно, чего искать. */
export function renderEditCounts(s) {
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
export function openZoneCard(kind, zone, pos) {
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
/**
 * Получаемый урон в карточке существа: выбрали вид урона и нажали множитель.
 * Подписи именно множителями — «½» под заголовком про стойкость читалось
 * наоборот. Выбранное живёт фишками: щёлкнул по фишке, и она ушла.
 * Три списка вместо одного словаря: массив в правке заменяется целиком, и
 * убрать вид урона получается без возни с удалением ключей.
 */
