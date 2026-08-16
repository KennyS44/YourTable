// Лист персонажа. Классический бланк D&D, но собранный из полей приложения:
// та же тёмная бумага, золотые канты, шкала отступов и размеров.
//
// Чего здесь нет намеренно: временных хитов и списка навыков с пассивной
// мудростью — вместо них окно внешнего вида. Спасброски считаются сами:
// модификатор характеристики плюс бонус мастерства, если стоит галочка.

export const ABILITIES = [
  { id: 'str', label: 'Сила' },
  { id: 'dex', label: 'Ловкость' },
  { id: 'con', label: 'Телосложение' },
  { id: 'int', label: 'Интеллект' },
  { id: 'wis', label: 'Мудрость' },
  { id: 'cha', label: 'Харизма' },
];

const HEAD = [
  { id: 'cls', label: 'Класс и уровень' },
  { id: 'race', label: 'Раса' },
  { id: 'background', label: 'Предыстория' },
  { id: 'alignment', label: 'Мировоззрение' },
  { id: 'xp', label: 'Опыт' },
  { id: 'player', label: 'Имя игрока' },
];

// Разложены по колонкам так, чтобы столбцы кончались примерно на одной высоте
const TEXTS = {
  left: [{ id: 'langs', label: 'Прочие владения и языки', rows: 3 }],
  mid: [
    { id: 'gear', label: 'Снаряжение', rows: 4 },
    { id: 'features', label: 'Умения и особенности', rows: 4 },
  ],
  right: [
    { id: 'appearance', label: 'Внешний вид', rows: 5 },
    { id: 'traits', label: 'Черты характера', rows: 3 },
    { id: 'ideals', label: 'Идеалы', rows: 2 },
    { id: 'bonds', label: 'Привязанности', rows: 2 },
    { id: 'flaws', label: 'Слабости', rows: 2 },
  ],
};
const ALL_TEXTS = [...TEXTS.left, ...TEXTS.mid, ...TEXTS.right];

export const ATTACK_ROWS = 5;

export const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
export const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);

export function emptySheet() {
  const s = {
    cls: '', race: '', background: '', alignment: '', xp: '', player: '',
    prof: 2, inspiration: false,
    ac: 10, initiative: 0, speed: 30, vision: 30,
    hpMax: 10, hpCur: 10, hitDice: '', deathOk: 0, deathFail: 0,
    attacks: Array.from({ length: ATTACK_ROWS }, () => ({ name: '', bonus: '', dmg: '' })),
    lore: '', notes: '',
  };
  ABILITIES.forEach((a) => { s[a.id] = 10; s['save_' + a.id] = false; });
  ALL_TEXTS.forEach((t) => { s[t.id] = ''; });
  return s;
}

/** Дополняем сохранённый лист до полного: старые записи не должны падать. */
export function fixSheet(raw) {
  const s = { ...emptySheet(), ...(raw || {}) };
  s.attacks = Array.from({ length: ATTACK_ROWS }, (_, i) => ({ name: '', bonus: '', dmg: '', ...((raw && raw.attacks && raw.attacks[i]) || {}) }));
  return s;
}

const el = (tag, cls = '', text = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

/**
 * Рисуем лист. onEdit(key, value) отдаёт правку наружу — кабинет её сохраняет.
 * Всё, что можно посчитать (модификаторы, спасброски), пересчитывается на месте.
 */
export function renderSheet(root, ch, onEdit) {
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
  const textField = (label, key, wide) => {
    const f = el('label', 'fld' + (wide ? ' fld-wide' : ''));
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

  /* ── колонка 1: характеристики и спасброски ── */
  const col1 = el('div', 'sheet-col');

  const insp = el('label', 'check insp');
  const inspBox = el('input');
  inspBox.type = 'checkbox';
  inspBox.checked = !!s.inspiration;
  inspBox.addEventListener('change', () => { s.inspiration = inspBox.checked; onEdit('inspiration', s.inspiration); });
  insp.append(inspBox, el('span', '', 'Вдохновение'));

  const profRow = el('div', 'prof-row');
  const profInput = el('input');
  profInput.type = 'number';
  profInput.value = s.prof;
  profRow.append(el('span', 'fld-l', 'Бонус мастерства'), bind(profInput, 'prof', (v) => Number(v) || 0));

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

  const saves = el('div', 'saves');
  const saveNodes = {};
  ABILITIES.forEach((a) => {
    const r = el('label', 'save');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!s['save_' + a.id];
    box.addEventListener('change', () => {
      s['save_' + a.id] = box.checked;
      onEdit('save_' + a.id, box.checked);
      refreshDerived();
    });
    saveNodes[a.id] = el('span', 'save-v', '');
    r.append(box, el('span', 'save-l', a.label), saveNodes[a.id]);
    saves.append(r);
  });

  col1.append(block('', insp, profRow), block('Характеристики', abil), block('Спасброски', saves));
  TEXTS.left.forEach((t) => col1.append(area(t)));

  /* ── колонка 2: бой ── */
  const col2 = el('div', 'sheet-col');
  const defense = el('div', 'row-4');
  defense.append(numField('КД', 'ac'), numField('Инициатива', 'initiative'),
    numField('Скорость', 'speed'), numField('Обзор, фт', 'vision'));

  const hp = el('div', 'row-3');
  hp.append(numField('Хиты сейчас', 'hpCur'), numField('Максимум хитов', 'hpMax'), textField('Кость хитов', 'hitDice'));

  const death = el('div', 'death');
  const dots = (key, label, tone) => {
    const row = el('div', 'death-row');
    row.append(el('span', 'fld-l', label));
    const box = el('div', 'dots');
    for (let i = 1; i <= 3; i++) {
      const d = el('button', 'dot ' + tone + (s[key] >= i ? ' on' : ''));
      d.type = 'button';
      d.addEventListener('click', () => {
        s[key] = s[key] === i ? i - 1 : i;      // повторный клик по горящей — снять
        onEdit(key, s[key]);
        [...box.children].forEach((c, j) => c.classList.toggle('on', s[key] >= j + 1));
      });
      box.append(d);
    }
    row.append(box);
    return row;
  };
  death.append(dots('deathOk', 'Успехи', 'ok'), dots('deathFail', 'Провалы', 'bad'));

  const atk = el('div', 'attacks');
  const ah = el('div', 'atk-row atk-head');
  ah.append(el('span', '', 'Название'), el('span', '', 'Бонус'), el('span', '', 'Урон и вид'));
  atk.append(ah);
  s.attacks.forEach((a, i) => {
    const r = el('div', 'atk-row');
    ['name', 'bonus', 'dmg'].forEach((k) => {
      const inp = el('input');
      inp.value = a[k] || '';
      inp.addEventListener('input', () => { a[k] = inp.value; onEdit('attacks', s.attacks); });
      r.append(inp);
    });
    atk.append(r);
  });

  col2.append(block('Защита и ход', defense), block('Хиты', hp, death), block('Атаки и заклинания', atk));
  TEXTS.mid.forEach((t) => col2.append(area(t)));

  /* ── колонка 3: описание ── */
  const col3 = el('div', 'sheet-col');
  TEXTS.right.forEach((t) => col3.append(area(t)));

  const cols = el('div', 'sheet-cols');
  cols.append(col1, col2, col3);
  root.append(cols);

  /* ── лор и заметки ── */
  const bottom = el('div', 'sheet-bottom');
  bottom.append(area({ id: 'lore', label: 'Лор персонажа', rows: 6 }), area({ id: 'notes', label: 'Заметки', rows: 6 }));
  root.append(bottom);

  function refreshDerived() {
    ABILITIES.forEach((a) => {
      const m = mod(s[a.id]);
      modNodes[a.id].textContent = sign(m);
      saveNodes[a.id].textContent = sign(m + (s['save_' + a.id] ? Number(s.prof) || 0 : 0));
    });
  }
  refreshDerived();
}
