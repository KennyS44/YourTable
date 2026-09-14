// Отмена последнего действия (Ctrl+Z).
//
// Никаких снимков всего стола: для каждого действия мы заранее считаем обратное
// — то, которое вернёт затронутый кусочек в прежний вид. Обратное действие
// уходит в базу как обычное, поэтому отмену видят все за столом сразу.
//
// Стопка своя у каждого: отменяется только то, что сделал ты сам. Чужие правки
// сюда не попадают — иначе Мастер стирал бы игроку линию, которую не рисовал.

const clone = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Значения тех же ключей, какими они были до правки: обратный патч.
 * Чего не было вовсе, возвращаем как null — так это поле и хранится в базе.
 */
function before(cur, patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const c = cur ? cur[k] : undefined;
    const deep = v && typeof v === 'object' && !Array.isArray(v)
      && c && typeof c === 'object' && !Array.isArray(c);
    out[k] = deep ? before(c, v) : (c === undefined ? null : clone(c));
  }
  return out;
}

const listOf = (loc, kind) => (loc && loc[kind]) || [];
const find = (list, id) => list.find((x) => x.id === id);

/**
 * Обратное действие для a, посчитанное по состоянию s ДО его применения.
 * Возвращает {label, back} — back это одно действие или несколько подряд.
 * null означает «такое не отменяем»: разговор, присутствие, смена локации.
 */
export function invert(s, a) {
  const loc = (id) => s.locations[id];
  const step = (label, back) => ({ label, back });

  switch (a.t) {
    case 'loc.add':
      return step('новая локация', { t: 'loc.remove', id: a.loc.id });
    case 'loc.update': {
      const c = loc(a.id); if (!c) return null;
      return step('правка локации', { t: 'loc.update', id: a.id, patch: before(c, a.patch) });
    }
    case 'loc.remove': {
      const c = loc(a.id); if (!c) return null;
      // вместе с локацией уходят её фигурки — возвращаем и их
      const tokens = Object.values(s.tokens).filter((t) => t.locId === a.id);
      return step('удаление локации', {
        t: 'loc.restore', loc: clone(c), at: s.order.indexOf(a.id),
        tokens: clone(tokens), active: s.activeLoc,
      });
    }

    case 'lib.add':
      return step('иконка', { t: 'lib.remove', id: a.item.id });
    case 'lib.update': {
      const c = s.library[a.id]; if (!c) return null;
      return step('правка карточки', { t: 'lib.update', id: a.id, patch: before(c, a.patch) });
    }
    case 'lib.remove': {
      const c = s.library[a.id]; if (!c) return null;
      return step('удаление иконки', { t: 'lib.add', item: clone(c) });
    }

    case 'token.add':
      return step('фигурка', { t: 'token.remove', id: a.token.id });
    case 'token.update': {
      const c = s.tokens[a.id]; if (!c) return null;
      return step('ход фигурки', { t: 'token.update', id: a.id, patch: before(c, a.patch) });
    }
    case 'token.status': {
      const c = s.tokens[a.id]; if (!c) return null;
      return step('состояние', { t: 'token.status', id: a.id, statuses: clone(c.statuses || []) });
    }
    case 'token.remove': {
      const c = s.tokens[a.id]; if (!c) return null;
      const back = [{ t: 'token.add', token: clone(c) }];
      // фигурка уходила из очереди боя — очередь возвращаем такой, какой была
      if (s.init.order.some((o) => o.id === a.id)) back.push({ t: 'init.restore', init: clone(s.init) });
      return step('удаление фигурки', back);
    }

    case 'fog.paint': {
      const l = loc(a.locId); if (!l) return null;
      // возвращаем только те клетки, которые эта кисть и правда изменила
      const changed = (a.cells || []).filter((k) => (l.fog[k] === 1) !== !!a.on);
      if (!changed.length) return null;
      return step('туман', { t: 'fog.paint', locId: a.locId, cells: changed, on: !a.on });
    }
    case 'fog.all': {
      const l = loc(a.locId); if (!l) return null;
      return step(a.open ? 'открытый туман' : 'закрытый туман',
        { t: 'fog.set', locId: a.locId, fog: clone(l.fog), allOpen: !!l.fogAllOpen });
    }

    case 'wall.add':
      return step(a.wall.type === 'door' ? 'дверь' : 'стена', { t: 'wall.remove', locId: a.locId, id: a.wall.id });
    case 'wall.update': {
      const w = find(listOf(loc(a.locId), 'walls'), a.id); if (!w) return null;
      return step('правка стены', { t: 'wall.update', locId: a.locId, id: a.id, patch: before(w, a.patch) });
    }
    case 'wall.remove': {
      const w = find(listOf(loc(a.locId), 'walls'), a.id); if (!w) return null;
      return step('стёртая стена', { t: 'wall.add', locId: a.locId, wall: clone(w) });
    }

    case 'light.add':
      return step('фонарь', { t: 'light.remove', locId: a.locId, id: a.light.id });
    case 'light.remove': {
      const x = find(listOf(loc(a.locId), 'lights'), a.id); if (!x) return null;
      return step('стёртый фонарь', { t: 'light.add', locId: a.locId, light: clone(x) });
    }

    case 'zone.add':
      return step('зона', { t: 'zone.remove', locId: a.locId, kind: a.kind, id: a.zone.id });
    case 'zone.update': {
      const z = find(listOf(loc(a.locId), a.kind), a.id); if (!z) return null;
      return step('правка зоны', { t: 'zone.update', locId: a.locId, kind: a.kind, id: a.id, patch: before(z, a.patch) });
    }
    case 'zone.remove': {
      const z = find(listOf(loc(a.locId), a.kind), a.id); if (!z) return null;
      return step('стёртая зона', { t: 'zone.add', locId: a.locId, kind: a.kind, zone: clone(z) });
    }

    case 'draw.add':
      return step('линия', { t: 'draw.erase', locId: a.locId, remove: [a.stroke.id] });
    case 'draw.erase': {
      const l = loc(a.locId); if (!l) return null;
      const gone = new Set(a.remove || []);
      const back = (l.drawings || []).filter((d) => gone.has(d.id));
      // ластик уносит линии и кладёт обрубки — меняем их местами
      return step('ластик', {
        t: 'draw.erase', locId: a.locId,
        remove: (a.add || []).map((d) => d.id), add: clone(back),
      });
    }
    case 'draw.clear': {
      const l = loc(a.locId); if (!l) return null;
      const gone = (l.drawings || []).filter((d) => (a.by ? d.by === a.by : true));
      if (!gone.length) return null;
      return step('стёртые рисунки', { t: 'draw.erase', locId: a.locId, remove: [], add: clone(gone) });
    }

    case 'insp.set':
      return step('вдохновение', { t: 'insp.set', key: a.key, value: (s.inspiration || {})[a.key] || 0 });
    case 'level.set':
      return step('уровень', { t: 'level.set', key: a.key, value: (s.levels || {})[a.key] || 1 });

    case 'init.set':
    case 'init.next':
    case 'init.clear':
      if (!s.init.order.length && a.t !== 'init.set') return null;
      return step('ход боя', { t: 'init.restore', init: clone(s.init) });

    case 'pics.add':
      return step('картинки', (a.assets || []).map((id) => ({ t: 'pics.remove', assetId: id })));
    case 'pics.remove': {
      if (!s.pics.assets.includes(a.assetId)) return null;
      const back = [{ t: 'pics.add', assets: [a.assetId] }];
      if (s.pics.shown === a.assetId) back.push({ t: 'pics.show', assetId: a.assetId });
      return step('убранная картинка', back);
    }
    case 'pics.show':
      return step('показ картинки', { t: 'pics.show', assetId: s.pics.shown || null });

    default:
      // разговор, присутствие, ключи комнаты и переход между локациями не отменяем
      return null;
  }
}
