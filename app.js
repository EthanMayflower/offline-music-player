
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

const audio = document.querySelector("#audio");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const songList = document.querySelector("#songList");
const searchInput = document.querySelector("#searchInput");
const songCount = document.querySelector("#songCount");
const sortSelect = document.querySelector("#sortSelect");
const totalSongs = document.querySelector("#totalSongs");
const totalStorage = document.querySelector("#totalStorage");
const totalPlaytime = document.querySelector("#totalPlaytime");
const coverWrap = document.querySelector(".cover-wrap");
const coverArt = document.querySelector("#coverArt");
const coverFallback = document.querySelector("#coverFallback");
const songTitle = document.querySelector("#songTitle");
const songCreator = document.querySelector("#songCreator");
const albumName = document.querySelector("#albumName");
const currentTime = document.querySelector("#currentTime");
const duration = document.querySelector("#duration");
const progress = document.querySelector("#progress");
const playBtn = document.querySelector("#playBtn");
const playIcon = document.querySelector("#playIcon");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const shuffleBtn = document.querySelector("#shuffleBtn");
const volume = document.querySelector("#volume");

const state = { songs: [], filteredIds: [], currentId: null, shuffle: false, objectUrls: new Set() };

fileInput.addEventListener("change", (event) => { addFiles([...event.target.files]); fileInput.value = ""; });
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (event) => { event.preventDefault(); dropZone.classList.remove("dragover"); addFiles([...event.dataTransfer.files]); });
searchInput.addEventListener("input", renderLibrary);
sortSelect.addEventListener("change", renderLibrary);

playBtn.addEventListener("click", async () => {
  if (!state.songs.length) return;
  if (!state.currentId) { loadSong(state.filteredIds[0] || state.songs[0].id, true); return; }
  if (audio.paused) await audio.play(); else audio.pause();
});

prevBtn.addEventListener("click", () => playRelative(-1));
nextBtn.addEventListener("click", () => playRelative(1));
shuffleBtn.addEventListener("click", () => {
  state.shuffle = !state.shuffle;
  shuffleBtn.classList.toggle("active", state.shuffle);
  shuffleBtn.setAttribute("aria-pressed", String(state.shuffle));
});
volume.addEventListener("input", () => { audio.volume = Number(volume.value); });
progress.addEventListener("input", () => { if (Number.isFinite(audio.duration)) audio.currentTime = (Number(progress.value) / 1000) * audio.duration; });

audio.addEventListener("play", updatePlayButton);
audio.addEventListener("pause", updatePlayButton);
audio.addEventListener("ended", () => playRelative(1));
audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("loadedmetadata", updateProgress);
window.addEventListener("beforeunload", () => { for (const url of state.objectUrls) URL.revokeObjectURL(url); });

audio.volume = Number(volume.value);
renderLibrary();
updateStats();

async function addFiles(files) {
  const mp3s = files.filter((file) => file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"));
  const newSongs = await Promise.all(mp3s.map(createSongFromFile));
  state.songs.push(...newSongs);
  applySort(state.songs);
  renderLibrary();
  updateStats();
  if (!state.currentId && state.songs.length) loadSong(state.songs[0].id, false);
}

async function createSongFromFile(file) {
  const buffer = await file.arrayBuffer();
  const tags = parseId3(buffer);
  const audioUrl = URL.createObjectURL(file);
  state.objectUrls.add(audioUrl);
  const trackDuration = await getAudioDuration(audioUrl);
  let coverUrl = "";
  if (tags.picture) {
    const blob = new Blob([tags.picture.data], { type: tags.picture.mime || "image/jpeg" });
    coverUrl = URL.createObjectURL(blob);
    state.objectUrls.add(coverUrl);
  }
  return { id: crypto.randomUUID(), file, audioUrl, coverUrl, title: tags.title || cleanFileName(file.name), artist: tags.artist || "Unknown creator", album: tags.album || "", duration: trackDuration };
}

function renderLibrary() {
  const query = searchInput.value.trim().toLowerCase();
  const songs = state.songs.filter((song) => (song.title + " " + song.artist + " " + song.album).toLowerCase().includes(query));
  applySort(songs);
  state.filteredIds = songs.map((song) => song.id);
  songCount.textContent = songs.length + " " + (songs.length === 1 ? "song" : "songs");
  songList.innerHTML = "";
  if (!songs.length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = state.songs.length ? "No songs match your search." : "Your uploaded songs will appear here.";
    songList.append(note);
    return;
  }
  for (const song of songs) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "song-card" + (song.id === state.currentId ? " playing" : "");
    button.addEventListener("click", () => loadSong(song.id, true));
    const art = song.coverUrl ? document.createElement("img") : document.createElement("span");
    if (song.coverUrl) { art.className = "thumb"; art.src = song.coverUrl; art.alt = ""; }
    else { art.className = "thumb-fallback"; art.textContent = "♪"; art.setAttribute("aria-hidden", "true"); }
    const meta = document.createElement("div");
    meta.className = "song-meta";
    const title = document.createElement("p");
    title.className = "song-title";
    title.textContent = song.title;
    const artist = document.createElement("p");
    artist.className = "song-artist";
    artist.textContent = song.album ? song.artist + " · " + song.album : song.artist;
    meta.append(title, artist);
    const length = document.createElement("span");
    length.className = "song-duration";
    length.textContent = song.duration ? formatTime(song.duration) : "--:--";
    button.append(art, meta, length);
    item.append(button);
    songList.append(item);
  }
}

async function loadSong(id, shouldPlay) {
  const song = state.songs.find((candidate) => candidate.id === id);
  if (!song) return;
  state.currentId = song.id;
  audio.src = song.audioUrl;
  songTitle.textContent = song.title;
  songCreator.textContent = song.artist;
  albumName.textContent = song.album;
  if (song.coverUrl) { coverArt.src = song.coverUrl; coverWrap.classList.add("has-cover"); }
  else { coverArt.removeAttribute("src"); coverWrap.classList.remove("has-cover"); coverFallback.textContent = initials(song.title); }
  renderLibrary();
  if (shouldPlay) { try { await audio.play(); } catch { audio.pause(); } } else updatePlayButton();
}

function playRelative(direction) {
  if (!state.songs.length) return;
  const pool = state.filteredIds.length ? state.filteredIds : state.songs.map((song) => song.id);
  if (state.shuffle && direction > 0 && pool.length > 1) {
    const choices = pool.filter((id) => id !== state.currentId);
    loadSong(choices[Math.floor(Math.random() * choices.length)], true);
    return;
  }
  const currentIndex = Math.max(0, pool.indexOf(state.currentId));
  const nextIndex = (currentIndex + direction + pool.length) % pool.length;
  loadSong(pool[nextIndex], true);
}

function updatePlayButton() {
  playIcon.textContent = audio.paused ? "▶" : "Ⅱ";
  playBtn.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  playBtn.title = audio.paused ? "Play" : "Pause";
}

function updateProgress() {
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const total = Number.isFinite(audio.duration) ? audio.duration : 0;
  currentTime.textContent = formatTime(current);
  duration.textContent = formatTime(total);
  progress.value = total ? String(Math.round((current / total) * 1000)) : "0";
  const song = state.songs.find((candidate) => candidate.id === state.currentId);
  if (song && total && song.duration !== total) { song.duration = total; renderLibrary(); updateStats(); }
}

function updateStats() {
  const bytes = state.songs.reduce((sum, song) => sum + song.file.size, 0);
  const seconds = state.songs.reduce((sum, song) => sum + (song.duration || 0), 0);
  totalSongs.textContent = String(state.songs.length);
  totalStorage.textContent = (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  totalPlaytime.textContent = Math.round(seconds / 60) + " min";
}

function applySort(songs) {
  const mode = sortSelect.value;
  songs.sort((a, b) => {
    if (mode === "duration") return (b.duration || 0) - (a.duration || 0) || compareText(a.title, b.title);
    if (mode === "artist") return compareText(a.artist, b.artist) || compareText(a.title, b.title);
    return compareText(a.title, b.title) || compareText(a.artist, b.artist);
  });
}

function compareText(a, b) {
  const left = sortKey(a);
  const right = sortKey(b);
  return left.group - right.group || left.value.localeCompare(right.value, undefined, { numeric: true, sensitivity: "base" });
}

function sortKey(value) {
  const trimmed = String(value || "").trim();
  const first = trimmed.charAt(0).toUpperCase();
  const group = first >= "A" && first <= "Z" ? 0 : 1;
  return { group, value: trimmed || "#" };
}

function getAudioDuration(url) {
  return new Promise((resolve) => {
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.src = url;
    probe.addEventListener("loadedmetadata", () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0), { once: true });
    probe.addEventListener("error", () => resolve(0), { once: true });
  });
}

function parseId3(buffer) {
  const bytes = new Uint8Array(buffer);
  const tags = {};
  if (bytes.length < 10 || readAscii(bytes, 0, 3) !== "ID3") return tags;
  const version = bytes[3];
  const tagSize = readSynchsafe(bytes, 6);
  let offset = 10;
  const end = Math.min(bytes.length, 10 + tagSize);
  while (offset + 10 <= end) {
    const frameId = readAscii(bytes, offset, 4).replace(/\0/g, "");
    const frameSize = version === 4 ? readSynchsafe(bytes, offset + 4) : readUint32(bytes, offset + 4);
    if (!frameId || frameSize <= 0) break;
    const frameStart = offset + 10;
    const frameEnd = Math.min(frameStart + frameSize, end);
    const data = bytes.slice(frameStart, frameEnd);
    if (frameId === "TIT2") tags.title = decodeTextFrame(data);
    if (frameId === "TPE1") tags.artist = decodeTextFrame(data);
    if (frameId === "TALB") tags.album = decodeTextFrame(data);
    if (frameId === "APIC" && !tags.picture) tags.picture = decodePictureFrame(data);
    offset = frameEnd;
  }
  return tags;
}

function decodeTextFrame(data) { if (!data.length) return ""; return decodeText(data[0], data.slice(1)).replace(/\0/g, "").trim(); }

function decodePictureFrame(data) {
  if (!data.length) return null;
  const encoding = data[0];
  let offset = 1;
  const mimeEnd = data.indexOf(0, offset);
  if (mimeEnd === -1) return null;
  const mime = readAscii(data, offset, mimeEnd - offset);
  offset = mimeEnd + 2;
  const descriptionEnd = findTextTerminator(data, offset, encoding);
  if (descriptionEnd === -1) return null;
  offset = descriptionEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  return { mime, data: data.slice(offset) };
}

function decodeText(encoding, data) {
  if (encoding === 3) return new TextDecoder("utf-8").decode(data);
  if (encoding === 1) return new TextDecoder("utf-16").decode(data);
  if (encoding === 2) return decodeUtf16Be(data);
  return new TextDecoder("latin1").decode(data);
}

function decodeUtf16Be(data) {
  const swapped = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index += 2) { swapped[index] = data[index + 1] || 0; swapped[index + 1] = data[index]; }
  return new TextDecoder("utf-16le").decode(swapped);
}

function findTextTerminator(data, start, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < data.length; index += 2) if (data[index] === 0 && data[index + 1] === 0) return index;
    return -1;
  }
  return data.indexOf(0, start);
}

function readAscii(bytes, start, length) { return [...bytes.slice(start, start + length)].map((byte) => String.fromCharCode(byte)).join(""); }
function readSynchsafe(bytes, start) { return (bytes[start] << 21) | (bytes[start + 1] << 14) | (bytes[start + 2] << 7) | bytes[start + 3]; }
function readUint32(bytes, start) { return (bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]; }
function cleanFileName(name) { return name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim(); }
function initials(text) { const letters = text.match(/[a-z0-9]/gi) || ["♪"]; return letters.slice(0, 2).join("").toUpperCase(); }
function formatTime(seconds) { const safeSeconds = Math.max(0, Math.floor(seconds || 0)); const mins = Math.floor(safeSeconds / 60); const secs = String(safeSeconds % 60).padStart(2, "0"); return mins + ":" + secs; }
