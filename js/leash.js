// Привязка: один персонаж ведёт другого.
//
// Игрок инструментом 🔗 выбирает своего персонажа, потом того, кто пойдёт
// следом, — НПС, врага или чужого героя. Привязанный стоит в соседней клетке
// и шагает за ведущим сам (это делает поле, board.js). Отвязать может тот, кто
// привязал, Мастер и хозяин привязанного; если связь разорвал не сам
// привязавший, он пять минут не может привязывать никого.

import { app, nameKey, tokenName } from './app-state.js';
import { say } from './chat.js';
import { $, el, toast } from './ui.js';

const BAN_MS = 5 * 60 * 1000;

const myKey = () => nameKey(app.me.name);
const isDown = (t) => (t.statuses || []).includes('Без сознания');
const mine = (t) => nameKey(t.ownerName) === myKey();
/** Имя для общей ленты: её читают все, скрытое имя врага туда не пишем. */
const publicName = (t) => (t.namePublic !== false ? t.name : 'Неизвестное существо');

/** Сколько ещё нельзя привязывать, мс. Мастера запрет не касается. */
export function banLeft(s = app.store.get()) {
  if (app.isDM) return 0;
  return Math.max(0, ((s.bindBan || {})[myKey()] || 0) - Date.now());
}
const clock = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Поле отдало пару «ведущий → привязанный». */
export function bindTokens(leadId, folId) {
  const s = app.store.get();
  const lead = s.tokens[leadId], fol = s.tokens[folId];
  if (!lead || !fol) return;
  const left = banLeft(s);
  if (left) return toast(`Связь разорвали — привязывать снова можно через ${clock(left)}`);
  if (!app.isDM && isDown(lead)) return toast('Без сознания: персонаж никого не поведёт');
  const leads = (id) => Object.values(s.tokens).some((t) => t.leash && t.leash.to === id);
  if (lead.leash) return toast(`${tokenName(lead)} сам привязан и вести других не может`);
  if (fol.leash) return toast(`${tokenName(fol)} уже привязан к другому`);
  if (leads(folId)) return toast(`${tokenName(fol)} сам ведёт другого — сначала отвяжите`);
  if (leads(leadId)) return toast(`${tokenName(lead)} уже ведёт другого — сначала отвяжите`);

  app.store.dispatch({
    t: 'token.leash', id: folId,
    leash: { to: leadId, by: myKey(), byName: app.me.name },
  });
  app.board.pullFollowers(leadId);
  say(`🔗 ${publicName(fol)} теперь идёт за ${publicName(lead)}`, 'system');
}

/** Кто может снять эту привязку одной кнопкой. */
export function canUnbind(t) {
  if (!t || !t.leash) return false;
  return app.isDM || t.leash.by === myKey() || mine(t);
}

export function unbind(id) {
  const s = app.store.get();
  const t = s.tokens[id];
  if (!canUnbind(t)) return;
  // привязанный без сознания сам не вырвется — его может отпустить ведущий или Мастер
  if (!app.isDM && mine(t) && isDown(t) && t.leash.by !== myKey()) {
    return toast('Без сознания: остаются только броски кубиков');
  }
  const by = t.leash.by;
  const lead = s.tokens[t.leash.to];
  app.store.dispatch({ t: 'token.leash', id });
  if (by !== myKey()) app.store.dispatch({ t: 'bind.ban', key: by, until: Date.now() + BAN_MS });
  say(`🔗 ${publicName(t)} больше не идёт за ${lead ? publicName(lead) : 'ведущим'}`, 'system');
}

/** Кнопка «Отвязать» — для карточки фигурки. */
export function unbindButton(t) {
  const lead = app.store.get().tokens[t.leash.to];
  const b = el('button', 'btn btn-soft btn-sm w-full',
    `🔗 Отвязать: ${tokenName(t)} идёт за ${lead ? tokenName(lead) : 'ведущим'}`);
  b.addEventListener('click', () => { unbind(t.id); $('#token-card').hidden = true; });
  return b;
}

/**
 * Полоска над полем у игрока: чьи связи его касаются — он привязал или его
 * персонажа привязали. Освободиться — одна кнопка прямо здесь.
 */
export function renderLeashBar(s) {
  const bar = $('#leash-bar');
  if (!bar) return;
  const list = app.isDM ? [] : Object.values(s.tokens).filter((t) =>
    t.leash && t.locId === s.activeLoc && canUnbind(t) && s.tokens[t.leash.to]);
  bar.innerHTML = '';
  bar.hidden = !list.length;
  list.forEach((t) => {
    const row = el('div', 'leash-row');
    row.append(el('span', 'leash-txt', `🔗 ${tokenName(t)} идёт за ${tokenName(s.tokens[t.leash.to])}`));
    const b = el('button', 'btn btn-soft btn-sm', 'Отвязать');
    b.addEventListener('click', () => unbind(t.id));
    row.append(b);
    bar.append(row);
  });
  showBanTimer();
}

/** Пока действует запрет, на кнопке инструмента тикает обратный отсчёт. */
let ticking = null;
function showBanTimer() {
  const badge = $('#leash-timer');
  if (!badge) return;
  const left = banLeft();
  badge.hidden = !left;
  badge.textContent = left ? clock(left) : '';
  clearTimeout(ticking);
  if (left) ticking = setTimeout(showBanTimer, 1000);
}
