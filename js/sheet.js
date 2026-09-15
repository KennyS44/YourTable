// Лист персонажа. Классический бланк D&D, но собранный из полей приложения:
// та же тёмная бумага, золотые канты, шкала отступов и размеров.
//
// Чего здесь нет намеренно: временных хитов, навыков с пассивной мудростью,
// спасбросков, бонуса мастерства, предыстории, опыта, инициативы и спасбросков
// от смерти. Вдохновение и уровень не правятся: их выдаёт Мастер за столом.

import { CLASSES, classById } from './classes.js';

export const ABILITIES = [
  { id: 'str', label: 'Сила' },
  { id: 'dex', label: 'Ловкость' },
  { id: 'con', label: 'Телосложение' },
  { id: 'int', label: 'Интеллект' },
  { id: 'wis', label: 'Мудрость' },
  { id: 'cha', label: 'Харизма' },
];

// Класс рисуется гербом (см. clsWidget), а не в этом списке текстовых полей.
const HEAD = [
  { id: 'level', label: 'Уровень', lvl: true },
  { id: 'race', label: 'Раса' },
  { id: 'alignment', label: 'Мировоззрение' },
  { id: 'player', label: 'Имя игрока' },
];

// rows подобраны так, чтобы три столбца (см. cols ниже) кончались примерно на
// одной высоте: где поле стоит в одиночку, там ему и места побольше.
const TEXTS = [
  { id: 'appearance', label: 'Внешний вид', rows: 8 },
  { id: 'traits', label: 'Черты характера', rows: 3 },
  { id: 'ideals', label: 'Идеалы', rows: 2 },
  { id: 'bonds', label: 'Привязанности', rows: 2 },
  { id: 'flaws', label: 'Слабости', rows: 2 },
  { id: 'resist', label: 'Сопротивления', rows: 2 },
  { id: 'gear', label: 'Снаряжение', rows: 4 },
  { id: 'langs', label: 'Прочие владения и языки', rows: 8 },
];

// В бумажном листе это один блок, и здесь тоже: карточки порознь растягивали
// страницу и разбредались по разным колонкам.
const PERSONA = ['traits', 'ideals', 'bonds'];
// Чему персонаж не поддаётся и чем его взять — две стороны одного вопроса.
const DEFENCE = ['resist', 'flaws'];

export const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/* ── Приёмы: один список на две вкладки ──────────────────────────────
   Раньше «Атаки» и «Способности» были двумя списками, которых роднило только
   совпадение названий. Теперь запись одна: у неё есть и описание с картинкой,
   и числа. Вкладки — два взгляда на неё. Оружию описание не нужно, поэтому
   в способности лезут только записи с kind 'feat'. */

export const AIMS = [['one', 'Цель'], ['area', 'Область'], ['cone', 'Конус']];
export const EFFECTS = [['dmg', 'Урон'], ['heal', 'Лечение'], ['buff', 'Бафф'], ['debuff', 'Дебафф']];
export const GUARDS = [['ac', 'Бросок атаки по КД'], ['save', 'Спасбросок цели'], ['none', 'Без броска']];
export const ON_SAVE = [['half', 'половина'], ['none', 'ничего']];
export const DMG_TYPES = [
  'рубящий', 'колющий', 'дробящий', 'огонь', 'холод', 'молния', 'кислота',
  'яд', 'некротический', 'излучение', 'психический', 'силовое', 'звук',
];
export const FACES = [4, 6, 8, 10, 12, 20, 100];

export function emptyMove(kind = 'feat') {
  return {
    id: uid('mv'), name: '', img: '', text: '', kind,
    aim: 'one', size: 0,                              // область и конус меряем в футах
    effect: 'dmg',
    dice: [{ n: 0, d: 6, type: '' }, { n: 0, d: 6, type: '' }],   // урон бывает из двух кусков
    guard: 'ac', guardAbil: 'dex', onSave: 'half',    // чем защищается цель
    bonus: { from: 'none', value: 0 },                // от характеристики или свой
    raw: '',                                          // текст из старой строки атаки
  };
}

const fixDie = (d) => ({
  n: Math.max(0, Math.min(20, Number(d && d.n) || 0)),
  d: FACES.includes(Number(d && d.d)) ? Number(d.d) : 6,
  type: DMG_TYPES.includes(d && d.type) ? d.type : '',
});

export function fixMove(f) {
  const m = { ...emptyMove(f && f.kind === 'weapon' ? 'weapon' : 'feat'), ...(f || {}) };
  m.id = m.id || uid('mv');
  m.dice = [fixDie((f && f.dice || [])[0]), fixDie((f && f.dice || [])[1])];
  if (!AIMS.some(([v]) => v === m.aim)) m.aim = 'one';
  if (!EFFECTS.some(([v]) => v === m.effect)) m.effect = 'dmg';
  if (!GUARDS.some(([v]) => v === m.guard)) m.guard = 'ac';
  m.size = Math.max(0, Number(m.size) || 0);
  const b = m.bonus || {};
  m.bonus = { from: b.from || 'none', value: Number(b.value) || 0 };
  return m;
}

/** Разбираем старое поле «Урон и вид»: «1d8+3 рубящий» — кости, прибавка и вид. */
function parseDmg(txt) {
  const t = String(txt || '');
  const dice = t.match(/(\d*)\s*[dдк]\s*(\d+)/gi) || [];
  const out = dice.slice(0, 2).map((piece) => {
    const [, n, d] = piece.match(/(\d*)\s*[dдк]\s*(\d+)/i);
    return fixDie({ n: Number(n) || 1, d: Number(d), type: '' });
  });
  const low = t.toLowerCase();
  const type = DMG_TYPES.find((x) => low.includes(x.slice(0, 5)));
  if (type && out[0]) out[0].type = type;
  const plus = t.match(/[dдк]\s*\d+\s*([+-]\s*\d+)/i);
  return { dice: out, plus: plus ? Number(plus[1].replace(/\s/g, '')) : null };
}

const nameKeyOf = (v) => String(v || '').trim().toLowerCase();

export function emptySheet() {
  const s = {
    cls: [], level: 1, race: '', alignment: '', player: '',
    ac: 10, speed: 30, vision: 30,
    hpMax: 10, hpCur: 10, hitDice: '',
    feats: [],                 // приёмы: способности и оружие одним списком
    lore: '', notes: '',
    wantPlayer: '', wantChar: '',   // желания человека за столом и самого героя
  };
  ABILITIES.forEach((a) => { s[a.id] = 10; });
  TEXTS.forEach((t) => { s[t.id] = ''; });
  return s;
}

/** Дополняем сохранённый лист до полного: старые записи не должны падать. */
export function fixSheet(raw) {
  const s = { ...emptySheet(), ...(raw || {}) };
  // старый лист хранил класс свободным текстом — заворачиваем в герб-слот как есть,
  // герб для него нарисовать нечем, но название доживёт до ручного выбора игроком
  s.cls = Array.isArray(s.cls) ? s.cls.filter(Boolean).slice(0, 2) : (s.cls ? [s.cls] : []);
  s.feats = ((raw && raw.feats) || []).map(fixMove);
  // старое текстовое поле «Умения и особенности» переносим в первую способность
  if (!s.feats.length && raw && raw.features) {
    s.feats = [fixMove({ name: 'Особенности', text: raw.features })];
  }
  delete s.features;

  // Строки старых атак вливаем в общий список: совпало имя — в ту же запись,
  // не совпало — новым оружием. Исходный текст держим рядом, чтобы при кривом
  // разборе ничего не пропало молча.
  ((raw && raw.attacks) || []).forEach((a) => {
    if (!a || (!a.name && !a.bonus && !a.dmg)) return;
    let m = s.feats.find((f) => f.name && nameKeyOf(f.name) === nameKeyOf(a.name));
    if (!m) {
      m = fixMove({ name: a.name || 'Оружие', kind: 'weapon' });
      s.feats.push(m);
    }
    const { dice, plus } = parseDmg(a.dmg);
    if (dice.length) m.dice = [dice[0] || fixDie(), dice[1] || fixDie()];
    const bonus = String(a.bonus || '').match(/-?\d+/);
    if (bonus) m.bonus = { from: 'custom', value: Number(bonus[0]) };
    else if (plus !== null) m.bonus = { from: 'custom', value: plus };
    m.raw = [a.bonus, a.dmg].filter(Boolean).join(' · ');
  });
  delete s.attacks;
  return s;
}

const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

/**
 * Уровень только показываем — маленьким окошком, как вдохновение: поднимает
 * его Мастер за столом, во вкладке «Герои».
 */
function lvlBox(n) {
  const b = el('div', 'fld fld-lvl');
  b.title = 'Уровень поднимает Мастер за столом.';
  b.append(el('span', 'fld-l', 'Уровень'), el('span', 'lvl-n', String(n || 1)));
  return b;
}

/** Вдохновение — такое же мастерское окошко, как уровень, и стоит рядом с ним. */
function inspBox(n) {
  const b = el('div', 'fld fld-lvl');
  b.title = 'Вдохновение выдаёт и забирает Мастер за столом.';
  b.append(el('span', 'fld-l', 'Вдохновение'), el('span', 'insp-n', String(n || 0)));
  return b;
}

/* ── Герб класса: монета на две стороны, одна сторона — один класс ── */

let crestDefsReady = false;
function ensureCrestDefs() {
  if (crestDefsReady || document.getElementById('crest-defs')) { crestDefsReady = true; return; }
  // innerHTML должен начинаться с <svg>, иначе разметка распарсится как HTML,
  // а не как SVG, и градиент нельзя будет сослаться через url(#...)
  const holder = el('div');
  holder.id = 'crest-defs';
  holder.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden';
  holder.innerHTML = '<svg width="0" height="0"><defs><radialGradient id="crest-gold-bg" cx="50%" cy="38%" r="72%">'
    + '<stop offset="0%" stop-color="#e3c98f"/><stop offset="100%" stop-color="#c9a45a"/></radialGradient></defs></svg>';
  document.body.append(holder);
  crestDefsReady = true;
}

/** Медальон герба: настоящий рисунок класса или пустая заглушка со знаком «+». */
function crestMarkup(id) {
  const c = id && classById(id);
  const glyph = c
    ? `<g transform="translate(120 120) scale(.3) translate(-256 -256)"><path fill="#141310" d="${c.d}"/></g>`
    : '<text x="120" y="150" font-size="90" text-anchor="middle" fill="#8d7440" opacity=".6">+</text>';
  // data-darkreader-ignore: расширения тёмной темы видят золотой кругляш как
  // «светлый фон» и выворачивают чёрную чеканку в белую. Просим не трогать.
  return `<svg viewBox="0 0 240 240" class="crest-svg" data-darkreader-ignore="true">
    <circle cx="120" cy="120" r="112" fill="url(#crest-gold-bg)" stroke="#8d7440" stroke-width="4"/>
    <circle cx="120" cy="120" r="100" fill="none" stroke="#8d7440" stroke-width="1.5" opacity=".7"/>
    <circle cx="120" cy="120" r="112" fill="none" stroke="#8d7440" stroke-width="1" stroke-dasharray="2 10" opacity=".7"/>
    ${glyph}
    <circle cx="120" cy="120" r="112" fill="none" stroke="#c9a45a" stroke-width="3.5"/>
  </svg>`;
}

// Толщина монеты: ребро набирается из тонких кружков, поставленных друг за
// другом по оси Z. Одним слоем не обойтись — между двумя лицами была бы щель.
//
// Каждый кружок браузер растрирует сам по себе, и по краю их ступеньки не
// совпадают — контур выходит пилой. Поэтому ребро чуть уже лица и слегка
// размыто: круглый край рисует гладкий SVG, а ребру остаётся только объём.
const COIN_DEPTH = 9;
function edgeMarkup(steps = 14) {
  let out = '';
  for (let i = 0; i <= steps; i++) {
    const z = COIN_DEPTH / 2 - (COIN_DEPTH / steps) * i;
    const k = 1 - Math.abs(z) / COIN_DEPTH;        // середина ребра светлее краёв
    out += `<span class="coin-edge" style="transform:translateZ(${z.toFixed(2)}px);`
      + `filter:brightness(${(0.55 + k * 0.5).toFixed(2)}) blur(.5px)"></span>`;
  }
  return out;
}

/**
 * Наклон к курсору. Раньше здесь был CSS-переход, но его перезапускало
 * каждое движение мыши — отсюда рывки. Теперь угол догоняет курсор сам,
 * по кадру за раз, и останавливается, когда догнал.
 */
function attachTilt(zone, target, max = 16) {
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const step = () => {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    target.style.setProperty('--tilt-y', cx.toFixed(2) + 'deg');
    target.style.setProperty('--tilt-x', cy.toFixed(2) + 'deg');
    raf = (Math.abs(tx - cx) > 0.03 || Math.abs(ty - cy) > 0.03) ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  zone.addEventListener('pointermove', (e) => {
    const r = zone.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * max * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * -max * 2;
    kick();
  });
  zone.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
}

/** Оверлей выбора класса: те же 13 гербов, что смотрели на превью. */
function openClassPicker(currentId, onPick) {
  ensureCrestDefs();
  const overlay = el('div', 'cls-picker-overlay');
  const panel = el('div', 'cls-picker');
  const head = el('div', 'cls-picker-head');
  head.append(el('h3', '', 'Выбери класс'));
  const close = el('button', 'icon-btn close', '×');
  close.type = 'button';
  close.addEventListener('click', () => overlay.remove());
  head.append(close);
  const grid = el('div', 'cls-picker-grid');
  CLASSES.forEach((c) => {
    const item = el('button', 'cls-pick' + (c.id === currentId ? ' is-current' : ''));
    item.type = 'button';
    item.innerHTML = `<span class="coin3d"><span class="coin-body">${edgeMarkup()}`
      + `<span class="coin-face">${crestMarkup(c.id)}</span></span></span>`
      + `<span>${c.label}</span>`;
    attachTilt(item, item.querySelector('.coin-body'));
    item.addEventListener('click', () => { overlay.remove(); onPick(c.id); });
    grid.append(item);
  });
  panel.append(head, grid);
  overlay.append(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

/**
 * Герб класса в шапке листа: одна монета, до двух сторон (мультикласс).
 * Уровень не делится между классами — подпись просто повторяет общий уровень.
 */
function clsWidget(s, onEdit, ro, level) {
  ensureCrestDefs();
  const wrap = el('div', 'fld fld-cls');
  const title = el('span', 'fld-l', 'Класс');
  wrap.append(title);

  const tools = el('div', 'cls-tools');
  const flipBtn = el('button', 'icon-btn cls-tool', '⟲');
  flipBtn.type = 'button';
  const addBtn = el('button', 'icon-btn cls-tool', '+');
  addBtn.type = 'button';
  addBtn.title = 'Добавить второй класс';
  const dropBtn = el('button', 'icon-btn cls-tool', '×');
  dropBtn.type = 'button';
  dropBtn.title = 'Убрать второй класс';
  const editBtn = el('button', 'icon-btn cls-tool', '✎');
  editBtn.type = 'button';
  editBtn.title = 'Выбрать класс';
  tools.append(flipBtn);
  if (!ro) tools.append(addBtn, dropBtn, editBtn);

  // Три слоя, у каждого своя работа: наклон к курсору, переворот на другую
  // сторону и сами лица. Будь это один слой, поворот затирал бы наклон.
  const coin = el('div', 'cls-coin');
  const tilt = el('div', 'cls-tilt');
  const inner = el('div', 'cls-coin-inner');
  const faceA = el('div', 'cls-face cls-face-a');
  const faceB = el('div', 'cls-face cls-face-b');
  const edge = el('div', 'cls-edge');
  edge.innerHTML = edgeMarkup();
  inner.append(edge, faceA, faceB);
  tilt.append(inner);
  coin.append(tilt);
  attachTilt(coin, tilt, 14);
  const caption = el('div', 'cls-caption');

  const box = el('div', 'cls-box');
  box.append(tools, coin, caption);
  wrap.append(box);

  const setSlot = (i, id) => {
    const ids = (Array.isArray(s.cls) ? s.cls : []).slice();
    while (ids.length <= i) ids.push(null);
    ids[i] = id;
    s.cls = ids;
    onEdit('cls', s.cls);
  };

  let side = 0;
  function repaint() {
    const ids = Array.isArray(s.cls) ? s.cls : [];
    const multi = !!ids[1];
    // Один класс — обе стороны его же: монета честно крутится, но чеканка на
    // ней одна, и никакой пустой изнанки со знаком «плюс» игрок не видит.
    faceA.innerHTML = crestMarkup(ids[0]);
    faceB.innerHTML = crestMarkup(multi ? ids[1] : ids[0]);
    inner.classList.toggle('is-flipped', side === 1);
    title.textContent = multi ? 'Мультикласс' : 'Класс';
    // Крутить нечего, только пока не выбран вообще никто
    const empty = !ids[0] && !multi;
    flipBtn.hidden = ro && empty;
    flipBtn.disabled = empty;
    flipBtn.title = empty ? 'Класс не выбран' : 'Показать другую сторону';
    addBtn.hidden = multi;
    dropBtn.hidden = !multi;
    const shown = (multi ? ids[side] : ids[0]);
    const known = shown && classById(shown);
    caption.textContent = known ? `${known.label}, ур. ${level || 1}`
      : shown ? shown
      : 'Класс не выбран';
  }

  flipBtn.addEventListener('click', () => {
    side = side ? 0 : 1;
    repaint();
  });
  addBtn.addEventListener('click', () => {
    openClassPicker(null, (id) => { setSlot(1, id); side = 1; repaint(); });
  });
  dropBtn.addEventListener('click', () => {
    // остаётся первый класс; сторона возвращается на лицо, чтобы не смотреть
    // на изнанку только что убранного
    s.cls = (Array.isArray(s.cls) ? s.cls : []).slice(0, 1);
    onEdit('cls', s.cls);
    side = 0;
    repaint();
  });
  editBtn.addEventListener('click', () => {
    const ids = Array.isArray(s.cls) ? s.cls : [];
    openClassPicker(ids[side], (id) => { setSlot(side, id); repaint(); });
  });

  repaint();
  return wrap;
}

/**
 * Ключ персонажа: игрок его диктует Мастеру, Мастер по нему смотрит лист.
 * Ключ — это адрес листа в базе, поэтому по умолчанию он закрыт точками:
 * за спиной игрока может стоять кто угодно, а стрим показывает экран всем.
 * Копировать можно не раскрывая — диктовать вслух приходится редко.
 */
function keyBox(key, ro) {
  const box = el('div', 'key-box');
  box.append(el('span', 'fld-l', ro ? 'Ключ персонажа' : 'Ключ персонажа — назовите его Мастеру'));
  const mask = String(key).replace(/[^-]/g, '•');
  const val = el('code', 'key-val is-hidden', mask);
  box.append(val);

  let shown = false;
  const eye = el('button', 'btn btn-soft btn-sm', 'Показать');
  eye.type = 'button';
  eye.addEventListener('click', () => {
    shown = !shown;
    val.textContent = shown ? key : mask;
    val.classList.toggle('is-hidden', !shown);
    eye.textContent = shown ? 'Скрыть' : 'Показать';
  });
  box.append(eye);

  if (!ro && navigator.clipboard) {
    const copy = el('button', 'btn btn-soft btn-sm', 'Копировать');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(key);
      copy.textContent = 'Скопировано';
      setTimeout(() => { copy.textContent = 'Копировать'; }, 1500);
    });
    box.append(copy);
  }
  return box;
}

/* ── Окно «Атаки и заклинания» ────────────────────────────────────── */

const BONUS_FROM = [['none', 'Нет'], ...ABILITIES.map((a) => [a.id, a.label]), ['custom', 'Свой']];

/**
 * Крестик в свёрнутой строке: убрать запись, не раскрывая её.
 * Запись одна на оба списка, поэтому и предупреждение общее.
 */
function rowDel(name, onYes) {
  const x = el('button', 'row-del feat-del', '×');
  x.type = 'button';
  x.title = 'Убрать из листа';
  x.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirm(`Убрать «${name || 'без названия'}» из листа?`)) return;
    onYes();
  });
  return x;
}

/**
 * Список приёмов: свёрнутый — иконка и название, развёрнутый — все числа.
 * Одна и та же разметка идёт и в кабинет, и в панель за столом; правится и там,
 * и там, потому что посреди боя дописать урон бывает нужнее, чем до игры.
 *
 * ctx.onChange зовём, когда поменялось имя или вид: соседний список
 * способностей смотрит в тот же массив и должен перерисоваться.
 */
function moveList(s, onEdit, ctx = {}) {
  const ro = !!ctx.readOnly;
  const host = el('div', 'moves');
  let open = null;
  const save = (deep) => { onEdit('feats', s.feats); if (deep && ctx.onChange) ctx.onChange(); };

  const sel = (pairs, cur, on) => {
    const n = el('select', 'sel sel-sm');
    pairs.forEach(([v, label]) => {
      const o = new Option(label, v);
      if (String(cur) === String(v)) o.selected = true;
      n.append(o);
    });
    if (ro) n.disabled = true;
    else n.addEventListener('change', () => on(n.value));
    return n;
  };
  const num = (val, on, min = 0, max = 99) => {
    const n = el('input', 'num-sm');
    n.type = 'number'; n.min = min; n.max = max; n.value = val;
    if (ro) n.readOnly = true;
    else n.addEventListener('input', () => on(Math.max(min, Math.min(max, Number(n.value) || 0))));
    return n;
  };
  const fld = (label, ...kids) => {
    const f = el('div', 'move-fld');
    const line = el('div', 'move-line');
    line.append(...kids);
    f.append(el('span', 'fld-l', label), line);
    return f;
  };

  function body(m) {
    const b = el('div', 'move-body');

    const nameI = el('input', 'feat-name-input');
    nameI.value = m.name;
    nameI.placeholder = m.kind === 'weapon' ? 'Название оружия' : 'Название способности';
    if (ro) nameI.readOnly = true;
    else nameI.addEventListener('input', () => { m.name = nameI.value; save(true); });
    b.append(nameI);

    /* направленность и размер пятна */
    const sizeI = num(m.size, (v) => { m.size = v; save(); }, 0, 500);
    const sizeWrap = el('span', 'move-size');
    sizeWrap.append(sizeI, el('span', 'move-unit', 'фт'));
    const showSize = () => { sizeWrap.hidden = m.aim === 'one'; };
    b.append(fld('Направленность', sel(AIMS, m.aim, (v) => { m.aim = v; showSize(); save(); }), sizeWrap));
    showSize();

    b.append(fld('Тип', sel(EFFECTS, m.effect, (v) => { m.effect = v; save(); })));

    /* чем защищается цель: по КД, спасброском или никак */
    const abilSel = sel(ABILITIES.map((a) => [a.id, a.label]), m.guardAbil, (v) => { m.guardAbil = v; save(); });
    const onSaveSel = sel(ON_SAVE, m.onSave, (v) => { m.onSave = v; save(); });
    const saveExtra = el('span', 'move-save');
    saveExtra.append(abilSel, el('span', 'move-unit', 'при успехе'), onSaveSel);
    const showSave = () => { saveExtra.hidden = m.guard !== 'save'; };
    b.append(fld('Чем защищается цель',
      sel(GUARDS, m.guard, (v) => { m.guard = v; showSave(); save(); }), saveExtra));
    showSave();

    /* кости: двумя кусками — «1д8 рубящий + 2д6 огонь» */
    const diceBox = el('div', 'move-dice');
    m.dice.forEach((d, i) => {
      const line = el('div', 'move-line');
      line.append(
        num(d.n, (v) => { d.n = v; save(); }, 0, 20),
        el('span', 'move-unit', 'д'),
        sel(FACES.map((f) => [f, String(f)]), d.d, (v) => { d.d = Number(v); save(); }),
        sel([['', 'вид не указан'], ...DMG_TYPES.map((t) => [t, t])], d.type, (v) => { d.type = v; save(); }),
      );
      if (i) line.classList.add('move-dice-2');
      diceBox.append(line);
    });
    const dmgLabel = el('div', 'move-fld');
    dmgLabel.append(el('span', 'fld-l', m.effect === 'heal' ? 'Лечение' : 'Урон'), diceBox);
    b.append(dmgLabel);

    /* бонус: от характеристики или свой — прибавка к броску, не к костям */
    const ownI = num(m.bonus.value, (v) => { m.bonus.value = v; save(); }, -20, 20);
    const showOwn = () => { ownI.hidden = m.bonus.from !== 'custom'; };
    b.append(fld('Бонус', sel(BONUS_FROM, m.bonus.from, (v) => { m.bonus.from = v; showOwn(); save(); }), ownI));
    showOwn();

    if (m.raw) b.append(el('p', 'hint', `Из старой записи: ${m.raw}`));

    if (!ro) {
      const acts = el('div', 'feat-acts');
      if (ctx.pickImage) {
        const up = el('label', 'btn btn-soft btn-sm file-btn', '🖼 Картинка');
        const inp = el('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
        inp.addEventListener('change', async () => {
          if (!inp.files[0]) return;
          m.img = await ctx.pickImage(inp.files[0], 220);
          save(true); draw();
        });
        up.append(inp);
        acts.append(up);
      }
      // вид решает, попадёт ли запись во вкладку способностей: оружию описание не нужно
      const flip = el('button', 'btn btn-soft btn-sm',
        m.kind === 'feat' ? 'Это оружие' : 'Это способность');
      flip.type = 'button';
      flip.title = 'Способности видны на вкладке с описаниями, оружие — только здесь';
      flip.addEventListener('click', () => {
        m.kind = m.kind === 'feat' ? 'weapon' : 'feat';
        save(true); draw();
      });
      const del = el('button', 'btn btn-danger btn-sm', 'Убрать');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!confirm(`Убрать «${m.name || 'без названия'}» совсем?`)) return;
        s.feats = s.feats.filter((x) => x.id !== m.id);
        save(true); draw();
      });
      acts.append(flip, del);
      b.append(acts);
    }
    return b;
  }

  function draw() {
    host.innerHTML = '';
    s.feats.forEach((m) => {
      const card = el('div', 'move feat' + (open === m.id ? ' is-open' : ''));
      const tab = el('button', 'feat-tab');
      tab.type = 'button';
      const pic = el('span', 'feat-pic');
      if (m.img) pic.style.backgroundImage = `url("${m.img}")`;
      else pic.textContent = m.kind === 'weapon' ? '⚔' : '✦';
      tab.append(pic, el('span', 'feat-name', m.name || 'Без названия'));
      tab.addEventListener('click', () => { open = open === m.id ? null : m.id; draw(); });
      const head = el('div', 'feat-head');
      head.append(tab);
      if (!ro) {
        head.append(rowDel(m.name, () => {
          s.feats = s.feats.filter((x) => x.id !== m.id);
          if (open === m.id) open = null;
          save(true); draw();
        }));
      }
      card.append(head);
      if (open === m.id) card.append(body(m));
      host.append(card);
    });
    if (!s.feats.length) host.append(el('p', 'hint', 'Пусто. Добавь оружие или заведи способность.'));
  }
  draw();

  const addBtn = el('button', 'btn btn-soft btn-sm w-full', '+ Оружие');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    const m = emptyMove('weapon');
    m.name = 'Новое оружие';
    s.feats.push(m);
    open = m.id;
    save(true); draw();
  });

  return { host, draw, addBtn };
}

/**
 * Рисуем лист. onEdit(key) отдаёт правку наружу — кабинет её сохраняет.
 * ctx.insp — сколько вдохновений выдал Мастер, ctx.level — уровень от Мастера
 * (без него берём сохранённый в листе), ctx.pickImage — выбор картинки.
 * ctx.readOnly — лист только для чтения: так его видит Мастер.
 * ctx.charKey — ключ персонажа: его игрок диктует Мастеру.
 */
export function renderSheet(root, ch, onEdit, ctx = {}) {
  const s = ch.sheet;
  const ro = !!ctx.readOnly;
  root.innerHTML = '';
  root.classList.toggle('is-ro', ro);

  const bind = (node, key, cast) => {
    if (ro) { node.readOnly = true; return node; }
    node.addEventListener('input', () => {
      s[key] = cast ? cast(node.value) : node.value;
      onEdit(key, s[key]);
      if (cast) refreshDerived();
    });
    return node;
  };
  const textField = (label, key) => {
    const f = el('label', 'fld');
    const i = el('input');
    i.value = s[key] ?? '';
    f.append(el('span', 'fld-l', label), bind(i, key));
    return f;
  };
  const numField = (label, key) => {
    const f = el('label', 'fld fld-num');
    const i = el('input');
    i.type = 'number';
    i.value = s[key] ?? 0;
    f.append(el('span', 'fld-l', label), bind(i, key, (v) => Number(v) || 0));
    return f;
  };
  const block = (title, ...kids) => {
    const b = el('section', 'blk');
    if (title) b.append(el('h3', 'blk-h', title));
    b.append(...kids);
    return b;
  };
  const area = (t) => {
    const b = el('section', 'blk');
    const a = el('textarea');
    a.rows = t.rows;
    a.value = s[t.id] ?? '';
    a.placeholder = '—';
    b.append(el('h3', 'blk-h', t.label), bind(a, t.id));
    return b;
  };

  /* ── шапка ── */
  const head = el('div', 'sheet-head');
  const nameWrap = el('label', 'fld fld-name');
  const nameInput = el('input');
  nameInput.value = ch.name || '';
  nameInput.placeholder = 'Имя персонажа';
  if (ro) nameInput.readOnly = true;
  else nameInput.addEventListener('input', () => { ch.name = nameInput.value; onEdit('name', ch.name); });
  nameWrap.append(el('span', 'fld-l', 'Имя персонажа'), nameInput);
  const lvlValue = ctx.level ?? s.level;
  const headGrid = el('div', 'head-grid');
  HEAD.forEach((h) => {
    if (h.lvl) {
      // Уровень и вдохновение выдаёт Мастер: два одинаковых окошка рядом,
      // вдохновению больше не нужна карточка на всю ширину колонки.
      headGrid.append(lvlBox(lvlValue), inspBox(ctx.insp || 0));
    } else headGrid.append(h.num ? numField(h.label, h.id) : textField(h.label, h.id));
  });
  // Герб высокий, поля низкие: держим их в своей колонке, иначе под каждым
  // полем остаётся провал в половину монеты.
  const headMain = el('div', 'head-main');
  headMain.append(nameWrap, headGrid);
  if (ctx.charKey) headMain.append(keyBox(ctx.charKey, ro));
  head.append(clsWidget(s, onEdit, ro, lvlValue), headMain);
  root.append(head);

  /* ── карточки одним потоком ── */
  const flow = el('div', 'sheet-flow');

  const abil = el('div', 'abilities');
  const modNodes = {};
  ABILITIES.forEach((a) => {
    const c = el('div', 'abil');
    const score = el('input', 'abil-score');
    score.type = 'number';
    score.value = s[a.id];
    modNodes[a.id] = el('div', 'abil-mod', sign(mod(s[a.id])));
    c.append(el('div', 'abil-l', a.label), modNodes[a.id], bind(score, a.id, (v) => Number(v) || 0));
    abil.append(c);
  });

  const abilBlk = block('Характеристики', abil);

  const defense = el('div', 'row-3');
  defense.append(numField('КД', 'ac'), numField('Скорость', 'speed'), numField('Обзор, фт', 'vision'));

  const hp = el('div', 'row-3');
  hp.append(numField('Хиты сейчас', 'hpCur'), numField('Максимум хитов', 'hpMax'), textField('Кость хитов', 'hitDice'));

  /* Атаки и заклинания: общий список приёмов, способности видны и здесь */
  const moves = moveList(s, onEdit, {
    readOnly: ro,
    pickImage: ctx.pickImage,
    onChange: () => drawFeats(),
  });

  const defenseBlk = block('Защита и ход', defense);
  const hpBlk = block('Хиты', hp);
  // без потолка по высоте: раскрытый приём длинный, и в окошке на 340px его
  // нижние поля было не достать
  const atkBlk = ro ? block('Атаки и заклинания', moves.host)
    : block('Атаки и заклинания', moves.host, moves.addBtn);

  const feats = el('div', 'feats');
  const addFeat = el('button', 'btn btn-soft btn-sm w-full', '+ Способность');
  addFeat.type = 'button';
  addFeat.addEventListener('click', () => {
    const f = emptyMove('feat');
    f.name = 'Новая способность';
    s.feats.push(f);
    onEdit('feats', s.feats);
    openFeat = f.id;
    drawFeats();
    moves.draw();
  });

  let openFeat = null;
  function drawFeats() {
    feats.innerHTML = '';
    // во вкладке описаний живут только способности: оружию описывать нечего
    s.feats.filter((f) => f.kind !== 'weapon').forEach((f) => {
      const card = el('div', 'feat' + (openFeat === f.id ? ' is-open' : ''));
      const tab = el('button', 'feat-tab');
      tab.type = 'button';
      const pic = el('span', 'feat-pic');
      if (f.img) pic.style.backgroundImage = `url("${f.img}")`;
      else pic.textContent = '✦';
      tab.append(pic, el('span', 'feat-name', f.name || 'Без названия'));
      tab.addEventListener('click', () => { openFeat = openFeat === f.id ? null : f.id; drawFeats(); });
      const head = el('div', 'feat-head');
      head.append(tab);
      if (!ro) {
        head.append(rowDel(f.name, () => {
          s.feats = s.feats.filter((x) => x.id !== f.id);
          if (openFeat === f.id) openFeat = null;
          onEdit('feats', s.feats);
          drawFeats();
          moves.draw();
        }));
      }
      card.append(head);

      if (openFeat === f.id && ro) {
        const body = el('div', 'feat-body');
        body.append(el('p', 'feat-text', f.text || 'Описания нет.'));
        card.append(body);
      } else if (openFeat === f.id) {
        const body = el('div', 'feat-body');
        const nameI = el('input', 'feat-name-input');
        nameI.value = f.name;
        nameI.placeholder = 'Название способности';
        nameI.addEventListener('input', () => {
          f.name = nameI.value;
          onEdit('feats', s.feats);
          tab.querySelector('.feat-name').textContent = f.name || 'Без названия';
          moves.draw();                      // запись одна — переименовалась и в атаках
        });
        const ta = el('textarea');
        ta.rows = 5;
        ta.value = f.text;
        ta.placeholder = 'Что делает способность';
        ta.addEventListener('input', () => { f.text = ta.value; onEdit('feats', s.feats); });

        const row = el('div', 'feat-acts');
        const up = el('label', 'btn btn-soft btn-sm file-btn', '🖼 Картинка');
        const inp = el('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
        inp.addEventListener('change', async () => {
          if (!inp.files[0] || !ctx.pickImage) return;
          f.img = await ctx.pickImage(inp.files[0], 220);
          onEdit('feats', s.feats);
          drawFeats();
          moves.draw();
        });
        up.append(inp);
        const del = el('button', 'btn btn-danger btn-sm', 'Убрать');
        del.type = 'button';
        del.addEventListener('click', () => {
          if (!confirm(`Убрать способность «${f.name || 'без названия'}»?`)) return;
          s.feats = s.feats.filter((x) => x.id !== f.id);
          onEdit('feats', s.feats);
          drawFeats();
          moves.draw();
        });
        row.append(up, del);
        body.append(nameI, ta, row);
        card.append(body);
      }
      feats.append(card);
    });
    if (!feats.children.length) feats.append(el('p', 'hint', 'Способностей пока нет.'));
  }
  drawFeats();

  const featsBlk = ro ? block('Умения и способности', feats)
    : block('Умения и способности', feats, addFeat);
  // Способности раскрываются внутри своего окна: у карточки свой потолок и
  // своя прокрутка, поэтому длинное описание не толкает вниз соседние блоки.
  featsBlk.classList.add('blk-scroll');

  // Несколько коротких полей одной карточкой, в две колонки: порознь каждое
  // просило себе целую карточку и растягивало лист.
  const pairGrid = (ids) => {
    const g = el('div', 'persona');
    ids.forEach((id) => {
      const t = TEXTS.find((x) => x.id === id);
      const cell = el('label', 'persona-cell');
      const a = el('textarea');
      a.rows = 2;
      a.value = s[t.id] ?? '';
      a.placeholder = '—';
      cell.append(el('span', 'fld-l', t.label), bind(a, t.id));
      g.append(cell);
    });
    return g;
  };

  // Раскладываем по трём столбцам руками. Раньше это делал column-count, но он
  // пересобирал весь поток от любой мелочи: раскрыл способность — и карточки
  // перепрыгивали из колонки в колонку.
  const paired = [...PERSONA, ...DEFENCE];
  const rest = Object.fromEntries(
    TEXTS.filter((t) => !paired.includes(t.id)).map((t) => [t.id, area(t)]),
  );
  // Слева всё, что про тело и снаряжение героя, посередине — что он делает,
  // справа — каким его видят и чем его не взять.
  const cols = [
    [abilBlk, defenseBlk, hpBlk, rest.gear],
    [atkBlk, featsBlk, block('Личность', pairGrid(PERSONA))],
    [rest.appearance, rest.langs, block('Сопротивления и слабости', pairGrid(DEFENCE))],
  ];
  cols.forEach((items) => {
    const col = el('div', 'sheet-col');
    items.filter(Boolean).forEach((n) => col.append(n));
    flow.append(col);
  });
  root.append(flow);

  /* ── лор и заметки ── */
  const bottom = el('div', 'sheet-bottom');
  bottom.append(area({ id: 'lore', label: 'Лор персонажа', rows: 6 }), area({ id: 'notes', label: 'Заметки', rows: 6 }));
  root.append(bottom);

  /* ── чего хотят от игры человек и герой ── */
  const wants = el('div', 'sheet-bottom');
  wants.append(
    area({ id: 'wantPlayer', label: 'Чего я как игрок хочу от игры', rows: 4 }),
    area({ id: 'wantChar', label: 'Чего я как персонаж хочу добиться', rows: 4 }),
  );
  root.append(wants);

  function refreshDerived() {
    ABILITIES.forEach((a) => { modNodes[a.id].textContent = sign(mod(s[a.id])); });
  }
  refreshDerived();
}

/**
 * Короткий лист для игрока за столом: то, за чем тянешься посреди боя —
 * характеристики, КД и хиты, способности, инвентарь, слабости и сопротивления.
 * Остальное живёт в кабинете. onEdit сохраняет так же, как в кабинете.
 */
export function renderSheetLite(root, ch, onEdit, ctx = {}) {
  const s = ch.sheet;
  root.innerHTML = '';

  const bindArea = (id, label, rows) => {
    const b = el('section', 'blk');
    const a = el('textarea');
    a.rows = rows;
    a.value = s[id] ?? '';
    a.placeholder = '—';
    a.addEventListener('input', () => { s[id] = a.value; onEdit(id, s[id]); });
    b.append(el('h3', 'blk-h', label), a);
    return b;
  };
  const numCell = (label, key) => {
    const f = el('label', 'fld fld-num');
    const i = el('input');
    i.type = 'number';
    i.value = s[key] ?? 0;
    i.addEventListener('input', () => { s[key] = Number(i.value) || 0; onEdit(key, s[key]); });
    f.append(el('span', 'fld-l', label), i);
    return f;
  };
  const block = (title, ...kids) => {
    const b = el('section', 'blk');
    b.append(el('h3', 'blk-h', title), ...kids);
    return b;
  };

  const head = el('div', 'lite-head');
  head.append(el('p', 'lite-name', ch.name || 'Персонаж'), lvlBox(ctx.level ?? s.level));
  root.append(head);

  /* ── характеристики: модификатор — кнопка броска d20 ── */
  const abil = el('div', 'abilities');
  ABILITIES.forEach((a) => {
    const c = el('div', 'abil');
    const score = el('input', 'abil-score');
    score.type = 'number';
    score.value = s[a.id];
    // за столом отсюда бросают, в кабинете бросок девать некуда — просто число
    const m = ctx.onRoll
      ? el('button', 'abil-mod abil-roll', sign(mod(s[a.id])))
      : el('div', 'abil-mod', sign(mod(s[a.id])));
    if (ctx.onRoll) {
      m.type = 'button';
      m.title = `Бросок: ${a.label}`;
      m.addEventListener('click', () => ctx.onRoll(a.label, mod(s[a.id]), m));
    }
    score.addEventListener('input', () => {
      s[a.id] = Number(score.value) || 0;
      m.textContent = sign(mod(s[a.id]));
      onEdit(a.id, s[a.id]);
    });
    c.append(el('div', 'abil-l', a.label), m, score);
    abil.append(c);
  });
  root.append(block('Характеристики', abil));

  /* ── КД и хиты ── */
  const vitals = el('div', 'row-3');
  vitals.append(numCell('КД', 'ac'), numCell('Хиты', 'hpCur'), numCell('Максимум', 'hpMax'));
  root.append(block('Защита и хиты', vitals));

  /* ── атаки и заклинания: тот же список, что в кабинете, правится в бою ── */
  const moves = moveList(s, onEdit, { onChange: () => drawFeats() });
  root.append(block('Атаки и заклинания', moves.host, moves.addBtn));

  /* ── способности: вкладка разворачивается в описание ── */
  const feats = el('div', 'feats');
  let open = null;
  function drawFeats() {
    feats.innerHTML = '';
    s.feats.filter((f) => f.kind !== 'weapon').forEach((f) => {
      const card = el('div', 'feat' + (open === f.id ? ' is-open' : ''));
      const tab = el('button', 'feat-tab');
      tab.type = 'button';
      const pic = el('span', 'feat-pic');
      if (f.img) pic.style.backgroundImage = `url("${f.img}")`;
      else pic.textContent = '✦';
      tab.append(pic, el('span', 'feat-name', f.name || 'Без названия'));
      tab.addEventListener('click', () => { open = open === f.id ? null : f.id; drawFeats(); });
      card.append(tab);
      if (open === f.id) {
        const body = el('div', 'feat-body');
        const ta = el('textarea');
        ta.rows = 4;
        ta.value = f.text || '';
        ta.placeholder = 'Что делает способность';
        ta.addEventListener('input', () => {
          f.text = ta.value;
          onEdit('feats', s.feats);
        });
        body.append(ta);
        card.append(body);
      }
      feats.append(card);
    });
    if (!feats.children.length) feats.append(el('p', 'hint', 'Способности заводятся в кабинете.'));
  }
  drawFeats();
  root.append(block('Способности', feats));

  root.append(bindArea('gear', 'Инвентарь', 5));
  root.append(bindArea('flaws', 'Слабости', 3));
  root.append(bindArea('resist', 'Сопротивления', 3));
}
