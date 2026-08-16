// Реестр столов и кабинетов для административной комнаты.
//
// Правила базы разрешают работать только внутри конкретной ветки: перечислить
// всё содержимое rooms нельзя. Поэтому приложение само отмечается в реестре —
// стол при входе, кабинет при заведении и при входе. Админка читает реестр.
//
// Честно: реестр лежит в той же открытой базе, и путь к нему виден в коде
// сайта. Это удобство для владельца стола, а не защита.

import { FIREBASE } from './firebase-config.js';

const REG = FIREBASE.databaseURL ? FIREBASE.databaseURL + '/rooms/admin-registry' : null;
const j = (r) => (r.ok ? r.json() : null);

/** Ключ в базе не может содержать . # $ [ ] / — пути и логины у нас уже чистые. */
const safe = (k) => String(k || '').replace(/[.#$[\]/]/g, '_');

async function put(where, value) {
  if (!REG) return null;
  try {
    return await fetch(`${REG}/${where}.json`, { method: 'PUT', body: JSON.stringify(value) }).then(j);
  } catch { return null; }
}
async function get(where) {
  if (!REG) return null;
  try {
    return await fetch(`${REG}/${where}.json`).then(j);
  } catch { return null; }
}
async function drop(where) {
  if (!REG) return null;
  try {
    return await fetch(`${REG}/${where}.json`, { method: 'DELETE' }).then(j);
  } catch { return null; }
}

export const noteRoom = (path, name, playerKey, dmKey) =>
  put('rooms/' + safe(path), { path, name, playerKey, dmKey, at: Date.now() });

export const noteAccount = (path, login, name) =>
  put('accounts/' + safe(login), { path, login, name, at: Date.now() });

export const listRooms = () => get('rooms').then((v) => Object.values(v || {}));
export const listAccounts = () => get('accounts').then((v) => Object.values(v || {}));

export const forgetRoom = (path) => drop('rooms/' + safe(path));
export const forgetAccount = (login) => drop('accounts/' + safe(login));

/**
 * Путь административной комнаты. Считается из пары логин-пароль, как и всё
 * остальное, но по SHA-256: подобрать такой адрес перебором нереально.
 */
export async function adminPath(login, pass) {
  const data = new TextEncoder().encode('yourtable-admin::' + String(login).trim().toLowerCase() + '::' + pass);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return 'adm-' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Прямой доступ к веткам базы — админке нужно править чужие кабинеты и сносить столы. */
export const dbUrl = (path) => `${FIREBASE.databaseURL}/rooms/${path}.json`;
export const dbGet = (path) => fetch(dbUrl(path)).then(j);
export const dbPut = (path, value) => fetch(dbUrl(path), { method: 'PUT', body: JSON.stringify(value) }).then(j);
export const dbDel = (path) => fetch(dbUrl(path), { method: 'DELETE' }).then(j);
