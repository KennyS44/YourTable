// Местность на поле: вода, грязь, подъём, яд, лава.
//
// Мастер выделяет прямоугольник клеток и говорит, что там. Местность видна
// всем и действует на фигурки двумя способами:
//   • трудная местность — шаг по ней стоит вдвое (считает линейка скорости
//     в js/board.js);
//   • опасная — вошёл или начал в ней ход, и кидаешь спасбросок: урон и
//     сложность задаёт Мастер, как и то, сколько урона остаётся при успехе.
// Яд при проваленном спасброске ещё и вешает состояние «Отравлен».
//
//   zone = {id, x, y, cw, ch, type, name, hard,
//           dmg: {n, d, type}, abil, dc, onSave: 'none'|'quarter'|'half',
//           poison, turn}

import { app, tokenName } from './app-state.js';
import { say } from './chat.js';
import { el, field, pair, numInput, checkRow, textInput } from './ui.js';
import { roll } from './dice.js';
import { applyToHp } from './moves-use.js';
import { ABILITIES, DMG_TYPES, FACES } from './sheet.js';

/** Как местность выглядит на поле: цвет заливки, цвет значка, значок. */
export const TERRAIN_LOOK = {
  water: { label: 'Вода', rgb: '74,134,196', ink: '214,232,250', glyph: '≈' },
  mud: { label: 'Грязь', rgb: '128,96,58', ink: '232,214,186', glyph: '∴' },
  climb: { label: 'Подъём', rgb: '150,142,124', ink: '240,234,220', glyph: '▲' },
  poison: { label: 'Яд', rgb: '116,168,64', ink: '226,244,200', glyph: '☠' },
  lava: { label: 'Лава', rgb: '214,92,40', ink: '255,226,190', glyph: '♨' },
};

/** С чего начинается местность каждого вида; дальше всё правит Мастер. */
const DEFAULTS = {
  water: { hard: true, dmg: { n: 0, d: 6, type: '' } },
  mud: { hard: true, dmg: { n: 0, d: 6, type: '' } },
  climb: { hard: true, dmg: { n: 0, d: 6, type: '' } },
  poison: { hard: false, dmg: { n: 2, d: 6, type: 'яд' }, abil: 'con', dc: 12, onSave: 'half', poison: true },
  lava: { hard: true, dmg: { n: 6, d: 10, type: 'огонь' }, abil: 'dex', dc: 15, onSave: 'half' },
};

export function newTerrain(type) {
  const d = DEFAULTS[type] || DEFAULTS.water;
  return {
    type, name: '', abil: 'dex', dc: 0, onSave: 'half', poison: false, turn: true,
    ...d, dmg: { ...d.dmg },
  };
}

const ON_SAVE_OPTS = [['none', 'ничего'], ['quarter', '¼ урона'], ['half', '½ урона']];

const label = (z) => z.name || (TERRAIN_LOOK[z.type] || TERRAIN_LOOK.water).label;
/** Опасна ли местность: есть кости урона или она травит. */
const harmful = (z) => (z.dmg && z.dmg.n > 0) || z.poison;

/* ───────────────────────── Настройки (Мастер) ───────────────────────── */

function select(opts, value, onChange) {
  const s = el('select', 'sel');
  opts.forEach(([v, text]) => {
    const o = new Option(text, v);
    if (String(value) === String(v)) o.selected = true;
    s.append(o);
  });
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

/**
 * Содержимое карточки местности. live() — зона, какая она сейчас в столе;
 * zUpd(patch) правит её, reopen() перерисовывает карточку.
 */
export function terrainCard(card, live, zUpd, reopen) {
  const zone = live();
  // кости урона правятся целым объектом: берём свежие, а не те, что были при открытии
  const setDmg = (patch) => zUpd({ dmg: { n: 0, d: 6, type: '', ...(live().dmg || {}), ...patch } });
  card.append(field('Что здесь', select(
    Object.entries(TERRAIN_LOOK).map(([id, l]) => [id, l.label]), zone.type,
    // сменили вид — берём его обычные числа, иначе вода осталась бы с уроном лавы
    (v) => { zUpd({ ...newTerrain(v), name: live().name || '' }); reopen(); })));
  card.append(field('Подпись (видна Мастеру)', textInput(zone.name || '', (v) => zUpd({ name: v.slice(0, 40) }))));
  card.append(checkRow('Трудная местность — шаг стоит вдвое', !!zone.hard, (on) => zUpd({ hard: on })));

  const dmg = zone.dmg || { n: 0, d: 6, type: '' };
  card.append(field('Урон (0 костей — без урона)', pair(
    numInput(dmg.n, (v) => { setDmg({ n: Math.max(0, Math.min(40, v)) }); reopen(); }),
    select(FACES.map((f) => [f, 'к' + f]), dmg.d, (v) => setDmg({ d: Number(v) })))));
  card.append(field('Вид урона', select([['', 'не указан'], ...DMG_TYPES.map((t) => [t, t])], dmg.type,
    (v) => setDmg({ type: v }))));

  card.append(pair(
    field('Спасбросок', select(ABILITIES.map((a) => [a.id, a.label]), zone.abil || 'dex', (v) => zUpd({ abil: v }))),
    field('Сложность (0 — без спасброска)', numInput(zone.dc || 0, (v) => zUpd({ dc: Math.max(0, Math.min(40, v)) })))));
  card.append(field('При успешном спасброске', select(ON_SAVE_OPTS, zone.onSave || 'half', (v) => zUpd({ onSave: v }))));
  card.append(checkRow('Провал — «Отравлен»', !!zone.poison, (on) => zUpd({ poison: on })));
  card.append(checkRow('Бьёт и в начале хода того, кто в ней стоит', zone.turn !== false, (on) => zUpd({ turn: on })));
  card.append(el('p', 'hint', harmful(zone)
    ? 'Вошедший кидает спасбросок сам: урон и хиты считаются автоматически, итог — в ленте.'
    : 'Безопасная местность: только замедляет, если отмечена трудной.'));
}

/* ───────────────────────── Действие на фигурку ───────────────────────── */

/**
 * Местность берёт своё: спасбросок, урон, «Отравлен». why — «входит» или
 * «начинает ход». Итог уходит в ленту той же записью, что и приём.
 */
export function terrainHit(t0, zones, why) {
  zones.filter(harmful).forEach((z) => {
    const t = app.store.get().tokens[t0.id];
    if (!t) return;
    const dmg = z.dmg && z.dmg.n > 0 ? (() => {
      const r = roll(z.dmg.d, z.dmg.n);
      return { parts: [{ n: z.dmg.n, d: z.dmg.d, type: z.dmg.type, dice: r.dice, sum: r.total }], total: r.total };
    })() : null;
    const use = { name: label(z), by: null, targets: [`${tokenName(t)} (${why})`] };
    let saves = null;
    if (z.dc > 0) {
      const abil = ABILITIES.find((a) => a.id === z.abil) || ABILITIES[1];
      const mod = Number((t.saves || {})[abil.id]) || 0;
      const r = roll(20, 1, mod);
      saves = [{ id: t.id, name: tokenName(t), total: r.total, dice: r.dice, mod, ok: r.total >= z.dc }];
      use.save = { abil: abil.label, dc: z.dc, onSave: z.onSave };
      use.saves = saves;
    }
    if (dmg) {
      use.dmg = dmg;
      use.landed = applyToHp([t], dmg, 'dmg', saves, z.onSave);
    }
    const failed = !saves || !saves[0].ok;
    if (z.poison && failed && !(t.statuses || []).includes('Отравлен')) {
      app.store.dispatch({ t: 'token.status', id: t.id, statuses: [...(t.statuses || []), 'Отравлен'] });
      use.status = 'Отравлен';
    }
    say('', 'use', { use });
  });
}
