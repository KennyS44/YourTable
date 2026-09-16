// Общее состояние приложения: один объект на всю страницу.
//
// Его наполняет запуск стола (me, sync, store, board, isDM), а читают все
// остальные модули. Объект один и тот же, поэтому правки видны везде.

export const app = {};

/** Короткие пути к частым действиям: чтобы не писать dispatch руками. */
export const upd = (id, patch) => app.store.dispatch({ t: 'token.update', id, patch });
export const libUpd = (id, patch) => app.store.dispatch({ t: 'lib.update', id, patch });

/** Ключ человека за столом: один и тот же после перезахода и с другого устройства. */
export const nameKey = (n) => String(n || '').trim().toLowerCase();

/** Имя существа глазами читателя: скрытые имена НПС и врагов игрок не видит. */
export function tokenName(t) {
  return (app.isDM || t.namePublic !== false) ? t.name : 'Неизвестное существо';
}
