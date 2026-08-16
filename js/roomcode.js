// Код комнаты — одна строка вместо пары «название + ключ».
// Мастер копирует её в панели «Комната», игрок вводит в комнате ожидания.

/** Кодируем в base64url: строка без пробелов, её удобно переслать в чат. */
export function packRoom(name, key) {
  const json = JSON.stringify([String(name || ''), String(key || '')]);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Обратно. Вернёт null, если строка не наш код. */
export function unpackRoom(code) {
  try {
    const b64 = String(code || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const [name, key] = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return name && key ? { name, key } : null;
  } catch {
    return null;
  }
}
