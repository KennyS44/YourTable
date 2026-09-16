// Применение приёма: навести на поле, посчитать и объявить столу.
//
// Игрок выбирает способность, потом показывает, куда она идёт: в фигурку,
// кругом от точки или конусом от себя. Дальше всё считается само — бросок
// по броне, спасбросок за цель, стойкость к виду урона и сами хиты.

import { app, upd, nameKey, tokenName } from './app-state.js';
import { say, rollCaption } from './chat.js';
import { $, el, toast } from './ui.js';
import { roll } from './dice.js';
import { showRoll } from './dice3d.js';
import { ABILITIES, mod as sheetMod } from './sheet.js';

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

export function useMove(m, ch, anchor, from = null) {
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
export function applyToHp(targets, dmg, effect, saves, onSave) {
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

export function rollAbility(label, mod) {
  const r = roll(20, 1, mod);
  r.label = label;
  say('', 'roll', { roll: r });
  showRoll($('#dice-stage'), r, rollCaption(app.me.name, r, false));
}
