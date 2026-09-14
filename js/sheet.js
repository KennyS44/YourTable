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

// Порядок карточек в потоке; по колонкам их раскладывает сама вёрстка,
// поэтому столбцы кончаются на одной высоте, сколько бы ни было способностей.
const TEXTS = [
  { id: 'appearance', label: 'Внешний вид', rows: 5 },
  { id: 'traits', label: 'Черты характера', rows: 3 },
  { id: 'ideals', label: 'Идеалы', rows: 2 },
  { id: 'bonds', label: 'Привязанности', rows: 2 },
  { id: 'flaws', label: 'Слабости', rows: 2 },
  { id: 'resist', label: 'Сопротивления', rows: 2 },
  { id: 'gear', label: 'Снаряжение', rows: 4 },
  { id: 'langs', label: 'Прочие владения и языки', rows: 3 },
];

export const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function emptySheet() {
  const s = {
    cls: [], level: 1, race: '', alignment: '', player: '',
    ac: 10, speed: 30, vision: 30,
    hpMax: 10, hpCur: 10, hitDice: '',
    attacks: [{ name: '', bonus: '', dmg: '' }, { name: '', bonus: '', dmg: '' }, { name: '', bonus: '', dmg: '' }],
    feats: [],                 // способности: {id, name, img, text}
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
  const rows = (raw && raw.attacks) || [];
  s.attacks = rows.length ? rows.map((a) => ({ name: '', bonus: '', dmg: '', ...a })) : emptySheet().attacks;
  s.feats = ((raw && raw.feats) || []).map((f) => ({ id: f.id || uid('ft'), name: f.name || '', img: f.img || '', text: f.text || '' }));
  // старое текстовое поле «Умения и особенности» переносим в первую способность
  if (!s.feats.length && raw && raw.features) s.feats = [{ id: uid('ft'), name: 'Особенности', img: '', text: raw.features }];
  delete s.features;
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
  return `<svg viewBox="0 0 240 240" class="crest-svg">
    <circle cx="120" cy="120" r="112" fill="url(#crest-gold-bg)" stroke="#8d7440" stroke-width="4"/>
    <circle cx="120" cy="120" r="100" fill="none" stroke="#8d7440" stroke-width="1.5" opacity=".7"/>
    <circle cx="120" cy="120" r="112" fill="none" stroke="#8d7440" stroke-width="1" stroke-dasharray="2 10" opacity=".7"/>
    ${glyph}
    <circle cx="120" cy="120" r="112" fill="none" stroke="#c9a45a" stroke-width="3.5"/>
  </svg>`;
}

/** Лёгкий наклон медальона к курсору — калька с превью, но живьём. */
function tiltMove(e) {
  const r = this.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  this.style.transform = `rotateY(${x * 18}deg) rotateX(${y * -18}deg)`;
}
function tiltReset() {
  this.style.transform = '';
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
    item.innerHTML = crestMarkup(c.id) + `<span>${c.label}</span>`;
    item.addEventListener('pointermove', tiltMove);
    item.addEventListener('pointerleave', tiltReset);
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
  const editBtn = el('button', 'icon-btn cls-tool', '✎');
  editBtn.type = 'button';
  editBtn.title = 'Выбрать класс';
  tools.append(flipBtn);
  if (!ro) tools.append(addBtn, editBtn);

  const coin = el('div', 'cls-coin');
  const inner = el('div', 'cls-coin-inner');
  const faceA = el('div', 'cls-face cls-face-a');
  const faceB = el('div', 'cls-face cls-face-b');
  inner.append(faceA, faceB);
  coin.append(inner);
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
    faceA.innerHTML = crestMarkup(ids[0]);
    faceB.innerHTML = crestMarkup(ids[1]);
    inner.classList.toggle('is-flipped', side === 1);
    // переворачивать нечего, пока второго класса нет: у Мастера кнопки просто
    // не будет, у игрока она погашена — рядом с ней «+», который её и оживит
    const multi = !!ids[1];
    title.textContent = multi ? 'Мультикласс' : 'Класс';
    flipBtn.hidden = ro && !multi;
    flipBtn.disabled = !multi;
    flipBtn.title = multi ? 'Показать другую сторону' : 'Второго класса нет';
    addBtn.hidden = multi;
    const shown = ids[side];
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
  editBtn.addEventListener('click', () => {
    const ids = Array.isArray(s.cls) ? s.cls : [];
    openClassPicker(ids[side], (id) => { setSlot(side, id); repaint(); });
  });

  repaint();
  return wrap;
}

/** Ключ персонажа: игрок его диктует Мастеру, Мастер по нему смотрит лист. */
function keyBox(key, ro) {
  const box = el('div', 'key-box');
  box.append(el('span', 'fld-l', ro ? 'Ключ персонажа' : 'Ключ персонажа — назовите его Мастеру'));
  const val = el('code', 'key-val', key);
  box.append(val);
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
    if (h.lvl) headGrid.append(lvlBox(lvlValue));
    else headGrid.append(h.num ? numField(h.label, h.id) : textField(h.label, h.id));
  });
  // Герб высокий, поля низкие: держим их в своей колонке, иначе под каждым
  // полем остаётся провал в половину монеты.
  const headMain = el('div', 'head-main');
  headMain.append(nameWrap, headGrid);
  head.append(clsWidget(s, onEdit, ro, lvlValue), headMain);
  root.append(head);
  if (ctx.charKey) root.append(keyBox(ctx.charKey, ro));

  /* ── карточки одним потоком ── */
  const flow = el('div', 'sheet-flow');

  const insp = el('div', 'insp-box');
  insp.append(el('span', 'fld-l', 'Вдохновение'), el('span', 'insp-n', String(ctx.insp || 0)));
  const inspBlock = block('', insp, el('p', 'hint', 'Выдаёт и забирает Мастер за столом.'));

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

  flow.append(inspBlock, block('Характеристики', abil));

  const defense = el('div', 'row-3');
  defense.append(numField('КД', 'ac'), numField('Скорость', 'speed'), numField('Обзор, фт', 'vision'));

  const hp = el('div', 'row-3');
  hp.append(numField('Хиты сейчас', 'hpCur'), numField('Максимум хитов', 'hpMax'), textField('Кость хитов', 'hitDice'));

  /* Атаки: строки добавляются, названия подсказываются из способностей */
  const listId = 'feat-names';
  const datalist = el('datalist');
  datalist.id = listId;
  const atk = el('div', 'attacks');
  const addAtkBtn = el('button', 'btn btn-soft btn-sm w-full', '+ Строка');
  addAtkBtn.type = 'button';
  addAtkBtn.addEventListener('click', () => {
    s.attacks.push({ name: '', bonus: '', dmg: '' });
    onEdit('attacks', s.attacks);
    drawAttacks();
  });

  function drawAttacks() {
    atk.innerHTML = '';
    const h = el('div', 'atk-row atk-head');
    h.append(el('span', '', 'Название'), el('span', '', 'Бонус'), el('span', '', 'Урон и вид'), el('span', '', ''));
    atk.append(h);
    s.attacks.forEach((a, i) => {
      const r = el('div', 'atk-row');
      ['name', 'bonus', 'dmg'].forEach((k) => {
        const inp = el('input');
        inp.value = a[k] || '';
        if (k === 'name') inp.setAttribute('list', listId);
        if (ro) inp.readOnly = true;
        else inp.addEventListener('input', () => { a[k] = inp.value; onEdit('attacks', s.attacks); });
        r.append(inp);
      });
      if (!ro) {
        const del = el('button', 'row-del', '×');
        del.type = 'button';
        del.title = 'Убрать строку';
        del.addEventListener('click', () => {
          s.attacks.splice(i, 1);
          if (!s.attacks.length) s.attacks.push({ name: '', bonus: '', dmg: '' });
          onEdit('attacks', s.attacks);
          drawAttacks();
        });
        r.append(del);
      }
      atk.append(r);
    });
  }
  drawAttacks();

  flow.append(block('Защита и ход', defense), block('Хиты', hp),
    ro ? block('Атаки и заклинания', atk) : block('Атаки и заклинания', atk, addAtkBtn, datalist));

  const feats = el('div', 'feats');
  const addFeat = el('button', 'btn btn-soft btn-sm w-full', '+ Способность');
  addFeat.type = 'button';
  addFeat.addEventListener('click', () => {
    const f = { id: uid('ft'), name: 'Новая способность', img: '', text: '' };
    s.feats.push(f);
    onEdit('feats', s.feats);
    openFeat = f.id;
    drawFeats();
  });

  let openFeat = null;
  function drawFeats() {
    feats.innerHTML = '';
    datalist.innerHTML = '';
    s.feats.forEach((f) => {
      if (f.name) datalist.append(new Option(f.name));

      const card = el('div', 'feat' + (openFeat === f.id ? ' is-open' : ''));
      const tab = el('button', 'feat-tab');
      tab.type = 'button';
      const pic = el('span', 'feat-pic');
      if (f.img) pic.style.backgroundImage = `url("${f.img}")`;
      else pic.textContent = '✦';
      tab.append(pic, el('span', 'feat-name', f.name || 'Без названия'));
      tab.addEventListener('click', () => { openFeat = openFeat === f.id ? null : f.id; drawFeats(); });
      card.append(tab);

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
          refreshNames();
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
        });
        up.append(inp);
        const del = el('button', 'btn btn-danger btn-sm', 'Убрать');
        del.type = 'button';
        del.addEventListener('click', () => {
          if (!confirm(`Убрать способность «${f.name || 'без названия'}»?`)) return;
          s.feats = s.feats.filter((x) => x.id !== f.id);
          onEdit('feats', s.feats);
          drawFeats();
        });
        row.append(up, del);
        body.append(nameI, ta, row);
        card.append(body);
      }
      feats.append(card);
    });
    if (!s.feats.length) feats.append(el('p', 'hint', 'Способностей пока нет.'));
  }
  const refreshNames = () => {
    datalist.innerHTML = '';
    s.feats.forEach((f) => { if (f.name) datalist.append(new Option(f.name)); });
  };
  drawFeats();

  flow.append(ro ? block('Умения и способности', feats) : block('Умения и способности', feats, addFeat));
  TEXTS.forEach((t) => flow.append(area(t)));
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

  /* ── характеристики ── */
  const abil = el('div', 'abilities');
  ABILITIES.forEach((a) => {
    const c = el('div', 'abil');
    const score = el('input', 'abil-score');
    score.type = 'number';
    score.value = s[a.id];
    const m = el('div', 'abil-mod', sign(mod(s[a.id])));
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

  /* ── способности: вкладка разворачивается в описание ── */
  const feats = el('div', 'feats');
  let open = null;
  function drawFeats() {
    feats.innerHTML = '';
    s.feats.forEach((f) => {
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
        ta.addEventListener('input', () => { f.text = ta.value; onEdit('feats', s.feats); });
        body.append(ta);
        card.append(body);
      }
      feats.append(card);
    });
    if (!s.feats.length) feats.append(el('p', 'hint', 'Способности заводятся в кабинете.'));
  }
  drawFeats();
  root.append(block('Способности', feats));

  root.append(bindArea('gear', 'Инвентарь', 5));
  root.append(bindArea('flaws', 'Слабости', 3));
  root.append(bindArea('resist', 'Сопротивления', 3));
}
