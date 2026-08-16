// Лист персонажа. Классический бланк D&D, но собранный из полей приложения:
// та же тёмная бумага, золотые канты, шкала отступов и размеров.
//
// Чего здесь нет намеренно: временных хитов, навыков с пассивной мудростью,
// спасбросков, бонуса мастерства, предыстории, опыта, инициативы и спасбросков
// от смерти. Вдохновение не правится: его выдаёт Мастер за столом.

export const ABILITIES = [
  { id: 'str', label: 'Сила' },
  { id: 'dex', label: 'Ловкость' },
  { id: 'con', label: 'Телосложение' },
  { id: 'int', label: 'Интеллект' },
  { id: 'wis', label: 'Мудрость' },
  { id: 'cha', label: 'Харизма' },
];

const HEAD = [
  { id: 'cls', label: 'Класс' },
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
  { id: 'gear', label: 'Снаряжение', rows: 4 },
  { id: 'langs', label: 'Прочие владения и языки', rows: 3 },
];

export const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function emptySheet() {
  const s = {
    cls: '', race: '', alignment: '', player: '',
    ac: 10, speed: 30, vision: 30,
    hpMax: 10, hpCur: 10, hitDice: '',
    attacks: [{ name: '', bonus: '', dmg: '' }, { name: '', bonus: '', dmg: '' }, { name: '', bonus: '', dmg: '' }],
    feats: [],                 // способности: {id, name, img, text}
    lore: '', notes: '',
  };
  ABILITIES.forEach((a) => { s[a.id] = 10; });
  TEXTS.forEach((t) => { s[t.id] = ''; });
  return s;
}

/** Дополняем сохранённый лист до полного: старые записи не должны падать. */
export function fixSheet(raw) {
  const s = { ...emptySheet(), ...(raw || {}) };
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
 * Рисуем лист. onEdit(key) отдаёт правку наружу — кабинет её сохраняет.
 * ctx.insp — сколько вдохновений выдал Мастер, ctx.pickImage — выбор картинки.
 */
export function renderSheet(root, ch, onEdit, ctx = {}) {
  const s = ch.sheet;
  root.innerHTML = '';

  const bind = (node, key, cast) => {
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
  nameInput.addEventListener('input', () => { ch.name = nameInput.value; onEdit('name', ch.name); });
  nameWrap.append(el('span', 'fld-l', 'Имя персонажа'), nameInput);
  const headGrid = el('div', 'head-grid');
  HEAD.forEach((h) => headGrid.append(textField(h.label, h.id)));
  head.append(nameWrap, headGrid);
  root.append(head);

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
        inp.addEventListener('input', () => { a[k] = inp.value; onEdit('attacks', s.attacks); });
        r.append(inp);
      });
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
      atk.append(r);
    });
  }
  drawAttacks();

  flow.append(block('Защита и ход', defense), block('Хиты', hp),
    block('Атаки и заклинания', atk, addAtkBtn, datalist));

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

      if (openFeat === f.id) {
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

  flow.append(block('Умения и способности', feats, addFeat));
  TEXTS.forEach((t) => flow.append(area(t)));
  root.append(flow);

  /* ── лор и заметки ── */
  const bottom = el('div', 'sheet-bottom');
  bottom.append(area({ id: 'lore', label: 'Лор персонажа', rows: 6 }), area({ id: 'notes', label: 'Заметки', rows: 6 }));
  root.append(bottom);

  function refreshDerived() {
    ABILITIES.forEach((a) => { modNodes[a.id].textContent = sign(mod(s[a.id])); });
  }
  refreshDerived();
}
