// Имя для скачиваемого файла.
//
// Chromium молча выбрасывает атрибут download, если в нём нерусская для него
// кириллица, и сохраняет файл как «download» без расширения. Поэтому имя
// переводим в латиницу — «Торин Дубощит» становится «Torin Duboshchit».

const МАП = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Латинское имя файла: пробелы сохраняем, запрещённые знаки убираем. */
export function fileName(name, fallback = 'file', ext = '.json') {
  const out = [...String(name || '')].map((ch) => {
    const low = ch.toLowerCase();
    if (МАП[low] === undefined) return ch;
    const lat = МАП[low];
    return ch === low ? lat : lat.charAt(0).toUpperCase() + lat.slice(1);
  }).join('');
  const clean = out.replace(/[^\w \-.]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return (clean || fallback) + ext;
}
