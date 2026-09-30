const DB_NAME = 'tabletop-audio';
const DB_VERSION = 1;
const FADE_MS = 450;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const id = () => crypto.randomUUID();
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('games', { keyPath: 'id' });
    db.createObjectStore('audio', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function store(name, mode, action) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const req = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const allGames = () => store('games', 'readonly', s => s.getAll());
const getGame = key => store('games', 'readonly', s => s.get(key));
const saveGame = game => store('games', 'readwrite', s => s.put(game));
const allAudio = () => store('audio', 'readonly', s => s.getAll());
const getAudio = key => store('audio', 'readonly', s => s.get(key));
const saveAudio = item => store('audio', 'readwrite', s => s.put(item));
const deleteAudio = key => store('audio', 'readwrite', s => s.delete(key));

const state = { games: [], currentGame: null, editingGame: null, editingOrigin: null, pendingKind: null, audio: [], players: new Map(), objectUrls: new Map(), repeatTimers: new Map(), toastTimer: null };
const libraryView = $('#library-view');
const boardView = $('#board-view');
const gameDialog = $('#game-dialog');
const deleteDialog = $('#delete-dialog');
const form = $('#game-form');
const picker = $('#audio-picker');
function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('visible');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove('visible'), 3200);
}
function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    return;
  }
  dialog.setAttribute('open', '');
  dialog.setAttribute('aria-modal', 'true');
  dialog.classList.add('is-open');
  document.body.classList.add('has-open-dialog');
}
function closeDialog(dialog, returnValue = '') {
  if (typeof dialog.close === 'function') {
    dialog.close(returnValue);
    return;
  }
  dialog.returnValue = returnValue;
  dialog.removeAttribute('open');
  dialog.removeAttribute('aria-modal');
  dialog.classList.remove('is-open');
  document.body.classList.remove('has-open-dialog');
}
function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function trackTitle(item) { return item.displayName || item.name; }
function fileTitle(name) { return name.replace(/\.[^.]+$/, ''); }
function stopRepeat(audioId) {
  clearInterval(state.repeatTimers.get(audioId));
  state.repeatTimers.delete(audioId);
  const player = state.players.get(audioId);
  if (player && !player.loop) stopPlayer(audioId, true);
  const row = $(`[data-audio-id="${CSS.escape(audioId)}"]`);
  if (row) { row.classList.remove('is-playing'); $('.sound-play', row).textContent = '▶'; }
}
function displayLibrary() {
  libraryView.hidden = false; boardView.hidden = true; state.currentGame = null;
  renderGames();
}
async function renderGames() {
  state.games = await allGames();
  $('#game-count').textContent = String(state.games.length).padStart(2, '0');
  $('#empty-state').hidden = state.games.length > 0;
  $('#games-grid').hidden = state.games.length === 0;
  $('#games-grid').innerHTML = '';
  const sounds = await allAudio();
  for (const game of state.games.sort((a, b) => a.created - b.created)) {
    const gameSounds = sounds.filter(item => item.gameId === game.id);
    const soundtrackCount = gameSounds.filter(item => item.kind === 'ambience').length;
    const effectCount = gameSounds.filter(item => item.kind === 'effect').length;
    const card = document.createElement('article');
    card.className = 'game-card';
    card.innerHTML = `<button class="game-card-open" type="button" aria-hidden="true" tabindex="-1"></button><div class="game-card-top"><button class="game-dots" type="button" aria-label="Редагувати сетап" title="Редагувати назву й опис">···</button></div><h3 aria-hidden="true"></h3><p aria-hidden="true"></p><div class="game-card-foot" aria-hidden="true"><span class="game-card-stat"><b>${String(soundtrackCount).padStart(2, '0')}</b><small>САУНДТРЕКІВ</small></span><span class="game-card-stat"><b>${String(effectCount).padStart(2, '0')}</b><small>ЕФЕКТІВ</small></span></div>`;
    $('.game-card-open', card).setAttribute('aria-label', `Відкрити сетап ${game.name}: ${soundtrackCount} саундтреків, ${effectCount} ефектів`);
    $('h3', card).textContent = game.name; $('p', card).textContent = game.note || '';
    $('.game-card-open', card).addEventListener('click', () => openBoard(game.id));
    $('.game-dots', card).addEventListener('click', () => openGameDialog(game));
    $('#games-grid').append(card);
  }
}
async function openBoard(gameId) {
  const game = await getGame(gameId); if (!game) return displayLibrary();
  state.currentGame = game; libraryView.hidden = true; boardView.hidden = false;
  $('#board-title').textContent = game.name; $('#board-description').textContent = game.note || '';
  await renderSoundboard();
}
async function renderSoundboard() {
  const sounds = (await allAudio()).filter(item => item.gameId === state.currentGame.id);
  state.audio = sounds;
  const ambience = sounds.filter(item => item.kind === 'ambience');
  const effects = sounds.filter(item => item.kind === 'effect');
  $('#ambience-count').textContent = String(ambience.length).padStart(2, '0');
  $('#effect-count').textContent = String(effects.length).padStart(2, '0');
  renderList($('#ambience-list'), ambience, false);
  renderList($('#effects-list'), effects, true);
}
function renderList(container, items, isEffect) {
  container.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'sound-row sound-empty'; empty.setAttribute('aria-label', isEffect ? 'Додати звуковий ефект' : 'Додати саундтрек');
    empty.innerHTML = `<span class="sound-play" aria-hidden="true">${isEffect ? '✦' : '♪'}</span><div class="sound-meta"><strong>${isEffect ? 'Додайте перші звукові ефекти' : 'Додайте атмосферний трек'}</strong><small>АУДІО З ВАШОГО ПРИСТРОЮ</small></div>`;
    empty.addEventListener('click', () => { state.pendingKind = isEffect ? 'effect' : 'ambience'; picker.click(); }); container.append(empty); return;
  }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'sound-row'; row.dataset.audioId = item.id;
    row.innerHTML = `<button class="sound-play" aria-label="${isEffect ? 'Відтворити ефект' : 'Відтворити або призупинити атмосферу'}">▶</button><div class="sound-meta"><strong></strong><small>${isEffect ? `ЕФЕКТ · ${formatSize(item.size)}` : formatSize(item.size)}</small></div><div class="row-actions">${isEffect ? '' : '<button class="row-action stop-audio" aria-label="Зупинити й повернути на початок" title="Зупинити">■</button>'}<button class="row-action rename-audio" aria-label="Перейменувати аудіо" title="Перейменувати">✎</button>${isEffect ? '<button class="row-action stop-effect" aria-label="Зупинити ефект" title="Зупинити">■</button>' : ''}<button class="row-action remove-audio" aria-label="Видалити аудіо" title="Видалити">×</button></div>`;
    $('strong', row).textContent = trackTitle(item);
    $('.sound-play', row).addEventListener('click', () => isEffect ? playEffect(item) : toggleAmbience(item, row));
    $('.rename-audio', row).addEventListener('click', async () => {
      const nextName = window.prompt('Назва саундтреку', trackTitle(item));
      if (nextName === null) return;
      const displayName = nextName.trim();
      if (!displayName) { toast('Назва не може бути порожньою.'); return; }
      await saveAudio({ ...item, displayName }); await renderSoundboard();
    });
    $('.stop-effect', row)?.addEventListener('click', () => stopRepeat(item.id));
    if (isEffect) {
      const repeat = document.createElement('label'); repeat.className = 'effect-repeat';
      repeat.innerHTML = `<span>Повтор</span><select aria-label="Інтервал повтору"><option value="">Вимкнено</option><option value="3">3 с</option><option value="5">5 с</option><option value="7">7 с</option><option value="10">10 с</option><option value="custom">Власний</option></select><input class="repeat-value" type="number" min="0.01" step="any" aria-label="Власний інтервал"><select class="repeat-unit" aria-label="Одиниця інтервалу"><option value="seconds">сек</option><option value="minutes">хв</option></select>`;
      const select = $('select', repeat); const valueInput = $('.repeat-value', repeat); const unitSelect = $('.repeat-unit', repeat);
      if (item.repeatIntervalSec) { select.value = ['3', '5', '7', '10'].includes(String(item.repeatIntervalSec)) ? String(item.repeatIntervalSec) : 'custom'; valueInput.value = item.repeatIntervalValue || item.repeatIntervalSec; unitSelect.value = item.repeatIntervalUnit || 'seconds'; }
      const updateRepeat = async () => {
        valueInput.hidden = select.value !== 'custom'; unitSelect.hidden = select.value !== 'custom';
        let seconds = select.value === 'custom' ? Number(valueInput.value) * (unitSelect.value === 'minutes' ? 60 : 1) : Number(select.value);
        if (select.value === 'custom' && (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2147483)) { if (valueInput.value) toast('Інтервал має бути більшим за нуль і не перевищувати приблизно 24 дні.'); return; }
        const wasRepeating = state.repeatTimers.has(item.id);
        const updated = { ...item, repeatIntervalSec: seconds || null, repeatIntervalValue: select.value === 'custom' ? Number(valueInput.value) : null, repeatIntervalUnit: select.value === 'custom' ? unitSelect.value : null };
        await saveAudio(updated); Object.assign(item, updated);
        if (wasRepeating) {
          clearInterval(state.repeatTimers.get(item.id)); state.repeatTimers.delete(item.id);
          if (seconds) scheduleEffectRepeat(item);
          else stopRepeat(item.id);
        }
      };
      select.value = item.repeatIntervalSec ? (['3', '5', '7', '10'].includes(String(item.repeatIntervalSec)) ? String(item.repeatIntervalSec) : 'custom') : '';
      valueInput.hidden = select.value !== 'custom'; unitSelect.hidden = select.value !== 'custom';
      select.addEventListener('change', updateRepeat); valueInput.addEventListener('change', updateRepeat); unitSelect.addEventListener('change', updateRepeat);
      row.append(repeat);
    }
    $('.stop-audio', row)?.addEventListener('click', async () => {
      const player = state.players.get(item.id);
      if (player) { await fade(player, 0); player.pause(); player.currentTime = 0; player.volume = Number($('#ambience-volume').value) / 100; }
      row.classList.remove('is-playing'); $('.sound-play', row).textContent = '▶';
    });
    $('.remove-audio', row).addEventListener('click', async () => {
      stopRepeat(item.id);
      if (state.players.has(item.id)) stopPlayer(item.id, true);
      await deleteAudio(item.id); await renderSoundboard(); toast('Аудіофайл видалено з цієї гри.');
    });
    container.append(row);
  }
}
function createPlayer(item) {
  const player = new Audio(); player.preload = 'metadata';
  if (!state.objectUrls.has(item.id)) state.objectUrls.set(item.id, URL.createObjectURL(item.blob));
  player.src = state.objectUrls.get(item.id); player.volume = 0;
  state.players.set(item.id, player); return player;
}
function fade(player, target, duration = FADE_MS) {
  const from = player.volume; const started = performance.now();
  return new Promise(resolve => {
    const tick = now => {
      const progress = Math.min(1, (now - started) / duration);
      player.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
      if (progress === 1) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function toggleAmbience(item, row) {
  const current = state.players.get(item.id);
  if (current && !current.paused) { await fade(current, 0); current.pause(); row.classList.remove('is-playing'); $('.sound-play', row).textContent = '▶'; return; }
  for (const [otherId, player] of state.players) {
    if (otherId !== item.id && !player.paused) {
      const otherRow = $(`[data-audio-id="${CSS.escape(otherId)}"]`);
      await fade(player, 0); player.pause();
      if (otherRow) { otherRow.classList.remove('is-playing'); $('.sound-play', otherRow).textContent = '▶'; }
    }
  }
  const player = current || createPlayer(item);
  if (player.ended) player.currentTime = 0;
  player.loop = true;
  player.onended = null;
  player.volume = 0;
  try { await player.play(); await fade(player, Number($('#ambience-volume').value) / 100); row.classList.add('is-playing'); $('.sound-play', row).textContent = 'Ⅱ'; }
  catch { toast('Браузер не зміг відтворити цей файл. Спробуйте інший формат.'); }
}
async function playEffect(item) {
  if (state.repeatTimers.has(item.id)) { stopRepeat(item.id); return; }
  const player = createPlayer(item); player.loop = false;
  player.volume = Number($('#effects-volume').value) / 100;
  const repeating = Number(item.repeatIntervalSec) > 0;
  const row = $(`[data-audio-id="${CSS.escape(item.id)}"]`);
  player.onended = () => {
    if (repeating) { state.players.delete(item.id); URL.revokeObjectURL(state.objectUrls.get(item.id)); state.objectUrls.delete(item.id); return; }
    state.players.delete(item.id); URL.revokeObjectURL(state.objectUrls.get(item.id)); state.objectUrls.delete(item.id);
  };
  try { await player.play(); } catch { state.players.delete(item.id); URL.revokeObjectURL(state.objectUrls.get(item.id)); state.objectUrls.delete(item.id); toast('Не вдалося відтворити звуковий файл.'); return; }
  if (repeating) {
    row?.classList.add('is-playing'); if (row) $('.sound-play', row).textContent = 'Ⅱ';
    scheduleEffectRepeat(item);
  }
}
function scheduleEffectRepeat(item) {
  state.repeatTimers.set(item.id, setInterval(() => {
    const active = state.players.get(item.id);
    if (active && !active.paused) return;
    const next = createPlayer(item); next.loop = false; next.volume = Number($('#effects-volume').value) / 100;
    next.onended = () => { state.players.delete(item.id); URL.revokeObjectURL(state.objectUrls.get(item.id)); state.objectUrls.delete(item.id); };
    next.play().catch(() => { stopRepeat(item.id); toast('Не вдалося відтворити звуковий файл.'); });
  }, Number(item.repeatIntervalSec) * 1000));
}
function stopPlayer(audioId, reset) {
  const player = state.players.get(audioId); if (!player) return;
  player.pause(); if (reset) player.currentTime = 0;
  URL.revokeObjectURL(state.objectUrls.get(audioId)); state.objectUrls.delete(audioId); state.players.delete(audioId);
}
function fadeAll() {
  for (const audioId of state.repeatTimers.keys()) stopRepeat(audioId);
  for (const [audioId, player] of state.players) {
    if (audioId === state.currentGame?.id || player.loop) fade(player, 0).then(() => { player.pause(); player.currentTime = 0; });
  }
}
function openGameDialog(game = null) {
  state.editingGame = game;
  state.editingOrigin = game ? (state.currentGame ? 'board' : 'library') : 'new';
  form.reset();
  $('#dialog-title').textContent = game ? 'Налаштуйте сетап' : 'Створіть сетап';
  $('#save-game').textContent = game ? 'Зберегти зміни' : 'Створити гру';
  $('#delete-game').hidden = !game;
  $('#game-name').value = game?.name || ''; $('#game-note').value = game?.note || '';
  showDialog(gameDialog); $('#game-name').focus();
}
async function onSaveGame(event) {
  event.preventDefault();
  const name = $('#game-name').value.trim(); if (!name) return;
  const existing = state.editingGame;
  const editingOrigin = state.editingOrigin;
  const game = { id: existing?.id || id(), name, note: $('#game-note').value.trim(), created: existing?.created || Date.now() };
  await saveGame(game); closeDialog(gameDialog);
  if (existing && editingOrigin === 'board') { state.currentGame = game; await openBoard(game.id); toast('Зміни збережено.'); }
  else if (existing) { state.editingGame = null; state.editingOrigin = null; await displayLibrary(); toast('Зміни збережено.'); }
  else { await renderGames(); await openBoard(game.id); }
}
async function askDeleteGame() {
  if (!state.editingGame) return;
  $('#delete-warning').textContent = `Буде видалено «${state.editingGame.name}», список звуків і копії аудіофайлів, збережені застосунком для цієї гри. Оригінали на телефоні не зміняться.`;
  closeDialog(gameDialog); showDialog(deleteDialog);
}
async function confirmDelete() {
  const game = state.editingGame; if (!game) return;
  if (deleteDialog.returnValue !== 'confirm') return;
  for (const item of (await allAudio()).filter(entry => entry.gameId === game.id)) {
    stopRepeat(item.id);
    if (state.players.has(item.id)) stopPlayer(item.id, true);
    const url = state.objectUrls.get(item.id); if (url) URL.revokeObjectURL(url);
    state.objectUrls.delete(item.id); await deleteAudio(item.id);
  }
  await store('games', 'readwrite', s => s.delete(game.id));
  closeDialog(deleteDialog); state.editingGame = null; displayLibrary(); toast('Гру та її імпортовані аудіокопії видалено.');
}
async function importFiles(files) {
  const selected = [...files]; if (!selected.length || !state.currentGame) return;
  if (selected.some(file => !file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name))) { toast('Оберіть аудіофайл (наприклад MP3, WAV або M4A).'); return; }
  try {
    const estimate = await navigator.storage?.estimate?.();
    const total = selected.reduce((sum, file) => sum + file.size, 0);
    if (estimate?.quota && estimate.usage + total > estimate.quota * .95) throw new Error('storage');
    const namedFiles = state.pendingKind === 'ambience' ? selected.map(file => ({ file, displayName: window.prompt(`Назва саундтреку для «${file.name}»`, fileTitle(file.name)) })) : selected.map(file => ({ file, displayName: '' }));
    if (namedFiles.some(entry => entry.displayName === null)) return;
    if (namedFiles.some(entry => state.pendingKind === 'ambience' && !entry.displayName.trim())) { toast('Назва саундтреку не може бути порожньою.'); return; }
    for (const { file, displayName } of namedFiles) await saveAudio({ id: id(), gameId: state.currentGame.id, name: file.name, displayName: displayName.trim() || undefined, size: file.size, type: file.type, blob: file, kind: state.pendingKind, imported: Date.now() });
    const persisted = await navigator.storage?.persist?.();
    await renderSoundboard(); await renderGames();
    toast(persisted === false ? 'Аудіо додано. Браузер поки не закріпив локальне сховище.' : `Додано файлів: ${selected.length}.`);
  } catch (error) { console.error(error); toast(error.message === 'storage' ? 'Недостатньо місця на пристрої, щоб зберегти ці файли.' : 'Не вдалося зберегти аудіо. Перевірте вільне місце браузера.'); }
}
function setVolume(kind, value) {
  const volume = Number(value) / 100;
  $(`#${kind}-volume-value`).textContent = `${value}%`;
  for (const player of state.players.values()) {
    if ((kind === 'ambience' && player.loop) || (kind === 'effects' && !player.loop)) player.volume = volume;
  }
}
function setupAudioInterruptions() {
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseAmbienceForInterruption(); for (const audioId of state.repeatTimers.keys()) stopRepeat(audioId); } });
  window.addEventListener('blur', () => { if (document.hidden) pauseAmbienceForInterruption(); });
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    const context = new AudioContext();
    document.addEventListener('pointerdown', () => { if (context.state === 'suspended') context.resume().catch(() => {}); }, { passive: true });
    // Browser interruption events vary by Android version; visibility handling provides a safe manual-resume fallback.
    context.addEventListener?.('statechange', () => { if (context.state === 'interrupted') pauseAmbienceForInterruption(); });
  }
}
function pauseAmbienceForInterruption() {
  for (const [audioId, player] of state.players) {
    if (!player.loop || player.paused) continue;
    fade(player, 0).then(() => player.pause());
    const row = $(`[data-audio-id="${CSS.escape(audioId)}"]`);
    if (row) { row.classList.remove('is-playing'); $('.sound-play', row).textContent = '▶'; }
  }
}

$('#new-game').addEventListener('click', () => openGameDialog());
$('#empty-new-game').addEventListener('click', () => openGameDialog());
$('#edit-game').addEventListener('click', () => openGameDialog(state.currentGame));
$('#back-to-library').addEventListener('click', () => { fadeAll(); displayLibrary(); });
form.addEventListener('submit', onSaveGame);
$$('.dialog-close,.cancel-dialog').forEach(button => button.addEventListener('click', () => closeDialog(gameDialog)));
$('#delete-game').addEventListener('click', askDeleteGame);
$('#delete-dialog button[value="cancel"]').addEventListener('click', event => { event.preventDefault(); closeDialog(deleteDialog, 'cancel'); });
$('#confirm-delete').addEventListener('click', event => { event.preventDefault(); deleteDialog.returnValue = 'confirm'; closeDialog(deleteDialog, 'confirm'); confirmDelete(); });
$$('.add-audio').forEach(button => button.addEventListener('click', () => { state.pendingKind = button.dataset.kind; picker.click(); }));
picker.addEventListener('change', async () => { await importFiles(picker.files); picker.value = ''; });
$('#ambience-volume').addEventListener('input', event => setVolume('ambience', event.target.value));
$('#effects-volume').addEventListener('input', event => setVolume('effects', event.target.value));
window.addEventListener('beforeunload', () => { for (const url of state.objectUrls.values()) URL.revokeObjectURL(url); });
setupAudioInterruptions();
if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (deleteDialog.open) closeDialog(deleteDialog, 'cancel');
    else if (gameDialog.open) closeDialog(gameDialog);
  });
}
try {
  await dbPromise;
  await renderGames();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(console.warn);
  }
}
catch (error) { console.error(error); toast('Не вдалося відкрити локальне сховище браузера.'); }
