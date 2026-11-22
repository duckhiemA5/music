import './style.css';
import { auth, db, storage } from './firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail
} from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const $ = (id) => document.getElementById(id);
const audio = $('audio-player');
const googleProvider = new GoogleAuthProvider();
let currentUser = null;
let tracks = [];
let visibleTracks = [];
let currentIndex = -1;
let authMode = 'login';
let activeView = 'home';
let botResults = [];
const favoritesKey = 'music-space-favorites';
const historyKey = 'music-space-history';
const readSet = (key) => new Set(JSON.parse(localStorage.getItem(key) || '[]'));
const saveSet = (key, value) => localStorage.setItem(key, JSON.stringify([...value]));
let favorites = readSet(favoritesKey);
let history = readSet(historyKey);

function toast(message, error = false) {
  const el = $('toast'); if (!el) return;
  el.textContent = message; el.classList.toggle('error', error); el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}
// Trung tâm thông báo trong ứng dụng (lưu trạng thái đã đọc trên trình duyệt)
const notifications = [
  { id: 'welcome', icon: '♫', title: 'Chào mừng đến Music Space', body: 'Không gian âm nhạc của bạn đã sẵn sàng. Hãy tìm kiếm hoặc thêm những bài hát yêu thích.', time: 'Thông báo hệ thống' },
  { id: 'upload-tip', icon: '☁', title: 'Mẹo sử dụng', body: 'Đăng nhập để tải nhạc lên và lưu thư viện cá nhân trên Firebase.', time: 'Hướng dẫn' }
];
const notificationStateKey = 'music-space-notifications-read';
let readNotifications = new Set(JSON.parse(localStorage.getItem(notificationStateKey) || '[]'));
function renderNotifications() {
  const list = $('notification-list');
  if (!list) return;
  list.innerHTML = notifications.map(n => `<article class="notification-item ${readNotifications.has(n.id) ? 'is-read' : 'is-unread'}"><span class="notification-icon">${n.icon}</span><div><b>${n.title}</b><p>${n.body}</p><small>${n.time}</small></div></article>`).join('');
  $('notification-dot').hidden = notifications.every(n => readNotifications.has(n.id));
}
$('notification-button').addEventListener('click', () => {
  const panel = $('notification-panel');
  panel.hidden = !panel.hidden;
  $('notification-button').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) renderNotifications();
});
$('notification-read').addEventListener('click', () => {
  readNotifications = new Set(notifications.map(n => n.id));
  localStorage.setItem(notificationStateKey, JSON.stringify([...readNotifications]));
  renderNotifications();
});
document.addEventListener('click', e => {
  if (!e.target.closest('.notification-wrap')) {
    $('notification-panel').hidden = true;
    $('notification-button').setAttribute('aria-expanded', 'false');
  }
});
renderNotifications();

function openAuth() { $('auth-error').textContent = ''; $('auth-dialog').showModal(); }
function setAuthMode(mode) {
  authMode = mode;
  $('auth-title').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
  $('auth-submit').innerHTML = mode === 'login' ? 'Đăng nhập <span>→</span>' : 'Tạo tài khoản <span>→</span>';
  $('forgot-password').hidden = mode !== 'login';
  $('switch-auth').innerHTML = mode === 'login' ? 'Chưa có tài khoản? <button type="button">Tạo tài khoản</button>' : 'Đã có tài khoản? <button type="button">Đăng nhập</button>';
}
$('auth-button').addEventListener('click', openAuth);
$('top-auth').addEventListener('click', openAuth);
document.querySelector('.dialog-close').addEventListener('click', (e) => { e.preventDefault(); $('auth-dialog').close(); });
$('switch-auth').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
$('forgot-password').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  $('auth-error').textContent = '';
  if (!email) { $('auth-error').textContent = 'Vui lòng nhập email trước khi đặt lại mật khẩu.'; $('auth-email').focus(); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    $('auth-error').textContent = '';
    toast('Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư email.');
  } catch (err) { $('auth-error').textContent = authError(err); }
});
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim(), password = $('auth-password').value;
  try {
    if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
    else await createUserWithEmailAndPassword(auth, email, password);
    $('auth-dialog').close(); toast(authMode === 'login' ? 'Đăng nhập thành công!' : 'Tạo tài khoản thành công!');
  } catch (err) { $('auth-error').textContent = authError(err); }
});
function authError(err) {
  const map = { 'auth/invalid-credential':'Email hoặc mật khẩu không đúng.', 'auth/user-not-found':'Không tìm thấy tài khoản.', 'auth/email-already-in-use':'Email này đã được đăng ký.', 'auth/weak-password':'Mật khẩu cần ít nhất 6 ký tự.', 'auth/unauthorized-domain':'Tên miền chưa được thêm trong Firebase Authentication.', 'auth/operation-not-allowed':'Hãy bật Email/Password trong Firebase Authentication.', 'auth/popup-blocked':'Trình duyệt đã chặn cửa sổ Google.', 'auth/invalid-email':'Địa chỉ email không hợp lệ.', 'auth/too-many-requests':'Bạn thao tác quá nhiều lần. Hãy thử lại sau.' };
  return map[err.code] || err.message;
}
$('google-login-button').addEventListener('click', async () => {
  try { const result = await signInWithPopup(auth, googleProvider); $('auth-dialog').close(); toast(`Xin chào ${result.user.displayName || result.user.email}!`); }
  catch (err) { $('auth-error').textContent = authError(err); console.error(err); }
});
$('logout-button').addEventListener('click', () => signOut(auth).then(() => toast('Đã đăng xuất.')));
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  $('user-label').textContent = user?.displayName || user?.email?.split('@')[0] || 'Khách';
  $('auth-label').textContent = user ? 'Đã đăng nhập' : 'Chưa đăng nhập';
  $('avatar').textContent = (user?.displayName || user?.email || 'G').charAt(0).toUpperCase();
  $('auth-button').hidden = !!user; $('top-auth').hidden = !!user; $('logout-button').hidden = !user;
  if (user) await loadTracks(); else { tracks = []; renderTracks(); }
});
async function loadTracks() {
  if (!currentUser) return;
  $('track-list').innerHTML = '<div class="empty-state">Đang tải thư viện...</div>';
  try {
    const q = query(collection(db, 'tracks'), where('userId', '==', currentUser.uid));
    const snap = await getDocs(q);
    tracks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderTracks();
  } catch (err) { console.error(err); $('track-list').innerHTML = '<div class="empty-state">Không tải được thư viện. Kiểm tra Firestore Rules.</div>'; }
}
function currentList() {
  if (activeView === 'favorites') return tracks.filter(t => favorites.has(t.id));
  if (activeView === 'history') return tracks.filter(t => history.has(t.id));
  return tracks;
}
function renderTracks() {
  const list = currentList();
  $('library-title').textContent = activeView === 'favorites' ? 'Bài hát yêu thích' : activeView === 'history' ? 'Đã nghe gần đây' : activeView === 'library' ? 'Toàn bộ thư viện' : 'Thư viện của bạn';
  if (!list.length) {
    $('track-list').innerHTML = `<div class="empty-state"><div class="empty-icon">♫</div><b>${currentUser ? 'Chưa có bài hát nào ở đây' : 'Đăng nhập để xem thư viện'}</b><p>Thêm nhạc hoặc dùng Music Search Bot để tìm bài hát.</p><button class="outline-button" data-goto="add">＋ Thêm nhạc</button></div>`;
    $('track-list').querySelector('[data-goto]')?.addEventListener('click', () => changeView('add'));
    return;
  }
  $('track-list').innerHTML = list.map((t) => `<div class="track-row"><button class="track-play" data-play="${esc(t.id)}">▶</button><div class="track-cover">♫</div><div class="track-info"><b>${esc(t.title || 'Không tên')}</b><small>${esc(t.artist || 'Unknown Artist')}</small></div><span class="track-source">${t.source === 'bot' ? 'PREVIEW' : 'MY MUSIC'}</span><button class="track-like ${favorites.has(t.id) ? 'liked' : ''}" data-like="${esc(t.id)}">${favorites.has(t.id) ? '♥' : '♡'}</button></div>`).join('');
  $('track-list').querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => playTrack(b.dataset.play)));
  $('track-list').querySelectorAll('[data-like]').forEach(b => b.addEventListener('click', () => toggleFavorite(b.dataset.like)));
}
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toggleFavorite(id) { favorites.has(id) ? favorites.delete(id) : favorites.add(id); saveSet(favoritesKey, favorites); renderTracks(); }
function playTrack(id) {
  const list = currentList(); const index = list.findIndex(t => t.id === id); if (index < 0) return;
  currentIndex = index; const t = list[index];
  $('now-title').textContent = t.title || 'Không tên'; $('now-artist').textContent = t.artist || 'Unknown Artist';
  $('player-cover').textContent = '♫'; history.add(id); saveSet(historyKey, history);
  if (t.platform) { audio.pause(); $('play-button').textContent = '▶'; toast('Nguồn YouTube/SoundCloud/Spotify không phát bằng thanh MP3. Hãy thêm file âm thanh trực tiếp.', true); return; }
  audio.src = t.url;
  audio.play().then(() => $('play-button').textContent = 'Ⅱ').catch(() => toast('Không phát được file này. Kiểm tra URL hoặc quyền truy cập.', true));
}
$('play-button').addEventListener('click', () => { if (!audio.src) { toast('Hãy chọn một bài hát trước.'); return; } if (audio.paused) audio.play().then(() => $('play-button').textContent='Ⅱ'); else { audio.pause(); $('play-button').textContent='▶'; } });
audio.addEventListener('ended', () => $('play-button').textContent = '▶');
audio.addEventListener('timeupdate', () => { $('current-time').textContent = fmt(audio.currentTime); $('duration').textContent = fmt(audio.duration); if (audio.duration) $('seek-bar').value = audio.currentTime / audio.duration * 100; });
function fmt(s) { return Number.isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00'; }
$('seek-bar').addEventListener('input', e => { if (audio.duration) audio.currentTime = Number(e.target.value)/100*audio.duration; });
$('volume-bar').addEventListener('input', e => { audio.volume = Number(e.target.value); $('volume-value').textContent = `${Math.round(audio.volume*100)}%`; }); audio.volume = .8;
$('prev-button').addEventListener('click', () => stepTrack(-1)); $('next-button').addEventListener('click', () => stepTrack(1));
function stepTrack(delta) { const list = currentList(); if (!list.length) return; const next = currentIndex < 0 ? 0 : (currentIndex + delta + list.length) % list.length; playTrack(list[next].id); }
$('like-button').addEventListener('click', () => { const t = currentList()[currentIndex]; if (t) toggleFavorite(t.id); });

// Music Search Bot: tìm bài hát qua iTunes Search API và phát thử preview 30 giây.
async function searchBot() {
  const term = $('search-input').value.trim(); if (!term) { toast('Nhập tên bài hát hoặc nghệ sĩ.'); return; }
  $('search-hint').textContent = 'Bot đang tìm nhạc...'; $('bot-results').innerHTML = '<div class="empty-state">Đang tìm kiếm...</div>';
  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=12`);
    if (!response.ok) throw new Error('Dịch vụ tìm kiếm đang bận.');
    const data = await response.json(); botResults = data.results || [];
    $('search-hint').textContent = `Tìm thấy ${botResults.length} kết quả cho “${term}”. Nhấn Phát thử để nghe preview.`;
    $('bot-results').innerHTML = botResults.length ? botResults.map((t,i) => `<div class="track-row bot-track"><div class="track-cover">♫</div><div class="track-info"><b>${esc(t.trackName)}</b><small>${esc(t.artistName)} · ${esc(t.collectionName || '')}</small></div><button class="outline-button" data-preview="${i}" ${t.previewUrl ? '' : 'disabled'}>▶ Nghe thử</button></div>`).join('') : '<div class="empty-state">Không tìm thấy kết quả. Thử từ khóa khác nhé.</div>';
    $('bot-results').querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', () => playPreview(Number(b.dataset.preview))));
  } catch (err) { $('search-hint').textContent = err.message; $('bot-results').innerHTML = ''; toast('Không thể tìm nhạc lúc này.', true); }
}
function playPreview(i) { const t = botResults[i]; if (!t?.previewUrl) return; audio.src = t.previewUrl; audio.play().then(() => $('play-button').textContent='Ⅱ').catch(() => toast('Không phát được preview.', true)); $('now-title').textContent = t.trackName; $('now-artist').textContent = `${t.artistName} · Preview`; }
$('search-button').addEventListener('click', searchBot); $('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchBot(); });

function changeView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('page-name').textContent = ({home:'Khám phá',library:'Thư viện nhạc',add:'Thêm nhạc',favorites:'Yêu thích',history:'Đã nghe gần đây'})[view] || 'Music Space';
  $('hero-section').classList.toggle('hidden', view !== 'home');
  $('search-section').classList.toggle('hidden', view !== 'home');
  $('library-section').classList.toggle('hidden', view === 'add');
  $('add-section').classList.toggle('hidden', view !== 'add');
  renderTracks(); window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => changeView(b.dataset.view)));
$('explore-button').addEventListener('click', () => changeView('library'));
$('view-all').addEventListener('click', () => changeView('library'));
$('empty-add')?.addEventListener('click', () => changeView('add'));

$('audio-file').addEventListener('change', e => { const f = e.target.files[0]; $('file-picked').textContent = f ? `${f.name} · ${(f.size/1024/1024).toFixed(1)} MB` : 'Chưa chọn file'; if (f && !$('file-title').value) $('file-title').value = f.name.replace(/\.[^.]+$/, ''); });
$('upload-button').addEventListener('click', async () => {
  const file = $('audio-file').files[0]; if (!currentUser) { toast('Đăng nhập trước khi tải nhạc.'); openAuth(); return; }
  if (!file) { toast('Chọn file âm thanh trước.'); return; }
  if (!file.type.startsWith('audio/')) { toast('File đã chọn không phải âm thanh.', true); return; }
  try {
    $('upload-progress').classList.remove('hidden'); $('progress-label').textContent = 'Đang tải lên...';
    const safe = file.name.replace(/[^\w.\-]/g, '_'); const path = `music/${currentUser.uid}/${Date.now()}_${safe}`;
    const storageRef = ref(storage, path); await uploadBytes(storageRef, file); const url = await getDownloadURL(storageRef);
    await addDoc(collection(db,'tracks'), { userId:currentUser.uid, title:$('file-title').value.trim() || file.name, artist:$('file-artist').value.trim() || 'Unknown Artist', url, source:'upload', createdAt:serverTimestamp() });
    $('progress-label').textContent = 'Hoàn tất!'; $('audio-file').value=''; $('file-picked').textContent='Chưa chọn file'; toast('Đã tải nhạc lên thành công!'); await loadTracks();
  } catch (err) { console.error(err); $('progress-label').textContent = authError(err); toast('Tải lên thất bại: ' + err.message, true); }
});
$('add-url-button').addEventListener('click', async () => {
  if (!currentUser) { toast('Đăng nhập trước khi thêm nhạc.'); openAuth(); return; }
  const url = $('web-url').value.trim(), title = $('web-title').value.trim();
  if (!url || !title) { toast('Nhập URL và tên bài hát.'); return; }
  try {
    const parsed = new URL(url); if (!['http:','https:'].includes(parsed.protocol)) throw new Error('URL không hợp lệ.');
    if (!/\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i.test(parsed.pathname + parsed.search + parsed.hash)) throw new Error('Chỉ hỗ trợ URL file âm thanh trực tiếp (.mp3, .wav, .ogg, .m4a, .aac, .flac). Link YouTube/Spotify/SoundCloud không phải file âm thanh trực tiếp.');
    await addDoc(collection(db,'tracks'), { userId:currentUser.uid, title, artist:$('web-artist').value.trim() || 'Unknown Artist', url, source:'url', createdAt:serverTimestamp() });
    $('web-url').value=''; $('web-title').value=''; $('web-artist').value=''; toast('Đã thêm bài hát!'); await loadTracks();
  } catch(err) { toast('Không thể thêm URL: ' + err.message, true); }
});
$('logout-button').hidden = true;
setAuthMode('login');
changeView('home');
