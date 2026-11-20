// Музыка за столом.
//
// Мастер загружает треки (до 20 МБ), они уходят в базу кусками и у каждого
// оседают в своём хранилище после первой загрузки. Что играет, с какого места
// и с какой общей громкостью — общее состояние комнаты (s.music), поэтому трек
// у всех идёт с одного места, и опоздавший слышит его оттуда же.
//
// Громкость у каждого своя: итог = общая громкость Мастера × своя громкость.
// Своя хранится только в этом браузере и никуда не уходит.

import { app } from './app-state.js';
import { uid } from './store.js';
import { $, el, toast } from './ui.js';

const MAX_BYTES = 20 * 1024 * 1024;
const FREE_DB = 1024 * 1024 * 1024;       // бесплатный объём Realtime Database
const DRIFT = 1.5;                        // на сколько секунд можно разойтись с остальными
const MY_VOL = 'dnd.musicVol', MY_MUTE = 'dnd.musicMute';

const audio = new Audio();
audio.preload = 'auto';
let loadedId = null;          // какой трек сейчас стоит в плеере
let loadingId = null;
let objUrl = null;
let blocked = false;          // браузер не дал играть без щелчка по странице
let status = '';              // «загружается 40%», «файл не найден»

// пока браузер держит в кэше прежний store.js, музыки в состоянии нет — молчим, а не падаем
const NONE = { tracks: [], now: null, vol: 0.8, loop: true };
const music = () => app.store.get().music || NONE;
const serverNow = () => (app.sync.now ? app.sync.now() : Date.now());
const myVol = () => { const v = parseFloat(localStorage.getItem(MY_VOL)); return Number.isFinite(v) ? v : 1; };
const isMuted = () => localStorage.getItem(MY_MUTE) === '1';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const trackOf = (m) => m.now && m.tracks.find((t) => t.id === m.now.id);
const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);

/** Где сейчас трек у всех, секунд. Без повтора может перевалить за конец. */
function position(m, track) {
  const n = m.now;
  let t = n.pos || 0;
  if (n.playing) t += (serverNow() - n.at) / 1000;
  const dur = track.dur || audio.duration || 0;
  return dur && m.loop ? t % dur : t;
}
const ended = (m, track) => !m.loop && track.dur > 0 && position(m, track) >= track.dur;

function setVolume(m) {
  audio.volume = isMuted() ? 0 : clamp01((m.vol ?? 0.8) * myVol());
}

/* ───────────────────────── Плеер ───────────────────────── */

async function load(track) {
  if (loadingId === track.id) return false;
  loadingId = track.id;
  status = 'Загружается…';
  renderPop();
  const blob = await Promise.resolve()
    .then(() => app.sync.getAudio(track, (p) => { status = `Загружается ${Math.round(p * 100)}%`; renderPop(); }))
    .catch(() => null);
  loadingId = null;
  if (!blob) { status = 'Файл трека не найден'; renderPop(); return false; }
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(blob);
  audio.src = objUrl;
  loadedId = track.id;
  status = '';
  return true;
}

function unload() {
  audio.pause();
  if (!loadedId) return;
  audio.removeAttribute('src');
  audio.load();
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = null;
  loadedId = null;
}

/** Привести свой плеер к общему состоянию: тот же трек, то же место, пауза или звук. */
async function follow() {
  const m = music();
  setVolume(m);
  const track = trackOf(m);
  if (!track) { unload(); status = ''; renderPop(); return; }
  if (loadedId !== track.id) {
    audio.pause();
    if (!(await load(track))) return;
    return follow();                 // пока грузили, Мастер мог всё поменять
  }
  audio.loop = !!m.loop;
  const t = position(m, track);
  if (!m.now.playing || ended(m, track)) {
    audio.pause();
    if (!m.now.playing && Math.abs(audio.currentTime - t) > 0.3) audio.currentTime = t;
    renderPop();
    return;
  }
  if (Math.abs(audio.currentTime - t) > DRIFT) audio.currentTime = t;
  if (audio.paused) {
    audio.play().then(() => { blocked = false; renderPop(); }).catch((e) => {
      if (e.name === 'NotAllowedError') { blocked = true; renderPop(); }
    });
  }
  renderPop();
}

/* ───────────────────────── Своя громкость ───────────────────────── */

function renderPop() {
  const m = music();
  const track = trackOf(m);
  const btn = $('#btn-music');
  btn.hidden = !track;
  btn.classList.toggle('is-alert', blocked);
  btn.textContent = blocked ? '♪ Включить звук' : (isMuted() ? '♪ Без звука' : '♪');
  if (!track) { $('#music-pop').hidden = true; return; }
  $('#music-now').textContent = track.name;
  $('#music-state').textContent = status
    || (blocked ? 'Браузер ждёт щелчка — нажмите «Включить звук»'
      : !m.now.playing ? 'Пауза' : ended(m, track) ? 'Трек закончился' : 'Играет');
  const r = $('#music-my-vol');
  if (document.activeElement !== r) r.value = Math.round(myVol() * 100);
  $('#music-my-val').textContent = Math.round(myVol() * 100) + '%';
  $('#music-mute').textContent = isMuted() ? 'Включить звук' : 'Без звука';
}

/* ───────────────────────── Пульт Мастера ───────────────────────── */

function setNow(playing, pos, id) {
  app.store.dispatch({ t: 'music.set', patch: { now: { id, playing, pos, at: serverNow() } } });
}

function toggle(track) {
  const m = music();
  const cur = m.now && m.now.id === track.id;
  if (!cur || ended(m, track)) return setNow(true, 0, track.id);
  if (m.now.playing) return setNow(false, position(m, track), track.id);
  return setNow(true, m.now.pos || 0, track.id);
}

async function remove(track) {
  if (!confirm(`Удалить трек «${track.name}» со стола?`)) return;
  app.store.dispatch({ t: 'music.remove', id: track.id });
  await app.sync.delAudio(track).catch(() => {});
}

function renderList(s) {
  const m = s.music || NONE;
  const list = $('#music-list');
  list.innerHTML = '';
  if (!m.tracks.length) list.append(el('p', 'hint', 'Треков пока нет.'));
  m.tracks.forEach((track) => {
    const cur = m.now && m.now.id === track.id;
    const playing = cur && m.now.playing && !ended(m, track);
    const row = el('div', 'music-row' + (cur ? ' is-current' : ''));
    const play = el('button', 'icon-btn music-play', playing ? '❚❚' : '▶');
    play.title = playing ? 'Пауза' : 'Играть у всех';
    play.addEventListener('click', () => toggle(track));
    const name = el('div', 'music-name');
    name.append(el('span', 'music-title', track.name), el('span', 'music-meta', `${clock(track.dur)} · ${mb(track.size)} МБ`));
    const del = el('button', 'icon-btn music-del', '×');
    del.title = 'Удалить трек';
    del.addEventListener('click', () => remove(track));
    row.append(play, name, del);
    list.append(row);
  });
  $('#music-stop').disabled = !m.now;
  $('#music-loop').checked = !!m.loop;
  const r = $('#music-vol');
  if (document.activeElement !== r) r.value = Math.round((m.vol ?? 0.8) * 100);
  $('#music-vol-val').textContent = Math.round((m.vol ?? 0.8) * 100) + '%';
  // в базе куски лежат в base64 — это на треть больше самого файла
  const used = m.tracks.reduce((a, t) => a + t.size * 4 / 3, 0);
  $('#music-used').textContent = `Музыка занимает ${mb(used)} МБ из 1 ГБ бесплатной базы (${(used / FREE_DB * 100).toFixed(1)}%).`;
}

/** Длительность файла; -1 — браузер такой звук не играет. */
function duration(file) {
  return new Promise((res) => {
    const a = new Audio();
    const u = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(u); res(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(-1);
    a.src = u;
  });
}

async function upload(files) {
  const bar = $('#music-progress');
  for (const f of files) {
    if (f.size > MAX_BYTES) { toast(`«${f.name}» весит ${mb(f.size)} МБ — можно до 20 МБ`); continue; }
    const dur = await duration(f);
    if (dur < 0) { toast(`«${f.name}» браузер не может проиграть — нужен mp3, ogg или m4a`); continue; }
    const id = uid('mus');
    const name = f.name.replace(/\.[^.]+$/, '').slice(0, 80);
    bar.hidden = false;
    bar.textContent = `Загружается «${name}»: 0%`;
    try {
      const n = await app.sync.putAudio(id, f, (p) => { bar.textContent = `Загружается «${name}»: ${Math.round(p * 100)}%`; });
      app.store.dispatch({
        t: 'music.add',
        track: { id, name, type: f.type || 'audio/mpeg', size: f.size, n, dur: Math.round(dur * 10) / 10 },
      });
    } catch (e) {
      toast(`«${name}» не загрузился: ${e.message || e}`);
      app.sync.delAudio({ id, n: Math.ceil(f.size / (768 * 1024)) }).catch(() => {});
    }
  }
  bar.hidden = true;
}

/* ───────────────────────── Запуск ───────────────────────── */

export function initMusic() {
  // окно для проверок: что на самом деле играет у этого человека
  window.__music = () => ({ id: loadedId, t: audio.currentTime, vol: audio.volume, paused: audio.paused, blocked });
  const pop = $('#music-pop');
  $('#btn-music').addEventListener('click', (e) => {
    e.stopPropagation();
    if (blocked) {
      // щелчок — то самое разрешение браузера: играем прямо из него
      audio.play().then(() => { blocked = false; renderPop(); }).catch(() => {});
      return;
    }
    pop.hidden = !pop.hidden;
    renderPop();
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target.id !== 'btn-music') pop.hidden = true;
  });
  $('#music-my-vol').addEventListener('input', (e) => {
    localStorage.setItem(MY_VOL, String(e.target.value / 100));
    setVolume(music());
    renderPop();
  });
  $('#music-mute').addEventListener('click', () => {
    localStorage.setItem(MY_MUTE, isMuted() ? '0' : '1');
    setVolume(music());
    renderPop();
  });

  if (app.isDM) {
    $('#music-upload').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      await upload(files);
    });
    $('#music-stop').addEventListener('click', () => app.store.dispatch({ t: 'music.stop' }));
    $('#music-loop').addEventListener('change', (e) => {
      const m = music();
      const track = trackOf(m);
      const patch = { loop: e.target.checked };
      // переставляем отсчёт на «сейчас», иначе смена повтора дёрнет трек на другое место
      if (track) patch.now = { ...m.now, pos: position(m, track), at: serverNow() };
      app.store.dispatch({ t: 'music.set', patch });
    });
    // пока тянешь ползунок — слышишь сам, всем уходит, когда отпустил
    $('#music-vol').addEventListener('input', (e) => {
      const v = e.target.value / 100;
      $('#music-vol-val').textContent = e.target.value + '%';
      setVolume({ vol: v });
    });
    $('#music-vol').addEventListener('change', (e) => {
      app.store.dispatch({ t: 'music.set', patch: { vol: e.target.value / 100 } });
    });
  }

  app.store.subscribe((s, a) => {
    if (a && !String(a.t).startsWith('music.') && a.t !== 'state.replace') return;
    if (app.isDM) renderList(s);
    follow();
  });
  // часы у всех идут чуть по-разному: раз в пять секунд сверяемся.
  // Заодно у Мастера ▶ возвращается, когда трек без повтора доиграл.
  let wasEnded = false;
  setInterval(() => {
    follow();
    const m = music(), track = trackOf(m);
    const now = !!track && ended(m, track);
    if (app.isDM && now !== wasEnded) renderList(app.store.get());
    wasEnded = now;
  }, 5000);
  if (app.isDM) renderList(app.store.get());
  follow();
}
