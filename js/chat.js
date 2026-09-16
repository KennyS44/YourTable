// Лента стола: разговор, служебные строки, броски и применённые приёмы.

import { app } from './app-state.js';
import { uid } from './store.js';
import { $, el, esc } from './ui.js';

// Что сейчас лежит в ленте, по порядку. Кроме renderChat в ленту никто не пишет.
let chatIds = [];

/**
 * Разговор, служебные строки и броски идут одной лентой; фильтр прячет лишнее.
 *
 * Лента дописывается, а не пересобирается заново. Перерисовка панелей идёт на
 * каждое действие за столом, и полная сборка трёхсот сообщений стоила 53 мс —
 * даже когда действие чата не касалось вовсе. Теперь общее начало остаётся на
 * месте, а трогаются только ушедшие сверху и пришедшие снизу.
 */
export function renderChat(s) {
  const feed = $('#chat-feed');
  const нужны = s.chat.filter((m) => !m.secret || app.isDM);
  const ids = нужны.map((m) => m.id);

  // у чата есть потолок: самые старые сообщения уходят с начала
  const место = ids.length && chatIds.length ? chatIds.indexOf(ids[0]) : 0;
  const срез = место > 0 ? место : 0;
  const хвост = chatIds.slice(срез);
  const продолжение = хвост.length <= ids.length && хвост.every((id, i) => id === ids[i]);

  // мерим до правки: если игрок отлистал ленту назад, не дёргаем его вниз
  const уНиза = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

  if (!продолжение) {
    feed.innerHTML = '';
    нужны.forEach((m) => feed.append(msgNode(m)));
  } else {
    for (let i = 0; i < срез && feed.firstChild; i++) feed.firstChild.remove();
    for (let i = хвост.length; i < нужны.length; i++) feed.append(msgNode(нужны[i]));
  }
  const добавили = !продолжение || нужны.length > хвост.length;
  chatIds = ids;
  if (добавили && уНиза) feed.scrollTop = feed.scrollHeight;
}

function msgNode(m) {
  const d = el('div', `msg ${m.kind}${m.secret ? ' secret' : ''}`);
  const time = new Date(m.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (m.kind === 'roll') {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span>
      <div class="body">${m.secret ? '🤫 ' : ''}${m.roll.label ? `<span class="roll-what">${esc(m.roll.label)}</span> ` : ''}${esc(m.roll.formula)} → <span class="total">${m.roll.total}</span>
      <span style="color:var(--muted);font-size:14px"> [${m.roll.dice.join(', ')}]${m.roll.mod ? ` ${m.roll.mod > 0 ? '+' : ''}${m.roll.mod}` : ''}</span></div>`;
  } else if (m.kind === 'use') {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span>`
      + `<div class="body">${useBody(m.use)}</div>`;
  } else if (m.kind === 'system') {
    d.innerHTML = `<div class="body">${esc(m.text)}</div>`;
  } else {
    d.innerHTML = `<span class="time">${time}</span><span class="who">${esc(m.name)}</span><div class="body">${esc(m.text)}</div>`;
  }
  return d;
}

/**
 * Применённый приём в ленте. КД цели — число Мастера: столу показываем только
 * «пробил броню» или «не пробил», а само КД видит лишь Мастер.
 */
function useBody(u) {
  if (!u) return '';
  const кто = u.by ? `${esc(u.by)} — ` : '';
  const строки = [`${кто}<b class="roll-what">${esc(u.name)}</b> → ${esc(u.targets.join(', '))}`];
  if (u.attack) {
    const a = u.attack;
    // при двух костях видно, какая пошла в счёт: [17, 4] → взяли 17
    const кости = a.adv ? `[${a.dice.join(', ')}] → взяли ${a.kept}` : `[${a.dice.join(', ')}]`;
    строки.push(`атака ${esc(a.formula)} → <span class="total">${a.total}</span>`
      + `<span class="use-dim"> ${кости}</span>`
      + (app.isDM ? `<span class="use-dim"> против КД ${a.vs}</span>` : ''));
    строки.push(a.crit ? '<span class="use-crit">двадцатка — критический удар, урон вдвое</span>'
      : a.hit ? '<span class="use-hit">пробил броню</span>' : '<span class="use-miss">не пробил</span>');
  }
  if (u.save) {
    строки.push(`спасбросок ${esc(u.save.abil)}${app.isDM ? `, сложность ${u.save.dc}` : ''}`
      + `<span class="use-dim"> при успехе ${u.save.onSave === 'half' ? 'половина' : 'ничего'}</span>`);
    (u.saves || []).forEach((sv) => {
      const прибавка = sv.mod ? ` ${sv.mod > 0 ? '+' : '−'}${Math.abs(sv.mod)}` : '';
      строки.push(`<span class="use-dim">${esc(sv.name)}: [${sv.dice.join(', ')}]${прибавка} → ${sv.total} — </span>`
        + (sv.ok ? '<span class="use-hit">отбился</span>' : '<span class="use-miss">не отбился</span>'));
    });
  }
  if (u.dmg) {
    const куски = u.dmg.parts
      .map((p) => `${p.n}д${p.d}${p.type ? ' ' + esc(p.type) : ''}<span class="use-dim"> [${p.dice.join(', ')}]</span>`)
      .join(' + ');
    строки.push(`${куски} → <span class="total">${u.dmg.total}</span>`
      + (u.dmg.crit ? '<span class="use-dim"> (уже вдвое)</span>' : ''));
  }
  // хиты уже сняты: строка говорит, чем дело кончилось. Полоску чужих хитов
  // игрокам показывать нельзя, поэтому остаток видит только Мастер и хозяин
  if (u.landed) {
    u.landed.forEach((l) => {
      const знак = l.delta > 0 ? '+' : '−';
      const остаток = (app.isDM || l.pub) ? `, осталось ${l.left} из ${l.max}` : '';
      // ноль бывает у неуязвимого: «−0» читается как опечатка, пишем словами
      const число = l.delta === 0 ? 'урон не прошёл' : `${знак}${Math.abs(l.delta)}`;
      строки.push(`<span class="${l.delta > 0 ? 'use-hit' : 'use-miss'}">${esc(l.name)}: ${число}</span>`
        + (l.why ? `<span class="use-dim"> (${esc(l.why)})</span>` : '')
        + `<span class="use-dim">${остаток}</span>`
        + (l.down ? '<span class="use-miss"> — свалился</span>' : ''));
    });
  }
  if (u.conc) строки.push('<span class="use-dim">требует концентрации</span>');
  return строки.map((s) => `<div class="use-line">${s}</div>`).join('');
}

export function say(text, kind = 'chat', extra = {}) {
  app.store.dispatch({
    t: 'chat.add',
    msg: { id: uid('m'), ts: Date.now(), by: app.me.id, name: app.me.name, kind, text, ...extra },
  });
}

/** Подпись под кубиками: у броска из листа впереди стоит название характеристики. */
export function rollCaption(name, r, secret) {
  return `${name}: ${r.label ? r.label + ' · ' : ''}${r.formula}${secret ? ' · тайно' : ''}`;
}
