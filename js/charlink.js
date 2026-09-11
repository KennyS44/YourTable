// Ключ персонажа: витрина листа для Мастера.
//
// Кабинет живёт по адресу из логина и пароля — чужой лист оттуда не достать.
// Поэтому персонаж кладёт свою копию в отдельную ветку, адрес которой и есть
// «ключ персонажа»: игрок диктует ключ Мастеру, Мастер добавляет его у себя и
// видит лист. Ключ знает только тот, кому его дали, — это вся защита.
//
//   rooms/pub-{КЛЮЧ} = {key, name, bg, sheet, at}
//
// Копия односторонняя: игрок пишет, Мастер только читает. Правок Мастера нет
// и быть не должно — лист принадлежит игроку.

import { FIREBASE, useFirebase } from './firebase-config.js';

const BASE = FIREBASE.databaseURL ? FIREBASE.databaseURL + '/rooms/' : null;
const LOCAL = 'dnd.pub.';           // запасной режим: витрина в этом же браузере

/** Буквы без пар-двойников: ноль и О, единица и I в диктовке не путаются. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCharKey() {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const part = (n) => Array.from({ length: n }, pick).join('');
  return part(4) + '-' + part(4);
}

/** В базе ключ — имя узла: приводим к одному виду и чистим запрещённое. */
export const normKey = (k) => String(k || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);

export const isCharKey = (k) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normKey(k));

/** Витрина — только то, что Мастеру нужно видеть: лист, имя и картинка. */
const shot = (ch) => ({
  key: ch.key,
  name: ch.name || 'Безымянный',
  bg: ch.bg || '',
  sheet: ch.sheet,
  at: Date.now(),
});

export async function publishChar(ch) {
  if (!ch || !isCharKey(ch.key)) return false;
  const body = JSON.stringify(shot(ch));
  if (!useFirebase) {
    localStorage.setItem(LOCAL + normKey(ch.key), body);
    return true;
  }
  try {
    const r = await fetch(`${BASE}pub-${normKey(ch.key)}.json`, { method: 'PUT', body });
    return r.ok;
  } catch { return false; }
}

export async function loadChar(key) {
  const k = normKey(key);
  if (!isCharKey(k)) return null;
  if (!useFirebase) return JSON.parse(localStorage.getItem(LOCAL + k) || 'null');
  try {
    const r = await fetch(`${BASE}pub-${k}.json`);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

/**
 * Следим за листом: Firebase по REST умеет поток событий, EventSource сам
 * просит text/event-stream. Без базы просто спрашиваем локальную копию.
 * Возвращаем функцию, которая закрывает подписку.
 */
export function watchChar(key, onChange) {
  const k = normKey(key);
  if (!isCharKey(k)) return () => {};
  if (!useFirebase) {
    const tick = () => onChange(JSON.parse(localStorage.getItem(LOCAL + k) || 'null'));
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }
  const es = new EventSource(`${BASE}pub-${k}.json`);
  const take = (e) => {
    try {
      const msg = JSON.parse(e.data);
      // put отдаёт лист целиком, patch — изменённые поля; нам хватает перечитать
      if (msg && msg.path === '/') onChange(msg.data);
      else loadChar(k).then(onChange);
    } catch { /* keep-alive и прочий служебный шум */ }
  };
  es.addEventListener('put', take);
  es.addEventListener('patch', take);
  return () => es.close();
}
