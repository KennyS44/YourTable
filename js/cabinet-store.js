// Хранилище личного кабинета.
//
// Настоящей проверки пароля без сервера не бывает, поэтому кабинет живёт по
// тому же принципу, что и комната: путь в базе выводится из логина и пароля.
// Знаешь пару — попадаешь в свой кабинет с любого устройства; не знаешь —
// не знаешь и пути. Пароль в базе не хранится.
//
//   rooms/cab-{логин}-{отпечаток}/profile = {login, name, at}
//   rooms/cab-{логин}-{отпечаток}/chars   = {id -> персонаж}
//
// Ветка именно rooms: правила базы открыты только для неё, а менять их —
// идти в консоль Firebase. Префикс cab- разводит кабинеты и столы.

import { FIREBASE, useFirebase } from './firebase-config.js';
import { roomFingerprint } from './sync-firebase.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';

export const slug = (s) => String(s || '').trim().toLowerCase()
  .replace(/\s+/g, '-').replace(/[^\wа-яё-]/gi, '').slice(0, 40);

export const userPath = (login, pass) => slug(login) + '-' + roomFingerprint(slug(login), pass);

/** Облачный кабинет: те же методы, что и у запасного локального. */
async function cloudStore(path) {
  const [{ initializeApp }, db] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-database.js'),
  ]);
  const database = db.getDatabase(initializeApp(FIREBASE, 'cabinet'));
  const R = (p) => db.ref(database, 'rooms/cab-' + path + (p ? '/' + p : ''));
  return {
    mode: 'firebase',
    async load() {
      const snap = await db.get(R(''));
      return snap.exists() ? snap.val() : null;
    },
    saveProfile: (profile) => db.set(R('profile'), clean(profile)),
    saveChar: (ch) => db.set(R('chars/' + ch.id), clean(ch)),
    removeChar: (id) => db.remove(R('chars/' + id)),
  };
}

/** Запасной кабинет — в этом браузере. Работает, пока не настроен Firebase. */
function localStore(path) {
  const key = 'dnd.cab.' + path;
  const read = () => JSON.parse(localStorage.getItem(key) || 'null');
  const write = (v) => localStorage.setItem(key, JSON.stringify(v));
  return {
    mode: 'local',
    async load() { return read(); },
    async saveProfile(profile) { write({ ...(read() || {}), profile }); },
    async saveChar(ch) {
      const all = read() || {};
      write({ ...all, chars: { ...(all.chars || {}), [ch.id]: ch } });
    },
    async removeChar(id) {
      const all = read() || {};
      const chars = { ...(all.chars || {}) };
      delete chars[id];
      write({ ...all, chars });
    },
  };
}

export function openStore(path) {
  return useFirebase ? cloudStore(path) : Promise.resolve(localStore(path));
}

/** База не принимает undefined и не хранит пустые объекты. */
function clean(v) {
  return JSON.parse(JSON.stringify(v, (k, val) => (val === undefined ? null : val)));
}

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
